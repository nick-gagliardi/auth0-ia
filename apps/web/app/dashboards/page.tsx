'use client';

import { useMemo } from 'react';
import { TrendingUp, Code2, AlertTriangle, Unlink } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMetrics, useNodes } from '@/hooks/use-index-data';

export default function DashboardsPage() {
  const { data: nodes, isLoading: l1 } = useNodes();
  const { data: metrics, isLoading: l2 } = useMetrics();

  const loading = l1 || l2;

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
              <div className="flex flex-col gap-2">
                {data.map((n, i) => (
                  <NodeCard
                    key={n.id}
                    node={n}
                    metrics={metrics?.[n.id]}
                    rank={value === 'hubs' ? i + 1 : undefined}
                  />
                ))}
              </div>
              {total && total > 200 && <p className="text-xs text-muted-foreground mt-4">Showing 200 of {total}</p>}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}
