'use client';

import { Activity, Github, Database, AlertTriangle, User, Settings, LogOut } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useSummary } from '@/hooks/use-index-data';
import { useIndexBundle } from '@/hooks/use-index-bundle';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

// Helper to check if data is from demo mode
function useIsDemoMode(): boolean {
  const { data } = useIndexBundle();
  return data?.summary?.source?.ref === 'demo' ||
         data?.summary?.source?.gitSha?.startsWith('demo-mode') ||
         false;
}

export function AppHeader() {
  const { data: summary } = useSummary();
  const isDemoMode = useIsDemoMode();
  const { data: session } = useSession();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push('/login');
  };

  return (
    <>
      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div className="bg-amber-500/10 border-b border-amber-500/20">
          <div className="px-4 py-2">
            <div className="flex items-center justify-center gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium">Demo Mode</span>
              <span className="text-amber-600/70 dark:text-amber-400/70 hidden sm:inline">
                Using sample data.
                <a
                  href="https://github.com/nickgag626/auth0-ia#readme"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-amber-800 dark:hover:text-amber-300 ml-1"
                >
                  Learn how to use real data
                </a>
              </span>
            </div>
          </div>
        </div>
      )}

      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />

        <div className="flex-1" />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isDemoMode ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isDemoMode ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              </span>
              <span className="hidden sm:inline text-xs text-muted-foreground">
                Data: {summary ? new Date(summary.generatedAtUtc).toLocaleDateString() : '...'}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-primary" />
              <div className="font-semibold">Data Inspector</div>
              {isDemoMode && (
                <Badge variant="outline" className="ml-auto border-amber-500/50 text-amber-600 dark:text-amber-400 text-xs">
                  Demo
                </Badge>
              )}
            </div>

            {!summary ? (
              <div className="text-sm text-muted-foreground">Loading summary...</div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Database className="w-4 h-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <div className="text-muted-foreground">Indexed snapshot</div>
                    <div className="font-mono text-xs">{summary.generatedAtUtc}</div>
                  </div>
                </div>

                {summary.source ? (
                  <div className="flex items-start gap-2">
                    <Github className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <div className="text-muted-foreground">docs-v2 ref</div>
                      <div className="font-mono text-xs">{summary.source.ref}</div>
                      <div className="text-muted-foreground mt-1">git sha</div>
                      <div className="font-mono text-xs">{summary.source.gitSha}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Source metadata not present yet. Rebuild the index after pulling latest.
                  </div>
                )}

                <div>
                  <div className="text-muted-foreground">Index base URL</div>
                  <div className="font-mono text-xs">{process.env.NEXT_PUBLIC_INDEX_BASE_URL || '/index'}</div>
                </div>

                {isDemoMode && (
                  <div className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-900">
                    <div className="text-amber-800 dark:text-amber-400 text-xs">
                      Running with demo data. Set up GitHub tokens and run the indexer to use real data.
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t">
                  <a
                    className="text-primary hover:underline"
                    href="https://github.com/nickgag626/auth0-ia#readme"
                    target="_blank"
                    rel="noreferrer"
                  >
                    How to refresh
                  </a>
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* User Menu */}
        {session && (
          <>
            <Separator orientation="vertical" className="mx-2 h-4" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {session.user?.name?.slice(0, 2).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-sm">
                    {session.user?.name || 'User'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {session.user?.name || 'User'}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {session.user?.email || 'GitHub Account'}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </header>
    </>
  );
}
