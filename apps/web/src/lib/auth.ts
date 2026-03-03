import NextAuth, { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import { createUser, getUserByGithubId, updateGithubToken } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

const authConfig: NextAuthConfig = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'repo user:email',
        },
      },
    }),
  ],
  callbacks: {
    authorized: async ({ auth, request }) => {
      // Check if user is authenticated
      const isAuthenticated = !!auth?.user;
      const isOnLoginPage = request.nextUrl.pathname.startsWith('/login');
      const isAuthAPI = request.nextUrl.pathname.startsWith('/api/auth');

      // Allow access to auth API and login page without authentication
      if (isAuthAPI || isOnLoginPage) {
        return true;
      }

      // Redirect to login if not authenticated
      if (!isAuthenticated) {
        return false;
      }

      return true;
    },
    async signIn({ user, account, profile }) {
      if (account?.provider === 'github' && account.access_token) {
        try {
          const encryptedToken = encrypt(account.access_token);

          // Check if user already exists
          let dbUser = await getUserByGithubId(account.providerAccountId);

          if (!dbUser) {
            // Create new user
            dbUser = await createUser({
              github_id: account.providerAccountId,
              github_username: (profile as any)?.login || user.name || user.email?.split('@')[0] || 'unknown',
              github_access_token_encrypted: encryptedToken,
            });
            console.log('Created new user:', dbUser.id);
          } else {
            // Update existing user's GitHub token
            await updateGithubToken(dbUser.id, encryptedToken);
            console.log('Updated GitHub token for user:', dbUser.id);
          }

          // Store user ID for session callback
          user.id = dbUser.id;
        } catch (error) {
          console.error('Error in signIn callback:', error);
          return false; // Prevent sign in on error
        }
      }
      return true;
    },

    async session({ session, token }) {
      // Add user ID to session
      if (token?.sub) {
        session.user.id = token.sub;
      }
      return session;
    },

    async jwt({ token, user, account }) {
      // Initial sign in
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
