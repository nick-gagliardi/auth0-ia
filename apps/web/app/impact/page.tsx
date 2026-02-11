'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Code2, Search, ExternalLink } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEdgesInbound, useMetrics, useNodes } from '@/hooks/use-index-data';

function computeTransitiveImpactPages(startId: string, nodesById: Map<string, any>, inbound: any): string[] {
  const nodeTypeById = new Map<string, 'page' | 'snippet'>();
  for (const [id, n] of nodesById) nodeTypeById.set(id, n.type);

  const seen = new Set<string>();
  const queue: string[] = [startId];
  const impacted = new Set<string>();

  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);

    const importers = inbound?.[cur]?.import ?? [];
    for (const from of importers) {
      const t = nodeTypeById.get(from);
      if (t === 'page') impacted.add(from);
      if (t === 'snippet') queue.push(from);
    }
  }

  return [...impacted];
}

export default function ImpactPage() {
  const { data: nodes, isLoading: l1 } = useNodes();
  const { data: inbound, isLoading: l2 } = useEdgesInbound();
  const { data: metrics, isLoading: l3 } = useMetrics();
  const loading = l1 || l2 || l3;

  const [query, setQuery] = useState('');

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const id = searchParams?.get('id') || '';

  const nodesById = useMemo(() => {
    const m = new Map<string, any>();
    (nodes || []).forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  const node = useMemo(() => (id ? nodesById.get(id) : null), [id, nodesById]);

  const impactedPageIds = useMemo(() => {
    if (!node || !inbound) return [] as string[];
    if (node.type !== 'snippet') return [];
    return computeTransitiveImpactPages(node.id, nodesById, inbound);
  }, [node, inbound, nodesById]);

  const impactedPages = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = impactedPageIds
      .map((pid) => nodesById.get(pid))
      .filter(Boolean)
      .sort((a, b) => (a?.title || a?.filePath).localeCompare(b?.title || b?.filePath));

    if (!q) return out;
    return out.filter((p) => {
      const title = (p.title || '').toLowerCase();
      const path = (p.filePath || '').toLowerCase();
      const permalink = (p.permalink || '').toLowerCase();
      const nav = (p.navPaths || []).join(' | ').toLowerCase();
      return title.includes(q) || path.includes(q) || permalink.includes(q) || nav.includes(q);
    });
  }, [impactedPageIds, nodesById, query]);

  const impactedNavRoots = useMemo(() => {
    // Use the full impacted set (unfiltered) for distributions.
    const rootCounts = new Map<string, number>();
    for (const pid of impactedPageIds) {
      const p = nodesById.get(pid);
      const first = (p?.navPaths?.[0] || 'Unknown') as string;
      const root = first.split(' > ')[0] || 'Unknown';
      rootCounts.set(root, (rootCounts.get(root) ?? 0) + 1);
    }
    return [...rootCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [impactedPageIds, nodesById]);

  const impactedTopHubs = useMemo(() => {
    const pages = impactedPageIds
      .map((pid) => nodesById.get(pid))
      .filter(Boolean)
      .sort((a, b) => (metrics?.[b.id]?.inboundLinks ?? 0) - (metrics?.[a.id]?.inboundLinks ?? 0));
    return pages.slice(0, 20);
  }, [impactedPageIds, nodesById, metrics]);

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  if (!id || !node) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Impact</h1>
            <p className="text-muted-foreground mt-1">Open this from Explain (Impact button) for a snippet/component.</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/explain">Go to Explain</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const docsV2BlobBase = process.env.NEXT_PUBLIC_DOCS_V2_BLOB_BASE || 'https://github.com/auth0/docs-v2/blob/main';
  const ghUrl = `${docsV2BlobBase}/${node.filePath}`;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <Link href={`/explain?id=${encodeURIComponent(node.id)}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Explain
        </Link>

        <div className="rounded-xl border bg-card p-6 mb-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              {node.type === 'snippet' ? <Code2 className="w-5 h-5 text-accent" /> : <FileText className="w-5 h-5 text-primary" />}
              <Badge variant="secondary">{node.type}</Badge>
            </div>
            <a href={ghUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              View in GitHub <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          <h1 className="text-2xl font-bold mb-1">Impact: {node.title || node.filePath}</h1>
          <div className="text-sm text-muted-foreground font-mono break-all">{node.id}</div>

          {node.type !== 'snippet' ? (
            <div className="mt-4 text-sm text-muted-foreground">Impact view is currently implemented for snippets/components only.</div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Badge variant="secondary">impacted pages: {impactedPageIds.length}</Badge>
            </div>
          )}
        </div>

        {node.type === 'snippet' && (
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-4 h-4 text-muted-foreground" />
              <div className="font-semibold">Pages impacted (transitive imports)</div>
              <Badge variant="secondary" className="ml-auto">{impactedPages.length}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="rounded-xl border bg-secondary/20 p-4">
                <div className="text-xs text-muted-foreground mb-2">Impacted nav roots</div>
                <div className="flex flex-col gap-1 text-sm">
                  {impactedNavRoots.map(([root, count]) => (
                    <div key={root} className="flex items-center justify-between gap-3">
                      <span className="font-medium">{root}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                  ))}
                  {impactedNavRoots.length === 0 && <div className="text-sm text-muted-foreground">No nav root data.</div>}
                </div>
              </div>

              <div className="rounded-xl border bg-secondary/20 p-4">
                <div className="text-xs text-muted-foreground mb-2">Top hubs impacted (by inbound links)</div>
                <div className="flex flex-col gap-1 text-sm">
                  {impactedTopHubs.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between gap-3">
                      <a className="text-primary hover:underline truncate" href={`/explain?id=${encodeURIComponent(p.id)}`}>
                        {p.title || p.filePath}
                      </a>
                      <span className="text-muted-foreground shrink-0">{metrics?.[p.id]?.inboundLinks ?? 0}</span>
                    </div>
                  ))}
                  {impactedTopHubs.length === 0 && <div className="text-sm text-muted-foreground">No impacted pages.</div>}
                </div>
              </div>
            </div>

            <div className="mb-4">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter impacted pages…" className="h-11 rounded-2xl" />
            </div>

            <div className="flex flex-col gap-2">
              {impactedPages.map((p: any) => (
                <div key={p.id} className="rounded-xl border hover:bg-secondary/40 transition-colors">
                  <NodeCard node={p} />
                </div>
              ))}
              {impactedPages.length === 0 && <div className="text-sm text-muted-foreground">No impacted pages found.</div>}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
