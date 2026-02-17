'use client';

import { useSummary } from '@/hooks/use-index-data';
import { useIndexBundle } from '@/hooks/use-index-bundle';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';

// Helper to check if data is from demo mode
function useIsDemoMode(): boolean {
  const { data } = useIndexBundle();
  return data?.summary?.source?.ref === 'demo' ||
         data?.summary?.source?.gitSha?.startsWith('demo-mode') ||
         false;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: summary } = useSummary();
  const isDemoMode = useIsDemoMode();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className="flex flex-1 flex-col">
          <main className="flex-1 p-4 md:p-6 lg:p-8">
            {children}
          </main>
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
      </SidebarInset>
    </SidebarProvider>
  );
}
