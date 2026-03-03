'use client';

import { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  Copy,
  ChevronDown,
  ChevronRight,
  GitPullRequest,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AnthropicKeyPrompt } from '@/components/AnthropicKeyPrompt';
import type { AuditResult, AuditCheckItem, AuditCheckStatus, AuditSuggestion, AiSuggestion } from '@/types';

function StatusIcon({ status }: { status: AuditCheckStatus }) {
  switch (status) {
    case 'PASS':
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'FAIL':
      return <XCircle className="w-5 h-5 text-red-500" />;
    case 'WARN':
      return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    case 'MANUAL':
      return <HelpCircle className="w-5 h-5 text-blue-500" />;
    case 'NA':
      return <div className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600" />;
  }
}

function StatusBadge({ status }: { status: AuditCheckStatus }) {
  const variants: Record<AuditCheckStatus, string> = {
    PASS: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300',
    FAIL: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',
    WARN: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300',
    MANUAL: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
    NA: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${variants[status]}`}>
      {status}
    </span>
  );
}

function CheckItemRow({ item, expanded, onToggle }: { item: AuditCheckItem; expanded: boolean; onToggle: () => void }) {
  const hasEvidence = item.evidence && (Array.isArray(item.evidence) ? item.evidence.length > 0 : Object.keys(item.evidence).length > 0);

  return (
    <div className="border-b last:border-b-0">
      <div
        className={`flex items-center gap-3 p-3 ${hasEvidence ? 'cursor-pointer hover:bg-muted/50' : ''}`}
        onClick={hasEvidence ? onToggle : undefined}
      >
        <StatusIcon status={item.status} />
        <div className="flex-1 min-w-0">
          <div className="font-medium">{item.label}</div>
          {item.details && <div className="text-sm text-muted-foreground">{item.details}</div>}
        </div>
        <StatusBadge status={item.status} />
        {hasEvidence && (
          expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      {expanded && hasEvidence && (
        <div className="px-3 pb-3 pl-11">
          <div className="p-3 bg-muted rounded-lg text-sm">
            <pre className="whitespace-pre-wrap break-all font-mono text-xs">
              {JSON.stringify(item.evidence, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditPage() {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<string>>(new Set());
  const [creatingPr, setCreatingPr] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [prError, setPrError] = useState<string | null>(null);
  const [includeAiSuggestions, setIncludeAiSuggestions] = useState(false);
  const [expandedAiItems, setExpandedAiItems] = useState<Set<number>>(new Set());
  const [acceptedAiSuggestions, setAcceptedAiSuggestions] = useState<Set<number>>(new Set());
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);

  // Check if user has Anthropic key configured
  useEffect(() => {
    const checkSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const data = await response.json();
          setHasAnthropicKey(data.hasAnthropicKey);
        }
      } catch (error) {
        // Fail silently - user can still use the app without AI features
      }
    };
    checkSettings();
  }, []);

  // Handle AI suggestions toggle
  const handleAiSuggestionsToggle = (checked: boolean) => {
    if (checked && !hasAnthropicKey) {
      // Show prompt to configure API key
      setShowKeyPrompt(true);
      return;
    }
    setIncludeAiSuggestions(checked);
  };

  const toggleItem = (id: string) => {
    const next = new Set(expandedItems);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedItems(next);
  };

  const toggleSuggestion = (id: string) => {
    const next = new Set(acceptedSuggestions);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setAcceptedSuggestions(next);
  };

  const toggleAllSuggestions = (accept: boolean) => {
    if (accept && result?.suggestions) {
      setAcceptedSuggestions(new Set(result.suggestions.map(s => s.id)));
    } else {
      setAcceptedSuggestions(new Set());
    }
  };

  const toggleAiSuggestion = (idx: number) => {
    const next = new Set(acceptedAiSuggestions);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setAcceptedAiSuggestions(next);
  };

  // Check if AI suggestion looks like actual replacement text (not an instruction)
  const isValidAiSuggestion = (s: AiSuggestion): boolean => {
    if (!s.original || !s.suggestion) return false;
    // Check if suggestion looks like an instruction rather than replacement text
    const instructionPatterns = [
      /^(remove|delete|add|insert|replace|change|update|fix|correct|modify|consider|should|could|would|ensure|make sure)/i,
      /^(the|this|that|a|an)\s+(section|paragraph|sentence|text|content|line)/i,
    ];
    for (const pattern of instructionPatterns) {
      if (pattern.test(s.suggestion.trim())) return false;
    }
    // Suggestion should not be much longer than original (likely an instruction)
    if (s.suggestion.length > s.original.length * 3 && s.suggestion.length > 200) return false;
    return true;
  };

  const toggleAllAiSuggestions = (accept: boolean) => {
    if (accept && result?.aiSuggestions) {
      // Only select suggestions that have valid replacement text
      const applicableIndices = result.aiSuggestions
        .map((s, idx) => isValidAiSuggestion(s) ? idx : -1)
        .filter(idx => idx !== -1);
      setAcceptedAiSuggestions(new Set(applicableIndices));
    } else {
      setAcceptedAiSuggestions(new Set());
    }
  };

  const runAudit = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setResult(null);
    setExpandedItems(new Set());
    setAcceptedSuggestions(new Set());
    setAcceptedAiSuggestions(new Set());
    setPrUrl(null);
    setPrError(null);

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: url.trim(), includeAiSuggestions }),
      });

      const data = await res.json();
      setResult(data);

      // Initialize all suggestions as accepted by default
      if (data.suggestions?.length > 0) {
        setAcceptedSuggestions(new Set(data.suggestions.map((s: AuditSuggestion) => s.id)));
      }

      // Initialize applicable AI suggestions as accepted by default
      if (data.aiSuggestions?.length > 0) {
        const applicableIndices = data.aiSuggestions
          .map((s: AiSuggestion, idx: number) => isValidAiSuggestion(s) ? idx : -1)
          .filter((idx: number) => idx !== -1);
        setAcceptedAiSuggestions(new Set(applicableIndices));
      }

      if (!data.ok) {
        toast({ title: 'Audit failed', description: data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Network error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const copyAsMarkdown = () => {
    if (!result) return;

    const lines = [
      `# Audit: ${result.pageTitle || result.filePath}`,
      `URL: ${result.url}`,
      `Checked: ${result.checkedAt}`,
      '',
      '## Checklist',
      '',
    ];

    for (const check of result.checks) {
      const icon = check.status === 'PASS' ? '[x]' : check.status === 'FAIL' ? '[ ]' : '[-]';
      lines.push(`- ${icon} **${check.label}**: ${check.status}${check.details ? ` - ${check.details}` : ''}`);
    }

    lines.push('', `## Summary`, `- Pass: ${result.summary.pass}`, `- Fail: ${result.summary.fail}`, `- Warnings: ${result.summary.warn}`, `- Manual: ${result.summary.manual}`, `- N/A: ${result.summary.na}`);

    navigator.clipboard.writeText(lines.join('\n'));
    toast({ title: 'Copied', description: 'Checklist copied to clipboard as markdown' });
  };

  const openPr = async () => {
    if (!result || !result.filePath) return;

    setCreatingPr(true);
    setPrError(null);

    try {
      // Generate today's date in YYYY-MM-DD format
      const validatedOn = new Date().toISOString().slice(0, 10);

      // Build PR body from audit results - use Unicode emojis for GitHub
      const checklistLines = result.checks.map((check) => {
        const icon = check.status === 'PASS' ? '✅'
          : check.status === 'FAIL' ? '❌'
          : check.status === 'WARN' ? '⚠️'
          : check.status === 'MANUAL' ? '🔵'
          : check.status === 'NA' ? '➖'
          : '❔';
        return `- ${icon} **${check.label}**: ${check.status}${check.details ? ` - ${check.details}` : ''}`;
      });

      // Get accepted suggestions to apply
      const suggestionsToApply = result.suggestions?.filter(s => acceptedSuggestions.has(s.id)) || [];

      // Get accepted AI suggestions to apply (convert to same format)
      const aiSuggestionsToApply = result.aiSuggestions
        ?.map((s, idx) => ({ ...s, idx }))
        .filter(s => acceptedAiSuggestions.has(s.idx) && isValidAiSuggestion(s))
        .map((s, i) => ({
          id: `ai-${s.idx}`,
          type: `ai-${s.category}`,
          description: s.title,
          line: s.line,
          original: s.original!,
          suggestion: s.suggestion!,
          context: s.description,
        })) || [];

      // Combine all suggestions
      const allSuggestions = [...suggestionsToApply, ...aiSuggestionsToApply];

      // Group suggestions by type for the PR body
      const suggestionsByType: Record<string, (typeof allSuggestions)> = {};
      for (const s of allSuggestions) {
        if (!suggestionsByType[s.type]) suggestionsByType[s.type] = [];
        suggestionsByType[s.type].push(s);
      }

      // Build automated fixes section
      const fixesLines: string[] = [];
      if (allSuggestions.length > 0) {
        fixesLines.push('', '## Automated Fixes', '');
        fixesLines.push(`- validatedOn set to: ${validatedOn}`);

        const getTypeLabel = (type: string) => {
          if (type === 'tooltip') return 'Glossary tooltips added';
          if (type === 'heading-case') return 'Heading capitalization fixes';
          if (type === 'callout-migration') return 'Legacy callouts migrated';
          if (type === 'heading-in-callout') return 'Headings in callouts removed';
          if (type === 'typo') return 'Typo fixes';
          if (type === 'ai-grammar') return 'AI grammar fixes';
          if (type === 'ai-clarity') return 'AI clarity improvements';
          if (type === 'ai-technical') return 'AI technical corrections';
          if (type === 'ai-tone') return 'AI tone adjustments';
          if (type.startsWith('ai-')) return `AI ${type.replace('ai-', '')} fixes`;
          return `${type} fixes`;
        };

        for (const [type, suggestions] of Object.entries(suggestionsByType)) {
          fixesLines.push(`- ${getTypeLabel(type)}: ${suggestions.length}`);
        }

        // Add details for each type
        for (const [type, suggestions] of Object.entries(suggestionsByType)) {
          if (suggestions.length > 0) {
            fixesLines.push('', `### ${getTypeLabel(type)}`, '');
            for (const s of suggestions.slice(0, 10)) {
              fixesLines.push(`- ${s.description}`);
            }
            if (suggestions.length > 10) {
              fixesLines.push(`- ... and ${suggestions.length - 10} more`);
            }
          }
        }
      }

      const prBody = [
        '## Content Audit Results',
        '',
        `Audited: ${result.url}`,
        `Date: ${validatedOn}`,
        '',
        '### Checklist',
        '',
        ...checklistLines,
        '',
        '### Summary',
        `- Pass: ${result.summary.pass}`,
        `- Fail: ${result.summary.fail}`,
        `- Warnings: ${result.summary.warn}`,
        `- Manual review: ${result.summary.manual}`,
        `- N/A: ${result.summary.na}`,
        ...fixesLines,
      ].join('\n');

      const res = await fetch('/api/audit/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: result.filePath,
          validatedOn,
          prTitle: `Content maintenance: ${result.pageTitle || result.filePath}`,
          prBody,
          suggestions: allSuggestions,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setPrUrl(data.compareUrl);
        toast({ title: 'Branch Pushed', description: 'Review changes and open PR when ready' });
      } else {
        setPrError(data.error || 'Unknown error');
      }
    } catch (e: any) {
      setPrError(e?.message || 'Network error');
    } finally {
      setCreatingPr(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
            <ClipboardCheck className="w-8 h-8" />
            Content Audit
          </h1>
          <p className="text-muted-foreground">
            Paste a production docs URL to run the technical correctness checklist automatically.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Audit Page</CardTitle>
            <CardDescription>
              Enter a production URL or file path to audit.
              <span className="block text-xs font-mono text-muted-foreground/70 mt-1">
                Examples: <code>https://auth0.com/docs/get-started/...</code> or <code>main/docs/get-started/foo.mdx</code>
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://auth0.com/docs/... or main/docs/path/to/file.mdx"
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && runAudit()}
              />
              <Button onClick={runAudit} disabled={loading || !url.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {includeAiSuggestions ? 'Auditing (with AI)...' : 'Auditing...'}
                  </>
                ) : (
                  'Run Audit'
                )}
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="ai-suggestions"
                checked={includeAiSuggestions}
                onCheckedChange={handleAiSuggestionsToggle}
              />
              <Label htmlFor="ai-suggestions" className="text-sm text-muted-foreground">
                Include AI suggestions (grammar, clarity, technical accuracy, content gaps)
                {!hasAnthropicKey && (
                  <span className="text-yellow-600 dark:text-yellow-400 ml-1">(requires API key)</span>
                )}
              </Label>
            </div>
          </CardContent>
        </Card>

        {result && (
          <>
            {!result.ok ? (
              <Card className="border-red-200 dark:border-red-900">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-red-600">
                    <XCircle className="w-5 h-5" />
                    <span className="font-medium">Audit Failed</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{result.error}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Summary Card */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{result.pageTitle || 'Page Audit'}</CardTitle>
                        <CardDescription className="mt-1">
                          <span className="font-mono text-xs">{result.filePath}</span>
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={copyAsMarkdown}>
                          <Copy className="w-4 h-4 mr-2" />
                          Copy
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a href={result.url} target="_blank" rel="noreferrer">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            View
                          </a>
                        </Button>
                        {prUrl ? (
                          <Button variant="default" size="sm" asChild>
                            <a href={prUrl} target="_blank" rel="noreferrer">
                              <GitPullRequest className="w-4 h-4 mr-2" />
                              Review & Open PR
                            </a>
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={openPr}
                            disabled={creatingPr || !result.filePath}
                          >
                            {creatingPr ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Pushing...
                              </>
                            ) : (
                              <>
                                <GitPullRequest className="w-4 h-4 mr-2" />
                                Create PR{(acceptedSuggestions.size + acceptedAiSuggestions.size) > 0 ? ` (${acceptedSuggestions.size + acceptedAiSuggestions.size} fix${(acceptedSuggestions.size + acceptedAiSuggestions.size) === 1 ? '' : 'es'})` : ''}
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        <span className="text-sm">Pass: {result.summary.pass}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <span className="text-sm">Fail: {result.summary.fail}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <span className="text-sm">Warn: {result.summary.warn}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="text-sm">Manual: {result.summary.manual}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-gray-400" />
                        <span className="text-sm">N/A: {result.summary.na}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* PR Error Display */}
                {prError && (
                  <Card className="border-red-200 dark:border-red-900">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2 text-red-600">
                        <XCircle className="w-5 h-5" />
                        PR Creation Failed
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-sm whitespace-pre-wrap break-all font-mono bg-muted p-3 rounded-lg select-text cursor-text overflow-auto max-h-64">
                        {prError}
                      </pre>
                    </CardContent>
                  </Card>
                )}

                {/* Screenshot Card */}
                {result.screenshot && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Visual Preview</CardTitle>
                      <CardDescription>Full-page screenshot of the rendered docs page</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="border rounded-lg overflow-hidden">
                        <img
                          src={`data:image/png;base64,${result.screenshot}`}
                          alt="Page screenshot"
                          className="w-full"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Review for layout issues, duplicate nav labels, image rendering, etc.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Checklist Card */}
                <Card>
                  <CardHeader>
                    <CardTitle>Technical Correctness Checklist</CardTitle>
                    <CardDescription>Click on items with evidence to expand details</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {result.checks.map((check) => (
                        <CheckItemRow
                          key={check.id}
                          item={check}
                          expanded={expandedItems.has(check.id)}
                          onToggle={() => toggleItem(check.id)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Suggestions Card */}
                {result.suggestions && result.suggestions.length > 0 && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Suggested Fixes ({acceptedSuggestions.size}/{result.suggestions.length})</CardTitle>
                          <CardDescription>Select which suggestions to include in the PR</CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => toggleAllSuggestions(true)}>
                            Accept All
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => toggleAllSuggestions(false)}>
                            Decline All
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {result.suggestions.map((suggestion) => (
                          <div
                            key={suggestion.id}
                            className={`p-4 ${!acceptedSuggestions.has(suggestion.id) ? 'opacity-50 bg-muted/30' : ''}`}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={acceptedSuggestions.has(suggestion.id)}
                                onCheckedChange={() => toggleSuggestion(suggestion.id)}
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="outline" className="text-xs">
                                    {suggestion.type}
                                  </Badge>
                                  {suggestion.line && (
                                    <span className="text-xs text-muted-foreground">
                                      Line {suggestion.line}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-medium mb-2">{suggestion.description}</p>
                                {suggestion.context && (
                                  <p className="text-xs text-muted-foreground mb-2">{suggestion.context}</p>
                                )}
                                <div className="bg-muted rounded-lg p-3 space-y-2">
                                  <div>
                                    <span className="text-xs text-red-500 font-medium">- </span>
                                    <code className="text-xs break-all">{suggestion.original.slice(0, 200)}{suggestion.original.length > 200 ? '...' : ''}</code>
                                  </div>
                                  <div>
                                    <span className="text-xs text-green-500 font-medium">+ </span>
                                    <code className="text-xs break-all">{suggestion.suggestion.slice(0, 200)}{suggestion.suggestion.length > 200 ? '...' : ''}</code>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* AI Suggestions Card */}
                {result.aiSuggestions && result.aiSuggestions.length > 0 && (
                  <Card className="border-purple-200 dark:border-purple-900">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <span className="text-purple-600 dark:text-purple-400">AI</span>
                            Content Suggestions ({acceptedAiSuggestions.size}/{result.aiSuggestions.filter(s => isValidAiSuggestion(s)).length} applicable)
                          </CardTitle>
                          <CardDescription>
                            AI-generated suggestions. Select which to include in the PR. Only suggestions with original/replacement text can be auto-applied.
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => toggleAllAiSuggestions(true)}>
                            Accept All
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => toggleAllAiSuggestions(false)}>
                            Decline All
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {result.aiSuggestions.map((suggestion, idx) => {
                          const categoryColors: Record<string, string> = {
                            grammar: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
                            clarity: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
                            technical: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
                            'content-gap': 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
                            'link-suggestion': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
                            tone: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
                          };
                          const isExpanded = expandedAiItems.has(idx);
                          const canApply = isValidAiSuggestion(suggestion);
                          const isAccepted = acceptedAiSuggestions.has(idx);

                          return (
                            <div
                              key={idx}
                              className={`p-4 ${!canApply ? 'opacity-60' : ''} ${canApply && !isAccepted ? 'opacity-50 bg-muted/30' : ''}`}
                            >
                              <div className="flex items-start gap-3">
                                {canApply ? (
                                  <Checkbox
                                    checked={isAccepted}
                                    onCheckedChange={() => toggleAiSuggestion(idx)}
                                    className="mt-1"
                                  />
                                ) : (
                                  <div className="w-4 h-4 mt-1" title="Cannot be auto-applied (no specific replacement)" />
                                )}
                                <div
                                  className="flex-1 min-w-0 cursor-pointer"
                                  onClick={() => {
                                    const next = new Set(expandedAiItems);
                                    if (next.has(idx)) {
                                      next.delete(idx);
                                    } else {
                                      next.add(idx);
                                    }
                                    setExpandedAiItems(next);
                                  }}
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[suggestion.category] || 'bg-gray-100 text-gray-700'}`}>
                                      {suggestion.category}
                                    </span>
                                    {!canApply && (
                                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800">
                                        manual only
                                      </span>
                                    )}
                                    <span className="font-medium text-sm">{suggestion.title}</span>
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">{suggestion.description}</p>

                                  {isExpanded && (suggestion.original || suggestion.suggestion) && (
                                    <div className="mt-3 bg-muted rounded-lg p-3 space-y-2">
                                      {suggestion.original && (
                                        <div>
                                          <span className="text-xs text-red-500 font-medium">- </span>
                                          <code className="text-xs break-all">{suggestion.original}</code>
                                        </div>
                                      )}
                                      {suggestion.suggestion && (
                                        <div>
                                          <span className="text-xs text-green-500 font-medium">+ </span>
                                          <code className="text-xs break-all">{suggestion.suggestion}</code>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </>
        )}

        {!result && !loading && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <ClipboardCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Enter a docs URL above to run the audit</p>
            </CardContent>
          </Card>
        )}

        {/* Anthropic API Key Prompt Modal */}
        <AnthropicKeyPrompt open={showKeyPrompt} onOpenChange={setShowKeyPrompt} />
      </div>
    </AppLayout>
  );
}
