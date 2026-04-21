'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ThumbsUp, ThumbsDown, MessageSquare, Code, FileText, AlertCircle, Eye, Search, Users,
  Lightbulb, Sparkles, ChevronDown, ChevronRight, Loader2, Wand2, Brain,
  AlertTriangle, Info, ArrowRight, ExternalLink,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import type { FeedbackSuggestion, AnalyticsInsight } from '@/types';
import { SiteGraphHeatmap } from '@/components/analytics/site-graph-heatmap';
import { useNodes, useMetrics, useEdgesOutbound } from '@/hooks/use-index-data';

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

interface PageView {
  page: string;
  views: number;
  date?: string;
}

interface SearchQuery {
  query: string;
  count: number;
  avgClickPosition?: number;
  date?: string;
}

interface VisitorData {
  path: string;
  count: number;
  human?: number;
  ai?: number;
}

interface FeedbackStats {
  total: number;
  helpful: number;
  unhelpful: number;
  helpfulRate: string;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
}

interface FeedbackInsights {
  topPages: Array<{ path: string; count: number }>;
  unhelpfulPages: Array<{ path: string; count: number }>;
  pagesWithFeedback: number;
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [insights, setInsights] = useState<FeedbackInsights | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [pageViews, setPageViews] = useState<PageView[]>([]);
  const [totalPageViews, setTotalPageViews] = useState(0);
  const [searchQueries, setSearchQueries] = useState<SearchQuery[]>([]);
  const [totalSearches, setTotalSearches] = useState(0);
  const [visitors, setVisitors] = useState<VisitorData[]>([]);
  const [totalVisitors, setTotalVisitors] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState('7'); // days
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Feedback suggestion state
  const [suggestionsMap, setSuggestionsMap] = useState<Record<string, FeedbackSuggestion[]>>({});
  const [suggestingId, setSuggestingId] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<Record<string, string>>({});
  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<string>>(new Set());

  // Insights state
  const [insightsMode, setInsightsMode] = useState<'algorithmic' | 'ai'>('algorithmic');
  const [analyticsInsights, setAnalyticsInsights] = useState<AnalyticsInsight[]>([]);
  const [insightsSummary, setInsightsSummary] = useState<string>('');
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insightsGenerated, setInsightsGenerated] = useState(false);

  // Index data for site graph
  const { data: indexNodes } = useNodes();
  const { data: indexMetrics } = useMetrics();
  const { data: indexEdgesOutbound } = useEdgesOutbound();

  useEffect(() => {
    fetchAnalytics();
  }, [dateFilter, sourceFilter, statusFilter]);

  async function fetchAnalytics() {
    setLoading(true);
    setError(null);

    try {
      // Calculate date range
      const dateTo = new Date().toISOString().split('T')[0];
      const dateFrom = new Date(Date.now() - parseInt(dateFilter) * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      // Build query params for feedback (with filters)
      const feedbackParams = new URLSearchParams({
        dateFrom,
        dateTo,
      });

      if (sourceFilter !== 'all') feedbackParams.append('source', sourceFilter);
      if (statusFilter !== 'all') feedbackParams.append('status', statusFilter);

      // Build query params for traffic data (no filters)
      const trafficParams = new URLSearchParams({
        dateFrom,
        dateTo,
      });

      // Fetch all analytics data in parallel
      const [statsRes, feedbackRes, pageViewsRes, searchQueriesRes, visitorsRes] = await Promise.all([
        fetch(`/api/analytics/stats?${feedbackParams}`),
        fetch(`/api/analytics/feedback?${feedbackParams}`),
        fetch(`/api/analytics/page-views?${trafficParams}`),
        fetch(`/api/analytics/search-queries?${trafficParams}`),
        fetch(`/api/analytics/visitors?${trafficParams}`),
      ]);

      if (!statsRes.ok || !feedbackRes.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const statsData = await statsRes.json();
      const feedbackData = await feedbackRes.json();

      setStats(statsData.stats);
      setInsights(statsData.insights);
      setFeedback(feedbackData.feedback);

      // Handle traffic data (may fail if endpoints don't exist yet)
      if (pageViewsRes.ok) {
        const pageViewsData = await pageViewsRes.json();
        setPageViews(pageViewsData.topPages || pageViewsData.views || []);
        setTotalPageViews(pageViewsData.total || 0);
      }

      if (searchQueriesRes.ok) {
        const searchData = await searchQueriesRes.json();
        setSearchQueries(searchData.topQueries || searchData.queries || []);
        setTotalSearches(searchData.total || 0);
      }

      if (visitorsRes.ok) {
        const visitorsData = await visitorsRes.json();
        setVisitors(visitorsData.visitors || []);
        setTotalVisitors(visitorsData.total || 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // ── Feedback suggestion handler ────────────────────────────────────────────

  const handleGetSuggestions = useCallback(async (item: FeedbackItem) => {
    setSuggestingId(item.id);
    setSuggestError((prev) => ({ ...prev, [item.id]: '' }));

    try {
      const res = await fetch('/api/analytics/feedback/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackId: item.id,
          path: item.path,
          comment: item.comment || '(no comment)',
          helpful: item.helpful,
          source: item.source,
        }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to get suggestions');

      setSuggestionsMap((prev) => ({ ...prev, [item.id]: data.suggestions }));
      setExpandedSuggestions((prev) => new Set(prev).add(item.id));
    } catch (err) {
      setSuggestError((prev) => ({
        ...prev,
        [item.id]: err instanceof Error ? err.message : 'Unknown error',
      }));
    } finally {
      setSuggestingId(null);
    }
  }, []);

  const toggleSuggestions = useCallback((id: string) => {
    setExpandedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Insights handler ──────────────────────────────────────────────────────

  const handleGenerateInsights = useCallback(async () => {
    setInsightsLoading(true);
    setInsightsError(null);

    try {
      // Build the payload from current analytics data
      const topPages = pageViews.slice(0, 50).map((p) => ({ path: p.page, views: p.views }));
      const unhelpfulPages = (insights?.unhelpfulPages || []).map((p) => ({
        path: p.path,
        unhelpful: p.count,
        total: p.count, // best approximation from available data
      }));
      const searchQueriesPayload = searchQueries.slice(0, 50).map((q) => ({
        query: q.query,
        count: q.count,
      }));

      if (topPages.length === 0) {
        setInsightsError('No page view data available yet. Try loading analytics with a wider date range.');
        setInsightsLoading(false);
        return;
      }

      const endpoint = insightsMode === 'ai'
        ? '/api/analytics/insights/ai-analyze'
        : '/api/analytics/insights/correlate';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topPages, unhelpfulPages, searchQueries: searchQueriesPayload }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to generate insights');

      setAnalyticsInsights(data.insights || []);
      setInsightsSummary(data.summary || '');
      setInsightsGenerated(true);
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setInsightsLoading(false);
    }
  }, [insightsMode, pageViews, insights, searchQueries]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const severityColor = (s: string) => {
    switch (s) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const severityIcon = (s: string) => {
    switch (s) {
      case 'high': return <AlertCircle className="h-4 w-4" />;
      case 'medium': return <AlertTriangle className="h-4 w-4" />;
      case 'low': return <Info className="h-4 w-4" />;
      default: return null;
    }
  };

  const categoryColor = (c: string) => {
    switch (c) {
      case 'content-gap': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'clarity': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'accuracy': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'navigation': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'code-example': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'structure': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="container mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6">Analytics</h1>
          <div className="text-muted-foreground">Loading analytics data...</div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="container mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6">Analytics</h1>
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Error Loading Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button onClick={fetchAnalytics} className="mt-4">
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Analytics</h1>
        <div className="flex gap-2">
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="contextual">Contextual</SelectItem>
              <SelectItem value="code_snippet">Code snippet</SelectItem>
              <SelectItem value="thumbs_only">Thumbs only</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Page Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-blue-600" />
              <div className="text-2xl font-bold">{totalPageViews.toLocaleString()}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Unique Visitors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />
              <div className="text-2xl font-bold">{totalVisitors.toLocaleString()}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Searches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-orange-600" />
              <div className="text-2xl font-bold">{totalSearches.toLocaleString()}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Helpful</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-green-600" />
              <div className="text-2xl font-bold">{stats?.helpful || 0}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Unhelpful</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ThumbsDown className="h-4 w-4 text-red-600" />
              <div className="text-2xl font-bold">{stats?.unhelpful || 0}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Helpful Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.helpfulRate || 0}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="traffic" className="space-y-4">
        <TabsList>
          <TabsTrigger value="traffic">Traffic & Search</TabsTrigger>
          <TabsTrigger value="feedback">Recent Feedback</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="graph">Site Graph</TabsTrigger>
        </TabsList>

        <TabsContent value="traffic" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Top Pages by Views</CardTitle>
                <CardDescription>Most viewed documentation pages</CardDescription>
              </CardHeader>
              <CardContent>
                {pageViews.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No page view data available
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pageViews.slice(0, 20).map((page, i) => (
                      <div key={page.page} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                          <code className="text-xs truncate">{page.page}</code>
                        </div>
                        <div className="flex items-center gap-1">
                          <Eye className="h-3 w-3 text-muted-foreground" />
                          <Badge variant="secondary">{page.views.toLocaleString()}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Search Queries</CardTitle>
                <CardDescription>Most popular search terms</CardDescription>
              </CardHeader>
              <CardContent>
                {searchQueries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No search query data available
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchQueries.slice(0, 20).map((query, i) => (
                      <div key={query.query} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                          <span className="text-sm truncate">{query.query}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Search className="h-3 w-3 text-muted-foreground" />
                          <Badge variant="secondary">{query.count.toLocaleString()}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {visitors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Pages by Unique Visitors</CardTitle>
                <CardDescription>Pages with the most unique visitors</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {visitors.slice(0, 20).map((visitor) => (
                    <div key={visitor.path} className="flex items-center justify-between gap-4">
                      <span className="text-sm font-mono truncate flex-1">{visitor.path}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <Badge variant="secondary">{visitor.count.toLocaleString()}</Badge>
                        {visitor.human != null && visitor.ai != null && (
                          <span className="text-xs text-muted-foreground">
                            ({visitor.human.toLocaleString()} human, {visitor.ai.toLocaleString()} AI)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="feedback" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Feedback</CardTitle>
              <CardDescription>
                {feedback.length} items from the selected period
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {feedback.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No feedback found for the selected filters
                </div>
              ) : (
                feedback.slice(0, 50).map((item) => (
                  <div
                    key={item.id}
                    className="border rounded-lg p-4 space-y-2 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {item.path}
                          </code>
                          <Badge variant={item.helpful === true ? 'default' : item.helpful === false ? 'destructive' : 'secondary'}>
                            {item.helpful === true ? (
                              <><ThumbsUp className="h-3 w-3 mr-1" /> Helpful</>
                            ) : item.helpful === false ? (
                              <><ThumbsDown className="h-3 w-3 mr-1" /> Unhelpful</>
                            ) : (
                              'No rating'
                            )}
                          </Badge>
                          <Badge variant="outline">
                            {item.source === 'contextual' && <><MessageSquare className="h-3 w-3 mr-1" /> Contextual</>}
                            {item.source === 'code_snippet' && <><Code className="h-3 w-3 mr-1" /> Code</>}
                            {item.source === 'thumbs_only' && <><FileText className="h-3 w-3 mr-1" /> Quick</>}
                          </Badge>
                          <Badge variant="outline">{item.status}</Badge>
                        </div>
                        {item.comment && (
                          <p className="text-sm text-muted-foreground">{item.comment}</p>
                        )}
                        {item.code && (
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto mt-2">
                            <code>{item.code}</code>
                          </pre>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                        {item.comment && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              suggestionsMap[item.id]
                                ? toggleSuggestions(item.id)
                                : handleGetSuggestions(item)
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
                      <div className="text-sm text-destructive flex items-center gap-1 mt-2">
                        <AlertCircle className="h-3 w-3" />
                        {suggestError[item.id]}
                      </div>
                    )}

                    {/* Suggestion loading skeleton */}
                    {suggestingId === item.id && (
                      <div className="mt-3 space-y-2">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                      </div>
                    )}

                    {/* Suggestion cards */}
                    {suggestionsMap[item.id] && expandedSuggestions.has(item.id) && (
                      <div className="mt-3 space-y-2 pl-4 border-l-2 border-primary/20">
                        {suggestionsMap[item.id].map((s, idx) => (
                          <div
                            key={idx}
                            className="bg-muted/50 rounded-lg p-3 space-y-2"
                          >
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
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          {/* Insights generation controls */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" />
                    Documentation Insights
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Correlate analytics data with site structure to surface actionable insights
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {/* Mode toggle */}
                  <div className="flex rounded-lg border p-1 gap-1">
                    <Button
                      variant={insightsMode === 'algorithmic' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setInsightsMode('algorithmic')}
                      className="gap-1"
                    >
                      <Brain className="h-3.5 w-3.5" />
                      Algorithmic
                    </Button>
                    <Button
                      variant={insightsMode === 'ai' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setInsightsMode('ai')}
                      className="gap-1"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      AI-Powered
                    </Button>
                  </div>
                  <Button
                    onClick={handleGenerateInsights}
                    disabled={insightsLoading || pageViews.length === 0}
                  >
                    {insightsLoading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
                    ) : (
                      <><Lightbulb className="h-4 w-4 mr-2" /> Generate Insights</>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            {pageViews.length === 0 && (
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Load analytics data first (select a date range above) to generate insights.
                </p>
              </CardContent>
            )}
          </Card>

          {/* Insights error */}
          {insightsError && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{insightsError}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading skeleton */}
          {insightsLoading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-5 w-48" />
                      </div>
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* AI Summary (only in AI mode) */}
          {insightsGenerated && insightsSummary && insightsMode === 'ai' && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Executive Summary</h3>
                    <p className="text-sm text-muted-foreground">{insightsSummary}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Insight cards grouped by severity */}
          {insightsGenerated && !insightsLoading && analyticsInsights.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {analyticsInsights.length} insight{analyticsInsights.length !== 1 ? 's' : ''} found
                  {insightsMode === 'ai' ? ' (AI-enhanced)' : ' (algorithmic)'}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-destructive" /> High</span>
                  <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Medium</span>
                  <span className="flex items-center gap-1"><Info className="h-3 w-3 text-muted-foreground" /> Low</span>
                </div>
              </div>

              {analyticsInsights.map((insight, idx) => (
                <Card key={idx} className={
                  insight.severity === 'high' ? 'border-destructive/40' :
                  insight.severity === 'medium' ? 'border-orange-300/40' : ''
                }>
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {severityIcon(insight.severity)}
                        <Badge variant={severityColor(insight.severity) as 'destructive' | 'default' | 'secondary' | 'outline'}>
                          {insight.severity}
                        </Badge>
                        <Badge variant="outline" className="font-mono text-xs">
                          {insight.type}
                        </Badge>
                        <span className="font-semibold text-sm">{insight.title}</span>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">{insight.description}</p>

                    {insight.affectedPages.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Affected:</span>
                        {insight.affectedPages.map((page) => (
                          <code key={page} className="text-xs bg-muted px-2 py-0.5 rounded">
                            {page}
                          </code>
                        ))}
                      </div>
                    )}

                    <div className="flex items-start gap-1.5 text-sm bg-muted/50 rounded-lg p-3">
                      <ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                      <span>{insight.recommendation}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty state */}
          {insightsGenerated && !insightsLoading && analyticsInsights.length === 0 && (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <Lightbulb className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  No insights generated. This may mean your documentation structure is in good shape,
                  or there isn&apos;t enough analytics data to correlate.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Existing feedback stats — always shown below insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Top Pages by Feedback Volume</CardTitle>
                <CardDescription>Pages receiving the most feedback</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {insights?.topPages.slice(0, 10).map((page, i) => (
                    <div key={page.path} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                        <code className="text-xs truncate">{page.path}</code>
                      </div>
                      <Badge variant="secondary">{page.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pages Needing Attention</CardTitle>
                <CardDescription>Pages with most unhelpful feedback</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {insights?.unhelpfulPages.slice(0, 10).map((page, i) => (
                    <div key={page.path} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                        <code className="text-xs truncate">{page.path}</code>
                      </div>
                      <Badge variant="destructive">{page.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Feedback by Source</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats && Object.entries(stats.bySource).map(([source, count]) => (
                    <div key={source} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{source.replace('_', ' ')}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Feedback by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats && Object.entries(stats.byStatus).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{status.replace('_', ' ')}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="graph" className="space-y-4">
          {indexNodes && indexMetrics && indexEdgesOutbound ? (
            <SiteGraphHeatmap
              nodes={indexNodes}
              metrics={indexMetrics}
              edgesOutbound={indexEdgesOutbound}
              pageViews={pageViews.map((p) => ({ path: p.page, views: p.views }))}
              unhelpfulPages={
                (insights?.unhelpfulPages ?? []).map((p) => ({
                  path: p.path,
                  unhelpful: p.count,
                  total: p.count,
                }))
              }
            />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">Loading index data...</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </AppLayout>
  );
}
