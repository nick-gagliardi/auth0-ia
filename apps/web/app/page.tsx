'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { Input } from '@/components/ui/input';
import { useMetrics, useNodes, useSummary } from '@/hooks/use-index-data';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const { data: nodes, isLoading: loadingNodes } = useNodes();
  const { data: metrics, isLoading: loadingMetrics } = useMetrics();
  const { data: summary } = useSummary();

  const loading = loadingNodes || loadingMetrics;

  const results = useMemo(() => {
    if (!nodes || !metrics) return [];
    const q = query.trim().toLowerCase();
    const pages = nodes.filter((n) => n.type === 'page');

    if (!q) {
      return [...pages]
        .map((n) => ({ ...n, score: metrics[n.id]?.inboundLinks ?? 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 30);
    }

    const out: (typeof pages[number] & { score: number })[] = [];
    for (const n of pages) {
      const title = (n.title || '').toLowerCase();
      const path = n.filePath.toLowerCase();
      const permalink = (n.permalink || '').toLowerCase();
      const nav = (n.navPaths || []).join(' | ').toLowerCase();
      if (title.includes(q) || path.includes(q) || permalink.includes(q) || nav.includes(q)) {
        const score = (title.includes(q) ? 1000 : 0) + (metrics[n.id]?.inboundLinks ?? 0);
        out.push({ ...n, score });
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 50);
  }, [nodes, metrics, query]);

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Docs Intelligence</h1>
          <p className="text-muted-foreground text-lg">Search, explore, and understand the Auth0 docs graph</p>
          {summary && (
            <p className="text-xs text-muted-foreground mt-2">
              {summary.pages} pages · {summary.snippets} snippets · source <code>{process.env.NEXT_PUBLIC_INDEX_BASE_URL || '/index'}</code>
            </p>
          )}
        </div>

        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages… e.g. pkce, universal login, actions, refresh token"
            className="pl-12 h-14 text-base rounded-2xl bg-card shadow-sm border"
          />
        </div>

        {loading && <div className="text-center text-muted-foreground py-12">Loading index…</div>}

        {!loading && (
          <>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                {query.trim() ? 'Matches' : 'Top Hubs'}
              </h2>
              <span className="text-xs text-muted-foreground">{results.length} results</span>
            </div>
            <div className="flex flex-col gap-2">
              {results.map((n, i) => (
                <NodeCard key={n.id} node={n} metrics={metrics?.[n.id]} rank={!query.trim() ? i + 1 : undefined} />
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
