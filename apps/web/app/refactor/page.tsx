'use client';

import { useMemo, useState } from 'react';
import { Download, GitPullRequest, Info, Search } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMetrics, useNodes } from '@/hooks/use-index-data';

type Operation = 'move-page' | 'move-subtree';

function downloadJson(filename: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function RefactorPage() {
  const { data: nodes, isLoading: loadingNodes } = useNodes();
  const { data: metrics, isLoading: loadingMetrics } = useMetrics();
  const loading = loadingNodes || loadingMetrics;

  const [op, setOp] = useState<Operation>('move-page');
  const [sourceQuery, setSourceQuery] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  const [destPermalink, setDestPermalink] = useState('');
  const [destFilePath, setDestFilePath] = useState('');

  const pages = useMemo(() => (nodes || []).filter((n) => n.type === 'page'), [nodes]);

  const sourceMatches = useMemo(() => {
    if (!pages || !metrics) return [];
    const q = sourceQuery.trim().toLowerCase();
    if (!q) {
      return [...pages]
        .map((n) => ({ ...n, score: metrics[n.id]?.inboundLinks ?? 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);
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
    return out.sort((a, b) => b.score - a.score).slice(0, 30);
  }, [pages, metrics, sourceQuery]);

  const selected = useMemo(() => {
    if (!selectedSourceId) return null;
    return pages.find((p) => p.id === selectedSourceId) || null;
  }, [pages, selectedSourceId]);

  const plan = useMemo(() => {
    if (!selected) return null;

    const oldPermalink = selected.permalink || '';
    const oldFilePath = selected.filePath || '';

    const nextPermalink = destPermalink.trim();
    const nextFilePath = destFilePath.trim();

    const warnings: string[] = [];
    if (!nextPermalink && !nextFilePath) warnings.push('Destination is empty. Fill permalink and/or file path to generate a useful plan.');
    if (nextPermalink && !nextPermalink.startsWith('/')) warnings.push('Destination permalink should start with /.');

    // Basic redirect suggestion: old permalink -> new permalink (when both present)
    const redirects =
      oldPermalink && nextPermalink && oldPermalink !== nextPermalink
        ? [{ from: oldPermalink, to: nextPermalink }]
        : [];

    // Basic move suggestion: old file -> new file (when both present)
    const moves =
      oldFilePath && nextFilePath && oldFilePath !== nextFilePath
        ? [{ from: oldFilePath, to: nextFilePath }]
        : [];

    return {
      kind: 'refactor-plan',
      version: 1,
      operation: op,
      source: {
        id: selected.id,
        title: selected.title,
        permalink: oldPermalink,
        filePath: oldFilePath,
        navPaths: selected.navPaths || [],
      },
      destination: {
        permalink: nextPermalink || null,
        filePath: nextFilePath || null,
      },
      proposed: {
        moves,
        redirects,
        linkRewrites: [],
        docsJsonEdits: [],
      },
      notes: {
        inboundLinks: metrics?.[selected.id]?.inboundLinks ?? null,
      },
      warnings,
      generatedAtUtc: new Date().toISOString(),
    };
  }, [destFilePath, destPermalink, metrics, op, selected]);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
              <GitPullRequest className="w-6 h-6 text-primary" />
              Refactor Assistant
              <Badge variant="secondary" className="text-xs">MVP</Badge>
            </h1>
            <p className="text-muted-foreground mt-1">
              Plan a move/rename safely. This MVP generates an exportable refactor plan (moves + redirects) from the index.
            </p>
          </div>

          <div className="hidden sm:flex gap-2">
            <Button
              variant="secondary"
              disabled={!plan}
              onClick={() => plan && downloadJson('refactor-plan.json', plan)}
              className="gap-2"
            >
              <Download className="w-4 h-4" /> Export plan
            </Button>
          </div>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>What this does (today)</AlertTitle>
          <AlertDescription>
            You pick a source page, type the destination permalink/file path, and export a plan JSON you can hand to a human or CI automation.
            Next iteration will add link rewrite detection + docs.json diff + PR creation.
          </AlertDescription>
        </Alert>

        <Tabs value={op} onValueChange={(v) => setOp(v as Operation)}>
          <TabsList>
            <TabsTrigger value="move-page">Move / rename a page</TabsTrigger>
            <TabsTrigger value="move-subtree">Move a subtree</TabsTrigger>
          </TabsList>
          <TabsContent value="move-page" className="mt-4" />
          <TabsContent value="move-subtree" className="mt-4" />
        </Tabs>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1) Choose source</CardTitle>
              <CardDescription>Search for the page you want to move/rename.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  value={sourceQuery}
                  onChange={(e) => setSourceQuery(e.target.value)}
                  placeholder="Search… title, path, permalink, nav"
                  className="pl-12 h-11 rounded-2xl"
                />
              </div>

              {loading && <div className="text-sm text-muted-foreground py-6">Loading index…</div>}

              {!loading && (
                <div className="flex flex-col gap-2">
                  {sourceMatches.map((n, i) => {
                    const active = n.id === selectedSourceId;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => setSelectedSourceId(n.id)}
                        className={`text-left rounded-xl border transition-colors ${
                          active ? 'border-primary bg-primary/5' : 'hover:bg-secondary/40'
                        }`}
                      >
                        <NodeCard node={n} metrics={metrics?.[n.id]} rank={!sourceQuery.trim() ? i + 1 : undefined} />
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2) Destination</CardTitle>
              <CardDescription>Fill what you know. Permalink drives redirects; file path drives git moves.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="destPermalink">New permalink</Label>
                <Input
                  id="destPermalink"
                  value={destPermalink}
                  onChange={(e) => setDestPermalink(e.target.value)}
                  placeholder="/docs/secure/your-new-slug"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="destFilePath">New file path</Label>
                <Input
                  id="destFilePath"
                  value={destFilePath}
                  onChange={(e) => setDestFilePath(e.target.value)}
                  placeholder="main/docs/secure/your-new-slug.mdx"
                />
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <Button
                  variant="secondary"
                  disabled={!plan}
                  onClick={() => plan && downloadJson('refactor-plan.json', plan)}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" /> Export plan
                </Button>
              </div>

              <div className="border-t pt-4">
                <div className="text-sm font-semibold mb-2">Plan preview</div>
                {!plan ? (
                  <div className="text-sm text-muted-foreground">Pick a source page to generate a plan.</div>
                ) : (
                  <pre className="text-xs bg-secondary/30 rounded-xl p-3 overflow-auto max-h-80">{JSON.stringify(plan, null, 2)}</pre>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
