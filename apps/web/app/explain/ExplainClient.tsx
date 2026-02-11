'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, FileText, Code2, Copy, Github, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import SharedLinksExpander from '@/components/SharedLinksExpander';
import { useEdgesInbound, useEdgesOutbound, useMetrics, useNodes, useSimilarity, useNavPages } from '@/hooks/use-index-data';

function EdgeList({
  title,
  icon: Icon,
  edges,
  nodeMap,
  docsV2BlobBase
}: {
  title: string;
  icon: React.ElementType;
  edges: { link: string[]; import: string[]; redirect: string[] };
  nodeMap: Map<string, { title?: string; filePath: string }>;
  docsV2BlobBase: string;
}) {
  const total = edges.link.length + edges.import.length + edges.redirect.length;

  function label(id: string) {
    const n = nodeMap.get(id);
    return n?.title || n?.filePath || id;
  }

  function githubUrl(id: string) {
    const n = nodeMap.get(id);
    if (!n?.filePath) return null;
    return `${docsV2BlobBase}/${n.filePath}`;
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-bold">{title}</h3>
        <Badge variant="secondary" className="ml-auto">
          {total}
        </Badge>
      </div>

      {edges.link.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Links ({edges.link.length})
          </div>
          <ul className="space-y-1">
            {edges.link.slice(0, 50).map((x) => {
              const gh = githubUrl(x);
              return (
                <li key={x} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/explain?id=${encodeURIComponent(x)}`}
                    className="text-sm text-primary hover:underline truncate block"
                  >
                    {label(x)}
                  </Link>
                  {gh ? (
                    <a href={gh} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground">
                      GitHub
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {edges.import.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Imports ({edges.import.length})
          </div>
          <ul className="space-y-1">
            {edges.import.slice(0, 50).map((x) => {
              const gh = githubUrl(x);
              return (
                <li key={x} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/explain?id=${encodeURIComponent(x)}`}
                    className="text-sm text-accent hover:underline truncate block"
                  >
                    {label(x)}
                  </Link>
                  {gh ? (
                    <a href={gh} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground">
                      GitHub
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {edges.redirect.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Redirects ({edges.redirect.length})
          </div>
          <ul className="space-y-1">
            {edges.redirect.slice(0, 50).map((x) => (
              <li key={x} className="text-sm text-muted-foreground truncate">
                {x}
              </li>
            ))}
          </ul>
        </div>
      )}

      {total === 0 && <p className="text-sm text-muted-foreground">None</p>}
    </div>
  );
}

export default function ExplainPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const { data: nodes, isLoading: l1 } = useNodes();
  const { data: metrics, isLoading: l2 } = useMetrics();
  const { data: inbound, isLoading: l3 } = useEdgesInbound();
  const { data: outbound, isLoading: l4 } = useEdgesOutbound();
  const { data: similarity, isLoading: l5 } = useSimilarity();
  const { data: navPages, isLoading: l6 } = useNavPages();

  const [query, setQuery] = useState('');

  const loading = l1 || l2 || l3 || l4 || l5 || l6;

  const nodeMap = useMemo(() => {
    const m = new Map<string, { title?: string; filePath: string }>();
    nodes?.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  const node = useMemo(() => nodes?.find((n) => n.id === id) ?? null, [nodes, id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  if (!id) {
    const pages = (nodes || []).filter((n) => n.type === 'page');
    const q = query.trim().toLowerCase();

    const results = (() => {
      if (!metrics) return [];
      if (!q) {
        return [...pages]
          .map((n) => ({ ...n, score: metrics[n.id]?.inboundLinks ?? 0 }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 20);
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
    })();

    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Explain</h1>
            <p className="text-muted-foreground mt-1">
              Choose a page to get a context + risk summary (inbound links, nav paths, shared links, and similar pages).
            </p>
          </div>

          <div className="relative mb-5">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a page to explain…"
              className="pl-12 h-12 text-base rounded-2xl"
            />
          </div>

          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
              {q ? 'Matches' : 'Top hubs (good starting points)'}
            </h2>
            <span className="text-xs text-muted-foreground">{results.length} results</span>
          </div>

          <div className="flex flex-col gap-2">
            {results.map((n, i) => (
              <button
                key={n.id}
                type="button"
                onClick={() => router.push(`/explain?id=${encodeURIComponent(n.id)}`)}
                className="text-left rounded-xl border hover:bg-secondary/40 transition-colors"
              >
                <NodeCard node={n} metrics={metrics?.[n.id]} rank={!q ? i + 1 : undefined} />
              </button>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!node) {
    return (
      <AppLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground mb-2">Node not found</p>
          <code className="text-sm">{id}</code>
        </div>
      </AppLayout>
    );
  }

  const m = metrics?.[node.id];
  const inE = inbound?.[node.id] || { link: [], import: [], redirect: [] };
  const outE = outbound?.[node.id] || { link: [], import: [], redirect: [] };
  const twins = (similarity?.[node.id] || []).slice(0, 5);

  const docsV2BlobBase = process.env.NEXT_PUBLIC_DOCS_V2_BLOB_BASE || 'https://github.com/auth0/docs-v2/blob/main';
  const docsV2Url = `${docsV2BlobBase}/${node.filePath}`;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', description: `${label} copied to clipboard` });
    } catch {
      toast({ title: 'Copy failed', description: 'Could not access clipboard', variant: 'destructive' });
    }
  }

  const deepLink = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to search
        </Link>

        <div className="rounded-xl border bg-card p-6 mb-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              {node.type === 'snippet' ? (
                <Code2 className="w-5 h-5 text-accent" />
              ) : (
                <FileText className="w-5 h-5 text-primary" />
              )}
              <Badge variant="secondary">{node.type}</Badge>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => copy(node.id, 'Node id')}>
                <Copy className="w-4 h-4 mr-2" />
                Copy id
              </Button>
              <Button variant="outline" size="sm" onClick={() => copy(node.filePath, 'File path')}>
                <Copy className="w-4 h-4 mr-2" />
                Copy path
              </Button>
              <Button variant="outline" size="sm" onClick={() => copy(deepLink, 'Link')} disabled={!deepLink}>
                <Copy className="w-4 h-4 mr-2" />
                Copy link
              </Button>
              <a href={docsV2Url} target="_blank" rel="noreferrer">
                <Button variant="default" size="sm">
                  <Github className="w-4 h-4 mr-2" />
                  View in GitHub
                </Button>
              </a>
            </div>
          </div>

          <h1 className="text-2xl font-bold mb-2">{node.title || node.filePath}</h1>
          <code className="text-sm text-muted-foreground block mb-4">{node.id}</code>

          {m && (
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1">
                <ArrowDownLeft className="w-4 h-4 text-primary" /> <b>{m.inboundLinks}</b> inbound
              </div>
              <div className="flex items-center gap-1">
                <ArrowUpRight className="w-4 h-4 text-accent" /> <b>{m.outboundLinks}</b> outbound
              </div>
              <div>
                imported by: <b>{m.importedBy}</b>
              </div>
              {m.impactPages != null && (
                <div>
                  impact pages: <b>{m.impactPages}</b>
                </div>
              )}
              {m.hubScore != null && (
                <div>
                  hub score: <b>{m.hubScore}</b>
                </div>
              )}
            </div>
          )}

          {(node.navPaths?.length > 0 || navPages?.[node.id]?.navNodePaths?.length) && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Navigation</div>
                {navPages?.[node.id]?.navLabelSource ? (
                  <div className="text-[10px] text-muted-foreground">
                    label source: <b>{navPages[node.id]?.navLabelSource}</b>
                  </div>
                ) : null}
              </div>

              {navPages?.[node.id]?.navNodePaths?.length ? (
                <ul className="space-y-1">
                  {navPages[node.id].navNodePaths.map((p) => (
                    <li key={p.pathString} className="text-sm">
                      {p.pathString}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="space-y-1">
                  {node.navPaths.map((p) => (
                    <li key={p} className="text-sm">
                      {p}
                    </li>
                  ))}
                </ul>
              )}

              {navPages?.[node.id]?.navDepth != null ? (
                <div className="text-xs text-muted-foreground mt-2">nav depth: {navPages[node.id].navDepth}</div>
              ) : null}
            </div>
          )}
        </div>

        {twins.length > 0 && (
          <div className="rounded-xl border bg-card p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-bold">Related Content (Graph Convergence)</div>
                <div className="text-sm text-muted-foreground">
                  Pages with similar outbound/inbound link neighborhoods (hubs filtered). Useful for spotting cross-nav duplicates.
                </div>
              </div>
              <Badge variant="secondary">top {twins.length}</Badge>
            </div>

            <div className="space-y-2">
              {twins.map((t) => {
                const n = nodeMap.get(t.id);
                const gh = n?.filePath ? `${docsV2BlobBase}/${n.filePath}` : null;
                return (
                  <div key={t.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/explain?id=${encodeURIComponent(t.id)}`} className="font-medium hover:underline truncate block">
                          {n?.title || n?.filePath || t.id}
                        </Link>
                        <div className="text-xs text-muted-foreground font-mono truncate">{t.id}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          score <b>{t.score}</b> · shared out <b>{t.sharedOut}</b> · shared in <b>{t.sharedIn}</b>
                          {t.isCrossNav === true ? ' · cross-nav' : ''}
                          {t.diffFolder === true ? ' · diff-folder' : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.highValueConvergence && <Badge variant="destructive">alert</Badge>}
                        {gh ? (
                          <a href={gh} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground">
                            GitHub
                          </a>
                        ) : null}
                      </div>
                    </div>

                    {outbound && metrics ? (
                      <SharedLinksExpander aId={node.id} bId={t.id} outbound={outbound} metrics={metrics as any} nodeMap={nodeMap} />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EdgeList title="Inbound" icon={ArrowDownLeft} edges={inE} nodeMap={nodeMap} docsV2BlobBase={docsV2BlobBase} />
          <EdgeList title="Outbound" icon={ArrowUpRight} edges={outE} nodeMap={nodeMap} docsV2BlobBase={docsV2BlobBase} />
        </div>
      </div>
    </AppLayout>
  );
}
