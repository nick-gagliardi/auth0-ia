'use client';

import { useMemo, useState } from 'react';
import { Download, GitPullRequest, Info, Search, Loader2, CheckCircle, ExternalLink, FileText, ArrowRight, AlertTriangle } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useMetrics, useNodes, useEdgesInbound } from '@/hooks/use-index-data';
import { recordActivity } from '@/hooks/use-activity-history';

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
  const { toast } = useToast();
  const { data: nodes, isLoading: loadingNodes } = useNodes();
  const { data: metrics, isLoading: loadingMetrics } = useMetrics();
  const { data: inboundEdges, isLoading: loadingInbound } = useEdgesInbound();
  const loading = loadingNodes || loadingMetrics || loadingInbound;

  const [op, setOp] = useState<Operation>('move-page');
  const [sourceQuery, setSourceQuery] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  const [destPermalink, setDestPermalink] = useState('');
  const [destFilePath, setDestFilePath] = useState('');

  const [applyLinkRewrites, setApplyLinkRewrites] = useState(true);
  const [applyRedirects, setApplyRedirects] = useState(true);
  const [creatingPr, setCreatingPr] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [prError, setPrError] = useState<string | null>(null);

  const pages = useMemo(() => (nodes || []).filter((n) => n.type === 'page'), [nodes]);

  // Build a map of page ID to node for lookups
  const nodeById = useMemo(() => {
    const m = new Map<string, typeof pages[number]>();
    pages.forEach((n) => m.set(n.id, n));
    return m;
  }, [pages]);

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

  // Get inbound links to the selected page
  const inboundPages = useMemo(() => {
    if (!selected || !inboundEdges) return [];
    const links = inboundEdges[selected.id]?.link || [];
    return links
      .map(id => nodeById.get(id))
      .filter((n): n is NonNullable<typeof n> => !!n);
  }, [selected, inboundEdges, nodeById]);

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

    // Detect link rewrites needed in inbound pages
    const linkRewrites: { file: string; oldLink: string; newLink: string }[] = [];
    if (oldPermalink && nextPermalink && oldPermalink !== nextPermalink) {
      for (const page of inboundPages) {
        linkRewrites.push({
          file: page.filePath,
          oldLink: oldPermalink,
          newLink: nextPermalink,
        });
      }
    }

    return {
      kind: 'refactor-plan' as const,
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
        linkRewrites,
        docsJsonEdits: [],
      },
      notes: {
        inboundLinks: metrics?.[selected.id]?.inboundLinks ?? null,
      },
      warnings,
      generatedAtUtc: new Date().toISOString(),
    };
  }, [destFilePath, destPermalink, metrics, op, selected, inboundPages]);

  // Create PR handler
  const handleCreatePr = async () => {
    if (!plan) return;

    setCreatingPr(true);
    setPrUrl(null);
    setPrError(null);

    try {
      const prTitle = `Refactor: ${plan.source.title || 'page'} → ${plan.destination.permalink || plan.destination.filePath}`;
      const prBody = [
        '## Refactor Summary',
        '',
        `**Source:** ${plan.source.title || plan.source.filePath}`,
        `**From:** ${plan.source.permalink}`,
        `**To:** ${plan.destination.permalink}`,
        '',
        '### Changes',
        '',
        plan.proposed.moves.length > 0 ? `- File moves: ${plan.proposed.moves.length}` : '',
        plan.proposed.redirects.length > 0 ? `- Redirects: ${plan.proposed.redirects.length}` : '',
        plan.proposed.linkRewrites.length > 0 ? `- Link rewrites: ${plan.proposed.linkRewrites.length}` : '',
        '',
        '---',
        'Generated by Auth0 IA Refactor Assistant',
      ].filter(Boolean).join('\n');

      const res = await fetch('/api/refactor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          prTitle,
          prBody,
          applyLinkRewrites,
          applyRedirects,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setPrUrl(data.compareUrl);
        toast({ title: 'Branch created', description: 'Review changes and open PR' });

        // Record activity
        recordActivity({
          type: 'refactor',
          title: plan.source.title || plan.source.filePath,
          description: `Moved to ${plan.destination.permalink || plan.destination.filePath}`,
          filePath: plan.source.filePath,
          url: data.compareUrl,
          metadata: { nodeId: plan.source.id, branchName: data.branchName },
        });
      } else {
        setPrError(data.error || 'Unknown error');
        toast({ title: 'PR creation failed', description: data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      setPrError(e?.message || 'Network error');
      toast({ title: 'Error', description: e?.message || 'Network error', variant: 'destructive' });
    } finally {
      setCreatingPr(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
              <GitPullRequest className="w-6 h-6 text-primary" />
              Refactor Assistant
            </h1>
            <p className="text-muted-foreground mt-1">
              Plan and execute page moves safely. Generates redirects, rewrites links, and creates PRs.
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
          <AlertTitle>Refactor Workflow</AlertTitle>
          <AlertDescription>
            1. Pick a source page  2. Enter the new permalink/file path  3. Review proposed changes  4. Create a PR with file moves, redirects, and link updates
          </AlertDescription>
        </Alert>

        {prUrl && (
          <Alert className="border-green-500/50 bg-green-500/5">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertTitle>Branch Created</AlertTitle>
            <AlertDescription className="flex items-center gap-2">
              <a href={prUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
                Review and Open PR <ExternalLink className="w-3 h-3" />
              </a>
            </AlertDescription>
          </Alert>
        )}

        {prError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>PR Creation Failed</AlertTitle>
            <AlertDescription>{prError}</AlertDescription>
          </Alert>
        )}

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

              {/* PR Options */}
              {plan && (plan.proposed.linkRewrites.length > 0 || plan.proposed.redirects.length > 0) && (
                <div className="border-t pt-4 space-y-3">
                  <div className="text-sm font-semibold">PR Options</div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="applyRedirects"
                      checked={applyRedirects}
                      onCheckedChange={setApplyRedirects}
                    />
                    <Label htmlFor="applyRedirects" className="text-sm">
                      Add redirects ({plan.proposed.redirects.length})
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="applyLinkRewrites"
                      checked={applyLinkRewrites}
                      onCheckedChange={setApplyLinkRewrites}
                    />
                    <Label htmlFor="applyLinkRewrites" className="text-sm">
                      Rewrite links in {plan.proposed.linkRewrites.length} files
                    </Label>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <Button
                  variant="secondary"
                  disabled={!plan}
                  onClick={() => plan && downloadJson('refactor-plan.json', plan)}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" /> Export plan
                </Button>
                <Button
                  disabled={!plan || creatingPr || plan.warnings.length > 0}
                  onClick={handleCreatePr}
                  className="gap-2"
                >
                  {creatingPr ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Creating...
                    </>
                  ) : (
                    <>
                      <GitPullRequest className="w-4 h-4" /> Create PR
                    </>
                  )}
                </Button>
              </div>

              {/* Link Rewrites Preview */}
              {plan && plan.proposed.linkRewrites.length > 0 && (
                <div className="border-t pt-4">
                  <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Link Rewrites ({plan.proposed.linkRewrites.length} files)
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {plan.proposed.linkRewrites.slice(0, 20).map((rewrite, i) => (
                      <div key={i} className="text-xs font-mono bg-secondary/30 rounded px-2 py-1 flex items-center gap-1">
                        <span className="truncate">{rewrite.file}</span>
                      </div>
                    ))}
                    {plan.proposed.linkRewrites.length > 20 && (
                      <div className="text-xs text-muted-foreground">
                        +{plan.proposed.linkRewrites.length - 20} more files
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Plan Preview */}
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
