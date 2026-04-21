'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertCircle, AlertTriangle, Info, ArrowRight, ChevronDown, ChevronRight,
  Sparkles, Lightbulb, TrendingUp, Shield, Zap,
} from 'lucide-react';
import type { AnalyticsInsight, InsightType } from '@/types';
import { severityVariant, severityBorder, insightTypeLabel } from '@/lib/insight-colors';

interface InsightsDashboardProps {
  insights: AnalyticsInsight[];
  summary: string;
  loading: boolean;
  error: string | null;
  generated: boolean;
  mode: 'algorithmic' | 'ai';
}

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case 'high': return <AlertCircle className="h-4 w-4 text-destructive" />;
    case 'medium': return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    case 'low': return <Info className="h-4 w-4 text-blue-400" />;
    default: return null;
  }
}

export function InsightsDashboard({
  insights,
  summary,
  loading,
  error,
  generated,
  mode,
}: InsightsDashboardProps) {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Filtered insights
  const filtered = useMemo(() => {
    let result = insights;
    if (severityFilter !== 'all') result = result.filter((i) => i.severity === severityFilter);
    if (typeFilter !== 'all') result = result.filter((i) => i.type === typeFilter);
    return result;
  }, [insights, severityFilter, typeFilter]);

  // Grouped by severity
  const grouped = useMemo(() => {
    const groups: Record<string, AnalyticsInsight[]> = { high: [], medium: [], low: [] };
    for (const insight of filtered) {
      (groups[insight.severity] ?? (groups[insight.severity] = [])).push(insight);
    }
    return groups;
  }, [filtered]);

  // Unique types for the filter
  const availableTypes = useMemo(
    () => Array.from(new Set(insights.map((i) => i.type))),
    [insights],
  );

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  // ── Error state ──────────────────────────────────────────────
  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Loading state ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Card skeletons */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Empty / not generated ────────────────────────────────────
  if (!generated) return null;

  if (generated && insights.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center py-12">
          <Lightbulb className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No insights generated. This may mean your documentation structure is in good shape,
            or there isn&apos;t enough analytics data to correlate.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Main dashboard ───────────────────────────────────────────
  const highCount = insights.filter((i) => i.severity === 'high').length;
  const mediumCount = insights.filter((i) => i.severity === 'medium').length;
  const lowCount = insights.filter((i) => i.severity === 'low').length;

  return (
    <div className="space-y-4">
      {/* Executive Summary */}
      {summary && mode === 'ai' && (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 mt-0.5 text-primary shrink-0" />
              <div>
                <h3 className="font-semibold text-sm mb-1">Executive Summary</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground mb-1">Total Insights</div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-2xl font-bold">{insights.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground mb-1">High Severity</div>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-2xl font-bold text-destructive">{highCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground mb-1">Medium Severity</div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="text-2xl font-bold text-orange-500">{mediumCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground mb-1">Low Severity</div>
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-400" />
              <span className="text-2xl font-bold text-blue-400">{lowCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Severity:</span>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[110px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Type:</span>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {availableTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {insightTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="text-xs text-muted-foreground ml-auto">
          Showing {filtered.length} of {insights.length} insight{insights.length !== 1 ? 's' : ''}
          {mode === 'ai' ? ' (AI-enhanced)' : ' (algorithmic)'}
        </span>
      </div>

      {/* Severity Groups */}
      {(['high', 'medium', 'low'] as const).map((severity) => {
        const group = grouped[severity];
        if (!group || group.length === 0) return null;
        const isCollapsed = collapsedGroups.has(severity);

        return (
          <Collapsible key={severity} open={!isCollapsed} onOpenChange={() => toggleGroup(severity)}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-3 py-2 h-auto">
                <div className="flex items-center gap-2">
                  <SeverityIcon severity={severity} />
                  <span className="font-medium text-sm capitalize">{severity} Severity</span>
                  <Badge variant={severityVariant(severity)} className="text-xs">
                    {group.length}
                  </Badge>
                </div>
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {group.map((insight, idx) => (
                <InsightCard key={`${severity}-${idx}`} insight={insight} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

function InsightCard({ insight }: { insight: AnalyticsInsight }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={severityBorder(insight.severity)}>
      <CardContent className="pt-4 pb-4 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={severityVariant(insight.severity)} className="text-xs">
              {insight.severity}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">
              {insightTypeLabel(insight.type)}
            </Badge>
            <span className="font-semibold text-sm">{insight.title}</span>
          </div>
          {insight.affectedPages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs shrink-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Less' : `${insight.affectedPages.length} pages`}
            </Button>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed">{insight.description}</p>

        {/* Affected pages (expandable) */}
        {expanded && insight.affectedPages.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-xs text-muted-foreground">Affected:</span>
            {insight.affectedPages.map((page) => (
              <code key={page} className="text-xs bg-muted px-2 py-0.5 rounded">
                {page}
              </code>
            ))}
          </div>
        )}

        {/* Recommendation */}
        <div className="flex items-start gap-1.5 text-sm bg-muted/50 rounded-lg p-3">
          <ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <span>{insight.recommendation}</span>
        </div>
      </CardContent>
    </Card>
  );
}
