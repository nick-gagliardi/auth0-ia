'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle,
  TrendingDown,
  Unlink,
  Eye,
  EyeOff,
  ArrowRight,
  BarChart3,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useMetrics, useNodes } from '@/hooks/use-index-data';

interface HealthMetric {
  label: string;
  count: number;
  total: number;
  severity: 'critical' | 'warning' | 'info' | 'healthy';
  description: string;
}

function HealthScoreCard({ metrics }: { metrics: HealthMetric[] }) {
  const totalIssues = metrics.reduce((sum, m) => sum + (m.severity !== 'healthy' ? m.count : 0), 0);
  const criticalCount = metrics.filter(m => m.severity === 'critical').reduce((sum, m) => sum + m.count, 0);
  const warningCount = metrics.filter(m => m.severity === 'warning').reduce((sum, m) => sum + m.count, 0);

  // Calculate health score (100 = perfect, 0 = terrible)
  const totalPages = metrics[0]?.total || 1;
  const healthScore = Math.max(0, Math.round(100 - (criticalCount * 2 + warningCount * 0.5) / totalPages * 100));

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Documentation Health Score
        </CardTitle>
        <CardDescription>
          Overall health based on orphan pages, deep content, and discoverability issues
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-8">
          <div className="text-center">
            <div className={`text-5xl font-bold ${getScoreColor(healthScore)}`}>
              {healthScore}
            </div>
            <div className="text-sm text-muted-foreground">/ 100</div>
          </div>

          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-4">
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" />
                {criticalCount} Critical
              </Badge>
              <Badge variant="secondary" className="gap-1 bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                <AlertTriangle className="w-3 h-3" />
                {warningCount} Warnings
              </Badge>
              <Badge variant="outline" className="gap-1">
                <CheckCircle className="w-3 h-3" />
                {totalPages - totalIssues} Healthy
              </Badge>
            </div>
            <Progress value={healthScore} className="h-2" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  count,
  total,
  severity,
  description,
  tabValue,
  onNavigate
}: HealthMetric & {
  icon: any;
  tabValue: string;
  onNavigate: (tab: string) => void;
}) {
  const getSeverityColor = () => {
    switch (severity) {
      case 'critical': return 'border-red-500/50 bg-red-500/5';
      case 'warning': return 'border-yellow-500/50 bg-yellow-500/5';
      case 'info': return 'border-blue-500/50 bg-blue-500/5';
      default: return 'border-green-500/50 bg-green-500/5';
    }
  };

  const getSeverityBadge = () => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Critical</Badge>;
      case 'warning': return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600">Warning</Badge>;
      case 'info': return <Badge variant="secondary">Info</Badge>;
      default: return <Badge variant="secondary" className="bg-green-500/10 text-green-600">Healthy</Badge>;
    }
  };

  return (
    <button
      onClick={() => onNavigate(tabValue)}
      className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${getSeverityColor()}`}
    >
      <div className="flex items-start justify-between mb-2">
        <Icon className="w-5 h-5 text-muted-foreground" />
        {getSeverityBadge()}
      </div>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground mt-1">{description}</div>
      <div className="flex items-center gap-1 text-xs text-primary mt-2">
        View details <ArrowRight className="w-3 h-3" />
      </div>
    </button>
  );
}

export default function HealthPage() {
  const { data: nodes, isLoading: l1 } = useNodes();
  const { data: metrics, isLoading: l2 } = useMetrics();
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const loading = l1 || l2;

  const pages = useMemo(() => nodes?.filter((n) => n.type === 'page') ?? [], [nodes]);

  // Calculate all orphan types
  const trueOrphans = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((p) => metrics[p.id]?.orphanTrue)
      .sort((a, b) => (metrics[b.id]?.outboundLinks ?? 0) - (metrics[a.id]?.outboundLinks ?? 0));
  }, [pages, metrics]);

  const referenceOrphans = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((p) => metrics[p.id]?.orphanReference)
      .sort((a, b) => (metrics[b.id]?.navDepth ?? 999) - (metrics[a.id]?.navDepth ?? 999));
  }, [pages, metrics]);

  const navOrphans = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((n) => metrics[n.id]?.orphanNav)
      .sort((a, b) => (metrics[b.id]?.inboundLinks ?? 0) - (metrics[a.id]?.inboundLinks ?? 0));
  }, [pages, metrics]);

  const linkOrphans = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((n) => metrics[n.id]?.orphanLinks)
      .sort((a, b) => (metrics[a.id]?.outboundLinks ?? 0) - (metrics[b.id]?.outboundLinks ?? 0));
  }, [pages, metrics]);

  const deepContent = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((n) => (metrics[n.id]?.navDepth ?? 0) >= 6)
      .sort((a, b) => (metrics[b.id]?.inboundLinks ?? 0) - (metrics[a.id]?.inboundLinks ?? 0));
  }, [pages, metrics]);

  const deadEnds = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((p) => {
        const m = metrics[p.id];
        return m && (m.inboundLinks ?? 0) >= 10 && (m.outboundLinks ?? 0) <= 2;
      })
      .sort((a, b) => (metrics[b.id]?.inboundLinks ?? 0) - (metrics[a.id]?.inboundLinks ?? 0));
  }, [pages, metrics]);

  // Health metrics for summary
  const healthMetrics: HealthMetric[] = useMemo(() => [
    {
      label: 'True Orphans',
      count: trueOrphans.length,
      total: pages.length,
      severity: trueOrphans.length > 20 ? 'critical' : trueOrphans.length > 5 ? 'warning' : 'healthy',
      description: 'No nav + no inbound links',
    },
    {
      label: 'Reference Orphans',
      count: referenceOrphans.length,
      total: pages.length,
      severity: referenceOrphans.length > 50 ? 'warning' : 'info',
      description: 'In nav but no inbound links',
    },
    {
      label: 'Nav Orphans',
      count: navOrphans.length,
      total: pages.length,
      severity: navOrphans.length > 30 ? 'warning' : 'info',
      description: 'Not in navigation tree',
    },
    {
      label: 'Deep Content',
      count: deepContent.length,
      total: pages.length,
      severity: deepContent.length > 100 ? 'warning' : 'info',
      description: 'Nav depth 6 or more',
    },
    {
      label: 'Dead Ends',
      count: deadEnds.length,
      total: pages.length,
      severity: deadEnds.length > 20 ? 'warning' : 'info',
      description: 'High inbound, low outbound',
    },
    {
      label: 'Link Orphans',
      count: linkOrphans.length,
      total: pages.length,
      severity: 'info',
      description: 'Zero inbound links',
    },
  ], [trueOrphans, referenceOrphans, navOrphans, deepContent, deadEnds, linkOrphans, pages.length]);

  const tabs = [
    { value: 'overview', label: 'Overview', icon: BarChart3 },
    { value: 'true-orphans', label: `True Orphans (${trueOrphans.length})`, icon: AlertTriangle, data: trueOrphans },
    { value: 'ref-orphans', label: `Reference Orphans (${referenceOrphans.length})`, icon: Unlink, data: referenceOrphans },
    { value: 'nav-orphans', label: `Nav Orphans (${navOrphans.length})`, icon: EyeOff, data: navOrphans },
    { value: 'deep-content', label: `Deep Content (${deepContent.length})`, icon: TrendingDown, data: deepContent },
    { value: 'dead-ends', label: `Dead Ends (${deadEnds.length})`, icon: Eye, data: deadEnds },
  ];

  // Filter data based on search
  const filterData = (data: any[]) => {
    if (!searchQuery.trim()) return data;
    const query = searchQuery.toLowerCase();
    return data.filter((n) => {
      const hay = `${n.title || ''} ${n.filePath} ${n.permalink || ''} ${(n.navPaths || []).join(' | ')}`.toLowerCase();
      return hay.includes(query);
    });
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Loading...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Documentation Health</h1>
        <p className="text-muted-foreground mb-6">
          Consolidated view of all documentation health issues. Fix critical issues first.
        </p>

        <HealthScoreCard metrics={healthMetrics} />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex-wrap h-auto">
            {tabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                <Icon className="w-4 h-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <SummaryCard
                icon={AlertTriangle}
                tabValue="true-orphans"
                onNavigate={setActiveTab}
                {...healthMetrics[0]}
              />
              <SummaryCard
                icon={Unlink}
                tabValue="ref-orphans"
                onNavigate={setActiveTab}
                {...healthMetrics[1]}
              />
              <SummaryCard
                icon={EyeOff}
                tabValue="nav-orphans"
                onNavigate={setActiveTab}
                {...healthMetrics[2]}
              />
              <SummaryCard
                icon={TrendingDown}
                tabValue="deep-content"
                onNavigate={setActiveTab}
                {...healthMetrics[3]}
              />
              <SummaryCard
                icon={Eye}
                tabValue="dead-ends"
                onNavigate={setActiveTab}
                {...healthMetrics[4]}
              />
              <SummaryCard
                icon={Unlink}
                tabValue="true-orphans"
                onNavigate={setActiveTab}
                {...healthMetrics[5]}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common workflows to improve documentation health</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link href="/work-queue" className="flex items-center justify-between p-3 rounded-lg border hover:bg-secondary/50 transition-colors">
                  <div>
                    <div className="font-medium">Work Queue</div>
                    <div className="text-sm text-muted-foreground">Daily IA backlog with export options</div>
                  </div>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/audit" className="flex items-center justify-between p-3 rounded-lg border hover:bg-secondary/50 transition-colors">
                  <div>
                    <div className="font-medium">Content Audit</div>
                    <div className="text-sm text-muted-foreground">Run technical correctness checks</div>
                  </div>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/redirects" className="flex items-center justify-between p-3 rounded-lg border hover:bg-secondary/50 transition-colors">
                  <div>
                    <div className="font-medium">Redirect Hygiene</div>
                    <div className="text-sm text-muted-foreground">Find chains, loops, and missing destinations</div>
                  </div>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </CardContent>
            </Card>
          </TabsContent>

          {tabs.slice(1).map(({ value, data }) => (
            <TabsContent key={value} value={value}>
              <div className="mb-4">
                <Input
                  placeholder="Search by title, path, or permalink..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-md"
                />
              </div>

              <div className="flex flex-col gap-2">
                {filterData(data || []).slice(0, 100).map((n: any) => (
                  <Link key={n.id} href={`/explain?id=${encodeURIComponent(n.id)}`}>
                    <NodeCard node={n} metrics={metrics?.[n.id]} />
                  </Link>
                ))}
              </div>

              {(data?.length ?? 0) > 100 && (
                <p className="text-xs text-muted-foreground mt-4">
                  Showing first 100 of {data?.length} items
                </p>
              )}

              {filterData(data || []).length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  {searchQuery ? 'No matches found' : 'No issues in this category'}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}
