'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  ThumbsUp, ThumbsDown, MessageSquare, Code, FileText, AlertCircle, Eye, Search, Users,
  Lightbulb, Sparkles, ChevronDown, ChevronRight, Loader2, Wand2, Brain,
  ArrowRight, ExternalLink, GitBranch, TrendingUp, TrendingDown, BarChart3,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import type { FeedbackSuggestion, AnalyticsInsight } from '@/types';
import { SiteGraphHeatmap } from '@/components/analytics/site-graph-heatmap';
import { InsightsDashboard } from '@/components/analytics/insights-dashboard';
import { FeedbackDashboard } from '@/components/analytics/feedback-dashboard';
import { categoryColor } from '@/lib/insight-colors';
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

  // PR creation state
  const [creatingPrFor, setCreatingPrFor] = useState<string | null>(null); // "feedbackId:idx"
  const [prResults, setPrResults] = useState<Record<string, { url?: string; error?: string }>>({});

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
      // Step 1: Get prepared prompt from server (fetches page content server-side)
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
      if (!data.ok) throw new Error(data.error || 'Failed to prepare suggestions');

      // Step 2: Fetch API key for client-side Anthropic call
      const keyRes = await fetch('/api/settings/key');
      if (!keyRes.ok) throw new Error('API key not configured. Add one in Settings.');
      const { apiKey } = await keyRes.json();

      // Step 3: Call Anthropic directly from browser (bypasses Vercel IP restrictions)
      const baseUrl = process.env.NEXT_PUBLIC_ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
      const isLiteLLMProxy = baseUrl.includes('llm.atko.ai');
      const model = data.model || process.env.NEXT_PUBLIC_ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isLiteLLMProxy) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      }

      const aiRes = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: data.prompt }],
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text().catch(() => '');
        throw new Error(`AI API error (${aiRes.status}): ${errText.slice(0, 200)}`);
      }

      const aiData = await aiRes.json();
      const text: string = aiData.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Failed to parse AI response');

      const parsed = JSON.parse(jsonMatch[0]);
      setSuggestionsMap((prev) => ({ ...prev, [item.id]: parsed.suggestions || [] }));
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

  // ── PR creation handler ─────────────────────────────────────────────────────

  const handleOpenPrForSuggestion = useCallback(async (feedbackId: string, idx: number, path: string, suggestion: FeedbackSuggestion) => {
    const key = `${feedbackId}:${idx}`;
    setCreatingPrFor(key);
    setPrResults((prev) => ({ ...prev, [key]: {} }));

    try {
      // Step 1: Get structured diff prompt from server
      const res = await fetch('/api/analytics/feedback/apply-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          suggestion: {
            title: suggestion.title,
            description: suggestion.description,
            category: suggestion.category,
            suggestedAction: suggestion.suggestedAction,
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to prepare changes');

      // Step 2: Fetch API key for client-side Anthropic call
      const keyRes = await fetch('/api/settings/key');
      if (!keyRes.ok) throw new Error('API key not configured. Add one in Settings.');
      const { apiKey } = await keyRes.json();

      // Step 3: Call Anthropic directly from browser
      const baseUrl = process.env.NEXT_PUBLIC_ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
      const isLiteLLMProxy = baseUrl.includes('llm.atko.ai');
      const model = data.model || process.env.NEXT_PUBLIC_ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

      const aiHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isLiteLLMProxy) {
        aiHeaders['Authorization'] = `Bearer ${apiKey}`;
      } else {
        aiHeaders['x-api-key'] = apiKey;
        aiHeaders['anthropic-version'] = '2023-06-01';
      }

      const aiRes = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: aiHeaders,
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: data.prompt }],
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text().catch(() => '');
        throw new Error(`AI API error (${aiRes.status}): ${errText.slice(0, 200)}`);
      }

      const aiData = await aiRes.json();
      const text: string = aiData.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Failed to parse AI response for diffs');

      const parsed = JSON.parse(jsonMatch[0]);
      const { filePath: targetFile, replacements, summary: diffSummary } = parsed;

      if (!targetFile || !replacements?.length) {
        throw new Error('AI did not produce valid replacements');
      }

      // Step 4: POST to /api/audit/apply to create the PR branch
      const applyRes = await fetch('/api/audit/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: targetFile,
          validatedOn: new Date().toISOString(),
          prTitle: `docs: ${suggestion.title}`,
          prBody: `## Context\n\nGenerated from reader feedback on \`${path}\`.\n\n**Suggestion:** ${suggestion.suggestedAction}\n\n## Changes\n\n${diffSummary || 'Applied AI-generated content improvements.'}`,
          suggestions: replacements.map((r: { before: string; after: string }, i: number) => ({
            id: `feedback-${feedbackId}-${idx}-${i}`,
            type: suggestion.category,
            description: suggestion.title,
            line: null,
            original: r.before,
            suggestion: r.after,
            context: null,
          })),
        }),
      });

      const applyData = await applyRes.json();
      if (!applyData.ok) throw new Error(applyData.error || 'Failed to create PR branch');

      setPrResults((prev) => ({ ...prev, [key]: { url: applyData.compareUrl } }));
    } catch (err) {
      setPrResults((prev) => ({
        ...prev,
        [key]: { error: err instanceof Error ? err.message : 'Unknown error' },
      }));
    } finally {
      setCreatingPrFor(null);
    }
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

      if (insightsMode === 'ai') {
        // AI mode: server prepares prompt, client calls Anthropic directly
        // Step 1: Get prepared prompt + algorithmic insights from server
        const res = await fetch('/api/analytics/insights/ai-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topPages, unhelpfulPages, searchQueries: searchQueriesPayload }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Failed to prepare insights analysis');

        // Step 2: Fetch API key for client-side Anthropic call
        const keyRes = await fetch('/api/settings/key');
        if (!keyRes.ok) throw new Error('API key not configured. Add one in Settings.');
        const { apiKey } = await keyRes.json();

        // Step 3: Call Anthropic directly from browser (bypasses Vercel IP restrictions)
        const baseUrl = process.env.NEXT_PUBLIC_ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
        const isLiteLLMProxy = baseUrl.includes('llm.atko.ai');
        const model = data.model || process.env.NEXT_PUBLIC_ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

        const aiHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (isLiteLLMProxy) {
          aiHeaders['Authorization'] = `Bearer ${apiKey}`;
        } else {
          aiHeaders['x-api-key'] = apiKey;
          aiHeaders['anthropic-version'] = '2023-06-01';
        }

        const aiRes = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: aiHeaders,
          body: JSON.stringify({
            model,
            max_tokens: 8192,
            messages: [{ role: 'user', content: data.prompt }],
          }),
        });

        if (!aiRes.ok) {
          const errText = await aiRes.text().catch(() => '');
          throw new Error(`AI request failed (${aiRes.status}): ${errText.slice(0, 200)}`);
        }

        const aiData = await aiRes.json();
        const text: string = aiData.content?.[0]?.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Failed to parse AI response');

        const parsed = JSON.parse(jsonMatch[0]);
        setAnalyticsInsights(parsed.insights || []);
        setInsightsSummary(parsed.summary || '');
        setInsightsGenerated(true);
      } else {
        // Algorithmic mode: fully server-side, no Anthropic call needed
        const res = await fetch('/api/analytics/insights/correlate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topPages, unhelpfulPages, searchQueries: searchQueriesPayload }),
        });

        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Failed to generate insights');

        setAnalyticsInsights(data.insights || []);
        setInsightsSummary(data.summary || '');
        setInsightsGenerated(true);
      }
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setInsightsLoading(false);
    }
  }, [insightsMode, pageViews, insights, searchQueries]);

  // ── Helpers ────────────────────────────────────────────────────────────────

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
          <FeedbackDashboard
            feedback={feedback}
            suggestionsMap={suggestionsMap}
            expandedSuggestions={expandedSuggestions}
            suggestingId={suggestingId}
            suggestError={suggestError}
            creatingPrFor={creatingPrFor}
            prResults={prResults}
            onGetSuggestions={handleGetSuggestions}
            onToggleSuggestions={toggleSuggestions}
            onOpenPr={handleOpenPrForSuggestion}
          />
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

          {/* Insights Dashboard */}
          <InsightsDashboard
            insights={analyticsInsights}
            summary={insightsSummary}
            loading={insightsLoading}
            error={insightsError}
            generated={insightsGenerated}
            mode={insightsMode}
          />

          {/* Feedback intelligence dashboard */}
          {insights && stats && (
            <>
              {/* Breakdowns row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      Feedback by Source
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(() => {
                        const entries = Object.entries(stats.bySource);
                        const maxCount = Math.max(...entries.map(([, c]) => c), 1);
                        return entries.map(([source, count]) => (
                          <div key={source} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="capitalize flex items-center gap-1.5">
                                {source === 'contextual' && <MessageSquare className="h-3 w-3 text-blue-500" />}
                                {source === 'code_snippet' && <Code className="h-3 w-3 text-purple-500" />}
                                {source === 'thumbs_only' && <ThumbsUp className="h-3 w-3 text-green-500" />}
                                {source.replace(/_/g, ' ')}
                              </span>
                              <span className="text-muted-foreground font-mono text-xs">{count}</span>
                            </div>
                            <Progress value={(count / maxCount) * 100} className="h-2" />
                          </div>
                        ));
                      })()}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      Feedback by Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(() => {
                        const entries = Object.entries(stats.byStatus);
                        const maxCount = Math.max(...entries.map(([, c]) => c), 1);
                        const statusColors: Record<string, string> = {
                          pending: 'text-yellow-500',
                          in_progress: 'text-blue-500',
                          resolved: 'text-green-500',
                          dismissed: 'text-muted-foreground',
                        };
                        return entries.map(([status, count]) => (
                          <div key={status} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className={`capitalize ${statusColors[status] ?? ''}`}>
                                {status.replace(/_/g, ' ')}
                              </span>
                              <span className="text-muted-foreground font-mono text-xs">{count}</span>
                            </div>
                            <Progress value={(count / maxCount) * 100} className="h-2" />
                          </div>
                        ));
                      })()}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top pages row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      Top Pages by Feedback Volume
                    </CardTitle>
                    <CardDescription>Pages receiving the most feedback</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(() => {
                        const pages = insights.topPages.slice(0, 10);
                        const maxCount = Math.max(...pages.map((p) => p.count), 1);
                        return pages.map((page, i) => (
                          <div key={page.path} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-5 shrink-0 font-mono">{i + 1}</span>
                              <code className="text-xs truncate flex-1 min-w-0">{page.path}</code>
                              <Badge variant="secondary" className="shrink-0 font-mono">{page.count}</Badge>
                            </div>
                            <div className="pl-7">
                              <Progress value={(page.count / maxCount) * 100} className="h-1.5" />
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-destructive" />
                      Pages Needing Attention
                    </CardTitle>
                    <CardDescription>Pages with most unhelpful feedback</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(() => {
                        const pages = insights.unhelpfulPages.slice(0, 10);
                        const maxCount = Math.max(...pages.map((p) => p.count), 1);
                        return pages.map((page, i) => (
                          <div key={page.path} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-5 shrink-0 font-mono">{i + 1}</span>
                              <code className="text-xs truncate flex-1 min-w-0">{page.path}</code>
                              <Badge variant="destructive" className="shrink-0 font-mono">{page.count}</Badge>
                            </div>
                            <div className="pl-7">
                              <Progress value={(page.count / maxCount) * 100} className="h-1.5" />
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
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
