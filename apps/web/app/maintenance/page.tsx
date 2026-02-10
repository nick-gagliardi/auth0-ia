'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, Rocket, ShieldCheck, Terminal } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { formatChecklistHuman } from '@/lib/checklist-format';

type Checklist = {
  curlWorks: boolean;
  sdkWorks: boolean;
  harRenders: boolean;
  missingSamples: boolean;
  removeObjcSwift: boolean;

  screenshotsAccurate: boolean;
  screenshotsHiRes: boolean;
  dashboardStepsWork: boolean;

  replaceRulesWithActions: boolean;
  brokenLinksFixed: boolean;
};

const defaultChecklist: Checklist = {
  curlWorks: false,
  sdkWorks: false,
  harRenders: false,
  missingSamples: false,
  removeObjcSwift: false,
  screenshotsAccurate: false,
  screenshotsHiRes: false,
  dashboardStepsWork: false,
  replaceRulesWithActions: false,
  brokenLinksFixed: false,
};

function todayUtc() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function MaintenancePage() {
  const { toast } = useToast();
  const [prTarget, setPrTarget] = useState<'fork' | 'upstream'>('fork');

  const defaultForkRepo = process.env.NEXT_PUBLIC_MAINTENANCE_FORK_REPO || 'nick-gagliardi/docs-v2';
  const defaultUpstreamRepo = process.env.NEXT_PUBLIC_MAINTENANCE_UPSTREAM_REPO || 'auth0/docs-v2';

  const [targetRepo, setTargetRepo] = useState(defaultForkRepo);
  const [filePath, setFilePath] = useState('');
  const [validatedOn, setValidatedOn] = useState(todayUtc());
  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState<Checklist>(defaultChecklist);

  const [running, setRunning] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<any | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<any | null>(null);

  const [consoleLines, setConsoleLines] = useState<string[]>([]);

  function log(line: string) {
    setConsoleLines((xs) => [...xs, `${new Date().toLocaleTimeString()} ${line}`]);
  }

  useEffect(() => {
    setTargetRepo(prTarget === 'fork' ? defaultForkRepo : defaultUpstreamRepo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prTarget]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ prUrl: string; branchName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prBody = useMemo(() => {
    const lines: string[] = [];
    lines.push('Content maintenance review (Phase 1: Technical correctness).');
    lines.push('');
    lines.push(`- validatedOn: ${validatedOn}`);
    lines.push('');
    lines.push('Checklist:');

    type Status = 'PASS' | 'FAIL' | 'MANUAL' | 'NA' | undefined;

    function mergeStatus(manualOk: boolean, auto: Status) {
      // Manual always wins (human checked it).
      if (manualOk) return { checked: true, note: null as string | null };
      if (auto === 'PASS') return { checked: true, note: 'auto' };
      if (auto === 'NA') return { checked: false, note: 'N/A' };
      if (auto === 'MANUAL') return { checked: false, note: 'manual' };
      return { checked: false, note: null as string | null };
    }

    function item(label: string, manualOk: boolean, auto?: Status) {
      const m = mergeStatus(manualOk, auto);
      const suffix = m.note ? ` (${m.note})` : '';
      lines.push(`- [${m.checked ? 'x' : ' '}] ${label}${suffix}`);
    }

    const auto = analysisResult?.checklistAuto;
    const cs = auto?.codeSamples || {};
    const hk = auto?.housekeeping || {};

    lines.push('');
    lines.push('Code samples');
    item('cURL code samples work and are properly formatted', checklist.curlWorks, cs.curl);
    item('Code tab rendering works (Mintlify)', false, cs.tabRendering);
    item('SDK code samples work and are properly formatted', checklist.sdkWorks, cs.sdk);
    item('HAR code samples render correctly on Mintlify', checklist.harRenders, cs.har);
    item('Code samples are present where needed (no missing samples)', checklist.missingSamples, cs.missingSamples);
    item('Removed Obj-C/Swift from Management API calls where inappropriate', checklist.removeObjcSwift, cs.removeObjcSwift);

    lines.push('');
    lines.push('Auth0 Dashboard');
    item('Screenshots are accurate and match written instructions', checklist.screenshotsAccurate, auto?.dashboard?.screenshots);
    item('Screenshots are high resolution and match style guide', checklist.screenshotsHiRes, auto?.dashboard?.screenshotsHiRes);
    item('Procedural instructions using the Auth0 Dashboard work', checklist.dashboardStepsWork, auto?.dashboard?.stepsWork);

    lines.push('');
    lines.push('General housekeeping');
    item('Replaced Rules with Actions', checklist.replaceRulesWithActions, hk.rulesToActions);
    item('Fixed broken links', checklist.brokenLinksFixed, hk.brokenLinks);
    item('No obvious typos (heuristic)', false, hk.typos);

    if (notes.trim()) {
      lines.push('');
      lines.push('Notes');
      lines.push(notes.trim());
    }

    return lines.join('\n');
  }, [analysisResult, checklist, notes, validatedOn]);

  async function runAnalysis() {
    setRunning(true);
    setAnalysisResult(null);
    setFixResult(null);
    setCleanupResult(null);
    setError(null);
    log(`Run analysis: ${filePath || '(no file path yet)'}`);

    try {
      const res = await fetch('/api/maintenance/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Unknown error');
      setAnalysisResult(json);
      log('Analysis complete');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  }

  async function applyAutoFix() {
    setFixing(true);
    setFixResult(null);
    setCleanupResult(null);
    setError(null);
    log('Auto-fix: apply recipe + re-test');

    try {
      const res = await fetch('/api/maintenance/fix', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filePath, curlIndex: 0, recipe: 'actions-runtime-node14-to-node18' }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Unknown error');
      setFixResult(json);
      log(`Auto-fix complete: ${json?.patch?.summary || 'done'}`);
      toast({ title: 'Auto-fix complete', description: json?.patch?.summary || 'Recipe applied and re-tested.' });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setFixing(false);
    }
  }

  async function cleanupCreatedAction() {
    const id = fixResult?.created?.actionId;
    if (!id) return;

    setCleaning(true);
    setCleanupResult(null);
    setError(null);
    log(`Cleanup Action ${id}`);

    try {
      const res = await fetch('/api/maintenance/cleanup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'action', id }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Cleanup failed');
      setCleanupResult(json);
      log(`Cleanup complete (status ${json.status})`);
      toast({ title: 'Cleanup complete', description: `DELETE returned ${json.status}` });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCleaning(false);
    }
  }

  async function openPr() {
    setSubmitting(true);
    setResult(null);
    setError(null);
    log(`Create PR → ${targetRepo}`);

    try {
      const res = await fetch('/api/maintenance/open-pr', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetRepo,
          filePath,
          validatedOn,
          prBody,
          prTitle: `Content maintenance: validate ${filePath}`,
          applyAutoFixes: true,
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Unknown error');
      setResult({ prUrl: json.prUrl, branchName: json.branchName });
      if (Array.isArray(json.steps)) {
        for (const s of json.steps) log(String(s));
      }
      toast({ title: 'PR created', description: json.prUrl });
      log(`PR created: ${json.prUrl}`);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Content maintenance</h1>
            <p className="text-muted-foreground mt-1">
              Run a page through the technical correctness checklist and open a PR that sets <code>validatedOn</code>.
            </p>
          </div>
          <Badge variant="secondary" className="text-xs mt-1">PR-first</Badge>
        </div>

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Automation mode</AlertTitle>
          <AlertDescription>
            When you click <b>Open PR</b>, the tool will automatically:
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Upsert front matter <code>validatedOn: YYYY-MM-DD</code></li>
              <li>Apply conservative <code>Rules</code> → <code>Actions</code> replacements (skips code fences + inline code)</li>
              <li>Scan internal <code>/docs/</code> links (best-effort via index) and report likely broken ones in the PR</li>
            </ul>
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Target</CardTitle>
            <CardDescription>Pick where the PR should merge (fork for testing vs upstream for real).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant={prTarget === 'fork' ? 'default' : 'secondary'}
                onClick={() => setPrTarget('fork')}
              >
                PR → My fork
              </Button>
              <Button
                type="button"
                variant={prTarget === 'upstream' ? 'default' : 'secondary'}
                onClick={() => setPrTarget('upstream')}
              >
                PR → Upstream
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="repo">GitHub repo (PR target)</Label>
                <Input id="repo" value={targetRepo} onChange={(e) => setTargetRepo(e.target.value)} placeholder="nick-gagliardi/docs-v2" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="validatedOn">validatedOn</Label>
                <Input id="validatedOn" value={validatedOn} onChange={(e) => setValidatedOn(e.target.value)} placeholder="2026-02-05" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filePath">MDX file path</Label>
              <Input
                id="filePath"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="main/docs/.../page.mdx"
              />
              <p className="text-xs text-muted-foreground">
                Tip: you can grab this from Explain (GitHub link) or from your spreadsheet.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Technical correctness checklist</CardTitle>
            <CardDescription>Check what you verified. Leave unchecked items as follow-ups.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="font-semibold">Code samples</div>
              <CheckRow label="Do cURL code samples work + formatting is correct" checked={checklist.curlWorks} onChange={(v) => setChecklist((c) => ({ ...c, curlWorks: v }))} />
              <CheckRow label="Do SDK code samples work + formatting is correct" checked={checklist.sdkWorks} onChange={(v) => setChecklist((c) => ({ ...c, sdkWorks: v }))} />
              <CheckRow label="Do HAR code samples render correctly on Mintlify" checked={checklist.harRenders} onChange={(v) => setChecklist((c) => ({ ...c, harRenders: v }))} />
              <CheckRow label="Are code samples present where needed (no missing samples)" checked={checklist.missingSamples} onChange={(v) => setChecklist((c) => ({ ...c, missingSamples: v }))} />
              <CheckRow label="Remove Obj-C/Swift from Mgmt API calls where they don't belong" checked={checklist.removeObjcSwift} onChange={(v) => setChecklist((c) => ({ ...c, removeObjcSwift: v }))} />
            </div>

            <div className="space-y-3">
              <div className="font-semibold">Auth0 Dashboard</div>
              <CheckRow label="Screenshots accurate + match written instructions" checked={checklist.screenshotsAccurate} onChange={(v) => setChecklist((c) => ({ ...c, screenshotsAccurate: v }))} />
              <CheckRow label="Screenshots high resolution + match style guide" checked={checklist.screenshotsHiRes} onChange={(v) => setChecklist((c) => ({ ...c, screenshotsHiRes: v }))} />
              <CheckRow label="Dashboard procedural steps work" checked={checklist.dashboardStepsWork} onChange={(v) => setChecklist((c) => ({ ...c, dashboardStepsWork: v }))} />
            </div>

            <div className="space-y-3">
              <div className="font-semibold">General housekeeping</div>
              <CheckRow label="Replace Rules with Actions" checked={checklist.replaceRulesWithActions} onChange={(v) => setChecklist((c) => ({ ...c, replaceRulesWithActions: v }))} />
              <CheckRow label="Fix broken links" checked={checklist.brokenLinksFixed} onChange={(v) => setChecklist((c) => ({ ...c, brokenLinksFixed: v }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything unusual, manual follow-ups, screenshot notes, etc." />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="secondary"
                onClick={runAnalysis}
                disabled={running || !filePath.trim()}
                className="gap-2"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                Run analysis
              </Button>
              <Button
                onClick={openPr}
                disabled={
                  submitting ||
                  !filePath.trim() ||
                  !/^\d{4}-\d{2}-\d{2}$/.test(validatedOn) ||
                  !analysisResult
                }
                className="gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                Create PR
              </Button>
              <Button asChild variant="secondary">
                <Link href="/explain">Find file path in Explain</Link>
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTitle>PR failed</AlertTitle>
                <AlertDescription className="font-mono text-xs whitespace-pre-wrap">{error}</AlertDescription>
              </Alert>
            )}

            {analysisResult && (
              <Alert>
                <AlertTitle>Analysis results</AlertTitle>
                <AlertDescription>
                  <div className="text-xs text-muted-foreground mb-2">This is a dry-run: no branch, no PR.</div>

                  {analysisResult?.curlExec?.[0] && !analysisResult.curlExec[0].ok && (
                    <div className="mt-3 mb-3 flex flex-col sm:flex-row gap-2">
                      <Button variant="default" onClick={applyAutoFix} disabled={fixing} className="gap-2">
                        {fixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                        Auto-fix & re-test (recipe)
                      </Button>
                      <div className="text-xs text-muted-foreground sm:self-center">
                        Currently supports: Actions runtime node14 → node18
                      </div>
                    </div>
                  )}

                  {fixResult && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold mb-2">Fix report</div>
                      <pre className="text-xs bg-secondary/30 rounded-xl p-3 overflow-auto max-h-60 whitespace-pre-wrap">{JSON.stringify(fixResult, null, 2)}</pre>

                      {fixResult?.created?.actionId && (
                        <div className="mt-3 flex flex-col sm:flex-row gap-2">
                          <Button variant="secondary" onClick={cleanupCreatedAction} disabled={cleaning} className="gap-2">
                            {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                            Cleanup created Action
                          </Button>
                          {cleanupResult && (
                            <span className="text-xs text-muted-foreground sm:self-center">
                              Cleanup status {cleanupResult.status}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <pre className="text-xs bg-secondary/30 rounded-xl p-3 overflow-auto max-h-72 whitespace-pre-wrap">{JSON.stringify(analysisResult, null, 2)}</pre>

                  {analysisResult?.checklistAuto && (
                    <div className="mt-4">
                      <div className="text-xs font-semibold mb-2">Technical correctness checklist</div>
                      <pre className="text-xs bg-secondary/30 rounded-xl p-3 overflow-auto max-h-64 whitespace-pre-wrap">{formatChecklistHuman(analysisResult.checklistAuto)}</pre>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {result && (
              <Alert>
                <AlertTitle>PR created</AlertTitle>
                <AlertDescription>
                  <div className="flex items-center gap-2 flex-wrap">
                    <a className="text-primary hover:underline inline-flex items-center gap-1" href={result.prUrl} target="_blank" rel="noreferrer">
                      View PR <ExternalLink className="w-4 h-4" />
                    </a>
                    <span className="text-xs text-muted-foreground">branch {result.branchName}</span>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {consoleLines.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Terminal className="w-4 h-4" /> Console
                  </CardTitle>
                  <CardDescription>What the tool is doing (client + server steps).</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-secondary/30 rounded-xl p-3 overflow-auto max-h-80 whitespace-pre-wrap">{consoleLines.join('\n')}</pre>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">PR body preview</CardTitle>
            <CardDescription>This is what will go into the PR description.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-secondary/30 rounded-xl p-3 overflow-auto max-h-80 whitespace-pre-wrap">{prBody}</pre>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 text-sm cursor-pointer select-none">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} className="mt-0.5" />
      <span>{label}</span>
    </label>
  );
}
