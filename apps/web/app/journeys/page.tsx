'use client';

import { useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useJourneyMaps, useNodes } from '@/hooks/use-index-data';

function labelFor(node: any) {
  return node?.title || node?.filePath || node?.id;
}

export default function JourneysPage() {
  const { data: nodes, isLoading: l1 } = useNodes();
  const { data: journeyMaps, isLoading: l2 } = useJourneyMaps();
  const loading = l1 || l2;

  const nodeById = useMemo(() => {
    const m = new Map<string, any>();
    (nodes || []).forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  const roots = useMemo(() => {
    const keys = Object.keys(journeyMaps?.byNavRoot || {});
    // Put Unknown last
    return keys.sort((a, b) => {
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      return a.localeCompare(b);
    });
  }, [journeyMaps]);

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  if (!journeyMaps) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Journey Maps</h1>
          <p className="text-muted-foreground">No journey map index found. Rebuild the indexer output (journey_maps.json).</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Journey Maps</h1>
        <p className="text-muted-foreground mb-6">
          Common reading paths inferred from the link graph (heuristic, not clickstream). Use this to validate onboarding flows, detect missing “next steps”, and spot link loops.
        </p>

        <div className="rounded-xl border bg-card p-4 mb-6 text-sm text-muted-foreground">
          <div>
            minLen <b>{journeyMaps.minLen}</b> · maxLen <b>{journeyMaps.maxLen}</b> · startsPerRoot <b>{journeyMaps.startsPerRoot}</b> · branching <b>{journeyMaps.branching}</b>
          </div>
        </div>

        <Tabs defaultValue={roots[0] || 'Unknown'}>
          <TabsList className="mb-6 flex-wrap h-auto">
            {roots.map((r) => (
              <TabsTrigger key={r} value={r}>
                {r}
              </TabsTrigger>
            ))}
          </TabsList>

          {roots.map((r) => (
            <TabsContent key={r} value={r}>
              <div className="flex flex-col gap-2">
                {(journeyMaps.byNavRoot?.[r]?.paths || []).map((j) => (
                  <div key={(j.path || []).join('||')} className="rounded-xl border bg-card p-4">
                    <div className="text-xs text-muted-foreground mb-2">
                      support <b>{j.support}</b> · score <b>{j.score}</b>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {(j.path || []).map((id: string, i: number) => (
                        <span key={id} className="inline-flex items-center gap-2">
                          <a className="text-primary hover:underline" href={`/explain?id=${encodeURIComponent(id)}`}>
                            {labelFor(nodeById.get(id) || { id })}
                          </a>
                          {i < j.path.length - 1 ? <span className="text-muted-foreground">→</span> : null}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}
