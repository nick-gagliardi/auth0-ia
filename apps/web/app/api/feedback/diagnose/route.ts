import { NextResponse } from 'next/server';
import { z } from 'zod';
import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { requireSession } from '@/lib/session';
import { getFeedbackDiagnosis, upsertFeedbackDiagnosis } from '@/lib/db';
import type { FeedbackIndex } from '@/types';

const BodySchema = z.object({
  path: z.string().min(1),
  diagnosis: z.string().min(1).max(4000),
  model: z.string().min(1).max(100),
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

// POST persists a diagnosis the client generated. The Anthropic call itself
// happens browser-side (see FeedbackClient.tsx) — the LiteLLM proxy at
// llm.atko.ai is IP-allowlisted to authenticated browser sessions, so calling
// it from a Vercel function 403s. Server-side here just validates and stores.
export async function POST(request: Request) {
  try {
    const { user } = await requireSession();
    const body = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
    }
    const { path: targetPath, diagnosis, model } = parsed.data;

    let index: FeedbackIndex;
    try {
      index = await readFeedbackIndex();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'feedback.json not found. Run `pnpm fetch:feedback && pnpm sync:index` first.' },
        { status: 500 },
      );
    }

    if (!index.byPath[targetPath]) {
      return NextResponse.json({ ok: false, error: `No feedback bucket for path: ${targetPath}` }, { status: 404 });
    }

    const stored = await upsertFeedbackDiagnosis({
      path: targetPath,
      diagnosis,
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
    console.error('[Feedback Diagnose] save error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 400 },
    );
  }
}
