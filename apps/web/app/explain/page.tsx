import { Suspense } from 'react';
import ExplainClient from './ExplainClient';

export const dynamic = 'force-dynamic';

export default function ExplainPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-muted-foreground">Loading…</div>}>
      <ExplainClient />
    </Suspense>
  );
}
