import { writeFileSync, mkdirSync } from 'node:fs';

const STOPWORDS = new Set([
  'the','a','an','and','or','but','for','to','of','in','on','at','is','are','was','were',
  'be','been','being','have','has','had','do','does','did','this','that','these','those',
  'with','as','it','its','if','by','from','you','your','i','my','me','we','our','us',
  'they','them','their','he','she','his','her','what','when','where','which','who','how',
  'not','no','so','than','then','there','here','all','any','some','more','most','other',
  'such','only','own','same','can','will','would','should','could','may','might','must',
  'page','doc','docs','quickstart','tutorial','example','code','please','use','using','like',
  'one','two','need','needs','also','just','really','very','still','even','about','make',
]);

function tokenize(text) {
  return text.toLowerCase().split(/[^a-z0-9.]+/).filter(t => t.length > 2 && !STOPWORDS.has(t));
}

function computeCluster(items) {
  const sorted = [...items].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  let largestBurst = null;
  let runStart = 0;
  for (let i = 1; i <= sorted.length; i++) {
    const gap = i < sorted.length
      ? (new Date(sorted[i].createdAt) - new Date(sorted[i-1].createdAt)) / 60000
      : Infinity;
    if (gap > 60) {
      const runLen = i - runStart;
      if (runLen >= 2 && (!largestBurst || runLen > largestBurst.count)) {
        const startedAt = sorted[runStart].createdAt;
        const endedAt = sorted[i-1].createdAt;
        largestBurst = {
          count: runLen,
          startedAt,
          endedAt,
          windowMinutes: Math.round((new Date(endedAt) - new Date(startedAt)) / 60000),
        };
      }
      runStart = i;
    }
  }

  const counts = new Map();
  for (const item of items) {
    const tokens = tokenize(item.comment || '');
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (let i = 0; i < tokens.length - 1; i++) {
      const bg = `${tokens[i]} ${tokens[i+1]}`;
      counts.set(bg, (counts.get(bg) ?? 0) + 1);
    }
  }
  const topTerms = [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([term, count]) => ({ term, count }));

  const codeCounts = new Map();
  for (const item of items) {
    if (!item.code) continue;
    const key = item.code.trim();
    codeCounts.set(key, (codeCounts.get(key) ?? 0) + 1);
  }
  const recurringCode = [...codeCounts.values()].filter(c => c >= 2).length;

  return {
    burst: largestBurst,
    topTerms,
    recurringCode,
    diagnosisCandidate: items.length >= 2,
  };
}

const apiKey = process.env.MINTLIFY_API_KEY;
const projectId = process.env.MINTLIFY_PROJECT_ID;
if (!apiKey || !projectId) {
  console.error('Missing MINTLIFY_API_KEY or MINTLIFY_PROJECT_ID');
  process.exit(1);
}

const daysBack = Number(process.env.FEEDBACK_DAYS_BACK ?? 30);
const dateFrom = process.env.FEEDBACK_DATE_FROM
  ?? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const dateTo = process.env.FEEDBACK_DATE_TO; // omit by default — API's dateTo is exclusive
const outDir = process.env.OUT_DIR || 'index';

async function fetchPage(cursor) {
  const url = new URL(`https://api.mintlify.com/v1/analytics/${projectId}/feedback`);
  url.searchParams.set('dateFrom', dateFrom);
  if (dateTo) url.searchParams.set('dateTo', dateTo);
  url.searchParams.set('limit', '100');
  if (cursor) url.searchParams.set('cursor', cursor);

  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  return res.json();
}

const all = [];
let cursor = undefined;
let pages = 0;
do {
  const page = await fetchPage(cursor);
  all.push(...(page.feedback ?? []));
  cursor = page.hasMore ? page.nextCursor : undefined;
  pages += 1;
} while (cursor);

const byPath = {};
for (const item of all) {
  const path = item.path || '<no-path>';
  if (!byPath[path]) {
    byPath[path] = {
      count: 0,
      pendingCount: 0,
      inProgressCount: 0,
      resolvedCount: 0,
      dismissedCount: 0,
      negativeCount: 0,
      lastAt: null,
      items: [],
    };
  }
  const bucket = byPath[path];
  bucket.count += 1;
  if (item.status === 'pending') bucket.pendingCount += 1;
  else if (item.status === 'in_progress') bucket.inProgressCount += 1;
  else if (item.status === 'resolved') bucket.resolvedCount += 1;
  else if (item.status === 'dismissed') bucket.dismissedCount += 1;

  // Negative = contextual thumbs-down OR any code_snippet feedback (form is implicitly negative)
  const isNegative =
    (item.source === 'contextual' && item.helpful === false) ||
    item.source === 'code_snippet';
  if (isNegative) bucket.negativeCount += 1;

  if (!bucket.lastAt || item.createdAt > bucket.lastAt) bucket.lastAt = item.createdAt;
  bucket.items.push(item);
}

for (const bucket of Object.values(byPath)) {
  bucket.items.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  bucket.cluster = computeCluster(bucket.items);
}

const sortedEntries = Object.entries(byPath).sort((a, b) => b[1].count - a[1].count);
const sortedByPath = Object.fromEntries(sortedEntries);

const output = {
  fetchedAt: new Date().toISOString(),
  dateFrom,
  dateTo: dateTo ?? null,
  total: all.length,
  pageCount: pages,
  pathCount: Object.keys(byPath).length,
  byPath: sortedByPath,
};

mkdirSync(outDir, { recursive: true });
const outPath = `${outDir}/feedback.json`;
writeFileSync(outPath, JSON.stringify(output, null, 2));

console.log(`Fetched ${all.length} items across ${pages} page(s), ${Object.keys(byPath).length} unique paths.`);
console.log(`Date range: ${dateFrom} -> ${dateTo ?? 'now'}`);
console.log(`Wrote ${outPath}`);
console.log(`\nTop 10 paths by feedback count:`);
for (const [path, b] of sortedEntries.slice(0, 10)) {
  console.log(`  ${String(b.count).padStart(3)}  neg=${b.negativeCount}  pending=${b.pendingCount}  ${path}`);
}
