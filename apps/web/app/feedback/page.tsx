import { Suspense } from 'react';
import FeedbackClient from './FeedbackClient';

export const dynamic = 'force-dynamic';

function PageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="animate-pulse space-y-6">
        <div className="h-5 w-40 bg-muted rounded" />
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <div className="h-7 w-2/3 bg-muted rounded" />
          <div className="h-4 w-1/2 bg-muted rounded" />
        </div>
        <div className="rounded-xl border bg-card p-5 h-24" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-5 h-32" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FeedbackClient />
    </Suspense>
  );
}
