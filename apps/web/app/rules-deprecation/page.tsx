'use client';

import { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Search,
  Filter,
  Loader2,
  Sparkles,
  GitPullRequest,
  CheckCircle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Clock,
  Ban,
  X,
} from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useRulesDeprecation } from '@/hooks/use-index-data';
import type { RulesDeprecationItem, RulesDeprecationCategory } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ItemStatus = 'pending' | 'in_progress' | 'done' | 'wont_fix';

type StatusRecord = {
  status: ItemStatus;
  prUrl: string | null;
  notes: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

type AiSuggestion = {
  before: string;
  after: string;
  explanation: string;
  category: string;
  confidence: string;
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
};

const CATEGORY_COLORS: Record<RulesDeprecationCategory, string> = {
  has_rules_code: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  links_to_rules: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800',
  suggests_rules: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800',
  mentions_rules: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  is_rules_api: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800',
  is_hooks_page: 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-400 dark:border-pink-800',
};

const CATEGORY_LABELS: Record<RulesDeprecationCategory, string> = {
  has_rules_code: 'Rules Code',
  links_to_rules: 'Links to Rules',
  suggests_rules: 'Suggests Rules',
  mentions_rules: 'Mentions Rules',
  is_rules_api: 'Rules API',
  is_hooks_page: 'Hooks',
};

const STATUS_ICONS: Record<ItemStatus, typeof CheckCircle> = {
  pending: AlertTriangle,
  in_progress: Clock,
  done: CheckCircle,
  wont_fix: Ban,
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function RulesDeprecationPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: indexData, isLoading, error, refetch } = useRulesDeprecation();

  // Persistent status from DB
  const { data: statusData } = useQuery({
    queryKey: ['rules_deprecation_status'],
    queryFn: async () => {
      const res = await fetch('/api/rules-deprecation/status');
      const json = await res.json();
      return (json.statuses || {}) as Record<string, StatusRecord>;
    },
    staleTime: 30_000,
  });

  const statuses = statusData || {};

  // Filters
  const [q, setQ] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // AI suggestions modal
  const [suggestingItem, setSuggestingItem] = useState<RulesDeprecationItem | null>(null);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<number>>(new Set());

  // PR success modal
  const [prSuccess, setPrSuccess] = useState<{ open: boolean; prUrl: string; filePath: string }>({
    open: false,
    prUrl: '',
    filePath: '',
  });

  // Creating PR state
  const [creatingPr, setCreatingPr] = useState(false);

  const items = indexData?.items ?? [];

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((x) => {
      if (severityFilter !== 'all' && x.severity !== severityFilter) return false;
      if (categoryFilter !== 'all' && !x.categories.includes(categoryFilter as RulesDeprecationCategory)) return false;
      const itemStatus = statuses[x.filePath]?.status || 'pending';
      if (statusFilter !== 'all' && itemStatus !== statusFilter) return false;
      if (!qq) return true;
      const hay = `${x.filePath} ${x.evidence.map((e) => e.snippet).join(' ')}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [items, q, severityFilter, categoryFilter, statusFilter, statuses]);

  // Stats
  const doneCount = Object.values(statuses).filter((s) => s.status === 'done').length;
  const inProgressCount = Object.values(statuses).filter((s) => s.status === 'in_progress').length;
  const totalItems = items.length;
  const progressPct = totalItems > 0 ? Math.round(((doneCount) / totalItems) * 100) : 0;

  // Suggestion validation & selection helpers
  const isValidSuggestion = (s: AiSuggestion): boolean => {
    if (!s.before || !s.after) return false;
    const instructionPatterns = [
      /^(remove|delete|add|insert|replace|change|update|fix|correct|modify|consider|should|could|would|ensure|make sure)/i,
      /^(the|this|that|a|an)\s+(section|paragraph|sentence|text|content|line)/i,
    ];
    for (const pattern of instructionPatterns) {
      if (pattern.test(s.after.trim())) return false;
    }
    if (s.after.length > s.before.length * 3 && s.after.length > 200) return false;
    return true;
  };

  const toggleSuggestion = (idx: number) => {
    setAcceptedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) { next.delete(idx); } else { next.add(idx); }
      return next;
    });
  };

  const toggleAllSuggestions = (accept: boolean) => {
    if (accept) {
      const applicable = suggestions
        .map((s, idx) => isValidSuggestion(s) ? idx : -1)
        .filter((idx) => idx !== -1);
      setAcceptedSuggestions(new Set(applicable));
    } else {
      setAcceptedSuggestions(new Set());
    }
  };

  const acceptedCount = acceptedSuggestions.size;
  const applicableCount = suggestions.filter(isValidSuggestion).length;

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: async ({ filePath, status }: { filePath: string; status: ItemStatus }) => {
      const res = await fetch('/api/rules-deprecation/status', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filePath, status }),
      });
      if (!res.ok) throw new Error('Failed to update status');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules_deprecation_status'] });
    },
  });

  // AI suggestions handler — calls Claude client-side (same pattern as audit page)
  const handleGetSuggestions = useCallback(async (item: RulesDeprecationItem) => {
    setSuggestingItem(item);
    setSuggestions([]);
    setSuggestionsLoading(true);
    try {
      // Get user's API key (same as audit page)
      const keyRes = await fetch('/api/settings/key');
      if (!keyRes.ok) throw new Error('Anthropic API key not configured. Add one in Settings.');
      const { apiKey } = await keyRes.json();
      if (!apiKey) throw new Error('Anthropic API key not configured. Add one in Settings.');

      const baseUrl = process.env.NEXT_PUBLIC_ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
      const isLiteLLMProxy = baseUrl.includes('llm.atko.ai');
      const model = process.env.NEXT_PUBLIC_ANTHROPIC_MODEL || 'claude-4-5-sonnet';

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isLiteLLMProxy) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      }

      const evidenceBlock = item.evidence
        .slice(0, 10)
        .map((e) => `- Line ${e.line} (${e.category}): "${e.snippet}"`)
        .join('\n');

      const filePath = item.filePath;
      const docsPath = filePath.replace(/^main\/docs\//, '').replace(/\.mdx$/, '').replace(/\/index$/, '');
      const docsUrl = `https://auth0.com/docs/${docsPath}`;

      const prompt = `You are an Auth0 documentation migration specialist. Auth0 Rules (the legacy JavaScript-based extensibility system using \`function(user, context, callback)\`) has reached end-of-life and must be migrated to Auth0 Actions (the new serverless function system using \`exports.onExecutePostLogin = async (event, api) =>\`).

Analyze the following documentation page and provide specific rewrite suggestions to remove or update all Auth0 Rules references.

File: ${filePath}
Published URL: ${docsUrl}
Categories detected: ${item.categories.join(', ')}

Evidence of Rules references found:
${evidenceBlock}

For each Rules reference, provide a concrete suggestion. Handle these cases:
1. **Code examples**: Rewrite \`function(user, context, callback)\` signatures to Actions format (\`exports.onExecutePostLogin\`). Map \`context.*\` to \`event.*\` / \`api.*\`. Remove \`callback()\` in favor of return values.
2. **Links**: Replace \`/docs/customize/rules\` with \`/docs/customize/actions\` equivalents.
3. **Prose**: Replace "Rules" product references with "Actions" where appropriate. Add deprecation notices where the page still needs to reference Rules for context.
4. **Suggestions to use Rules**: Reframe guidance to recommend Actions instead.

Return your response as JSON only:
{
  "suggestions": [
    {
      "before": "The exact original text from the document (verbatim, used for find-replace)",
      "after": "The exact replacement text",
      "explanation": "Brief explanation of why this change is needed",
      "category": "code|link|prose|suggestion",
      "confidence": "high|medium|low"
    }
  ]
}

Rules:
- "before" must be EXACT text from the document (copy verbatim)
- "after" must be the EXACT replacement (not instructions)
- For deletions, set "after" to ""
- Focus on the most impactful changes. Maximum 15 suggestions.
- Only include suggestions where you're confident there's a real issue.
- Return ONLY the JSON, no other text.`;

      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API error ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Failed to parse AI response');
      const parsed = JSON.parse(jsonMatch[0]);
      const newSuggestions: AiSuggestion[] = parsed.suggestions || [];
      setSuggestions(newSuggestions);
      // Auto-accept all valid suggestions
      const validIndices = newSuggestions
        .map((s: AiSuggestion, idx: number) => isValidSuggestion(s) ? idx : -1)
        .filter((idx: number) => idx !== -1);
      setAcceptedSuggestions(new Set(validIndices));
    } catch (e: any) {
      toast({ title: 'AI Error', description: e?.message || String(e), variant: 'destructive' });
      setSuggestingItem(null);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [toast]);

  // PR creation handler — only sends accepted suggestions
  const handleCreatePr = useCallback(async () => {
    if (!suggestingItem || acceptedSuggestions.size === 0) return;
    setCreatingPr(true);
    try {
      const selectedSuggestions = suggestions
        .filter((_, idx) => acceptedSuggestions.has(idx))
        .map((s) => ({ before: s.before, after: s.after }));
      const res = await fetch('/api/rules-deprecation/open-pr', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filePath: suggestingItem.filePath,
          suggestions: selectedSuggestions,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to create PR');
      setSuggestingItem(null);
      setSuggestions([]);
      setPrSuccess({ open: true, prUrl: json.prUrl, filePath: suggestingItem.filePath });
      queryClient.invalidateQueries({ queryKey: ['rules_deprecation_status'] });
    } catch (e: any) {
      toast({ title: 'PR Error', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setCreatingPr(false);
    }
  }, [suggestingItem, suggestions, toast, queryClient]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Loading...</div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">Rules Deprecation Tracker</h1>
          <p className="text-muted-foreground mb-4">Failed to load rules deprecation index.</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Rules Deprecation Tracker</h1>
          <p className="text-muted-foreground">
            Auth0 Rules is end-of-life. Track and migrate all Rules references to Actions across the documentation.
          </p>
        </div>

        {/* Burndown Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Burndown Progress</CardTitle>
            <CardDescription>
              {doneCount} of {totalItems} pages resolved ({progressPct}%)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Progress bar */}
            <div className="w-full bg-muted rounded-full h-3 mb-4">
              <div
                className="bg-green-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Stats tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <StatTile label="Critical" count={indexData?.byCriticality.critical ?? 0} color="text-red-600 dark:text-red-400" />
              <StatTile label="High" count={indexData?.byCriticality.high ?? 0} color="text-orange-600 dark:text-orange-400" />
              <StatTile label="Medium" count={indexData?.byCriticality.medium ?? 0} color="text-yellow-600 dark:text-yellow-400" />
              <StatTile label="Low" count={indexData?.byCriticality.low ?? 0} color="text-slate-600 dark:text-slate-400" />
              <StatTile label="In Progress" count={inProgressCount} color="text-blue-600 dark:text-blue-400" />
              <StatTile label="Done" count={doneCount} color="text-green-600 dark:text-green-400" />
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search file path, evidence..."
              className="pl-12 h-12 rounded-2xl"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              className="h-12 rounded-2xl border bg-card px-3 text-sm"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              className="h-12 rounded-2xl border bg-card px-3 text-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              <option value="has_rules_code">Rules Code</option>
              <option value="links_to_rules">Links to Rules</option>
              <option value="suggests_rules">Suggests Rules</option>
              <option value="mentions_rules">Mentions Rules</option>
              <option value="is_rules_api">Rules API</option>
              <option value="is_hooks_page">Hooks</option>
            </select>
            <select
              className="h-12 rounded-2xl border bg-card px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
              <option value="wont_fix">Won&apos;t Fix</option>
            </select>
          </div>
        </div>

        {/* Results count */}
        <div className="text-sm text-muted-foreground">
          Showing {filtered.length} of {totalItems} pages
        </div>

        {/* Item list */}
        <Tabs defaultValue="critical">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="critical">Critical First</TabsTrigger>
            <TabsTrigger value="all">All Items</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value="critical" className="mt-4">
            <ItemList
              items={filtered.filter((x) => x.severity === 'critical')}
              statuses={statuses}
              onGetSuggestions={handleGetSuggestions}
              onStatusChange={(fp, s) => statusMutation.mutate({ filePath: fp, status: s })}
            />
            {filtered.filter((x) => x.severity !== 'critical').length > 0 && (
              <>
                <div className="text-sm text-muted-foreground mt-6 mb-3 font-medium">Other items</div>
                <ItemList
                  items={filtered.filter((x) => x.severity !== 'critical')}
                  statuses={statuses}
                  onGetSuggestions={handleGetSuggestions}
                  onStatusChange={(fp, s) => statusMutation.mutate({ filePath: fp, status: s })}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            <ItemList
              items={filtered}
              statuses={statuses}
              onGetSuggestions={handleGetSuggestions}
              onStatusChange={(fp, s) => statusMutation.mutate({ filePath: fp, status: s })}
            />
          </TabsContent>

          <TabsContent value="completed" className="mt-4">
            <ItemList
              items={filtered.filter((x) => {
                const s = statuses[x.filePath]?.status;
                return s === 'done' || s === 'wont_fix';
              })}
              statuses={statuses}
              onGetSuggestions={handleGetSuggestions}
              onStatusChange={(fp, s) => statusMutation.mutate({ filePath: fp, status: s })}
            />
          </TabsContent>
        </Tabs>

        {/* AI Suggestions Dialog */}
        <Dialog open={!!suggestingItem} onOpenChange={(open) => { if (!open) { setSuggestingItem(null); setSuggestions([]); } }}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                AI Suggestions
              </DialogTitle>
              <DialogDescription className="font-mono text-xs break-all">
                {suggestingItem?.filePath.replace('main/docs/', '')}
              </DialogDescription>
            </DialogHeader>

            {suggestionsLoading ? (
              <div className="flex items-center justify-center py-12 gap-3">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-muted-foreground">Analyzing page with Claude...</span>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No suggestions returned.</div>
            ) : (
              <div className="space-y-4">
                {/* Accept/Decline all controls */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {acceptedCount} of {applicableCount} applicable suggestions selected
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => toggleAllSuggestions(true)}>
                      Accept All
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => toggleAllSuggestions(false)}>
                      Decline All
                    </Button>
                  </div>
                </div>

                {/* Suggestion list with checkboxes */}
                {suggestions.map((s, i) => {
                  const canApply = isValidSuggestion(s);
                  const isAccepted = acceptedSuggestions.has(i);
                  return (
                    <div key={i} className={`rounded-lg border p-4 space-y-2 transition-opacity ${!isAccepted && canApply ? 'opacity-50 bg-muted/30' : ''}`}>
                      <div className="flex items-start gap-3">
                        {canApply ? (
                          <Checkbox
                            checked={isAccepted}
                            onCheckedChange={() => toggleSuggestion(i)}
                            className="mt-1"
                          />
                        ) : (
                          <div className="w-4 h-4 mt-1" title="Cannot be auto-applied (no specific replacement text)" />
                        )}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{s.category}</Badge>
                            <Badge variant={s.confidence === 'high' ? 'default' : 'secondary'}>{s.confidence}</Badge>
                            {!canApply && <Badge variant="outline" className="text-xs">Manual only</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">{s.explanation}</p>
                          {s.before && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                              <div className="rounded bg-red-50 dark:bg-red-900/20 p-3">
                                <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Before</div>
                                <pre className="text-xs whitespace-pre-wrap break-all">{s.before.slice(0, 300)}</pre>
                              </div>
                              <div className="rounded bg-green-50 dark:bg-green-900/20 p-3">
                                <div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">After</div>
                                <pre className="text-xs whitespace-pre-wrap break-all">{(s.after || '(deleted)').slice(0, 300)}</pre>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex gap-2 pt-2">
                  <Button onClick={handleCreatePr} disabled={creatingPr || acceptedCount === 0} className="flex-1">
                    {creatingPr ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating PR...</>
                    ) : (
                      <><GitPullRequest className="w-4 h-4 mr-2" /> Apply &amp; Create PR ({acceptedCount} fix{acceptedCount !== 1 ? 'es' : ''})</>
                    )}
                  </Button>
                  <Button variant="outline" onClick={() => { setSuggestingItem(null); setSuggestions([]); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* PR Success Dialog */}
        <Dialog open={prSuccess.open} onOpenChange={(open) => setPrSuccess({ ...prSuccess, open })}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                PR Created
              </DialogTitle>
              <DialogDescription>
                Rules migration PR has been opened for{' '}
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{prSuccess.filePath.replace('main/docs/', '')}</code>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Pull Request URL</div>
                <div className="font-mono text-sm break-all">{prSuccess.prUrl}</div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => window.open(prSuccess.prUrl, '_blank')}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open PR
                </Button>
                <Button variant="outline" onClick={() => setPrSuccess({ open: false, prUrl: '', filePath: '' })}>
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatTile({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{count}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ItemList({
  items,
  statuses,
  onGetSuggestions,
  onStatusChange,
}: {
  items: RulesDeprecationItem[];
  statuses: Record<string, StatusRecord>;
  onGetSuggestions: (item: RulesDeprecationItem) => void;
  onStatusChange: (filePath: string, status: ItemStatus) => void;
}) {
  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground py-4">No items</div>;
  }

  return (
    <div className="space-y-2">
      {items.slice(0, 200).map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          status={statuses[item.filePath]}
          onGetSuggestions={() => onGetSuggestions(item)}
          onStatusChange={(s) => onStatusChange(item.filePath, s)}
        />
      ))}
      {items.length > 200 && (
        <div className="text-xs text-muted-foreground">Showing first 200 of {items.length}</div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  status,
  onGetSuggestions,
  onStatusChange,
}: {
  item: RulesDeprecationItem;
  status?: StatusRecord;
  onGetSuggestions: () => void;
  onStatusChange: (s: ItemStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const currentStatus = status?.status || 'pending';
  const isDone = currentStatus === 'done' || currentStatus === 'wont_fix';

  return (
    <div className={`rounded-xl border bg-card p-4 ${isDone ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Badge className={SEVERITY_COLORS[item.severity]}>{item.severity}</Badge>
            {item.categories.map((cat) => (
              <Badge key={cat} variant="outline" className={`text-xs ${CATEGORY_COLORS[cat]}`}>
                {CATEGORY_LABELS[cat]}
              </Badge>
            ))}
            {currentStatus !== 'pending' && (
              <Badge variant={currentStatus === 'done' ? 'default' : 'secondary'} className="gap-1">
                {(() => {
                  const Icon = STATUS_ICONS[currentStatus];
                  return <Icon className="w-3 h-3" />;
                })()}
                {currentStatus.replace('_', ' ')}
              </Badge>
            )}
          </div>

          {/* File path */}
          <div className="text-sm font-mono break-all">
            {item.filePath.replace('main/docs/', '')}
          </div>

          {/* Evidence preview */}
          <button
            className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {item.evidenceCount} evidence item{item.evidenceCount !== 1 ? 's' : ''}
          </button>

          {expanded && (
            <div className="mt-2 space-y-1">
              {item.evidence.map((e, i) => (
                <div key={i} className="text-xs text-muted-foreground font-mono pl-4 border-l-2 border-muted">
                  <span className="text-foreground/60">L{e.line}:</span> {e.snippet}
                </div>
              ))}
            </div>
          )}

          {/* Links */}
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              href={`/explain?id=${encodeURIComponent(item.filePath)}`}
            >
              Explain page <ArrowUpRight className="w-3 h-3" />
            </Link>
            {status?.prUrl && (
              <a
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                href={status.prUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View PR <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={onGetSuggestions} disabled={isDone}>
            <Sparkles className="w-4 h-4 mr-1" /> AI Suggest
          </Button>
          <select
            className="h-8 rounded-lg border bg-card px-2 text-xs"
            value={currentStatus}
            onChange={(e) => onStatusChange(e.target.value as ItemStatus)}
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="wont_fix">Won&apos;t Fix</option>
          </select>
        </div>
      </div>
    </div>
  );
}
