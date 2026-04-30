'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ExternalLink,
  Sparkles,
  Clock,
  MessagesSquare,
  FileCode2,
  ClipboardCheck,
  Copy,
  FileSpreadsheet,
  Wrench,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { useFeedback, useNodes } from '@/hooks/use-index-data';
import type { FeedbackBucket, FeedbackItem } from '@/types';

type DiagnosisState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'ready'; diagnosis: string; model: string; generatedAt: string }
  | { status: 'error'; message: string };

function useDiagnosis(path: string) {
  const [state, setState] = useState<DiagnosisState>({ status: 'loading' });
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetch(`/api/feedback/diagnose?path=${encodeURIComponent(path)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setState({ status: 'error', message: body.error ?? `HTTP ${res.status}` });
          return;
        }
        const data = await res.json();
        if (data.diagnosis) {
          setState({
            status: 'ready',
            diagnosis: data.diagnosis,
            model: data.model,
            generatedAt: data.generatedAt,
          });
        } else {
          setState({ status: 'none' });
        }
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/feedback/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ status: 'error', message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setState({
        status: 'ready',
        diagnosis: data.diagnosis,
        model: data.model,
        generatedAt: data.generatedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate diagnosis';
      setState({ status: 'error', message });
    } finally {
      setGenerating(false);
    }
  };

  return { state, generating, generate };
}

function DiagnosisCard({
  isCandidate,
  state,
  generating,
  generate,
}: {
  isCandidate: boolean;
  state: DiagnosisState;
  generating: boolean;
  generate: () => Promise<void>;
}) {
  const Header = (
    <div className="flex items-center gap-2 text-xs uppercase tracking-wide mb-2">
      <Sparkles className="w-4 h-4" /> Diagnosis
    </div>
  );

  if (state.status === 'loading') {
    return (
      <div className="rounded-xl border bg-card p-5 mb-6 text-sm text-muted-foreground">
        {Header}
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 mb-6 text-sm">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-destructive mb-2">
          <Sparkles className="w-4 h-4" /> Diagnosis error
        </div>
        <div className="text-destructive">{state.message}</div>
        {isCandidate && (
          <Button variant="outline" size="sm" className="mt-3" onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Try again
          </Button>
        )}
      </div>
    );
  }

  if (state.status === 'ready') {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary">
            <Sparkles className="w-4 h-4" /> Diagnosis
          </div>
          <Button variant="ghost" size="sm" onClick={generate} disabled={generating} className="h-7">
            {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Regenerate
          </Button>
        </div>
        <div className="text-sm leading-relaxed mb-3">{state.diagnosis}</div>
        <div className="text-xs text-muted-foreground">
          {state.model} · {new Date(state.generatedAt).toLocaleString()}
        </div>
      </div>
    );
  }

  // status === 'none'
  if (!isCandidate) {
    return null;
  }
  return (
    <div className="rounded-xl border bg-card p-5 mb-6">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
        <Sparkles className="w-4 h-4" /> Diagnosis
      </div>
      <div className="text-sm text-muted-foreground mb-3">
        No diagnosis generated yet. Click below to analyze this cluster with Claude
        (uses the Anthropic key from your <Link className="underline" href="/settings">settings</Link>).
      </div>
      <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
        {generating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
        {generating ? 'Diagnosing…' : 'Diagnose this cluster'}
      </Button>
    </div>
  );
}

function formatRelative(iso: string) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const minutes = Math.round((now - t) / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'border-muted-foreground/30 text-muted-foreground',
    in_progress: 'border-blue-500/40 text-blue-500',
    resolved: 'border-emerald-500/40 text-emerald-500',
    dismissed: 'border-muted-foreground/20 text-muted-foreground/70',
  };
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide ${styles[status] ?? ''}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function generateGitHubMarkdown(path: string, bucket: FeedbackBucket, diagnosis: string | null): string {
  const today = new Date().toISOString().split('T')[0];
  const c = bucket.cluster;

  let md = `# Docs feedback triage: \`${path}\`\n\n`;
  md += `**Exported from auth0-ia on ${today}**\n\n`;
  md += `- Items: ${bucket.count} (${bucket.negativeCount} negative, ${bucket.pendingCount} pending in Mintlify)\n`;
  md += `- Page: https://auth0.com${path}\n\n`;

  if (diagnosis) {
    md += `## Diagnosis\n\n${diagnosis}\n\n`;
  }

  md += `## Cluster signals\n\n`;
  if (c.burst) {
    md += `- **Burst**: ${c.burst.count} items in ${c.burst.windowMinutes} minutes (${c.burst.startedAt} → ${c.burst.endedAt}) — likely one user, one frustrated session.\n`;
  }
  if (c.topTerms.length > 0) {
    md += `- **Recurring terms**: ${c.topTerms.map((t) => `\`${t.term}\` ×${t.count}`).join(', ')}\n`;
  }
  if (c.recurringCode > 0) {
    md += `- **Recurring code snippets**: ${c.recurringCode} snippet(s) appear on multiple feedback items\n`;
  }
  md += `\n`;

  md += `## Feedback items (${bucket.items.length})\n\n`;
  bucket.items.forEach((item, idx) => {
    md += `### ${idx + 1}. ${item.source}`;
    if (item.source === 'contextual') {
      md += item.helpful === false ? ' (👎)' : item.helpful === true ? ' (👍)' : '';
    }
    md += `\n\n`;
    md += `- Submitted: ${item.createdAt}\n`;
    md += `- Mintlify status: \`${item.status}\`\n`;
    if (item.filename) md += `- File: \`${item.filename}\`${item.lang ? ` (${item.lang})` : ''}\n`;
    md += `\n`;
    if (item.comment) {
      md += `> ${item.comment.split('\n').join('\n> ')}\n\n`;
    }
    if (item.code) {
      md += '```' + (item.lang || '') + '\n' + item.code + '\n```\n\n';
    }
  });

  md += `## Suggested next steps\n\n`;
  md += `- [ ] Review the diagnosis above and decide: content fix, structural fix, or escalate\n`;
  md += `- [ ] Open a PR against \`auth0/docs-v2\` if a content fix is needed\n`;
  md += `- [ ] Once shipped, the next \`pnpm fetch:feedback\` run will pick up the resolution implicitly\n`;
  md += `- [ ] Mark these items as \`resolved\` or \`dismissed\` in the Mintlify dashboard (no write API yet)\n`;

  return md;
}

function generateJiraCsv(path: string, bucket: FeedbackBucket, diagnosis: string | null): string {
  const c = bucket.cluster;
  const summary = `Docs feedback: ${path}`;

  const descLines: string[] = [];
  descLines.push(`h2. Page`);
  descLines.push(`${path} — https://auth0.com${path}`);
  descLines.push(``);
  descLines.push(`h2. Counts`);
  descLines.push(`* Total: ${bucket.count}`);
  descLines.push(`* Negative: ${bucket.negativeCount}`);
  descLines.push(`* Pending in Mintlify: ${bucket.pendingCount}`);
  descLines.push(``);
  if (diagnosis) {
    descLines.push(`h2. Diagnosis`);
    descLines.push(diagnosis);
    descLines.push(``);
  }
  if (c.burst) {
    descLines.push(`h2. Burst`);
    descLines.push(`${c.burst.count} items in ${c.burst.windowMinutes} min — likely a single frustrated session.`);
    descLines.push(``);
  }
  if (c.topTerms.length > 0) {
    descLines.push(`h2. Recurring terms`);
    c.topTerms.forEach((t) => descLines.push(`* ${t.term} (×${t.count})`));
    descLines.push(``);
  }
  descLines.push(`h2. Feedback items`);
  bucket.items.forEach((item, idx) => {
    descLines.push(`${idx + 1}. (${item.source}) ${item.comment ?? '[no comment]'}`);
  });

  const labels = ['docs-feedback'];
  if (c.burst) labels.push('feedback-burst');
  if (c.recurringCode > 0) labels.push('feedback-recurring-code');

  let priority = 'Medium';
  if (bucket.count >= 5 || (c.burst && c.burst.count >= 3)) priority = 'High';
  else if (bucket.count === 1) priority = 'Low';

  const escape = (field: string) => {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };

  const headers = ['Summary', 'Description', 'Labels', 'Priority'];
  const row = [summary, descLines.join('\n'), labels.join(','), priority].map(escape).join(',');
  return [headers.join(','), row].join('\n');
}

function TriageActions({
  path,
  bucket,
  diagnosis,
}: {
  path: string;
  bucket: FeedbackBucket;
  diagnosis: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyGitHub = async () => {
    await navigator.clipboard.writeText(generateGitHubMarkdown(path, bucket, diagnosis));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJira = () => {
    const csv = generateJiraCsv(path, bucket, diagnosis);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const slug = path.replace(/\W+/g, '-').replace(/^-|-$/g, '');
    link.download = `feedback-${slug}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="rounded-xl border bg-card p-5 mb-6">
      <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-wide text-muted-foreground">
        <Wrench className="w-4 h-4" /> Triage
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/audit" className="gap-2">
            <ClipboardCheck className="w-4 h-4" />
            Open audit (paste URL)
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopyGitHub} className="gap-2">
          {copied ? <ClipboardCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy as GitHub issue'}
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownloadJira} className="gap-2">
          <FileSpreadsheet className="w-4 h-4" />
          Export to Jira CSV
        </Button>
      </div>
      <div className="text-xs text-muted-foreground mt-3 leading-relaxed">
        Mintlify owns feedback status (no write API yet — coming soon). Resolution is implicit:
        once a fix PR ships against <code className="font-mono">auth0/docs-v2</code>, the next{' '}
        <code className="font-mono">pnpm fetch:feedback</code> run reflects the new state.
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: FeedbackItem }) {
  const isCodeSnippet = item.source === 'code_snippet';
  const isThumbsDown = item.source === 'contextual' && item.helpful === false;
  const isThumbsUp = item.source === 'contextual' && item.helpful === true;

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
        {isCodeSnippet && (
          <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5">
            <FileCode2 className="w-3 h-3" /> code snippet
          </span>
        )}
        {isThumbsDown && (
          <span className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-0.5 text-destructive">
            👎 thumbs-down
          </span>
        )}
        {isThumbsUp && (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 px-2 py-0.5 text-emerald-500">
            👍 thumbs-up
          </span>
        )}
        <StatusPill status={item.status} />
        <span className="ml-auto inline-flex items-center gap-1">
          <Clock className="w-3 h-3" /> {formatRelative(item.createdAt)}
        </span>
      </div>

      {item.comment && (
        <div className="text-sm leading-relaxed mb-3 whitespace-pre-wrap">{item.comment}</div>
      )}

      {item.code && (
        <div className="mt-2">
          {item.filename && (
            <div className="text-xs font-mono text-muted-foreground mb-1">
              {item.filename}
              {item.lang ? ` · ${item.lang}` : ''}
            </div>
          )}
          <pre className="rounded-lg border bg-muted/40 p-3 text-xs font-mono overflow-x-auto whitespace-pre">
            {item.code}
          </pre>
        </div>
      )}
    </div>
  );
}

function FeedbackQueueRow({ path, bucket }: { path: string; bucket: FeedbackBucket }) {
  const { cluster } = bucket;
  const negative = bucket.negativeCount;
  const lastAt = new Date(bucket.lastAt);
  const ageDays = Math.max(0, Math.round((Date.now() - lastAt.getTime()) / 86400000));

  const burstLine = cluster.burst
    ? `Burst of ${cluster.burst.count} in ${cluster.burst.windowMinutes} min`
    : null;
  const termsLine = cluster.topTerms.length
    ? cluster.topTerms.slice(0, 4).map((t) => `${t.term} ×${t.count}`).join(' · ')
    : null;
  const signals = [burstLine, termsLine].filter(Boolean).join(' — ');

  return (
    <Link
      href={`/feedback?path=${encodeURIComponent(path)}`}
      className="block rounded-xl border bg-card p-4 hover:bg-secondary/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="font-mono text-sm font-medium break-all">{path}</div>
        <div className="flex items-center gap-2 text-xs whitespace-nowrap">
          <span className="rounded-md border px-2 py-0.5 bg-secondary/40">
            {bucket.count} {bucket.count === 1 ? 'item' : 'items'}
          </span>
          {negative > 0 && (
            <span className="rounded-md border border-destructive/30 px-2 py-0.5 text-destructive">
              {negative} negative
            </span>
          )}
          {bucket.pendingCount > 0 && (
            <span className="rounded-md border px-2 py-0.5 text-muted-foreground">
              {bucket.pendingCount} pending
            </span>
          )}
        </div>
      </div>

      {signals ? (
        <div className="text-sm text-muted-foreground leading-relaxed mb-1">{signals}</div>
      ) : null}

      <div className="text-xs text-muted-foreground">
        last feedback {ageDays === 0 ? 'today' : `${ageDays}d ago`}
        {cluster.recurringCode > 0 && (
          <span className="ml-2">· {cluster.recurringCode} recurring snippet{cluster.recurringCode === 1 ? '' : 's'}</span>
        )}
      </div>
    </Link>
  );
}

function FeedbackQueueView({ entries, fetchedAt }: { entries: Array<[string, FeedbackBucket]>; fetchedAt: string | null }) {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Feedback</h1>
        <p className="text-muted-foreground mb-2">
          Mintlify user feedback joined to the IA graph. Pages with multiple complaints, time-clustered bursts, or recurring code-snippet issues bubble to the top. Click any row to view the cluster, generate a one-sentence Claude diagnosis on demand (uses your settings-page Anthropic key), and triage.
        </p>
        {fetchedAt && (
          <p className="text-xs text-muted-foreground mb-8">
            Last fetched {formatRelative(fetchedAt)}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {entries.map(([path, bucket]) => (
            <FeedbackQueueRow key={path} path={path} bucket={bucket} />
          ))}
          {entries.length === 0 && (
            <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
              No feedback data yet. Run <code className="font-mono">pnpm fetch:feedback</code> to fetch from Mintlify.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function FeedbackBody({
  path,
  bucket,
  cluster,
}: {
  path: string;
  bucket: FeedbackBucket;
  cluster: FeedbackBucket['cluster'];
}) {
  const { state, generating, generate } = useDiagnosis(path);
  const diagnosisText = state.status === 'ready' ? state.diagnosis : null;

  return (
    <>
      <DiagnosisCard
        isCandidate={cluster.diagnosisCandidate}
        state={state}
        generating={generating}
        generate={generate}
      />
      <TriageActions path={path} bucket={bucket} diagnosis={diagnosisText} />
    </>
  );
}

export default function FeedbackClient() {
  const searchParams = useSearchParams();
  const path = searchParams.get('path');
  const { data: feedback, isLoading } = useFeedback();
  const { data: nodes } = useNodes();

  const bucket = path && feedback ? feedback.byPath[path] : undefined;

  const matchingNode = useMemo(() => {
    if (!path || !nodes) return null;
    return nodes.find((n) => n.permalink === path) ?? null;
  }, [path, nodes]);

  const queueEntries = useMemo(() => {
    if (!feedback) return [] as Array<[string, FeedbackBucket]>;
    return Object.entries(feedback.byPath).sort((a, b) => b[1].count - a[1].count);
  }, [feedback]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  if (!path) {
    return <FeedbackQueueView entries={queueEntries} fetchedAt={feedback?.fetchedAt ?? null} />;
  }

  if (!bucket) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto">
          <Button asChild variant="ghost" size="sm" className="mb-4">
            <Link href="/feedback">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to feedback
            </Link>
          </Button>
          <div className="rounded-xl border bg-card p-6">
            <div className="text-sm font-medium mb-1">No feedback for this path</div>
            <div className="text-sm text-muted-foreground font-mono break-all">{path}</div>
          </div>
        </div>
      </AppLayout>
    );
  }

  const { cluster } = bucket;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href="/feedback">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to feedback
          </Link>
        </Button>

        <div className="rounded-xl border bg-card p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">page</div>
              <h1 className="text-xl font-semibold font-mono break-all">{path}</h1>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Button asChild variant="outline" size="sm">
                <a href={`https://auth0.com${path}`} target="_blank" rel="noreferrer">
                  Open on auth0.com <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </Button>
              {matchingNode && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/explain?id=${encodeURIComponent(matchingNode.id)}`}>
                    Open in /explain
                  </Link>
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border px-2 py-0.5 bg-secondary/40">
              {bucket.count} {bucket.count === 1 ? 'item' : 'items'}
            </span>
            {bucket.negativeCount > 0 && (
              <span className="rounded-md border border-destructive/30 px-2 py-0.5 text-destructive">
                {bucket.negativeCount} negative
              </span>
            )}
            {bucket.pendingCount > 0 && (
              <span className="rounded-md border px-2 py-0.5">
                {bucket.pendingCount} pending
              </span>
            )}
            {bucket.inProgressCount > 0 && (
              <span className="rounded-md border border-blue-500/40 px-2 py-0.5 text-blue-500">
                {bucket.inProgressCount} in progress
              </span>
            )}
            {bucket.resolvedCount > 0 && (
              <span className="rounded-md border border-emerald-500/40 px-2 py-0.5 text-emerald-500">
                {bucket.resolvedCount} resolved
              </span>
            )}
            {bucket.dismissedCount > 0 && (
              <span className="rounded-md border px-2 py-0.5 text-muted-foreground">
                {bucket.dismissedCount} dismissed
              </span>
            )}
          </div>
        </div>

        <FeedbackBody path={path} bucket={bucket} cluster={cluster} />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Burst</div>
            <div className="text-sm">
              {cluster.burst
                ? `${cluster.burst.count} items in ${cluster.burst.windowMinutes} min`
                : 'no burst'}
            </div>
            {cluster.burst && (
              <div className="text-xs text-muted-foreground mt-1">
                {formatRelative(cluster.burst.startedAt)} → {formatRelative(cluster.burst.endedAt)}
              </div>
            )}
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Top terms</div>
            {cluster.topTerms.length > 0 ? (
              <div className="text-sm leading-snug">
                {cluster.topTerms.slice(0, 4).map((t) => (
                  <span key={t.term} className="mr-2 whitespace-nowrap">
                    {t.term} <span className="text-muted-foreground">×{t.count}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">none recurring</div>
            )}
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Recurring snippets</div>
            <div className="text-sm">
              {cluster.recurringCode > 0
                ? `${cluster.recurringCode} repeated`
                : 'none'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
          <MessagesSquare className="w-4 h-4" />
          {bucket.items.length} {bucket.items.length === 1 ? 'item' : 'items'} (newest first)
        </div>

        <div className="flex flex-col gap-3">
          {bucket.items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
