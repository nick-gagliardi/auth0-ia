'use client';

import { useMemo } from 'react';
import { TrendingUp, Code2, AlertTriangle, Unlink } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCrossNavPairs, useMetrics, useNodes, useShadowHubs } from '@/hooks/use-index-data';

export default function DashboardsPage() {
  const { data: nodes, isLoading: l1 } = useNodes();
  const { data: metrics, isLoading: l2 } = useMetrics();
  const { data: crossNav, isLoading: l3 } = useCrossNavPairs();
  const { data: shadowHubs, isLoading: l4 } = useShadowHubs();

  const loading = l1 || l2 || l3 || l4;

  const pages = useMemo(() => nodes?.filter((n) => n.type === 'page') ?? [], [nodes]);
  const snippets = useMemo(() => nodes?.filter((n) => n.type === 'snippet') ?? [], [nodes]);

  const topHubs = useMemo(() => {
    if (!metrics) return [];
    return [...pages]
      .sort((a, b) => (metrics[b.id]?.inboundLinks ?? 0) - (metrics[a.id]?.inboundLinks ?? 0))
      .slice(0, 50);
  }, [pages, metrics]);

  const topSnippets = useMemo(() => {
    if (!metrics) return [];
    return [...snippets]
      .sort((a, b) => (metrics[b.id]?.importedBy ?? 0) - (metrics[a.id]?.importedBy ?? 0))
      .slice(0, 50);
  }, [snippets, metrics]);

  const navOrphans = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((n) => metrics[n.id]?.orphanNav)
      .sort((a, b) => (metrics[b.id]?.inboundLinks ?? 0) - (metrics[a.id]?.inboundLinks ?? 0));
  }, [pages, metrics]);

  const linkOrphans = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((n) => metrics[n.id]?.orphanLinks)
      .sort((a, b) => (metrics[a.id]?.outboundLinks ?? 0) - (metrics[b.id]?.outboundLinks ?? 0));
  }, [pages, metrics]);

  const deepContent = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((n) => metrics[n.id]?.deepNav)
      .sort((a, b) => (metrics[b.id]?.inboundLinks ?? 0) - (metrics[a.id]?.inboundLinks ?? 0));
  }, [pages, metrics]);

  const nodeById = useMemo(() => {
    const m = new Map<string, any>();
    nodes?.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  const tabs = [
    {
      value: 'hubs',
      label: 'Top Hubs',
      icon: TrendingUp,
      description: 'Pages with the most inbound links — foundation pages that deserve extra IA care.',
      data: topHubs
    },
    {
      value: 'snippets',
      label: 'Top Snippets',
      icon: Code2,
      description: 'Snippets/components by blast radius. Changes here affect many pages.',
      data: topSnippets
    },
    {
      value: 'cross-nav',
      label: 'Cross-Nav Duplicates',
      icon: AlertTriangle,
      description: 'High-value convergence: pages in different nav roots with similar link neighborhoods (score > 0.4, min intersection 3, hubs filtered).',
      data: (crossNav?.pairs || []).slice(0, 200) as any,
      total: crossNav?.pairs?.length
    },
    {
      value: 'shadow-hubs',
      label: 'Shadow Hubs',
      icon: AlertTriangle,
      description: 'Low-discoverability pages (deep/orphan) that strongly mimic a high-authority hub (score > 0.70 vs hub pages with inbound > 50).',
      data: (shadowHubs?.items || []).slice(0, 200) as any,
      total: shadowHubs?.items?.length
    },
    {
      value: 'deep',
      label: 'Deep Content',
      icon: TrendingUp,
      description: 'Pages with nav depth ≥ 5. Often where old/low-discoverability content hides ("SEO graveyard").',
      data: deepContent.slice(0, 200),
      total: deepContent.length
    },
    {
      value: 'nav-orphans',
      label: 'Nav Orphans',
      icon: AlertTriangle,
      description: 'Pages not in docs.json navigation. May be legacy content or missing IA integration.',
      data: navOrphans.slice(0, 200),
      total: navOrphans.length
    },
    {
      value: 'true-orphans',
      label: 'True Orphans',
      icon: AlertTriangle,
      description: 'Pages with 0 inbound links AND not in navigation (highest-priority cleanup candidates).',
      data: navOrphans.filter((n) => metrics?.[n.id]?.orphanTrue).slice(0, 200),
      total: navOrphans.filter((n) => metrics?.[n.id]?.orphanTrue).length
    },
    {
      value: 'ref-orphans',
      label: 'Reference Orphans',
      icon: Unlink,
      description: 'Pages in nav but with 0 inbound links (often needs cross-linking from hub pages).',
      data: pages.filter((n) => metrics?.[n.id]?.orphanReference).slice(0, 200),
      total: pages.filter((n) => metrics?.[n.id]?.orphanReference).length
    },
    {
      value: 'link-orphans',
      label: 'Link Orphans',
      icon: Unlink,
      description: 'Pages with 0 inbound links (often undiscoverable).',
      data: linkOrphans.slice(0, 200),
      total: linkOrphans.length
    }
  ];

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Dashboards</h1>
        <p className="text-muted-foreground mb-8">Index-derived IA and maintenance views. English-only.</p>

        <Tabs defaultValue="hubs">
          <TabsList className="mb-6 flex-wrap h-auto">
            {tabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                <Icon className="w-4 h-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map(({ value, description, data, total }) => (
            <TabsContent key={value} value={value}>
              <p className="text-sm text-muted-foreground mb-4">{description}</p>

              {value === 'cross-nav' ? (
                <div className="flex flex-col gap-2">
                  {(data as any[]).map((p) => {
                    const a = nodeById.get(p.a);
                    const b = nodeById.get(p.b);
                    return (
                      <div key={`${p.a}||${p.b}`} className="rounded-xl border bg-card p-4">
                        <div className="text-xs text-muted-foreground mb-2">
                          score <b>{p.score}</b> · simOut <b>{p.simOut}</b> · simIn <b>{p.simIn}</b> · shared out <b>{p.sharedOut}</b> · shared in <b>{p.sharedIn}</b>
                          <span className="ml-2 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide">
                            {p.convergenceType === 'journey' ? 'Journey Twin' : p.convergenceType === 'context' ? 'Context Twin' : 'Mixed'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <a className="text-primary hover:underline" href={`/explain?id=${encodeURIComponent(p.a)}`}>
                            {a?.title || a?.filePath || p.a}
                          </a>
                          <div className="text-xs text-muted-foreground">{p.aNav || 'Unknown'} · {p.aFolder || 'Unknown'}</div>
                          <a className="text-primary hover:underline" href={`/explain?id=${encodeURIComponent(p.b)}`}>
                            {b?.title || b?.filePath || p.b}
                          </a>
                          <div className="text-xs text-muted-foreground">{p.bNav || 'Unknown'} · {p.bFolder || 'Unknown'}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : value === 'shadow-hubs' ? (
                <div className="flex flex-col gap-2">
                  {(data as any[]).map((s) => {
                    const shadow = nodeById.get(s.shadowId);
                    const hub = nodeById.get(s.hubId);
                    return (
                      <div key={`${s.shadowId}||${s.hubId}`} className="rounded-xl border bg-card p-4">
                        <div className="text-xs text-muted-foreground mb-2">
                          score <b>{s.score}</b> · simOut <b>{s.simOut}</b> · simIn <b>{s.simIn}</b> · shadow inbound <b>{s.shadowInbound}</b> · hub inbound <b>{s.hubInbound}</b>
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shadow page</div>
                          <a className="text-primary hover:underline" href={`/explain?id=${encodeURIComponent(s.shadowId)}`}>
                            {shadow?.title || shadow?.filePath || s.shadowId}
                          </a>
                          <div className="text-xs text-muted-foreground">
                            {s.shadowOrphanTrue ? 'true orphan' : s.shadowOrphanReference ? 'reference orphan' : s.shadowDeepNav ? `deep nav (depth ${s.shadowNavDepth ?? '?'})` : 'low discoverability'}
                          </div>

                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2">Mimics hub</div>
                          <a className="text-primary hover:underline" href={`/explain?id=${encodeURIComponent(s.hubId)}`}>
                            {hub?.title || hub?.filePath || s.hubId}
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {(data as any[]).map((n: any, i: number) => (
                    <NodeCard key={n.id} node={n} metrics={metrics?.[n.id]} rank={value === 'hubs' ? i + 1 : undefined} />
                  ))}
                </div>
              )}

              {total && total > 200 && <p className="text-xs text-muted-foreground mt-4">Showing 200 of {total}</p>}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}
