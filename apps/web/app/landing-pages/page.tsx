'use client';

import { useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNodes } from '@/hooks/use-index-data';

function prefixes(navPath: string): string[] {
  const parts = navPath.split(' > ').map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join(' > '));
  return out;
}

export default function LandingPagesPage() {
  const { data: nodes, isLoading } = useNodes();

  const pages = useMemo(() => (nodes || []).filter((n) => n.type === 'page'), [nodes]);

  const groups = useMemo(() => {
    // groupKey -> { key, children: Set<pageId>, hasLanding: boolean }
    const m = new Map<string, { key: string; children: Set<string>; hasLanding: boolean }>();

    for (const p of pages) {
      for (const navPath of p.navPaths || []) {
        // mark landing pages: exact navPath string exists as a page's navPath
        // (this is heuristic, but works well in practice)
        const self = m.get(navPath) ?? { key: navPath, children: new Set(), hasLanding: false };
        self.hasLanding = true;
        m.set(navPath, self);

        for (const pref of prefixes(navPath)) {
          const g = m.get(pref) ?? { key: pref, children: new Set(), hasLanding: false };
          g.children.add(p.id);
          m.set(pref, g);
        }
      }
    }

    const out = [...m.values()]
      .filter((g) => g.children.size >= 6 && !g.hasLanding)
      .map((g) => ({ ...g, children: [...g.children] }))
      .sort((a, b) => b.children.length - a.children.length)
      .slice(0, 200);

    return out;
  }, [pages]);

  const nodeById = useMemo(() => new Map(pages.map((p) => [p.id, p] as const)), [pages]);

  if (isLoading) {
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
          <h1 className="text-3xl font-bold tracking-tight mb-2">Landing pages needed</h1>
          <p className="text-muted-foreground">
            Heuristic detector: nav groups with many child pages but no detected “landing” page.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Candidates</CardTitle>
            <CardDescription>Start with the biggest groups. These usually deserve an overview page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {groups.map((g) => (
              <div key={g.key} className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">{g.key}</div>
                  <Badge variant="secondary">{g.children.length} pages</Badge>
                </div>
                <div className="space-y-2">
                  {g.children.slice(0, 8).map((id: string) => {
                    const p = nodeById.get(id);
                    if (!p) return null;
                    return <NodeCard key={id} node={p} />;
                  })}
                  {g.children.length > 8 ? (
                    <div className="text-xs text-muted-foreground">Showing 8 of {g.children.length}</div>
                  ) : null}
                </div>
              </div>
            ))}
            {groups.length === 0 && <div className="text-sm text-muted-foreground">No candidates found (or navPaths missing).</div>}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
