import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { sql } from '@vercel/postgres';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// Admin usernames who can access this page
const ADMIN_USERNAMES = ['nick-gagliardi'];

interface User {
  id: string;
  github_id: string;
  github_username: string;
  created_at: Date;
  updated_at: Date;
  has_anthropic_key: boolean;
}

export default async function AdminUsersPage() {
  // Check authentication and authorization
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Get user from database to check GitHub username
  const { rows: [dbUser] } = await sql`
    SELECT github_username FROM users WHERE id = ${session.user.id}
  `;

  if (!dbUser || !ADMIN_USERNAMES.includes(dbUser.github_username)) {
    redirect('/');
  }

  // Fetch all users
  const { rows: users } = await sql<User>`
    SELECT
      id,
      github_id,
      github_username,
      created_at,
      updated_at,
      CASE
        WHEN anthropic_api_key_encrypted IS NOT NULL THEN true
        ELSE false
      END as has_anthropic_key
    FROM users
    ORDER BY created_at DESC
  `;

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin: Users</h1>
        <p className="text-muted-foreground mt-2">
          View all authenticated users and their configuration status
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Authenticated Users</CardTitle>
          <CardDescription>
            Total: {users.length} user{users.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold">GitHub Username</th>
                  <th className="text-left py-3 px-4 font-semibold">GitHub ID</th>
                  <th className="text-left py-3 px-4 font-semibold">Anthropic Key</th>
                  <th className="text-left py-3 px-4 font-semibold">Signed Up</th>
                  <th className="text-left py-3 px-4 font-semibold">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <a
                        href={`https://github.com/${user.github_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        {user.github_username}
                      </a>
                      {ADMIN_USERNAMES.includes(user.github_username) && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          Admin
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-sm text-muted-foreground">
                      {user.github_id}
                    </td>
                    <td className="py-3 px-4">
                      {user.has_anthropic_key ? (
                        <Badge variant="default" className="bg-green-500">
                          ✓ Configured
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          Not set
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {new Date(user.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {new Date(user.updated_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No users have signed up yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="text-2xl font-bold">{users.length}</div>
              <div className="text-sm text-muted-foreground">Total Users</div>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-2xl font-bold">
                {users.filter(u => u.has_anthropic_key).length}
              </div>
              <div className="text-sm text-muted-foreground">
                Users with Anthropic Key
              </div>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-2xl font-bold">
                {users.filter(u => !u.has_anthropic_key).length}
              </div>
              <div className="text-sm text-muted-foreground">
                Users without Anthropic Key
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
