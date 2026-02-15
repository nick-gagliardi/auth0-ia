import { Suspense } from 'react';
import ExplainClient from './ExplainClient';

export const dynamic = 'force-dynamic';

function PageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="animate-pulse space-y-6">
        <div className="h-5 w-32 bg-muted rounded" />
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-muted rounded" />
              <div className="w-16 h-5 bg-muted rounded" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-24 h-8 bg-muted rounded" />
              <div className="w-28 h-8 bg-muted rounded" />
            </div>
          </div>
          <div className="w-3/4 h-8 bg-muted rounded" />
          <div className="w-1/2 h-4 bg-muted rounded" />
          <div className="flex gap-4">
            <div className="w-24 h-5 bg-muted rounded" />
            <div className="w-24 h-5 bg-muted rounded" />
            <div className="w-28 h-5 bg-muted rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-muted rounded" />
              <div className="w-20 h-5 bg-muted rounded" />
              <div className="w-8 h-5 bg-muted rounded ml-auto" />
            </div>
            <div className="w-full h-4 bg-muted rounded" />
            <div className="w-11/12 h-4 bg-muted rounded" />
            <div className="w-10/12 h-4 bg-muted rounded" />
          </div>
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-muted rounded" />
              <div className="w-20 h-5 bg-muted rounded" />
              <div className="w-8 h-5 bg-muted rounded ml-auto" />
            </div>
            <div className="w-full h-4 bg-muted rounded" />
            <div className="w-11/12 h-4 bg-muted rounded" />
            <div className="w-10/12 h-4 bg-muted rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExplainPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ExplainClient />
    </Suspense>
  );
}
