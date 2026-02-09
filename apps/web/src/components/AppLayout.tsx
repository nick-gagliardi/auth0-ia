'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, LayoutDashboard, Network } from 'lucide-react';
import { useSummary } from '@/hooks/use-index-data';

const navItems = [
  { to: '/', label: 'Search', icon: Search },
  { to: '/dashboards', label: 'Dashboards', icon: LayoutDashboard }
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: summary } = useSummary();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card sticky top-0 z-50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Network className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight">Auth0 IA</span>
                <span className="text-muted-foreground text-sm ml-2 hidden sm:inline">Docs Graph</span>
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
          </span>
        )}
      </footer>
    </div>
  );
}
