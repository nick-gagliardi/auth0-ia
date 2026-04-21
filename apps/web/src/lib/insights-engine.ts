/**
 * Algorithmic correlation engine.
 *
 * Pure-logic module — no API or auth dependencies.
 * Takes index data + analytics data and returns AnalyticsInsight[].
 */

import type {
  AnalyticsInsight,
  DocNode,
  Metrics,
  DeadEndsIndex,
  JourneyMapsIndex,
  ShadowHubs,
  CrossNavPairs,
} from '@/types';

// ── Input shapes ────────────────────────────────────────────────────────────

export interface TopPage {
  path: string;
  views: number;
}

export interface UnhelpfulPage {
  path: string;
  unhelpful: number;
  total: number;
}

export interface SearchQueryItem {
  query: string;
  count: number;
}

export interface CorrelationInput {
  topPages: TopPage[];
  unhelpfulPages: UnhelpfulPage[];
  searchQueries?: SearchQueryItem[];
}

export interface IndexData {
  nodes: DocNode[];
  metrics: Metrics;
  deadEnds: DeadEndsIndex;
  journeyMaps: JourneyMapsIndex;
  shadowHubs: ShadowHubs;
  crossNavPairs: CrossNavPairs;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Normalise a docs path for comparison (strip leading slash, .mdx, index) */
function normPath(p: string): string {
  return p
    .replace(/^\/docs\//, '')
    .replace(/^docs\//, '')
    .replace(/^main\/docs\//, '')
    .replace(/\.mdx$/, '')
    .replace(/\/index$/, '')
    .replace(/^\/+/, '')
    .toLowerCase();
}

/** Build a fast lookup: normalised-path → node id */
function buildPathIndex(nodes: DocNode[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const n of nodes) {
    if (n.permalink) m.set(normPath(n.permalink), n.id);
    m.set(normPath(n.filePath), n.id);
    if (n.title) m.set(n.title.toLowerCase(), n.id);
  }
  return m;
}

// ── Correlation checks ──────────────────────────────────────────────────────

function checkOrphanTraffic(
  input: CorrelationInput,
  index: IndexData,
  pathIdx: Map<string, string>,
): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  const viewMedian = median(input.topPages.map((p) => p.views));

  for (const page of input.topPages) {
    if (page.views <= viewMedian) continue;
    const nodeId = pathIdx.get(normPath(page.path));
    if (!nodeId) continue;
    const m = index.metrics[nodeId];
    if (!m?.orphanTrue) continue;
    insights.push({
      type: 'orphan-traffic',
      severity: 'high',
      title: `Orphan page receiving above-median traffic`,
      description: `"${page.path}" gets ${page.views} views but is a true orphan (no nav links and no inbound links).`,
      affectedPages: [page.path],
      recommendation:
        'Add this page to the navigation tree or link to it from a hub page to make it discoverable.',
      evidence: { views: page.views, orphanTrue: true, nodeId },
    });
  }
  return insights;
}

function checkHighTrafficLowHelpfulness(
  input: CorrelationInput,
): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  const sorted = [...input.topPages].sort((a, b) => b.views - a.views);
  const top20Pct = Math.max(1, Math.ceil(sorted.length * 0.2));
  const highTrafficPaths = new Set(sorted.slice(0, top20Pct).map((p) => normPath(p.path)));

  for (const page of input.unhelpfulPages) {
    if (!highTrafficPaths.has(normPath(page.path))) continue;
    const ratio = page.total > 0 ? page.unhelpful / page.total : 0;
    if (ratio < 0.3) continue;
    insights.push({
      type: 'high-traffic-low-helpfulness',
      severity: 'high',
      title: `High-traffic page with poor helpfulness`,
      description: `"${page.path}" is in the top 20% by traffic but has a ${(ratio * 100).toFixed(0)}% unhelpful ratio (${page.unhelpful}/${page.total}).`,
      affectedPages: [page.path],
      recommendation:
        'Review user feedback comments on this page. Consider rewriting unclear sections, adding code examples, or updating outdated content.',
      evidence: { unhelpful: page.unhelpful, total: page.total, ratio },
    });
  }
  return insights;
}

function checkDeadEndTraffic(
  input: CorrelationInput,
  index: IndexData,
  pathIdx: Map<string, string>,
): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  const deadEndIds = new Set(index.deadEnds.items.map((d) => d.id));
  const viewMedian = median(input.topPages.map((p) => p.views));

  for (const page of input.topPages) {
    if (page.views <= viewMedian * 0.5) continue; // meaningful traffic
    const nodeId = pathIdx.get(normPath(page.path));
    if (!nodeId || !deadEndIds.has(nodeId)) continue;
    const de = index.deadEnds.items.find((d) => d.id === nodeId);
    insights.push({
      type: 'dead-end-traffic',
      severity: 'medium',
      title: `Dead-end page with meaningful traffic`,
      description: `"${page.path}" has ${page.views} views but is a dead end (${de?.outboundLinks ?? 0} outbound links). Users may bounce.`,
      affectedPages: [page.path],
      recommendation:
        'Add "Next steps" or "Related topics" links at the bottom of this page to keep users engaged.',
      evidence: { views: page.views, outboundLinks: de?.outboundLinks, deadEndScore: de?.deadEndScore },
    });
  }
  return insights;
}

function checkConvergencePoint(
  input: CorrelationInput,
  index: IndexData,
  pathIdx: Map<string, string>,
): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  // Count how many journey map paths each page appears in
  const pageCounts = new Map<string, number>();
  for (const jp of index.journeyMaps.globalTop) {
    for (const step of jp.path) {
      pageCounts.set(step, (pageCounts.get(step) || 0) + 1);
    }
  }

  for (const [nodeId, count] of pageCounts) {
    if (count < 3) continue;
    // Only flag if it has traffic (appears in topPages)
    const node = index.nodes.find((n) => n.id === nodeId);
    if (!node) continue;
    const np = normPath(node.filePath);
    const hasTraffic = input.topPages.some((p) => normPath(p.path) === np);
    if (!hasTraffic) continue;

    insights.push({
      type: 'convergence-point',
      severity: 'medium',
      title: `High-convergence page on ${count} journey paths`,
      description: `"${node.filePath}" appears in ${count} journey map paths, making it a critical waypoint. If this page is unclear, it blocks multiple learning flows.`,
      affectedPages: [node.filePath],
      recommendation:
        'Ensure this page has clear prerequisites, a strong intro, and links to the next steps in each journey.',
      evidence: { journeyPathCount: count, nodeId },
    });
  }
  return insights;
}

function checkContentGap(
  input: CorrelationInput,
  index: IndexData,
  pathIdx: Map<string, string>,
): AnalyticsInsight[] {
  if (!input.searchQueries?.length) return [];
  const insights: AnalyticsInsight[] = [];
  const titleSet = new Set<string>();
  for (const n of index.nodes) {
    if (n.title) titleSet.add(n.title.toLowerCase());
  }

  for (const sq of input.searchQueries) {
    if (sq.count < 3) continue;
    const qLower = sq.query.toLowerCase();
    // Simple match: check if any node title contains the query (or vice versa)
    const hasMatch = [...titleSet].some(
      (t) => t.includes(qLower) || qLower.includes(t),
    );
    if (hasMatch) continue;
    // Also check if any path resolves
    if (pathIdx.has(qLower)) continue;

    insights.push({
      type: 'content-gap',
      severity: 'medium',
      title: `Unmatched search query: "${sq.query}"`,
      description: `"${sq.query}" was searched ${sq.count} times but no page title closely matches. Users may not be finding what they need.`,
      affectedPages: [],
      recommendation: `Consider creating content for "${sq.query}" or adding it as a keyword/alias to an existing page.`,
      evidence: { query: sq.query, searchCount: sq.count },
    });
  }
  return insights.slice(0, 10); // cap to avoid noise
}

function checkShadowHubTraffic(
  input: CorrelationInput,
  index: IndexData,
  pathIdx: Map<string, string>,
): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  const topPagePaths = new Map(input.topPages.map((p) => [normPath(p.path), p.views]));

  for (const sh of index.shadowHubs.items) {
    const shadowNode = index.nodes.find((n) => n.id === sh.shadowId);
    if (!shadowNode) continue;
    const shadowNorm = normPath(shadowNode.filePath);
    const shadowViews = topPagePaths.get(shadowNorm);
    if (!shadowViews) continue; // no traffic data

    const hubNode = index.nodes.find((n) => n.id === sh.hubId);
    insights.push({
      type: 'shadow-hub-traffic',
      severity: 'medium',
      title: `Shadow hub receiving traffic`,
      description: `"${shadowNode.filePath}" shadows hub "${hubNode?.filePath ?? sh.hubId}" (similarity ${(sh.score * 100).toFixed(0)}%) and gets ${shadowViews} views. Content may need consolidation.`,
      affectedPages: [shadowNode.filePath, hubNode?.filePath ?? sh.hubId],
      recommendation:
        'Consider merging this page into the hub or adding a clear canonical link to avoid diluting authority.',
      evidence: {
        shadowViews,
        similarityScore: sh.score,
        shadowInbound: sh.shadowInbound,
        hubInbound: sh.hubInbound,
      },
    });
  }
  return insights;
}

function checkCrossNavFriction(
  input: CorrelationInput,
  index: IndexData,
  pathIdx: Map<string, string>,
): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  const topPagePaths = new Map(input.topPages.map((p) => [normPath(p.path), p.views]));
  const viewMedian = median(input.topPages.map((p) => p.views));

  for (const pair of index.crossNavPairs.pairs) {
    const nodeA = index.nodes.find((n) => n.id === pair.a);
    const nodeB = index.nodes.find((n) => n.id === pair.b);
    if (!nodeA || !nodeB) continue;

    const viewsA = topPagePaths.get(normPath(nodeA.filePath)) ?? 0;
    const viewsB = topPagePaths.get(normPath(nodeB.filePath)) ?? 0;

    // Source has high traffic, target has low traffic — friction
    if (viewsA > viewMedian && viewsB < viewMedian * 0.3 && viewsA > viewsB * 3) {
      insights.push({
        type: 'cross-nav-friction',
        severity: 'medium',
        title: `Cross-nav friction between sections`,
        description: `"${nodeA.filePath}" (${viewsA} views) links to "${nodeB.filePath}" (${viewsB} views) across nav sections (${pair.aNav ?? '?'} → ${pair.bNav ?? '?'}). The link exists but users aren't following it.`,
        affectedPages: [nodeA.filePath, nodeB.filePath],
        recommendation:
          'Improve the link anchor text, add a callout or "See also" box, or reconsider whether the cross-nav link is useful.',
        evidence: {
          viewsA,
          viewsB,
          convergenceType: pair.convergenceType,
          score: pair.score,
        },
      });
    }
  }
  return insights.slice(0, 10);
}

function checkUnlinkedHighSearch(
  input: CorrelationInput,
  index: IndexData,
  pathIdx: Map<string, string>,
): AnalyticsInsight[] {
  if (!input.searchQueries?.length) return [];
  const insights: AnalyticsInsight[] = [];

  // Find pages that match high-search queries but have few inbound links
  const querySet = input.searchQueries
    .filter((sq) => sq.count >= 5)
    .map((sq) => ({ ...sq, lower: sq.query.toLowerCase() }));

  for (const node of index.nodes) {
    if (!node.title) continue;
    const titleLower = node.title.toLowerCase();
    const matching = querySet.filter(
      (sq) => titleLower.includes(sq.lower) || sq.lower.includes(titleLower),
    );
    if (matching.length === 0) continue;

    const m = index.metrics[node.id];
    if (!m || m.inboundLinks >= 2) continue;

    insights.push({
      type: 'unlinked-high-search',
      severity: 'low',
      title: `Frequently searched but poorly linked`,
      description: `"${node.title}" matches search queries (${matching.map((sq) => `"${sq.query}"`).join(', ')}) but has only ${m.inboundLinks} inbound link(s).`,
      affectedPages: [node.filePath],
      recommendation:
        'Add inbound links from related pages or hub pages to improve discoverability without relying on search.',
      evidence: {
        inboundLinks: m.inboundLinks,
        matchingQueries: matching.map((sq) => ({ query: sq.query, count: sq.count })),
      },
    });
  }
  return insights.slice(0, 10);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run all 8 algorithmic correlation checks and return sorted insights.
 */
export function correlate(
  input: CorrelationInput,
  index: IndexData,
): AnalyticsInsight[] {
  const pathIdx = buildPathIndex(index.nodes);

  const all: AnalyticsInsight[] = [
    ...checkOrphanTraffic(input, index, pathIdx),
    ...checkHighTrafficLowHelpfulness(input),
    ...checkDeadEndTraffic(input, index, pathIdx),
    ...checkConvergencePoint(input, index, pathIdx),
    ...checkContentGap(input, index, pathIdx),
    ...checkShadowHubTraffic(input, index, pathIdx),
    ...checkCrossNavFriction(input, index, pathIdx),
    ...checkUnlinkedHighSearch(input, index, pathIdx),
  ];

  // Sort by severity: high → medium → low
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  all.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

  return all;
}
