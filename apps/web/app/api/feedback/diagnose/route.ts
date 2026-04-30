import { NextResponse } from 'next/server';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireSession } from '@/lib/session';
import { getFeedbackDiagnosis, upsertFeedbackDiagnosis } from '@/lib/db';
import { DIAGNOSIS_SYSTEM_PROMPT, buildDiagnosisUserPrompt } from '@/lib/feedback-diagnosis';
import type { FeedbackIndex } from '@/types';

const BodySchema = z.object({
  path: z.string().min(1),
});

async function readFeedbackIndex(): Promise<FeedbackIndex> {
  const filePath = path.join(process.cwd(), 'public', 'index', 'feedback.json');
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as FeedbackIndex;
}

async function callClaude(opts: {
  systemPrompt: string;
  userPrompt: string;
  apiKey: string;
}): Promise<{ text: string; model: string }> {
  const configuredBaseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const isLiteLLMProxy = configuredBaseUrl.includes('llm.atko.ai');
  const proxyToken = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

  const useProxy = isLiteLLMProxy && !!proxyToken;
  const apiKey = useProxy ? proxyToken! : opts.apiKey;
  const baseUrl = useProxy ? configuredBaseUrl : 'https://api.anthropic.com';
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (useProxy) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  }

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 256,
      system: [
        {
          type: 'text',
          text: opts.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: opts.userPrompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text');
  const text = (textBlock?.text ?? '').trim();
  if (!text) throw new Error('Anthropic returned empty diagnosis');
  return { text, model };
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
  let session;
  try {
    session = await requireSession(true);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const { path: targetPath } = parsed.data;

  const proxyToken = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  const userKey = session.user.anthropic_api_key_decrypted ?? null;
  if (!userKey && !proxyToken) {
    return NextResponse.json(
      { error: 'No Anthropic API key configured. Add one in /settings.' },
      { status: 400 },
    );
  }

  let index: FeedbackIndex;
  try {
    index = await readFeedbackIndex();
  } catch (err) {
    return NextResponse.json(
      { error: 'feedback.json not found. Run `pnpm fetch:feedback && pnpm sync:index` first.' },
      { status: 500 },
    );
  }

  const bucket = index.byPath[targetPath];
  if (!bucket) {
    return NextResponse.json({ error: `No feedback bucket for path: ${targetPath}` }, { status: 404 });
  }

  const userPrompt = buildDiagnosisUserPrompt(targetPath, bucket);

  try {
    const { text, model } = await callClaude({
      systemPrompt: DIAGNOSIS_SYSTEM_PROMPT,
      userPrompt,
      apiKey: userKey ?? '',
    });

    const stored = await upsertFeedbackDiagnosis({
      path: targetPath,
      diagnosis: text,
      model,
      userId: session.user.id,
    });

    return NextResponse.json({
      diagnosis: stored.diagnosis,
      model: stored.model,
      generatedAt: stored.generated_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Diagnosis failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
