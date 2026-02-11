'use client';

import { useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth0Lint, useCrossNavPairs, useDeadEnds, useMetrics, useNodes } from '@/hooks/use-index-data';

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
  const { data: deadEnds, isLoading: l4 } = useDeadEnds();
  const { data: auth0Lint, isLoading: l5 } = useAuth0Lint();

  const loading = l1 || l2 || l3 || l4 || l5;

  const pages = useMemo(() => nodes?.filter((n) => n.type === 'page') ?? [], [nodes]);
  const snippets = useMemo(() => nodes?.filter((n) => n.type === 'snippet') ?? [], [nodes]);

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

  const blastSnippets = useMemo(() => {
    if (!metrics) return [];
    return snippets
      .map((s) => ({ node: s, impact: metrics[s.id]?.impactPages ?? 0, importedBy: metrics[s.id]?.importedBy ?? 0 }))
      .filter((x) => x.impact > 0)
      .sort((a, b) => b.impact - a.impact || b.importedBy - a.importedBy)
      .slice(0, 200);
  }, [snippets, metrics]);

  const auth0LintQueue = useMemo(() => {
    if (!auth0Lint) return [];
    const byId = new Map<string, any>();
    pages.forEach((p) => byId.set(p.id, p));

    // prioritize: errors > warns > infos, then more warnings
    function score(warnings: any[]): number {
      let s = 0;
      for (const w of warnings) {
        if (w.severity === 'error') s += 1000;
        else if (w.severity === 'warn') s += 100;
        else s += 10;
      }
      return s + warnings.length;
    }

    return (auth0Lint.items || [])
      .filter((x) => (x.warnings?.length ?? 0) > 0)
      .map((x) => ({ node: byId.get(x.id) || { id: x.id, filePath: x.filePath, type: 'page', navPaths: [] }, warnings: x.warnings }))
      .sort((a, b) => score(b.warnings) - score(a.warnings) || (b.warnings.length ?? 0) - (a.warnings.length ?? 0) || (a.node.filePath < b.node.filePath ? -1 : 1))
      .slice(0, 200);
  }, [auth0Lint, pages]);

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
      value: 'auth0-lint',
      label: 'Auth0 Recipe Checks',
      help:
        'Heuristic checks for common Auth0 docs footguns (PKCE/state/nonce mentions, token storage guidance, Rules vs Actions language). Review and fix high-severity items first.',
      data: auth0LintQueue as any,
      total: auth0LintQueue.length
    },
    {
      value: 'blast-snippets',
      label: 'Blast Radius Snippets',
      help:
        'Snippets/components with the biggest transitive impact (pages affected via imports). Treat these like shared infrastructure.',
      data: blastSnippets as any,
      total: blastSnippets.length
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
      value: 'dead-ends',
      label: 'Dead Ends',
      help:
        'High inbound but low outbound pages. These attract readers but fail to route them onward — add "Next steps" links, improve in-page nav, or create a hub.',
      data: (deadEnds?.items || []).slice(0, 200) as any,
      total: deadEnds?.count
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

              {t.value === 'blast-snippets' ? (
                <div className="flex flex-col gap-2">
                  {(t.data as any[]).map((x: any) => (
                    <div key={x.node.id} className="rounded-xl border bg-card p-4">
                      <div className="text-xs text-muted-foreground mb-2">
                        impact pages <b>{x.impact}</b> · imported by <b>{x.importedBy}</b>
                      </div>
                      <NodeCard node={x.node} metrics={metrics?.[x.node.id]} />
                    </div>
                  ))}
                </div>
              ) : t.value === 'cross-nav' ? (
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
              ) : t.value === 'auth0-lint' ? (
                <div className="flex flex-col gap-2">
                  {(t.data as any[]).map((x: any) => {
                    const n = x.node;
                    const warns = x.warnings || [];
                    const errors = warns.filter((w: any) => w.severity === 'error').length;
                    const warnsCount = warns.filter((w: any) => w.severity === 'warn').length;
                    const infos = warns.filter((w: any) => w.severity === 'info').length;
                    return (
                      <div key={n.id} className="rounded-xl border bg-card p-4">
                        <div className="text-xs text-muted-foreground mb-2">
                          issues <b>{warns.length}</b> · errors <b>{errors}</b> · warns <b>{warnsCount}</b> · info <b>{infos}</b>
                        </div>
                        <a className="text-primary hover:underline" href={`/explain?id=${encodeURIComponent(n.id)}`}>
                          <NodeCard node={n} metrics={metrics?.[n.id]} />
                        </a>
                      </div>
                    );
                  })}
                </div>
              ) : t.value === 'dead-ends' ? (
                <div className="flex flex-col gap-2">
                  {(t.data as any[]).map((x: any) => {
                    const n = nodeById.get(x.id);
                    if (!n) return null;
                    return (
                      <div key={x.id} className="rounded-xl border bg-card p-4">
                        <div className="text-xs text-muted-foreground mb-2">
                          inbound <b>{x.inboundLinks}</b> · outbound <b>{x.outboundLinks}</b> · score <b>{x.deadEndScore}</b>
                          {x.navRoot ? (
                            <span className="ml-2 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide">{x.navRoot}</span>
                          ) : null}
                        </div>
                        <NodeCard node={n} metrics={metrics?.[x.id]} />
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
