'use client';

import Link from 'next/link';
import { useMemo, useState, type ComponentType } from 'react';
import { ArrowRight, GitPullRequest, ListTodo, Network, Search, Sparkles } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMetrics, useNodes, useSummary } from '@/hooks/use-index-data';

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
  const { data: nodes, isLoading: loadingNodes } = useNodes();
  const { data: metrics, isLoading: loadingMetrics } = useMetrics();
  const { data: summary } = useSummary();

  const loading = loadingNodes || loadingMetrics;

  const results = useMemo(() => {
    if (!nodes || !metrics) return [];
    const q = query.trim().toLowerCase();
    const pages = nodes.filter((n) => n.type === 'page');

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
  }, [nodes, metrics, query]);

  return (
    <AppLayout>
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
              <Button asChild variant="secondary">
                <Link href="/work-queue">Open work queue</Link>
              </Button>
              <Button asChild>
                <Link href="/explain">Explain a page</Link>
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
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Start here</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
              title="Dashboards"
              description="See top hubs, risky pages, and navigation patterns at a glance."
              href="/dashboards"
              icon={Network}
            />
            <ActionCard
              title="Refactor Assistant"
              description="Plan a move/rename with redirects + link rewrites (dry-run → export plan → PR later)."
              href="/refactor"
              icon={GitPullRequest}
              badge="New"
            />
          </div>
        </section>

        <section>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Search pages</CardTitle>
              <CardDescription>
                Search by title, file path, permalink, or nav path. Start with a page, then use Explain for the “so what.”
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search… e.g. pkce, universal login, actions, refresh token"
                  className="pl-12 h-12 text-base rounded-2xl bg-card shadow-sm border"
                />
              </div>

              {loading && <div className="text-center text-muted-foreground py-10">Loading index…</div>}

              {!loading && (
                <div className="mt-5">
                  <div className="flex items-baseline justify-between mb-3">
                    <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                      {query.trim() ? 'Matches' : 'Top hubs (quick picks)'}
                    </h3>
                    <span className="text-xs text-muted-foreground">{results.length} results</span>
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
