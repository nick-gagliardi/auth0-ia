'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ThumbsUp, ThumbsDown, MessageSquare, Code, FileText, AlertCircle } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState('7'); // days
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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

      // Build query params
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
      });

      if (sourceFilter !== 'all') params.append('source', sourceFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      // Fetch stats and feedback in parallel
      const [statsRes, feedbackRes] = await Promise.all([
        fetch(`/api/analytics/stats?${params}`),
        fetch(`/api/analytics/feedback?${params}`),
      ]);

      if (!statsRes.ok || !feedbackRes.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const statsData = await statsRes.json();
      const feedbackData = await feedbackRes.json();

      setStats(statsData.stats);
      setInsights(statsData.insights);
      setFeedback(feedbackData.feedback);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Analytics</h1>
        <div className="text-muted-foreground">Loading analytics data...</div>
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  return (
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
      <Tabs defaultValue="feedback" className="space-y-4">
        <TabsList>
          <TabsTrigger value="feedback">Recent Feedback</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

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
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
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
      </Tabs>
    </div>
  );
}
