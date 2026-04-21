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

/**
 * POST /api/analytics/insights/ai-analyze
 *
 * Runs algorithmic correlation on index data, then calls Claude server-side
 * and returns parsed insights directly.
 */
export async function POST(req: Request) {
  try {
    await requireSession(true);
    const body = BodySchema.parse(await req.json());

    // Load index data
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

    const indexData = {
      nodes,
      metrics,
      deadEnds: deadEnds ?? { generatedAtUtc: '', minInbound: 0, maxOutbound: 0, count: 0, items: [] },
      journeyMaps: journeyMaps ?? { generatedAtUtc: '', maxLen: 0, minLen: 0, startsPerRoot: 0, branching: 0, topPerRoot: 0, globalTop: [], byNavRoot: {} },
      shadowHubs: shadowHubs ?? { generatedAtUtc: '', hubCutoff: 0, shadowThreshold: 0, minAuthorityDelta: 0, count: 0, items: [] },
      crossNavPairs: crossNavPairs ?? { generatedAtUtc: '', hubCutoff: 0, minIntersection: 0, scoreThreshold: 0, pairs: [] },
    };

    // Step 1: Run algorithmic correlation
    const algoInsights = correlate(
      { topPages: body.topPages, unhelpfulPages: body.unhelpfulPages, searchQueries: body.searchQueries },
      indexData,
    );

    // Step 2: Build prompt with algorithmic context
    const orphanCount = Object.values(metrics).filter((m) => m.orphanTrue).length;
    const deadEndCount = deadEnds?.count ?? 0;
    const hubCount = Object.values(metrics).filter((m) => (m.hubScore ?? 0) > 5).length;

    const prompt = `You are a documentation analytics expert for Auth0's documentation site (auth0.com/docs). You're analyzing the correlation between site structure and analytics data to surface actionable insights for the technical writing team.

## Site topology
- Total pages: ${nodes.length}
- Orphan pages (no nav + no inbound links): ${orphanCount}
- Dead-end pages (no/few outbound links): ${deadEndCount}
- Hub pages (hubScore > 5): ${hubCount}
- Shadow hubs: ${shadowHubs?.count ?? 0}
- Cross-nav pairs: ${crossNavPairs?.pairs.length ?? 0}
- Journey map paths: ${journeyMaps?.globalTop.length ?? 0}

## Analytics data

Top 15 pages by traffic:
${body.topPages.slice(0, 15).map((p) => `- ${p.path}: ${p.views} views`).join('\n')}

Pages with low helpfulness:
${body.unhelpfulPages.slice(0, 15).map((p) => `- ${p.path}: ${p.unhelpful}/${p.total} unhelpful`).join('\n')}

${body.searchQueries?.length ? `Top search queries:\n${body.searchQueries.slice(0, 15).map((q) => `- "${q.query}": ${q.count} searches`).join('\n')}` : ''}

## Algorithmic insights already found (${algoInsights.length} total):
${algoInsights.map((i) => `- [${i.severity}] ${i.type}: ${i.title}`).join('\n') || 'None'}

## Your task

1. **Prioritize and validate** the algorithmic insights — which are most impactful? Any false positives?
2. **Identify patterns the algorithm missed** — narrative/thematic insights, cross-cutting patterns (e.g. "these 5 pages form a natural learning path but aren't linked").
3. **Provide an executive summary** (2-3 sentences) of the overall documentation health.

Return your response as JSON only:
{
  "summary": "Executive summary of documentation health",
  "insights": [
    {
      "type": "orphan-traffic|high-traffic-low-helpfulness|dead-end-traffic|convergence-point|content-gap|unlinked-high-search|shadow-hub-traffic|cross-nav-friction",
      "severity": "high|medium|low",
      "title": "Short title",
      "description": "Rich narrative description with reasoning",
      "affectedPages": ["path1", "path2"],
      "recommendation": "Specific, actionable recommendation",
      "evidence": {}
    }
  ]
}

Rules:
- Include the most impactful algorithmic insights (validated/enhanced), plus any new patterns you spot.
- Maximum 12 insights total. Quality over quantity.
- Return ONLY the JSON, no other text.`;

    // Return prompt + algorithmic insights so client can call Claude directly
    // from the browser (avoids Vercel IP restrictions on LiteLLM proxy).
    return NextResponse.json({
      ok: true,
      prompt,
      maxTokens: 8192,
      algoInsights,
    });
  } catch (err: any) {
    console.error('[AI Insights] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 400 },
    );
  }
}
