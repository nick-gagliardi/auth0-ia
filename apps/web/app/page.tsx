'use client';

import Link from 'next/link';
import { useMemo, useState, type ComponentType } from 'react';
import { ArrowRight, ListTodo, Network, Search, Filter, Calendar, X } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { OnboardingModal } from '@/components/OnboardingModal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMetrics, useNodes, useSummary } from '@/hooks/use-index-data';
import type { DocNode } from '@/types';

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

function ActionCard({
  title,
  description,
  href,
  icon: Icon,
  badge,
  disabled,
}: {
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string;
  disabled?: boolean;
}) {
  const inner = (
    <Card
      className={`h-full transition-colors ${
        disabled ? 'opacity-60' : 'hover:bg-secondary/40'
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {title}
                {badge && (
                  <Badge variant={badge === 'New' ? 'default' : 'secondary'} className="text-xs">
                    {badge}
                  </Badge>
                )}
              </CardTitle>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground mt-1" />
        </div>
        <CardDescription className="mt-2">{description}</CardDescription>
      </CardHeader>
    </Card>
  );

  if (disabled) return inner;
  return (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  );
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [navSection, setNavSection] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const { data: nodes, isLoading: loadingNodes } = useNodes();
  const { data: metrics, isLoading: loadingMetrics } = useMetrics();
  const { data: summary } = useSummary();

  const loading = loadingNodes || loadingMetrics;
  const navSections = useMemo(() => extractNavSections(nodes || []), [nodes]);
  
  // Count active filters
  const activeFilterCount = (navSection ? 1 : 0) + (dateFilter !== 'all' ? 1 : 0);

  const results = useMemo(() => {
    if (!nodes || !metrics) return [];
    const q = query.trim().toLowerCase();
    
    // First apply nav section and date filters
    let pages = nodes.filter((n) => {
      if (n.type !== 'page') return false;
      const matchesNav = matchesNavSection(n, navSection);
      const matchesDate = matchesDateFilter(n, dateFilter);
      return matchesNav && matchesDate;
    });

    if (!q) {
      return [...pages]
        .map((n) => ({ ...n, score: metrics[n.id]?.inboundLinks ?? 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);
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
    return out.sort((a, b) => b.score - a.score).slice(0, 20);
  }, [nodes, metrics, query, navSection, dateFilter]);

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
    <AppLayout>
      <OnboardingModal />
      <div className="space-y-8">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Docs Ops Console</h1>
              <p className="text-muted-foreground mt-1">
                Writer-first workflows for navigating, auditing, and refactoring docs safely.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <Button asChild>
                <Link href="/explain">Explain a page</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/work-queue">Open work queue</Link>
              </Button>
            </div>
          </div>
          {summary && (
            <p className="text-xs text-muted-foreground">
              Indexed snapshot: <span className="font-mono">{summary.generatedAtUtc}</span>
            </p>
          )}
        </div>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Start here</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ActionCard
              title="Explain"
              description="Pick a page/snippet and get a risk + context summary (inbound links, nav paths, shared links)."
              href="/explain"
              icon={Search}
            />
            <ActionCard
              title="Work Queue"
              description="Triage orphans, broken links, and duplicates into a concrete list of fixes."
              href="/work-queue"
              icon={ListTodo}
            />
            <ActionCard
              title="Redirects"
              description="Check redirect hygiene: chains, loops, and missing destinations."
              href="/redirects"
              icon={Network}
            />
          </div>
        </section>

        <section>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Search pages</CardTitle>
              <CardDescription>
                Search by title, file path, permalink, or nav path. Start with a page, then use Explain for the &apos;so what.&apos;
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search… e.g. pkce, universal login, actions, refresh token"
                  className="pl-12 h-12 text-base rounded-2xl bg-card shadow-sm border"
                />
              </div>

              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
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

              {loading && <div className="text-center text-muted-foreground py-10">Loading index…</div>}

              {!loading && (
                <div className="mt-4">
                  <div className="flex items-baseline justify-between mb-3">
                    <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                      {query.trim() ? 'Matches' : 'Top hubs (quick picks)'}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {results.length} result{results.length !== 1 ? 's' : ''}
                      {activeFilterCount > 0 && ' (filtered)'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {results.map((n, i) => (
                      <NodeCard
                        key={n.id}
                        node={n}
                        metrics={metrics?.[n.id]}
                        rank={!query.trim() ? i + 1 : undefined}
                      />
                    ))}
                  </div>
                  {results.length === 0 && (
                    <div className="text-center py-10 rounded-xl border bg-card">
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
              )}
            </CardContent>
          </Card>
        </section>

        <section className="sm:hidden">
          <div className="grid grid-cols-1 gap-2">
            <Button asChild variant="secondary" className="justify-between">
              <Link href="/work-queue">
                Open work queue <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild className="justify-between">
              <Link href="/explain">
                Explain a page <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
