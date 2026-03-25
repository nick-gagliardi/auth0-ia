'use client';

import { useMemo } from 'react';
import { AlertTriangle, Link as LinkIcon, Repeat2, ShieldAlert } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRedirects } from '@/hooks/use-index-data';

function RouteList({ items }: { items: { source: string; destination: string }[] }) {
  return (
    <div className="space-y-2">
      {items.map((r, idx) => (
        <div key={`${r.source}||${r.destination}||${idx}`} className="rounded-xl border bg-card p-4">
          <div className="text-sm font-mono break-all">{r.source}</div>
          <div className="text-sm text-muted-foreground font-mono break-all">→ {r.destination}</div>
        </div>
      ))}
      {items.length === 0 && <div className="text-sm text-muted-foreground">None</div>}
    </div>
  );
}

export default function RedirectsPage() {
  const { data, isLoading, error } = useRedirects();

  const chains = useMemo(() => data?.warnings?.chains ?? [], [data]);
  const loops = useMemo(() => data?.warnings?.loops ?? [], [data]);
  const missingDst = useMemo(() => data?.warnings?.missingDestination ?? [], [data]);
  const missingDstResolvable = useMemo(() => data?.warnings?.missingDestinationResolvable ?? [], [data]);
  const missingDstUnresolvable = useMemo(() => data?.warnings?.missingDestinationUnresolvable ?? [], [data]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Failed to load redirects.json</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Redirect hygiene</h1>
          <p className="text-muted-foreground">Find redirect chains, loops, and redirects pointing to missing pages (best-effort).</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <LinkIcon className="w-4 h-4" /> Summary
            </CardTitle>
            <CardDescription>Derived from docs.json redirects.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm">
            <Badge variant="secondary">redirects: {data?.redirects?.length ?? 0}</Badge>
            <Badge variant={missingDstUnresolvable.length ? 'destructive' : 'secondary'}>missing dest (unresolvable): {missingDstUnresolvable.length}</Badge>
            <Badge variant={missingDstResolvable.length ? 'default' : 'secondary'}>missing dest (resolves via redirects): {missingDstResolvable.length}</Badge>
            <Badge variant={chains.length ? 'default' : 'secondary'}>chains: {chains.length}</Badge>
            <Badge variant={loops.length ? 'destructive' : 'secondary'}>loops: {loops.length}</Badge>
          </CardContent>
        </Card>

        <Tabs defaultValue="missing-dst-unresolvable">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="missing-dst-unresolvable" className="gap-1.5">
              <ShieldAlert className="w-4 h-4" /> Missing destination (unresolvable)
            </TabsTrigger>
            <TabsTrigger value="missing-dst-resolvable" className="gap-1.5">
              <Repeat2 className="w-4 h-4" /> Missing destination (resolves)
            </TabsTrigger>
            <TabsTrigger value="chains" className="gap-1.5">
              <Repeat2 className="w-4 h-4" /> Chains
            </TabsTrigger>
            <TabsTrigger value="loops" className="gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Loops
            </TabsTrigger>
          </TabsList>

          <TabsContent value="missing-dst-unresolvable" className="mt-4">
            <RouteList items={missingDstUnresolvable} />
          </TabsContent>

          <TabsContent value="missing-dst-resolvable" className="mt-4">
            <div className="space-y-2">
              {missingDstResolvable.map((r, idx) => (
                <div key={`${r.source}||${r.destination}||${idx}`} className="rounded-xl border bg-card p-4">
                  <div className="text-sm font-mono break-all">{r.source}</div>
                  <div className="text-sm text-muted-foreground font-mono break-all">→ {r.destination}</div>
                  <div className="text-xs text-muted-foreground mt-2 font-mono break-all">
                    resolves to: {r.finalDestination || '(unknown)'} · hops: {r.hops}{r.loop ? ' · LOOP' : ''}
                  </div>
                </div>
              ))}
              {missingDstResolvable.length === 0 && <div className="text-sm text-muted-foreground">None</div>}
            </div>
          </TabsContent>

          <TabsContent value="chains" className="mt-4">
            <div className="space-y-2">
              {chains.map((c) => (
                <div key={c.source} className="rounded-xl border bg-card p-4">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">chain</div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words">{c.chain.join(' -> ')}</pre>
                </div>
              ))}
              {chains.length === 0 && <div className="text-sm text-muted-foreground">None</div>}
            </div>
          </TabsContent>

          <TabsContent value="loops" className="mt-4">
            <div className="space-y-2">
              {loops.map((c) => (
                <div key={c.source} className="rounded-xl border bg-card p-4">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">loop</div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words">{c.chain.join(' -> ')}</pre>
                </div>
              ))}
              {loops.length === 0 && <div className="text-sm text-muted-foreground">None</div>}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
