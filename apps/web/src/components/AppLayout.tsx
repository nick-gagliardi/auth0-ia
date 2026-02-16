'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, LayoutDashboard, Network, Activity, Github, Database, AlertTriangle } from 'lucide-react';
import { useSummary, useIndexBundle } from '@/hooks/use-index-data';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// MVP Navigation - scoped to 3 core routes
const navItems = [
  { to: '/', label: 'Home', icon: Search },
  { to: '/explain', label: 'Explain', icon: Search },
  { to: '/work-queue', label: 'Work Queue', icon: LayoutDashboard },
  { to: '/redirects', label: 'Redirects', icon: Network }
];

// Helper to check if data is from demo mode
function useIsDemoMode(): boolean {
  const { data } = useIndexBundle();
  return data?.summary?.source?.ref === 'demo' || 
         data?.summary?.source?.gitSha?.startsWith('demo-mode') ||
         false;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: summary } = useSummary();
  const isDemoMode = useIsDemoMode();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div className="bg-amber-500/10 border-b border-amber-500/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
            <div className="flex items-center justify-center gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium">Demo Mode</span>
              <span className="text-amber-600/70 dark:text-amber-400/70">
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

      <header className="border-b bg-card sticky top-0 z-50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Network className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight">Auth0 IA</span>
                {isDemoMode && (
                  <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600 dark:text-amber-400">
                    Demo
                  </Badge>
                )}
                <span className="text-muted-foreground text-sm hidden sm:inline">Docs Graph</span>
              </div>
            </Link>

            <nav className="flex items-center gap-1">
              {navItems.map(({ to, label, icon: Icon }) => {
                const active = pathname === to;
                return (
                  <Link
                    key={to}
                    href={to}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                );
              })}

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isDemoMode ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${isDemoMode ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    </span>
                    <span className="hidden sm:inline text-xs text-muted-foreground">
                      Data: {summary ? new Date(summary.generatedAtUtc).toLocaleDateString() : '…'}
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
                    <div className="text-sm text-muted-foreground">Loading summary…</div>
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
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>

      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        {summary && (
          <span>
            {summary.pages} pages · {summary.snippets} snippets · indexed{' '}
            {new Date(summary.generatedAtUtc).toLocaleDateString()}
            {isDemoMode && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">(Demo Mode)</span>
            )}
          </span>
        )}
      </footer>
    </div>
  );
}
