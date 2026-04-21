import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { correlate } from '@/lib/insights-engine';
import type { DocNode, Metrics, DeadEndsIndex, JourneyMapsIndex, ShadowHubs, CrossNavPairs } from '@/types';
import fs from 'fs/promises';
import path from 'path';

const BodySchema = z.object({
  topPages: z.array(z.object({ path: z.string(), views: z.number() })),
  unhelpfulPages: z.array(z.object({ path: z.string(), unhelpful: z.number(), total: z.number() })),
  searchQueries: z.array(z.object({ query: z.string(), count: z.number() })).optional(),
});

const INDEX_DIR = path.join(process.cwd(), 'public', 'index');

async function loadJson<T>(filename: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(INDEX_DIR, filename), 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    await requireSession(true);
    const body = BodySchema.parse(await req.json());

    // Load index data from disk
    const [nodes, metrics, deadEnds, journeyMaps, shadowHubs, crossNavPairs] = await Promise.all([
      loadJson<DocNode[]>('nodes.json'),
      loadJson<Metrics>('metrics.json'),
      loadJson<DeadEndsIndex>('dead_ends.json'),
      loadJson<JourneyMapsIndex>('journey_maps.json'),
      loadJson<ShadowHubs>('shadow_hubs.json'),
      loadJson<CrossNavPairs>('cross_nav_pairs.json'),
    ]);

    if (!nodes || !metrics) {
      return NextResponse.json(
        { ok: false, error: 'Index data not available. Run the indexer first.' },
        { status: 503 },
      );
    }

    const insights = correlate(
      {
        topPages: body.topPages,
        unhelpfulPages: body.unhelpfulPages,
        searchQueries: body.searchQueries,
      },
      {
        nodes,
        metrics,
        deadEnds: deadEnds ?? { generatedAtUtc: '', minInbound: 0, maxOutbound: 0, count: 0, items: [] },
        journeyMaps: journeyMaps ?? { generatedAtUtc: '', maxLen: 0, minLen: 0, startsPerRoot: 0, branching: 0, topPerRoot: 0, globalTop: [], byNavRoot: {} },
        shadowHubs: shadowHubs ?? { generatedAtUtc: '', hubCutoff: 0, shadowThreshold: 0, minAuthorityDelta: 0, count: 0, items: [] },
        crossNavPairs: crossNavPairs ?? { generatedAtUtc: '', hubCutoff: 0, minIntersection: 0, scoreThreshold: 0, pairs: [] },
      },
    );

    return NextResponse.json({ ok: true, insights, mode: 'algorithmic' as const });
  } catch (err: any) {
    console.error('[Insights Correlate] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 400 },
    );
  }
}
