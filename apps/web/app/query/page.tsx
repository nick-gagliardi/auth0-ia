'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { useMetrics, useNodes, useSimilarity } from '@/hooks/use-index-data';

function norm(s: string) {
  return (s || '').trim().toLowerCase();
}

function hubScore(metrics: any, id: string) {
  return metrics?.[id]?.hubScore ?? metrics?.[id]?.inboundLinks ?? 0;
}

export default function QueryPage() {
  const { data: nodes, isLoading: l1 } = useNodes();
  const { data: metrics, isLoading: l2 } = useMetrics();
  const { data: similarity, isLoading: l3 } = useSimilarity();
  const loading = l1 || l2 || l3;

  const [q, setQ] = useState('');

  const pages = useMemo(() => (nodes || []).filter((n) => n.type === 'page'), [nodes]);

  const keywordHubs = useMemo(() => {
    if (!metrics) return [] as any[];
    const query = norm(q);
    if (!query) return [];

    const out: any[] = [];
    for (const p of pages) {
      const hay = `${p.title || ''} ${p.permalink || ''} ${p.filePath} ${(p.navPaths || []).join(' | ')}`.toLowerCase();
      if (!hay.includes(query)) continue;
      out.push({ ...p, score: hubScore(metrics, p.id) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 30);
  }, [q, pages, metrics]);

  const canonicalHubs = useMemo(() => {
    if (!metrics) return [] as any[];
    const out = [...pages]
      .map((p) => ({ ...p, score: hubScore(metrics, p.id) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    return out;
  }, [pages, metrics]);

  const duplicateTitles = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const p of pages) {
      const t = norm(p.title || '');
      if (!t) continue;
      const arr = map.get(t) ?? [];
      arr.push(p);
      map.set(t, arr);
    }
    const dups = [...map.entries()]
      .filter(([, arr]) => arr.length >= 2)
      .map(([title, arr]) => ({ title, items: arr }));

    // rank by max hub score
    if (!metrics) return dups;
    return dups
      .map((d) => ({
        ...d,
        score: Math.max(...d.items.map((p) => hubScore(metrics, p.id))),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 100);
  }, [pages, metrics]);

  const suggestedNavRoots = useMemo(() => {
    // very light heuristic: based on highest-overlap nav roots among keyword matches.
    const query = norm(q);
    if (!query) return [] as { root: string; count: number }[];

    const roots = new Map<string, number>();
    for (const p of keywordHubs) {
      const root = (p.navPaths?.[0] || '').split(' > ')[0]?.trim();
      if (!root) continue;
      roots.set(root, (roots.get(root) ?? 0) + 1);
    }
    return [...roots.entries()]
      .map(([root, count]) => ({ root, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [q, keywordHubs]);

  // “duplicates for this concept”: use similarity neighborhood of top keyword hit.
  const topHit = keywordHubs[0];
  const similarToTopHit = useMemo(() => {
    if (!topHit || !similarity) return [] as any[];
    const rels = (similarity[topHit.id] || []).slice(0, 10);
    const idSet = new Set(rels.map((r) => r.id));
    return pages.filter((p) => idSet.has(p.id));
  }, [topHit, similarity, pages]);

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Ask the graph</h1>
          <p className="text-muted-foreground">Deterministic, index-driven queries for writers. No AI required.</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Query</CardTitle>
            <CardDescription>Type a concept (e.g. pkce, refresh token, actions, orgs, m2m).</CardDescription>
          </CardHeader>
          <CardContent>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search concept…" className="h-11 rounded-2xl" />
            {q.trim() ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestedNavRoots.map((r) => (
                  <Badge key={r.root} variant="secondary">{r.root} · {r.count}</Badge>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Tabs defaultValue="where">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="where">Where should this live?</TabsTrigger>
            <TabsTrigger value="hubs">Canonical hubs</TabsTrigger>
            <TabsTrigger value="dups">Duplicate titles</TabsTrigger>
            <TabsTrigger value="similar">Duplicates for this concept</TabsTrigger>
          </TabsList>

          <TabsContent value="where" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Nav placement suggestions</CardTitle>
                <CardDescription>Heuristic: nav roots that already contain the most matching pages.</CardDescription>
              </CardHeader>
              <CardContent>
                {q.trim() ? (
                  <div className="space-y-2">
                    {suggestedNavRoots.map((r) => (
                      <div key={r.root} className="rounded-xl border bg-card p-4 flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{r.root}</div>
                          <div className="text-sm text-muted-foreground">{r.count} related pages</div>
                        </div>
                        <Button asChild variant="secondary">
                          <Link href={`/dashboards`}>Open dashboards</Link>
                        </Button>
                      </div>
                    ))}
                    {suggestedNavRoots.length === 0 && <div className="text-sm text-muted-foreground">No signal yet. Try a broader term.</div>}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Enter a concept above.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hubs" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Top hubs</CardTitle>
                <CardDescription>Most-linked pages (hubScore). These deserve “canonical” treatment.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {canonicalHubs.map((p: any, i) => (
                  <Link key={p.id} href={`/explain?id=${encodeURIComponent(p.id)}`} className="block rounded-xl border hover:bg-secondary/40 transition-colors">
                    <NodeCard node={p} metrics={metrics?.[p.id]} rank={i + 1} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dups" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Duplicate titles</CardTitle>
                <CardDescription>Common source of confusion (especially cross-nav).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {duplicateTitles.map((d: any) => (
                  <div key={d.title} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{d.title}</div>
                      <Badge variant="secondary">{d.items.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {d.items.slice(0, 8).map((p: any) => (
                        <Link key={p.id} href={`/explain?id=${encodeURIComponent(p.id)}`} className="block rounded-lg border hover:bg-secondary/40 transition-colors">
                          <NodeCard node={p} metrics={metrics?.[p.id]} />
                        </Link>
                      ))}
                      {d.items.length > 8 ? <div className="text-xs text-muted-foreground">Showing 8 of {d.items.length}</div> : null}
                    </div>
                  </div>
                ))}
                {duplicateTitles.length === 0 && <div className="text-sm text-muted-foreground">No duplicates found (or missing titles in frontmatter).</div>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="similar" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Duplicates for this concept</CardTitle>
                <CardDescription>Uses link-neighborhood similarity. Good for spotting near-duplicate journeys.</CardDescription>
              </CardHeader>
              <CardContent>
                {!q.trim() ? (
                  <div className="text-sm text-muted-foreground">Enter a concept above.</div>
                ) : !topHit ? (
                  <div className="text-sm text-muted-foreground">No matches.</div>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-xl border bg-card p-4">
                      <div className="text-xs text-muted-foreground mb-1">seed page</div>
                      <Link href={`/explain?id=${encodeURIComponent(topHit.id)}`} className="text-primary hover:underline font-semibold">
                        {topHit.title || topHit.filePath}
                      </Link>
                    </div>
                    {similarToTopHit.map((p: any) => (
                      <Link key={p.id} href={`/explain?id=${encodeURIComponent(p.id)}`} className="block rounded-xl border hover:bg-secondary/40 transition-colors">
                        <NodeCard node={p} metrics={metrics?.[p.id]} />
                      </Link>
                    ))}
                    {similarToTopHit.length === 0 && <div className="text-sm text-muted-foreground">No similar pages found for the seed.</div>}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
