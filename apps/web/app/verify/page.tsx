'use client';

import { useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useLinkHrefsOut } from '@/hooks/use-index-data';

type Plan = any;

function safeParseJson(text: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export default function VerifyPage() {
  const { data: hrefsOut, isLoading } = useLinkHrefsOut();
  const [planText, setPlanText] = useState('');

  const parsed = useMemo(() => safeParseJson(planText), [planText]);

  const checks = useMemo(() => {
    if (!parsed.ok) return null;
    const plan: Plan = parsed.value;

    const oldPermalink = plan?.source?.permalink as string | undefined;
    const newPermalink = plan?.destination?.permalink as string | undefined;
    const files: string[] = plan?.proposed?.linkRewriteFiles ?? [];

    const fileHasOld = (fileId: string) => (hrefsOut?.[fileId] ?? []).some((x) => x.href === oldPermalink);
    const fileHasNew = (fileId: string) => (hrefsOut?.[fileId] ?? []).some((x) => x.href === newPermalink);

    const oldRefs = oldPermalink ? files.filter(fileHasOld) : [];
    const newRefs = newPermalink ? files.filter(fileHasNew) : [];

    return {
      oldPermalink,
      newPermalink,
      files,
      oldRefs,
      newRefs,
    };
  }, [parsed, hrefsOut]);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Verify a refactor plan</h1>
          <p className="text-muted-foreground">Paste a refactor-plan JSON and run post-change verification checks (best-effort).</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Paste plan JSON</CardTitle>
            <CardDescription>From the Refactor Assistant export.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={planText} onChange={(e) => setPlanText(e.target.value)} placeholder="{ ...refactor-plan.json... }" className="min-h-[220px] font-mono text-xs" />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setPlanText('')}>Clear</Button>
            </div>
          </CardContent>
        </Card>

        {!planText.trim() ? null : !parsed.ok ? (
          <Alert variant="destructive">
            <AlertTitle>Invalid JSON</AlertTitle>
            <AlertDescription className="font-mono text-xs whitespace-pre-wrap">{parsed.error}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="text-center py-10 text-muted-foreground">Loading index…</div>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Checks</CardTitle>
              <CardDescription>These checks are conservative; they’re meant to catch the obvious footguns.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">files in scope: {checks?.files?.length ?? 0}</Badge>
                <Badge variant={checks?.oldRefs?.length ? 'destructive' : 'secondary'}>old permalink refs found: {checks?.oldRefs?.length ?? 0}</Badge>
                <Badge variant={checks?.newPermalink ? (checks?.newRefs?.length ? 'secondary' : 'destructive') : 'secondary'}>
                  new permalink refs found: {checks?.newRefs?.length ?? 0}
                </Badge>
              </div>

              <div className="rounded-xl border bg-card p-4">
                <div className="text-xs text-muted-foreground mb-1">old permalink</div>
                <div className="font-mono text-sm break-all">{checks?.oldPermalink || '(none)'}</div>
                <div className="text-xs text-muted-foreground mt-3 mb-1">new permalink</div>
                <div className="font-mono text-sm break-all">{checks?.newPermalink || '(none)'}</div>
              </div>

              {checks?.oldRefs?.length ? (
                <div className="rounded-xl border bg-card p-4">
                  <div className="font-semibold mb-2">Files still referencing old permalink</div>
                  <ul className="space-y-1 text-sm font-mono">
                    {checks.oldRefs.slice(0, 200).map((f: string) => (
                      <li key={f} className="break-all">{f}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {checks?.newPermalink && !checks?.newRefs?.length ? (
                <Alert variant="destructive">
                  <AlertTitle>No references to the new permalink detected</AlertTitle>
                  <AlertDescription>
                    This might be OK (nav-only, not linked yet), but it’s a red flag for discoverability.
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
