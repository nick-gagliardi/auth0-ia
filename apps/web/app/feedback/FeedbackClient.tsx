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
import {
  DIAGNOSIS_SYSTEM_PROMPT,
  buildDiagnosisUserPrompt,
  FIX_SUGGESTIONS_SYSTEM_PROMPT,
  buildFixSuggestionsUserPrompt,
} from '@/lib/feedback-diagnosis';
import { Checkbox } from '@/components/ui/checkbox';
import { GitPullRequest } from 'lucide-react';
import type { FeedbackBucket, FeedbackItem } from '@/types';

type DiagnosisState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'ready'; diagnosis: string; model: string; generatedAt: string }
  | { status: 'error'; message: string };

function useDiagnosis(path: string, bucket: FeedbackBucket | null) {
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

  // The Claude call happens browser-side because the LiteLLM proxy at
  // llm.atko.ai is IP-allowlisted to authenticated browser sessions —
  // server-side fetches from Vercel functions 403. Same pattern as the
  // working /audit and /rules-deprecation pages.
  const generate = async () => {
    if (!bucket) {
      setState({ status: 'error', message: 'Cluster data not loaded yet' });
      return;
    }
    setGenerating(true);
    try {
      const keyRes = await fetch('/api/settings/key');
      if (!keyRes.ok) {
        setState({ status: 'error', message: 'No Anthropic key configured. Add one in Settings.' });
        return;
      }
      const { apiKey } = await keyRes.json();

      const baseUrl = process.env.NEXT_PUBLIC_ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
      const isLiteLLMProxy = baseUrl.includes('llm.atko.ai');
      const model = process.env.NEXT_PUBLIC_ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isLiteLLMProxy) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      }

      const prompt = `${DIAGNOSIS_SYSTEM_PROMPT}\n\n---\n\n${buildDiagnosisUserPrompt(path, bucket)}`;

      const aiRes = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 256,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!aiRes.ok) {
        const errorText = await aiRes.text().catch(() => '');
        setState({ status: 'error', message: `AI API error: ${aiRes.status}${errorText ? ` — ${errorText.slice(0, 200)}` : ''}` });
        return;
      }

      const aiData = await aiRes.json();
      const diagnosis = (aiData.content?.[0]?.text || '').trim();
      if (!diagnosis) {
        setState({ status: 'error', message: 'AI returned empty diagnosis' });
        return;
      }

      // Persist server-side
      const saveRes = await fetch('/api/feedback/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, diagnosis, model }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        // AI call succeeded; show the result even if the save failed
        console.error('[Feedback Diagnose] save failed:', saveData.error);
        setState({
          status: 'ready',
          diagnosis,
          model,
          generatedAt: new Date().toISOString(),
        });
        return;
      }

      setState({
        status: 'ready',
        diagnosis: saveData.diagnosis,
        model: saveData.model,
        generatedAt: saveData.generatedAt,
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

interface FixSuggestion {
  before: string;
  after: string;
  explanation: string;
}

type SuggestionsState =
  | { status: 'idle' }
  | { status: 'loading'; step: 'file' | 'ai' | 'pr' }
  | { status: 'ready'; suggestions: FixSuggestion[] }
  | { status: 'pr-opened'; prUrl: string }
  | { status: 'error'; message: string };

function useSuggestFixes(args: {
  path: string;
  filePath: string | null;
  bucket: FeedbackBucket;
  diagnosis: string | null;
}) {
  const [state, setState] = useState<SuggestionsState>({ status: 'idle' });
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  const generate = async () => {
    if (!args.filePath) {
      setState({ status: 'error', message: 'No matching file in the IA graph for this path' });
      return;
    }
    if (!args.diagnosis) {
      setState({ status: 'error', message: 'Generate a diagnosis first' });
      return;
    }

    try {
      setState({ status: 'loading', step: 'file' });
      const fileRes = await fetch('/api/rules-deprecation/fetch-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: args.filePath }),
      });
      const fileData = await fileRes.json();
      if (!fileRes.ok || !fileData.ok) {
        setState({ status: 'error', message: fileData.error || `Failed to fetch file (HTTP ${fileRes.status})` });
        return;
      }
      const fileContent: string = fileData.content;

      const keyRes = await fetch('/api/settings/key');
      if (!keyRes.ok) {
        setState({ status: 'error', message: 'No Anthropic key configured. Add one in Settings.' });
        return;
      }
      const { apiKey } = await keyRes.json();

      setState({ status: 'loading', step: 'ai' });

      const baseUrl = process.env.NEXT_PUBLIC_ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
      const isLiteLLMProxy = baseUrl.includes('llm.atko.ai');
      const model = process.env.NEXT_PUBLIC_ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isLiteLLMProxy) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      }

      const userPrompt = buildFixSuggestionsUserPrompt({
        path: args.path,
        filePath: args.filePath,
        diagnosis: args.diagnosis,
        bucket: args.bucket,
        fileContent,
      });
      const prompt = `${FIX_SUGGESTIONS_SYSTEM_PROMPT}\n\n---\n\n${userPrompt}`;

      const aiRes = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!aiRes.ok) {
        const errText = await aiRes.text().catch(() => '');
        setState({ status: 'error', message: `AI API error: ${aiRes.status}${errText ? ` — ${errText.slice(0, 200)}` : ''}` });
        return;
      }
      const aiData = await aiRes.json();
      const text = (aiData.content?.[0]?.text || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        setState({ status: 'error', message: 'AI response did not contain parseable JSON' });
        return;
      }
      let parsed: { suggestions?: FixSuggestion[] };
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        setState({ status: 'error', message: 'Failed to parse AI suggestions JSON' });
        return;
      }
      const suggestions = (parsed.suggestions || []).filter(
        (s) => s && typeof s.before === 'string' && typeof s.after === 'string' && s.before.length > 0,
      );

      setState({ status: 'ready', suggestions });
      setAccepted(new Set(suggestions.map((_, i) => i))); // accept all by default
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate suggestions';
      setState({ status: 'error', message });
    }
  };

  const createPr = async () => {
    if (state.status !== 'ready') return;
    if (!args.filePath) return;
    if (accepted.size === 0) return;

    setState({ status: 'loading', step: 'pr' });
    try {
      const acceptedSuggestions = state.suggestions
        .map((s, idx) => ({ s, idx }))
        .filter(({ idx }) => accepted.has(idx))
        .map(({ s, idx }) => ({
          id: `feedback-fix-${idx}`,
          type: 'feedback-fix',
          description: s.explanation,
          line: null,
          original: s.before,
          suggestion: s.after,
          context: null,
        }));

      const today = new Date().toISOString().slice(0, 10);
      const shortPath = args.filePath.replace(/^main\/docs\//, '');
      const prTitle = `docs: address feedback on ${shortPath}`;
      const prBodyLines = [
        '## Summary',
        '',
        `Addresses negative user feedback on \`${args.path}\`.`,
        '',
        '## Diagnosis',
        '',
        args.diagnosis,
        '',
        `## Suggestions applied (${acceptedSuggestions.length})`,
        '',
        ...acceptedSuggestions.map((s, i) => `${i + 1}. ${s.description}`),
        '',
        '---',
        '',
        'Generated by auth0-ia Feedback Triage.',
      ];

      const res = await fetch('/api/audit/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: args.filePath,
          validatedOn: today,
          prTitle,
          prBody: prBodyLines.join('\n'),
          suggestions: acceptedSuggestions,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState({ status: 'error', message: json.error || `Failed to create PR (HTTP ${res.status})` });
        return;
      }
      const prUrl: string = json.compareUrl || json.prUrl || '';
      setState({ status: 'pr-opened', prUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create PR';
      setState({ status: 'error', message });
    }
  };

  const reset = () => {
    setState({ status: 'idle' });
    setAccepted(new Set());
  };

  return { state, accepted, setAccepted, generate, createPr, reset };
}

function SuggestFixesPanel({
  path,
  filePath,
  bucket,
  diagnosis,
}: {
  path: string;
  filePath: string | null;
  bucket: FeedbackBucket;
  diagnosis: string | null;
}) {
  const { state, accepted, setAccepted, generate, createPr, reset } = useSuggestFixes({
    path,
    filePath,
    bucket,
    diagnosis,
  });

  const disabled = !filePath || !diagnosis;
  const disabledReason = !diagnosis
    ? 'Generate a diagnosis above first.'
    : !filePath
      ? 'No matching file in the IA graph — can\'t open a PR for this path.'
      : null;

  if (state.status === 'idle') {
    return (
      <div className="rounded-xl border bg-card p-5 mb-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
          <GitPullRequest className="w-4 h-4" /> Suggest fixes & open PR
        </div>
        <div className="text-sm text-muted-foreground mb-3">
          Generate concrete file edits from the diagnosis, review them, and open a PR against{' '}
          <code className="font-mono">auth0/docs-v2</code>.
        </div>
        {disabledReason ? (
          <div className="text-xs text-muted-foreground">{disabledReason}</div>
        ) : (
          <Button variant="outline" size="sm" onClick={generate}>
            <Sparkles className="w-4 h-4 mr-1" />
            Suggest fixes
          </Button>
        )}
      </div>
    );
  }

  if (state.status === 'loading') {
    const label =
      state.step === 'file' ? 'Fetching file from docs-v2…'
      : state.step === 'ai' ? 'Asking Claude for fix suggestions…'
      : 'Creating PR…';
    return (
      <div className="rounded-xl border bg-card p-5 mb-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide mb-2">
          <GitPullRequest className="w-4 h-4" /> Suggest fixes & open PR
        </div>
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> {label}
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 mb-6 text-sm">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-destructive mb-2">
          <GitPullRequest className="w-4 h-4" /> Suggest fixes & open PR
        </div>
        <div className="text-destructive mb-3">{state.message}</div>
        <Button variant="outline" size="sm" onClick={reset} disabled={disabled}>
          <RefreshCw className="w-4 h-4 mr-1" /> Reset
        </Button>
      </div>
    );
  }

  if (state.status === 'pr-opened') {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 mb-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-emerald-500 mb-2">
          <GitPullRequest className="w-4 h-4" /> PR ready
        </div>
        <div className="text-sm mb-3">
          Branch created and changes committed.{' '}
          {state.prUrl ? (
            <a href={state.prUrl} target="_blank" rel="noreferrer" className="underline font-medium">
              Review on GitHub
            </a>
          ) : (
            'Open the compare URL in GitHub to create the PR.'
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={reset}>
          Suggest more fixes
        </Button>
      </div>
    );
  }

  // status === 'ready'
  const { suggestions } = state;
  if (suggestions.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-5 mb-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
          <GitPullRequest className="w-4 h-4" /> Suggest fixes & open PR
        </div>
        <div className="text-sm text-muted-foreground mb-3">
          Claude returned no suggestions. This is expected for misrouted support tickets, garbage
          input, or clusters where the diagnosis says no docs change is needed.
        </div>
        <Button variant="ghost" size="sm" onClick={reset}>
          Reset
        </Button>
      </div>
    );
  }

  const toggle = (i: number) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="rounded-xl border bg-card p-5 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <GitPullRequest className="w-4 h-4" />
          Review {suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAccepted(new Set(suggestions.map((_, i) => i)))}
          >
            Accept all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAccepted(new Set())}>
            Decline all
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 mb-4">
        {suggestions.map((s, i) => (
          <label
            key={i}
            className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-secondary/40 transition-colors"
          >
            <Checkbox
              checked={accepted.has(i)}
              onCheckedChange={() => toggle(i)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm leading-relaxed mb-2">{s.explanation}</div>
              <div className="space-y-1">
                <div className="text-xs">
                  <span className="text-muted-foreground">before:</span>
                  <pre className="mt-1 rounded border bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap break-all">
                    {s.before}
                  </pre>
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">after:</span>
                  <pre className="mt-1 rounded border bg-emerald-500/5 border-emerald-500/30 p-2 font-mono text-xs whitespace-pre-wrap break-all">
                    {s.after || <span className="italic text-muted-foreground">(deletion)</span>}
                  </pre>
                </div>
              </div>
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {accepted.size} of {suggestions.length} accepted
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={reset}>
            Cancel
          </Button>
          <Button size="sm" onClick={createPr} disabled={accepted.size === 0}>
            <GitPullRequest className="w-4 h-4 mr-1" />
            Create PR
          </Button>
        </div>
      </div>
    </div>
  );
}

function FeedbackBody({
  path,
  bucket,
  cluster,
  filePath,
}: {
  path: string;
  bucket: FeedbackBucket;
  cluster: FeedbackBucket['cluster'];
  filePath: string | null;
}) {
  const { state, generating, generate } = useDiagnosis(path, bucket);
  const diagnosisText = state.status === 'ready' ? state.diagnosis : null;

  return (
    <>
      <DiagnosisCard
        isCandidate={cluster.diagnosisCandidate}
        state={state}
        generating={generating}
        generate={generate}
      />
      <SuggestFixesPanel
        path={path}
        filePath={filePath}
        bucket={bucket}
        diagnosis={diagnosisText}
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

        <FeedbackBody
          path={path}
          bucket={bucket}
          cluster={cluster}
          filePath={matchingNode?.filePath ?? null}
        />

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
