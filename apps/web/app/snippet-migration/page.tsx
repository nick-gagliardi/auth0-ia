'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Copy, Filter, GitPullRequest, Search, Loader2, CheckCircle, ExternalLink } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useSnippetMigration } from '@/hooks/use-index-data';

export default function SnippetMigrationPage() {
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useSnippetMigration();

  const [q, setQ] = useState('');
  const [lang, setLang] = useState<string>('all');
  const [migratingId, setMigratingId] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<{ open: boolean; prUrl: string; snippetId: string }>({
    open: false,
    prUrl: '',
    snippetId: '',
  });

  const items = data?.items ?? [];

  const langs = useMemo(() => {
    const keys = Object.keys(data?.byLang || {});
    return ['all', ...keys.sort()];
  }, [data]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((x) => {
      const l = (x.lang || '(none)').toLowerCase();
      if (lang !== 'all' && l !== lang) return false;
      if (!qq) return true;
      const hay = `${x.filePath} ${x.preview} ${x.snippetId} ${l}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [items, q, lang]);

  const repeated = filtered.filter((x) => x.occurrences >= 2);
  const singletons = filtered.filter((x) => x.occurrences === 1);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', description: `${label} copied to clipboard` });
    } catch {
      toast({ title: 'Copy failed', description: 'Could not access clipboard', variant: 'destructive' });
    }
  }

  async function migrate(item: any) {
    const itemId = `${item.filePath}:${item.startLine}:${item.hash}`;
    setMigratingId(itemId);
    try {
      const res = await fetch('/api/snippets/migrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetRepo: process.env.NEXT_PUBLIC_SNIPPET_MIGRATION_TARGET_REPO || 'Nick-Gagliardi/docs-v2',
          filePath: item.filePath,
          startLine: item.startLine,
          endLine: item.endLine,
          lang: item.lang,
          snippetId: item.snippetId,
          hash: item.hash,
          migrateAllOccurrences: false,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Migration failed');
      setSuccessModal({ open: true, prUrl: json.prUrl, snippetId: item.snippetId });
    } catch (e: any) {
      toast({ title: 'Migration failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setMigratingId(null);
    }
  }

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
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">Snippet Migration</h1>
          <p className="text-muted-foreground mb-4">Failed to load snippet migration inventory.</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Snippet Migration</h1>
          <p className="text-muted-foreground">
            Review hardcoded fenced code blocks and migrate them to <code className="font-mono">main/snippets/&lt;id&gt;/</code> with <code className="font-mono">&lt;Snippet /&gt;</code> embeds.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Inventory</CardTitle>
            <CardDescription>
              pages scanned: <b>{data?.pagesScanned ?? 0}</b> · blocks found: <b>{data?.blocksFound ?? 0}</b> · unique blocks: <b>{data?.uniqueBlocks ?? 0}</b>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search file, preview, snippetId…" className="pl-12 h-12 rounded-2xl" />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <select
                  className="h-12 rounded-2xl border bg-card px-3 text-sm"
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                >
                  {langs.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="repeated">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="repeated">Repeated (best ROI)</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="single">Singletons</TabsTrigger>
          </TabsList>

          <TabsContent value="repeated" className="mt-4">
            <List items={repeated} onCopy={copy} onMigrate={migrate} migratingId={migratingId} />
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            <List items={filtered} onCopy={copy} onMigrate={migrate} migratingId={migratingId} />
          </TabsContent>

          <TabsContent value="single" className="mt-4">
            <List items={singletons} onCopy={copy} onMigrate={migrate} migratingId={migratingId} />
          </TabsContent>
        </Tabs>

        <div className="text-xs text-muted-foreground">
          Note: the PR only migrates the selected occurrence for now. We can add &ldquo;migrate all identical occurrences&rdquo; once we&rsquo;re comfortable.
        </div>

        {/* Success Modal */}
        <Dialog open={successModal.open} onOpenChange={(open) => setSuccessModal({ ...successModal, open })}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                PR Created Successfully
              </DialogTitle>
              <DialogDescription>
                A pull request has been opened to migrate the snippet <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{successModal.snippetId}</code>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Pull Request URL</div>
                <div className="font-mono text-sm break-all">{successModal.prUrl}</div>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    window.open(successModal.prUrl, '_blank');
                  }}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open PR
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSuccessModal({ open: false, prUrl: '', snippetId: '' })}
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

function List({
  items,
  onCopy,
  onMigrate,
  migratingId,
}: {
  items: any[];
  onCopy: (text: string, label: string) => Promise<void>;
  onMigrate: (item: any) => Promise<void>;
  migratingId: string | null;
}) {
  return (
    <div className="space-y-2">
      {items.slice(0, 200).map((x) => {
        const itemId = `${x.filePath}:${x.startLine}:${x.hash}`;
        const isMigrating = migratingId === itemId;
        return (
          <div key={itemId} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{(x.lang || '(none)').toLowerCase()}</Badge>
                  <Badge variant={x.occurrences >= 2 ? 'default' : 'secondary'}>{x.occurrences}x</Badge>
                  <span className="text-xs text-muted-foreground font-mono break-all">{x.snippetId}</span>
                </div>

                <div className="mt-2 text-sm font-mono break-all">
                  {x.filePath}:{x.startLine}-{x.endLine}
                </div>

                <div className="mt-2 text-sm text-muted-foreground">{x.preview}</div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    href={`/explain?id=${encodeURIComponent(x.filePath)}`}
                  >
                    Explain page <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button variant="secondary" size="sm" onClick={() => onCopy(x.code, 'Snippet code')} disabled={isMigrating}>
                  <Copy className="w-4 h-4 mr-2" /> Copy
                </Button>
                <Button variant="default" size="sm" onClick={() => onMigrate(x)} disabled={isMigrating || migratingId !== null}>
                  {isMigrating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating PR...
                    </>
                  ) : (
                    <>
                      <GitPullRequest className="w-4 h-4 mr-2" /> Migrate
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      {items.length > 200 ? <div className="text-xs text-muted-foreground">Showing first 200 of {items.length}</div> : null}
      {items.length === 0 ? <div className="text-sm text-muted-foreground">No items</div> : null}
    </div>
  );
}
