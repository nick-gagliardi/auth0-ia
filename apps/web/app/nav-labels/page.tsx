'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useNavLabelCollisions, useNavPages, useNodes } from '@/hooks/use-index-data';

export default function NavLabelsPage() {
  const { data: nodes, isLoading: l1 } = useNodes();
  const { data: navPages, isLoading: l2 } = useNavPages();
  const { data: collisions, isLoading: l3 } = useNavLabelCollisions();

  const [q, setQ] = useState('');
  const loading = l1 || l2 || l3;

  const nodeById = useMemo(() => {
    const m = new Map<string, any>();
    (nodes || []).forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  const filtered = useMemo(() => {
    const all = collisions?.collisions ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return all;
    return all.filter((c) => c.label.toLowerCase().includes(qq) || c.pages.some((p) => p.filePath.toLowerCase().includes(qq)));
  }, [collisions, q]);

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Nav Label Intelligence</h1>
        <p className="text-muted-foreground mb-6">
          Find repeated (colliding) navigation labels and inspect the exact nav node path(s) for each page.
        </p>

        <div className="mb-6">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter collisions by label or file path…"
            className="h-11 rounded-2xl"
          />
        </div>

        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Label collisions</h2>
          <span className="text-xs text-muted-foreground">{filtered.length} labels</span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground">No collisions found for this filter.</div>
        ) : (
          <div className="space-y-3">
            {filtered.slice(0, 200).map((c) => (
              <div key={c.label} className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="font-semibold truncate">{c.label}</div>
                  <Badge variant="secondary" className="ml-auto">
                    {c.count}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {c.pages.slice(0, 20).map((p) => {
                    const n = nodeById.get(p.id);
                    const meta = navPages?.[p.id];
                    const paths = meta?.navNodePaths ?? [];

                    return (
                      <div key={p.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link href={`/explain?id=${encodeURIComponent(p.id)}`} className="text-primary hover:underline font-medium truncate block">
                              {n?.title || p.title || p.filePath}
                            </Link>
                            <div className="text-xs text-muted-foreground font-mono truncate">{p.filePath}</div>
                            {meta?.navLabelSource ? (
                              <div className="text-xs text-muted-foreground mt-1">
                                nav label source: <b>{meta.navLabelSource}</b>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {paths.length > 0 ? (
                          <div className="mt-3">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Exact nav node path(s)</div>
                            <ul className="space-y-1">
                              {paths.slice(0, 4).map((pp) => (
                                <li key={pp.pathString} className="text-xs text-muted-foreground">
                                  {pp.pathString}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-muted-foreground">Not found in nav tree.</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {c.pages.length > 20 && <div className="text-xs text-muted-foreground mt-3">Showing 20 of {c.pages.length}</div>}
              </div>
            ))}

            {filtered.length > 200 && <div className="text-xs text-muted-foreground">Showing 200 of {filtered.length}</div>}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
