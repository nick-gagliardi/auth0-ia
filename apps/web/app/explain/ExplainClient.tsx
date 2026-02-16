'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, FileText, Code2, Copy, Github, Search, AlertCircle, Sparkles, Compass, X, Filter, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import SharedLinksExpander from '@/components/SharedLinksExpander';
import { useEdgesInbound, useEdgesOutbound, useMetrics, useNodes, useSimilarity, useNavPages } from '@/hooks/use-index-data';
import type { DocNode, NodeMetrics } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Date filter options
type DateFilter = 'all' | 'last30days' | 'last6months' | 'older1year';

// Extract unique nav sections from nodes
function extractNavSections(nodes: DocNode[]): string[] {
  const sections = new Set<string>();
  nodes.forEach((node) => {
    node.navPaths?.forEach((path) => {
      const parts = path.split(' > ');
      if (parts.length >= 2) {
        sections.add(parts[1]); // Second level is the section
      }
    });
  });
  return Array.from(sections).sort();
}

// Check if node matches date filter
function matchesDateFilter(node: DocNode, filter: DateFilter): boolean {
  if (filter === 'all') return true;
  if (!node.lastModified) return filter === 'older1year'; // Treat missing dates as old

  const modified = new Date(node.lastModified).getTime();
  const now = Date.now();
  const days30 = 30 * 24 * 60 * 60 * 1000;
  const months6 = 180 * 24 * 60 * 60 * 1000;
  const year1 = 365 * 24 * 60 * 60 * 1000;

  switch (filter) {
    case 'last30days':
      return now - modified <= days30;
    case 'last6months':
      return now - modified <= months6;
    case 'older1year':
      return now - modified >= year1;
    default:
      return true;
  }
}

// Check if node matches nav section filter
function matchesNavSection(node: DocNode, section: string): boolean {
  if (!section) return true;
  return node.navPaths?.some((path) => {
    const parts = path.split(' > ');
    return parts.length >= 2 && parts[1] === section;
  }) ?? false;
}

// Loading skeleton components
function NodeHeaderSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6 mb-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="w-16 h-5 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="w-24 h-8 rounded" />
          <Skeleton className="w-24 h-8 rounded" />
          <Skeleton className="w-24 h-8 rounded" />
          <Skeleton className="w-28 h-8 rounded" />
        </div>
      </div>
      <Skeleton className="w-3/4 h-8 rounded mb-2" />
      <Skeleton className="w-1/2 h-4 rounded mb-4" />
      <div className="flex flex-wrap gap-4">
        <Skeleton className="w-24 h-5 rounded" />
        <Skeleton className="w-24 h-5 rounded" />
        <Skeleton className="w-28 h-5 rounded" />
      </div>
    </div>
  );
}

function EdgeListSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="w-4 h-4 rounded" />
        <Skeleton className="w-20 h-5 rounded" />
        <Skeleton className="w-8 h-5 rounded ml-auto" />
      </div>
      <div className="space-y-3">
        <Skeleton className="w-full h-4 rounded" />
        <Skeleton className="w-11/12 h-4 rounded" />
        <Skeleton className="w-10/12 h-4 rounded" />
        <Skeleton className="w-full h-4 rounded" />
        <Skeleton className="w-9/12 h-4 rounded" />
      </div>
    </div>
  );
}

function RelatedContentSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Skeleton className="w-40 h-5 rounded mb-2" />
          <Skeleton className="w-64 h-4 rounded" />
        </div>
        <Skeleton className="w-16 h-5 rounded" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <Skeleton className="w-3/4 h-4 rounded mb-1" />
                <Skeleton className="w-1/2 h-3 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <Skeleton className="w-32 h-5 rounded mb-6" />
        <NodeHeaderSkeleton />
        <RelatedContentSkeleton />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EdgeListSkeleton title="Inbound" />
          <EdgeListSkeleton title="Outbound" />
        </div>
      </div>
    </AppLayout>
  );
}

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

// Empty state component
function EmptyState({
  nodes,
  metrics,
  onSelectPage
}: {
  nodes: DocNode[] | undefined;
  metrics: Record<string, NodeMetrics> | undefined;
  onSelectPage: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [navSection, setNavSection] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  const pages = (nodes || []).filter((n) => n.type === 'page');
  const navSections = useMemo(() => extractNavSections(nodes || []), [nodes]);
  const q = query.trim().toLowerCase();

  // Count active filters
  const activeFilterCount = (navSection ? 1 : 0) + (dateFilter !== 'all' ? 1 : 0);

  const results = useMemo(() => {
    if (!metrics) return [];
    
    // First apply nav section and date filters
    let filtered = pages.filter((n) => {
      const matchesNav = matchesNavSection(n, navSection);
      const matchesDate = matchesDateFilter(n, dateFilter);
      return matchesNav && matchesDate;
    });

    if (!q) {
      return [...filtered]
        .map((n) => ({ ...n, score: metrics[n.id]?.inboundLinks ?? 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
    }

    const out: (typeof pages[number] & { score: number })[] = [];
    for (const n of filtered) {
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
  }, [pages, metrics, q, navSection, dateFilter]);

  const clearFilters = () => {
    setNavSection('');
    setDateFilter('all');
    setQuery('');
  };

  const dateFilterLabel: Record<DateFilter, string> = {
    all: 'All time',
    last30days: 'Last 30 days',
    last6months: 'Last 6 months',
    older1year: 'Older than 1 year',
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <Compass className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Explain</h1>
        <p className="text-muted-foreground text-lg max-w-md mx-auto">
          Select a page to analyze its context, inbound/outbound links, navigation paths, and related content.
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a page to analyze..."
          className="pl-12 h-14 text-base rounded-2xl shadow-sm"
          autoFocus
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="flex items-center gap-1 text-sm text-muted-foreground mr-1">
          <Filter className="w-4 h-4" />
          <span>Filters:</span>
        </div>
        
        {/* Nav Section dropdown */}
        <Select value={navSection} onValueChange={setNavSection}>
          <SelectTrigger className="w-auto min-w-[140px] h-9 text-sm rounded-full border-dashed">
            <SelectValue placeholder="Nav section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All sections</SelectItem>
            {navSections.map((section) => (
              <SelectItem key={section} value={section}>
                {section}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date filter dropdown */}
        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
          <SelectTrigger className="w-auto min-w-[140px] h-9 text-sm rounded-full border-dashed">
            <Calendar className="w-3.5 h-3.5 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="last30days">Last 30 days</SelectItem>
            <SelectItem value="last6months">Last 6 months</SelectItem>
            <SelectItem value="older1year">Older than 1 year</SelectItem>
          </SelectContent>
        </Select>

        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 text-xs"
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Active filter pills */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {navSection && (
            <Badge variant="secondary" className="flex items-center gap-1 px-2 py-1">
              <span>Section: {navSection}</span>
              <button
                onClick={() => setNavSection('')}
                className="ml-1 hover:text-destructive"
                aria-label="Remove section filter"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {dateFilter !== 'all' && (
            <Badge variant="secondary" className="flex items-center gap-1 px-2 py-1">
              <span>Date: {dateFilterLabel[dateFilter]}</span>
              <button
                onClick={() => setDateFilter('all')}
                className="ml-1 hover:text-destructive"
                aria-label="Remove date filter"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          {q ? (
            <>
              <Search className="w-4 h-4" />
              Search Results
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Top Hubs (Good Starting Points)
            </>
          )}
        </h2>
        <span className="text-xs text-muted-foreground">
          {results.length} result{results.length !== 1 ? 's' : ''}
          {activeFilterCount > 0 && ' (filtered)'}
        </span>
      </div>

      {results.length > 0 ? (
        <div className="flex flex-col gap-3">
          {results.map((n, i) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelectPage(n.id)}
              className="text-left rounded-xl border hover:bg-secondary/40 transition-colors"
            >
              <NodeCard node={n} metrics={metrics?.[n.id]} rank={!q ? i + 1 : undefined} />
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 rounded-xl border bg-card">
          <Search className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {activeFilterCount > 0 
              ? "No pages match your filters" 
              : `No pages found matching "${query}"`}
          </p>
          {activeFilterCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="mt-3"
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Error state component
function ErrorState({ id, onBack }: { id: string; onBack: () => void }) {
  return (
    <div className="max-w-2xl mx-auto text-center py-16">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Page Not Found</h2>
      <p className="text-muted-foreground mb-4">
        We couldn&apos;t find a page with the ID <code className="text-sm bg-muted px-1.5 py-0.5 rounded">{id}</code>
      </p>
      <p className="text-sm text-muted-foreground mb-6">
        The page may have been removed, renamed, or the ID might be incorrect.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Search
        </Button>
        <Link href="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}

export default function ExplainPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const { data: nodes, isLoading: nodesLoading } = useNodes();
  const { data: metrics, isLoading: metricsLoading } = useMetrics();
  const { data: inbound, isLoading: inboundLoading } = useEdgesInbound();
  const { data: outbound, isLoading: outboundLoading } = useEdgesOutbound();
  const { data: similarity, isLoading: similarityLoading } = useSimilarity();
  const { data: navPages, isLoading: navPagesLoading } = useNavPages();

  // Only show full-page skeleton when initially loading data
  const isInitialLoading = nodesLoading || metricsLoading;

  // Show skeleton for individual sections when their data is loading
  const isEdgeDataLoading = inboundLoading || outboundLoading;
  const isRelatedContentLoading = similarityLoading;
  const isNavLoading = navPagesLoading;

  const nodeMap = useMemo(() => {
    const m = new Map<string, { title?: string; filePath: string }>();
    nodes?.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  const node = useMemo(() => nodes?.find((n) => n.id === id) ?? null, [nodes, id]);

  const handleSelectPage = (pageId: string) => {
    router.push(`/explain?id=${encodeURIComponent(pageId)}`);
  };

  const handleBack = () => {
    router.push('/explain');
  };

  // Full page loading state
  if (isInitialLoading) {
    return <PageSkeleton />;
  }

  // Empty state - no page selected
  if (!id) {
    return (
      <AppLayout>
        <EmptyState
          nodes={nodes}
          metrics={metrics}
          onSelectPage={handleSelectPage}
        />
      </AppLayout>
    );
  }

  // Error state - invalid ID
  if (!node) {
    return (
      <AppLayout>
        <ErrorState id={id} onBack={handleBack} />
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
          href="/explain"
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

            <div className="flex items-center gap-2 flex-wrap justify-end">
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
              {isNavLoading ? (
                <div className="space-y-2">
                  <Skeleton className="w-24 h-4 rounded" />
                  <Skeleton className="w-full h-4 rounded" />
                  <Skeleton className="w-3/4 h-4 rounded" />
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>
          )}
        </div>

        {isRelatedContentLoading ? (
          <RelatedContentSkeleton />
        ) : twins.length > 0 ? (
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
        ) : null}

        {isEdgeDataLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EdgeListSkeleton title="Inbound" />
            <EdgeListSkeleton title="Outbound" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EdgeList title="Inbound" icon={ArrowDownLeft} edges={inE} nodeMap={nodeMap} docsV2BlobBase={docsV2BlobBase} />
            <EdgeList title="Outbound" icon={ArrowUpRight} edges={outE} nodeMap={nodeMap} docsV2BlobBase={docsV2BlobBase} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
