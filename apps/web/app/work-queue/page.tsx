'use client';

import { useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCrossNavPairs, useMetrics, useNodes } from '@/hooks/use-index-data';

function scoreDeepImportant(m: any) {
  // prioritize: deeper + more inbound
  const depth = m?.navDepth ?? 0;
  const inbound = m?.inboundLinks ?? 0;
  return inbound * 10 + depth * 2;
}

export default function WorkQueuePage() {
  const { data: nodes, isLoading: l1 } = useNodes();
  const { data: metrics, isLoading: l2 } = useMetrics();
  const { data: crossNav, isLoading: l3 } = useCrossNavPairs();

  const loading = l1 || l2 || l3;

  const pages = useMemo(() => nodes?.filter((n) => n.type === 'page') ?? [], [nodes]);

  const referenceOrphans = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((p) => metrics[p.id]?.orphanReference)
      .sort((a, b) => (metrics[b.id]?.navDepth ?? 999) - (metrics[a.id]?.navDepth ?? 999));
  }, [pages, metrics]);

  const deepImportant = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((p) => (metrics[p.id]?.navDepth ?? 0) >= 6 && (metrics[p.id]?.inboundLinks ?? 0) >= 10)
      .sort((a, b) => scoreDeepImportant(metrics[b.id]) - scoreDeepImportant(metrics[a.id]));
  }, [pages, metrics]);

  const trueOrphans = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((p) => metrics[p.id]?.orphanTrue)
      .sort((a, b) => (metrics[b.id]?.outboundLinks ?? 0) - (metrics[a.id]?.outboundLinks ?? 0));
  }, [pages, metrics]);

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  const tabs = [
    {
      value: 'ref-orphans',
      label: 'Reference Orphans',
      help:
        'In navigation, but 0 inbound links. Usually a discoverability problem: add cross-links from relevant hub pages.',
      data: referenceOrphans.slice(0, 200),
      total: referenceOrphans.length
    },
    {
      value: 'deep-important',
      label: 'Deep-but-Important',
      help:
        'Nav depth ≥ 6 and inbound links ≥ 10. Likely buried content that matters: consider moving up nav or creating a hub/landing page.',
      data: deepImportant.slice(0, 200),
      total: deepImportant.length
    },
    {
      value: 'cross-nav',
      label: 'Cross-Nav Duplicates',
      help:
        'High-value convergence across different nav roots. Candidates to consolidate or extract shared prereqs/next-steps snippets.',
      data: (crossNav?.pairs || []).slice(0, 200) as any,
      total: crossNav?.pairs?.length
    },
    {
      value: 'true-orphans',
      label: 'True Orphans',
      help:
        'Not in nav AND 0 inbound links. Triage: delete/archive, redirect to canonical, or intentionally add to nav.',
      data: trueOrphans.slice(0, 200),
      total: trueOrphans.length
    }
  ];

  const nodeById = new Map<string, any>();
  nodes?.forEach((n) => nodeById.set(n.id, n));

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Work Queue</h1>
        <p className="text-muted-foreground mb-8">
          A day-to-day IA backlog for writers. These queues turn graph signals into concrete tasks.
        </p>

        <Tabs defaultValue="ref-orphans">
          <TabsList className="mb-6 flex-wrap h-auto">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((t) => (
            <TabsContent key={t.value} value={t.value}>
              <div className="flex items-baseline justify-between mb-4">
                <p className="text-sm text-muted-foreground">{t.help}</p>
                <span className="text-xs text-muted-foreground">{t.total ?? 0} items</span>
              </div>

              {t.value === 'cross-nav' ? (
                <div className="flex flex-col gap-2">
                  {(t.data as any[]).map((p) => {
                    const a = nodeById.get(p.a);
                    const b = nodeById.get(p.b);
                    return (
                      <div key={`${p.a}||${p.b}`} className="rounded-xl border bg-card p-4">
                        <div className="text-xs text-muted-foreground mb-2">
                          score <b>{p.score}</b> · simOut <b>{p.simOut}</b> · simIn <b>{p.simIn}</b> · shared out <b>{p.sharedOut}</b> · shared in{' '}
                          <b>{p.sharedIn}</b>
                          <span className="ml-2 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide">
                            {p.convergenceType === 'journey'
                              ? 'Journey Twin'
                              : p.convergenceType === 'context'
                                ? 'Context Twin'
                                : 'Mixed'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <a className="text-primary hover:underline" href={`/explain?id=${encodeURIComponent(p.a)}`}>
                            {a?.title || a?.filePath || p.a}
                          </a>
                          <div className="text-xs text-muted-foreground">
                            {p.aNav || 'Unknown'} · {p.aFolder || 'Unknown'}
                          </div>
                          <a className="text-primary hover:underline" href={`/explain?id=${encodeURIComponent(p.b)}`}>
                            {b?.title || b?.filePath || p.b}
                          </a>
                          <div className="text-xs text-muted-foreground">
                            {p.bNav || 'Unknown'} · {p.bFolder || 'Unknown'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {(t.data as any[]).map((n: any) => (
                    <NodeCard key={n.id} node={n} metrics={metrics?.[n.id]} />
                  ))}
                </div>
              )}

              {t.total && t.total > 200 ? (
                <p className="text-xs text-muted-foreground mt-4">Showing first 200 of {t.total}</p>
              ) : null}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}
