'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Link2Off } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEdgesOutbound, useLinkHrefsOut, useNodes } from '@/hooks/use-index-data';

export default function BrokenLinksPage() {
  const { data: nodes, isLoading: l1 } = useNodes();
  const { data: outbound, isLoading: l2 } = useEdgesOutbound();
  const { data: hrefsOut, isLoading: l3 } = useLinkHrefsOut();
  const loading = l1 || l2 || l3;

  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pages = useMemo(() => (nodes || []).filter((n) => n.type === 'page'), [nodes]);
  const nodeById = useMemo(() => new Map((nodes || []).map((n) => [n.id, n] as const)), [nodes]);

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return pages.slice(0, 15);
    return pages
      .filter((p) => {
        const hay = `${p.title || ''} ${p.filePath} ${p.permalink || ''} ${(p.navPaths || []).join(' | ')}`.toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 30);
  }, [q, pages]);

  const selected = selectedId ? nodeById.get(selectedId) : null;

  const missingTargets = useMemo(() => {
    if (!selectedId || !outbound) return [] as string[];
    const targets = outbound[selectedId]?.link ?? [];
    return targets.filter((t) => !nodeById.has(t));
  }, [selectedId, outbound, nodeById]);

  const hrefPairs = useMemo(() => {
    if (!selectedId || !hrefsOut) return [] as Array<{ href: string; toId: string }>;
    return (hrefsOut[selectedId] || []).slice(0, 500);
  }, [selectedId, hrefsOut]);

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
          <h1 className="text-3xl font-bold tracking-tight mb-2">Broken link finder</h1>
          <p className="text-muted-foreground">Pick a page and review its outbound /docs links. This is a best-effort static analysis.</p>
        </div>

        {!selected ? (
          <div className="rounded-xl border bg-card p-6">
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search page…" className="pl-12 h-12 rounded-2xl" />
            </div>
            <div className="space-y-2">
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className="w-full text-left rounded-xl border hover:bg-secondary/40 transition-colors"
                >
                  <NodeCard node={p} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">selected</div>
                  <div className="text-lg font-semibold">{selected.title || selected.filePath}</div>
                  <div className="text-xs text-muted-foreground font-mono break-all">{selected.id}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setSelectedId(null)}>
                    Change page
                  </Button>
                  <Button asChild>
                    <Link href={`/explain?id=${encodeURIComponent(selected.id)}`}>Explain</Link>
                  </Button>
                </div>
              </div>
            </div>

            <Tabs defaultValue="outbound">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="outbound">Outbound links</TabsTrigger>
                <TabsTrigger value="missing">Missing targets</TabsTrigger>
              </TabsList>

              <TabsContent value="outbound" className="mt-4">
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Link2Off className="w-4 h-4 text-muted-foreground" />
                    <div className="font-semibold">Parsed markdown links</div>
                    <Badge variant="secondary" className="ml-auto">{hrefPairs.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {hrefPairs.map((x, idx) => (
                      <div key={`${x.href}||${idx}`} className="rounded-xl border p-4">
                        <div className="text-sm font-mono break-all">{x.href}</div>
                        <div className="text-xs text-muted-foreground mt-1">→ {x.toId}</div>
                        {nodeById.has(x.toId) ? (
                          <Link className="text-sm text-primary hover:underline mt-2 inline-block" href={`/explain?id=${encodeURIComponent(x.toId)}`}>
                            Open target
                          </Link>
                        ) : (
                          <div className="text-sm text-destructive mt-2">Target not found in index</div>
                        )}
                      </div>
                    ))}
                    {hrefPairs.length === 0 && <div className="text-sm text-muted-foreground">No /docs links found.</div>}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="missing" className="mt-4">
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold">Missing targets</div>
                    <Badge variant={missingTargets.length ? 'destructive' : 'secondary'}>{missingTargets.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {missingTargets.map((t) => (
                      <div key={t} className="rounded-xl border p-4">
                        <div className="text-sm font-mono break-all">{t}</div>
                      </div>
                    ))}
                    {missingTargets.length === 0 && <div className="text-sm text-muted-foreground">None</div>}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
