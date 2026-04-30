import { NextResponse } from 'next/server';
import { z } from 'zod';
import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { requireSession } from '@/lib/session';
import { getFeedbackDiagnosis, upsertFeedbackDiagnosis } from '@/lib/db';
import { DIAGNOSIS_SYSTEM_PROMPT, buildDiagnosisUserPrompt } from '@/lib/feedback-diagnosis';
import type { FeedbackIndex } from '@/types';

const BodySchema = z.object({
  path: z.string().min(1),
});

async function readFeedbackIndex(): Promise<FeedbackIndex> {
  const filePath = nodePath.join(process.cwd(), 'public', 'index', 'feedback.json');
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as FeedbackIndex;
}

export async function GET(request: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const targetPath = url.searchParams.get('path');
  if (!targetPath) {
    return NextResponse.json({ error: 'Missing ?path=' }, { status: 400 });
  }

  const existing = await getFeedbackDiagnosis(targetPath);
  if (!existing) {
    return NextResponse.json({ diagnosis: null });
  }

  return NextResponse.json({
    diagnosis: existing.diagnosis,
    model: existing.model,
    generatedAt: existing.generated_at,
  });
}

export async function POST(request: Request) {
  try {
    const { user } = await requireSession(true);
    const body = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
    }
    const { path: targetPath } = parsed.data;

    let index: FeedbackIndex;
    try {
      index = await readFeedbackIndex();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'feedback.json not found. Run `pnpm fetch:feedback && pnpm sync:index` first.' },
        { status: 500 },
      );
    }

    const bucket = index.byPath[targetPath];
    if (!bucket) {
      return NextResponse.json({ ok: false, error: `No feedback bucket for path: ${targetPath}` }, { status: 404 });
    }

    // Resolve Anthropic auth — same pattern as /api/rules-deprecation/suggest
    const configuredBaseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    const isLiteLLMProxy = configuredBaseUrl.includes('llm.atko.ai');
    const proxyToken = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
    const userKey = user.anthropic_api_key_decrypted;

    const useProxy = isLiteLLMProxy && !!proxyToken;
    const apiKey = useProxy ? proxyToken : (userKey || proxyToken);
    const baseUrl = useProxy ? configuredBaseUrl : 'https://api.anthropic.com';

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'No Anthropic API key configured. Add one in Settings.' }, { status: 400 });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (useProxy) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    const userPrompt = buildDiagnosisUserPrompt(targetPath, bucket);
    // Inline the system prompt into the user message to match audit/rules-deprecation
    // routing through the Okta LiteLLM proxy (top-level `system` is not preserved).
    const prompt = `${DIAGNOSIS_SYSTEM_PROMPT}\n\n---\n\n${userPrompt}`;
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Feedback Diagnose] AI error:', response.status, errorText);
      return NextResponse.json({ ok: false, error: `AI API error: ${response.status}` }, { status: 502 });
    }

    const data = await response.json();
    const text = (data.content?.[0]?.text || '').trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: 'AI returned empty diagnosis' }, { status: 502 });
    }

    const stored = await upsertFeedbackDiagnosis({
      path: targetPath,
      diagnosis: text,
      model,
      userId: user.id,
    });

    return NextResponse.json({
      ok: true,
      diagnosis: stored.diagnosis,
      model: stored.model,
      generatedAt: stored.generated_at,
    });
  } catch (err: any) {
    console.error('[Feedback Diagnose] suggest error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 400 },
    );
  }
}
