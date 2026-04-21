'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ThumbsUp, ThumbsDown, MessageSquare, Code, FileText, AlertCircle,
  ChevronDown, ChevronRight, Loader2, Wand2, ArrowRight,
  ExternalLink, GitBranch, BarChart3, ChevronLeft, Globe, Github,
  AlertTriangle, Unlink, Network,
} from 'lucide-react';
import type { FeedbackSuggestion, DocNode, Metrics } from '@/types';
import { categoryColor } from '@/lib/insight-colors';

interface FeedbackItem {
  id: string;
  path: string;
  comment: string;
  createdAt: string;
  source: 'contextual' | 'code_snippet' | 'thumbs_only';
  status: 'pending' | 'in_progress' | 'resolved' | 'dismissed';
  helpful: boolean | null;
  contact: string | null;
  code?: string;
  filename?: string;
  lang?: string;
}

interface FeedbackDashboardProps {
  feedback: FeedbackItem[];
  suggestionsMap: Record<string, FeedbackSuggestion[]>;
  expandedSuggestions: Set<string>;
  suggestingId: string | null;
  suggestError: Record<string, string>;
  creatingPrFor: string | null;
  prResults: Record<string, { url?: string; error?: string }>;
  indexNodes?: DocNode[];
  indexMetrics?: Metrics;
  onGetSuggestions: (item: FeedbackItem) => void;
  onToggleSuggestions: (id: string) => void;
  onOpenPr: (feedbackId: string, idx: number, path: string, suggestion: FeedbackSuggestion) => void;
}

const PAGE_SIZE = 10;

const sourceIcon = (source: string) => {
  switch (source) {
    case 'contextual': return <MessageSquare className="h-3 w-3" />;
    case 'code_snippet': return <Code className="h-3 w-3" />;
    case 'thumbs_only': return <FileText className="h-3 w-3" />;
    default: return null;
  }
};

const sourceLabel = (source: string) => {
  switch (source) {
    case 'contextual': return 'Contextual';
    case 'code_snippet': return 'Code';
    case 'thumbs_only': return 'Quick';
    default: return source;
  }
};

export function FeedbackDashboard({
  feedback,
  suggestionsMap,
  expandedSuggestions,
  suggestingId,
  suggestError,
  creatingPrFor,
  prResults,
  indexNodes,
  indexMetrics,
  onGetSuggestions,
  onToggleSuggestions,
  onOpenPr,
}: FeedbackDashboardProps) {
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<'grouped' | 'list'>('grouped');
  const [collapsedPages, setCollapsedPages] = useState<Set<string>>(new Set());

  // ── Path lookup maps ───────────────────────────────────
  const nodeByPath = useMemo(() => {
    if (!indexNodes) return new Map<string, DocNode>();
    const map = new Map<string, DocNode>();
    for (const node of indexNodes) {
      if (node.permalink) map.set(node.permalink, node);
    }
    return map;
  }, [indexNodes]);

  // ── Computed data ──────────────────────────────────────
  const grouped = useMemo(() => {
    const groups: Record<string, { items: FeedbackItem[]; helpful: number; unhelpful: number; noRating: number }> = {};
    for (const item of feedback) {
      if (!groups[item.path]) groups[item.path] = { items: [], helpful: 0, unhelpful: 0, noRating: 0 };
      groups[item.path].items.push(item);
      if (item.helpful === true) groups[item.path].helpful++;
      else if (item.helpful === false) groups[item.path].unhelpful++;
      else groups[item.path].noRating++;
    }
    return Object.entries(groups)
      .sort(([, a], [, b]) => b.items.length - a.items.length);
  }, [feedback]);

  const statusBreakdown = useMemo(() => {
    const counts = { pending: 0, in_progress: 0, resolved: 0, dismissed: 0 };
    for (const item of feedback) {
      counts[item.status] = (counts[item.status] || 0) + 1;
    }
    return counts;
  }, [feedback]);

  const sourceBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of feedback) {
      counts[item.source] = (counts[item.source] || 0) + 1;
    }
    return counts;
  }, [feedback]);

  const helpfulCount = useMemo(() => feedback.filter((f) => f.helpful === true).length, [feedback]);
  const unhelpfulCount = useMemo(() => feedback.filter((f) => f.helpful === false).length, [feedback]);
  const withComments = useMemo(() => feedback.filter((f) => f.comment).length, [feedback]);

  const togglePage = useCallback((path: string) => {
    setCollapsedPages((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // ── Pagination for list mode ──────────────────────────
  const paginatedFeedback = useMemo(
    () => feedback.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [feedback, page],
  );
  const totalPages = Math.ceil(feedback.length / PAGE_SIZE);

  // ── Helper: build URLs from path ───────────────────────
  const getGithubUrl = (feedbackPath: string) => {
    const stripped = feedbackPath.replace(/^\/docs\//, '').replace(/^\//, '');
    return `https://github.com/auth0/docs-v2/blob/main/articles/${stripped}.mdx`;
  };
  const getProductionUrl = (feedbackPath: string) => `https://auth0.com${feedbackPath}`;

  // ── Helper: page context bar for a path ────────────────
  const renderPageContext = (feedbackPath: string) => {
    const node = nodeByPath.get(feedbackPath);
    const m = node ? indexMetrics?.[node.id] : undefined;

    return (
      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        {node?.title && (
          <span className="font-medium text-foreground truncate max-w-[300px]" title={node.title}>
            {node.title}
          </span>
        )}
        {m?.orphanTrue && (
          <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300">
            <Unlink className="h-3 w-3" /> Orphan
          </Badge>
        )}
        {m?.deadEnd && (
          <Badge variant="outline" className="text-xs gap-1 text-red-600 border-red-300">
            <AlertTriangle className="h-3 w-3" /> Dead End
          </Badge>
        )}
        {(m?.hubScore ?? 0) > 5 && (
          <Badge variant="outline" className="text-xs gap-1 text-blue-600 border-blue-300">
            <Network className="h-3 w-3" /> Hub
          </Badge>
        )}
        <a
          href={getProductionUrl(feedbackPath)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Globe className="h-3 w-3" /> View page
        </a>
        <a
          href={getGithubUrl(feedbackPath)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Github className="h-3 w-3" /> Source
        </a>
      </div>
    );
  };

  if (feedback.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center py-12">
          <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No feedback found for the selected filters.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Summary Row ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground mb-1">Total Items</div>
            <div className="text-2xl font-bold">{feedback.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground mb-1">Unique Pages</div>
            <div className="text-2xl font-bold">{grouped.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground mb-1">With Comments</div>
            <div className="text-2xl font-bold">{withComments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <ThumbsUp className="h-3 w-3 text-green-600" /> Helpful
            </div>
            <div className="text-2xl font-bold text-green-600">{helpfulCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <ThumbsDown className="h-3 w-3 text-red-600" /> Unhelpful
            </div>
            <div className="text-2xl font-bold text-red-600">{unhelpfulCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Status & Source breakdown side by side ────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">By Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(statusBreakdown).map(([status, count]) => (
              <div key={status} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="capitalize">{status.replace('_', ' ')}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
                <Progress
                  value={feedback.length > 0 ? (count / feedback.length) * 100 : 0}
                  className="h-2"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">By Source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(sourceBreakdown).map(([source, count]) => (
              <div key={source} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    {sourceIcon(source)} {sourceLabel(source)}
                  </span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
                <Progress
                  value={feedback.length > 0 ? (count / feedback.length) * 100 : 0}
                  className="h-2"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Pages Table ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Feedback by Page
              </CardTitle>
              <CardDescription className="mt-1">
                {grouped.length} pages with feedback — click to expand
              </CardDescription>
            </div>
            <div className="flex rounded-lg border p-1 gap-1">
              <Button
                variant={viewMode === 'grouped' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setViewMode('grouped')}
              >
                Grouped
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setViewMode('list')}
              >
                List
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === 'grouped' ? (
            <div className="space-y-1">
              {grouped.map(([path, group]) => {
                const isOpen = !collapsedPages.has(path);
                const total = group.items.length;
                const unhelpfulPct = total > 0 ? (group.unhelpful / total) * 100 : 0;

                return (
                  <Collapsible key={path} open={isOpen} onOpenChange={() => togglePage(path)}>
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-md hover:bg-muted/50 transition-colors">
                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        <code className="text-xs truncate flex-1">{path}</code>
                        <div className="flex items-center gap-2 shrink-0">
                          {group.unhelpful > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {group.unhelpful} unhelpful
                            </Badge>
                          )}
                          {group.helpful > 0 && (
                            <Badge variant="default" className="text-xs">
                              {group.helpful} helpful
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            {total} total
                          </Badge>
                        </div>
                        {/* Mini bar showing unhelpful ratio */}
                        <div className="w-16 shrink-0">
                          <div className="h-1.5 rounded-full bg-green-200 dark:bg-green-900 overflow-hidden">
                            <div
                              className="h-full bg-red-500 rounded-full transition-all"
                              style={{ width: `${unhelpfulPct}%` }}
                            />
                          </div>
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-7 mt-1 mb-3 space-y-2">
                        {/* Page context: title, health badges, links */}
                        <div className="px-3 py-1.5">
                          {renderPageContext(path)}
                        </div>
                        {group.items.map((item) => (
                          <FeedbackItemCard
                            key={item.id}
                            item={item}
                            compact
                            suggestionsMap={suggestionsMap}
                            expandedSuggestions={expandedSuggestions}
                            suggestingId={suggestingId}
                            suggestError={suggestError}
                            creatingPrFor={creatingPrFor}
                            prResults={prResults}
                            onGetSuggestions={onGetSuggestions}
                            onToggleSuggestions={onToggleSuggestions}
                            onOpenPr={onOpenPr}
                          />
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          ) : (
            /* ── List view with pagination ─────────────────── */
            <div className="space-y-3">
              {paginatedFeedback.map((item) => (
                <FeedbackItemCard
                  key={item.id}
                  item={item}
                  compact={false}
                  suggestionsMap={suggestionsMap}
                  expandedSuggestions={expandedSuggestions}
                  suggestingId={suggestingId}
                  suggestError={suggestError}
                  creatingPrFor={creatingPrFor}
                  prResults={prResults}
                  onGetSuggestions={onGetSuggestions}
                  onToggleSuggestions={onToggleSuggestions}
                  onOpenPr={onOpenPr}
                  renderPageContext={renderPageContext}
                />
              ))}
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-3 w-3" /> Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="gap-1"
                  >
                    Next <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Individual feedback item card ──────────────────────────
function FeedbackItemCard({
  item,
  compact,
  suggestionsMap,
  expandedSuggestions,
  suggestingId,
  suggestError,
  creatingPrFor,
  prResults,
  onGetSuggestions,
  onToggleSuggestions,
  onOpenPr,
  renderPageContext,
}: {
  item: FeedbackItem;
  compact: boolean;
  suggestionsMap: Record<string, FeedbackSuggestion[]>;
  expandedSuggestions: Set<string>;
  suggestingId: string | null;
  suggestError: Record<string, string>;
  creatingPrFor: string | null;
  prResults: Record<string, { url?: string; error?: string }>;
  onGetSuggestions: (item: FeedbackItem) => void;
  onToggleSuggestions: (id: string) => void;
  onOpenPr: (feedbackId: string, idx: number, path: string, suggestion: FeedbackSuggestion) => void;
  renderPageContext?: (path: string) => React.ReactNode;
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2 hover:bg-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {!compact && (
              <code className="text-xs bg-muted px-2 py-0.5 rounded truncate max-w-[250px]">
                {item.path}
              </code>
            )}
            <Badge
              variant={item.helpful === true ? 'default' : item.helpful === false ? 'destructive' : 'secondary'}
              className="text-xs"
            >
              {item.helpful === true ? (
                <><ThumbsUp className="h-3 w-3 mr-1" /> Helpful</>
              ) : item.helpful === false ? (
                <><ThumbsDown className="h-3 w-3 mr-1" /> Unhelpful</>
              ) : 'No rating'}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {sourceIcon(item.source)} <span className="ml-1">{sourceLabel(item.source)}</span>
            </Badge>
            <Badge variant="outline" className="text-xs capitalize">
              {item.status.replace('_', ' ')}
            </Badge>
          </div>
          {!compact && renderPageContext && (
            <div className="mt-0.5">{renderPageContext(item.path)}</div>
          )}
          {item.comment && (
            <p className="text-sm text-muted-foreground">{item.comment}</p>
          )}
          {item.code && (
            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto mt-1">
              <code>{item.code}</code>
            </pre>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {new Date(item.createdAt).toLocaleDateString()}
          </div>
          {item.comment && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                suggestionsMap[item.id]
                  ? onToggleSuggestions(item.id)
                  : onGetSuggestions(item)
              }
              disabled={suggestingId === item.id}
            >
              {suggestingId === item.id ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Analyzing...</>
              ) : suggestionsMap[item.id] ? (
                <>{expandedSuggestions.has(item.id) ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />} Suggestions ({suggestionsMap[item.id].length})</>
              ) : (
                <><Wand2 className="h-3 w-3 mr-1" /> Get Suggestions</>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Suggestion error */}
      {suggestError[item.id] && (
        <div className="text-sm text-destructive flex items-center gap-1 mt-1">
          <AlertCircle className="h-3 w-3" />
          {suggestError[item.id]}
        </div>
      )}

      {/* Suggestion loading */}
      {suggestingId === item.id && (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {/* Suggestion cards */}
      {suggestionsMap[item.id] && expandedSuggestions.has(item.id) && (
        <div className="mt-2 space-y-2 pl-3 border-l-2 border-primary/20">
          {suggestionsMap[item.id].map((s, idx) => {
            const prKey = `${item.id}:${idx}`;
            const prResult = prResults[prKey];
            const isCreatingPr = creatingPrFor === prKey;

            return (
              <div key={idx} className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{s.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor(s.category)}`}>
                    {s.category}
                  </span>
                  <Badge variant={s.confidence === 'high' ? 'default' : s.confidence === 'medium' ? 'secondary' : 'outline'}>
                    {s.confidence}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{s.description}</p>
                <div className="flex items-start gap-1 text-sm">
                  <ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  <span>{s.suggestedAction}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {!prResult?.url && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      disabled={isCreatingPr || !!creatingPrFor}
                      onClick={() => onOpenPr(item.id, idx, item.path, s)}
                    >
                      {isCreatingPr ? (
                        <><Loader2 className="h-3 w-3 animate-spin" />Creating PR…</>
                      ) : (
                        <><GitBranch className="h-3 w-3" />Open PR</>
                      )}
                    </Button>
                  )}
                  {prResult?.url && (
                    <a
                      href={prResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <GitBranch className="h-3 w-3" />
                      PR branch created
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {prResult?.error && (
                    <span className="text-xs text-destructive">{prResult.error}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
