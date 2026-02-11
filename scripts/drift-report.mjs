#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const out = {
    indexPath: 'index/index.json',
    snapshotsDir: 'drift/snapshots',
    reportsDir: 'drift/reports',
    date: new Date().toISOString().slice(0, 10),
    maxItems: 50,
    snapshot: true,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--index' && argv[i + 1]) out.indexPath = argv[++i];
    else if (a === '--snapshots' && argv[i + 1]) out.snapshotsDir = argv[++i];
    else if (a === '--reports' && argv[i + 1]) out.reportsDir = argv[++i];
    else if (a === '--date' && argv[i + 1]) out.date = argv[++i];
    else if (a === '--max-items' && argv[i + 1]) out.maxItems = Number(argv[++i]);
    else if (a === '--no-snapshot') out.snapshot = false;
    else if (a === '--help' || a === '-h') {
      console.log(`Docs Drift Watcher\n\nUsage:\n  node scripts/drift-report.mjs [options]\n\nOptions:\n  --index <path>        Path to current index.json (default: index/index.json)\n  --snapshots <dir>     Snapshot directory (default: drift/snapshots)\n  --reports <dir>       Reports directory (default: drift/reports)\n  --date <YYYY-MM-DD>   Override report date (default: today, UTC)\n  --max-items <n>       Max list items per section (default: 50)\n  --no-snapshot          Do not write a snapshot (report only)\n`);
      process.exit(0);
    }
  }
  return out;
}

function normTitle(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function hubScore(metrics, id) {
  const m = metrics?.[id];
  return m?.hubScore ?? m?.inboundLinks ?? 0;
}

function topHubs(index, n = 50) {
  const pages = (index.nodes || []).filter((x) => x.type === 'page');
  const metrics = index.metrics || {};
  return pages
    .map((p) => ({
      id: p.id,
      title: p.title || '',
      permalink: p.permalink || '',
      navRoot: (p.navPaths?.[0] || '').split(' > ')[0]?.trim() || '',
      score: hubScore(metrics, p.id),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

function computeDuplicateTitles(index) {
  const pages = (index.nodes || []).filter((x) => x.type === 'page');
  const by = new Map();
  for (const p of pages) {
    const t = normTitle(p.title);
    if (!t) continue;
    const arr = by.get(t) || [];
    arr.push(p.id);
    by.set(t, arr);
  }
  const dupTitles = new Map();
  for (const [t, ids] of by.entries()) {
    if (ids.length >= 2) dupTitles.set(t, ids);
  }
  return dupTitles;
}

function computeTrueOrphans(index) {
  const metrics = index.metrics || {};
  const nodes = index.nodes || [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const ids = [];
  for (const [id, m] of Object.entries(metrics)) {
    if (m?.orphanNav && m?.orphanLinks) ids.push(id);
  }
  // keep stable sort for deterministic reports
  ids.sort((a, b) => (nodeById.get(a)?.filePath || a).localeCompare(nodeById.get(b)?.filePath || b));
  return ids;
}

function computeRedirectHygiene(index) {
  const r = index.redirects || {};
  const redirects = r.redirects || [];
  const warnings = r.warnings || {};
  const missing = warnings.missingDestination || [];
  const chains = warnings.chains || [];
  return {
    redirects: redirects.length,
    missingDestination: missing.length,
    chains: chains.length,
  };
}

function setDiff(next, prev) {
  const out = [];
  for (const x of next) if (!prev.has(x)) out.push(x);
  return out;
}

function fmtDelta(n, p) {
  const d = n - p;
  const sign = d > 0 ? '+' : '';
  return `${n} (${sign}${d})`;
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listDirs(dir) {
  if (!(await fileExists(dir))) return [];
  const ents = await fs.readdir(dir, { withFileTypes: true });
  return ents.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

function mdList(items, maxItems) {
  const shown = items.slice(0, maxItems);
  const lines = shown.map((x) => `- ${x}`);
  if (items.length > shown.length) lines.push(`- …and ${items.length - shown.length} more`);
  return lines.length ? lines.join('\n') : '_None._';
}

function mdTable(rows, headers) {
  const h = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return [h, sep, body].filter(Boolean).join('\n');
}

function findHubMovers(currTop, prevTop) {
  const prevRank = new Map(prevTop.map((x, i) => [x.id, i + 1]));
  const currRank = new Map(currTop.map((x, i) => [x.id, i + 1]));

  const entered = currTop.filter((x) => !prevRank.has(x.id));
  const exited = prevTop.filter((x) => !currRank.has(x.id));

  const movers = [];
  for (const x of currTop) {
    if (!prevRank.has(x.id)) continue;
    const d = prevRank.get(x.id) - currRank.get(x.id); // positive = moved up
    if (Math.abs(d) >= 10) movers.push({ ...x, prevRank: prevRank.get(x.id), currRank: currRank.get(x.id), delta: d });
  }
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { entered, exited, movers };
}

async function main() {
  const args = parseArgs(process.argv);

  const indexRaw = await fs.readFile(args.indexPath, 'utf8');
  const curr = JSON.parse(indexRaw);

  const snapshotDirs = await listDirs(args.snapshotsDir);
  const prevDir = snapshotDirs.length ? snapshotDirs[snapshotDirs.length - 1] : null;
  const prevIndexPath = prevDir ? path.join(args.snapshotsDir, prevDir, 'index.json') : null;

  const prev = prevIndexPath && (await fileExists(prevIndexPath)) ? JSON.parse(await fs.readFile(prevIndexPath, 'utf8')) : null;

  const currSummary = curr.summary || {};
  const prevSummary = prev?.summary || null;

  const currOrphans = computeTrueOrphans(curr);
  const prevOrphans = prev ? computeTrueOrphans(prev) : [];
  const newOrphans = prev ? setDiff(currOrphans, new Set(prevOrphans)) : currOrphans;

  const currDupTitles = computeDuplicateTitles(curr);
  const prevDupTitles = prev ? computeDuplicateTitles(prev) : new Map();

  const newDupTitleKeys = prev ? setDiff([...currDupTitles.keys()], new Set(prevDupTitles.keys())) : [...currDupTitles.keys()];
  newDupTitleKeys.sort();

  const currRedirect = computeRedirectHygiene(curr);
  const prevRedirect = prev ? computeRedirectHygiene(prev) : { redirects: 0, missingDestination: 0, chains: 0 };

  const currTop = topHubs(curr, 50);
  const prevTop = prev ? topHubs(prev, 50) : [];
  const hubChanges = prev ? findHubMovers(currTop, prevTop) : { entered: currTop, exited: [], movers: [] };

  const source = currSummary.source || {};
  const prevSource = prevSummary?.source || {};

  const reportLines = [];
  reportLines.push(`# Docs Drift Watcher — Weekly IA Report (${args.date})`);
  reportLines.push('');

  reportLines.push('## Snapshot metadata');
  reportLines.push('');
  reportLines.push(mdTable(
    [
      ['Generated (UTC)', currSummary.generatedAtUtc || ''],
      ['Docs repo', source.repoUrl || ''],
      ['Ref', source.ref || ''],
      ['Docs git SHA', source.gitSha ? `\`${source.gitSha}\`` : ''],
      ['Previous snapshot', prevDir ? `\`${prevDir}\`` : '_None (baseline)_'],
      ['Previous docs SHA', prevSource.gitSha ? `\`${prevSource.gitSha}\`` : '_n/a_'],
    ],
    ['Field', 'Value']
  ));
  reportLines.push('');

  reportLines.push('## Coverage');
  reportLines.push('');
  reportLines.push(mdTable(
    [
      ['Nodes', String(currSummary.nodes ?? ''), prevSummary ? String(prevSummary.nodes ?? '') : '_n/a_'],
      ['Pages', String(currSummary.pages ?? ''), prevSummary ? String(prevSummary.pages ?? '') : '_n/a_'],
      ['Snippets', String(currSummary.snippets ?? ''), prevSummary ? String(prevSummary.snippets ?? '') : '_n/a_'],
    ],
    ['Metric', 'Current', 'Previous']
  ));
  reportLines.push('');

  reportLines.push('## Orphans');
  reportLines.push('');
  reportLines.push(`**True orphans** (not in nav AND 0 inbound links): **${currOrphans.length}**` + (prev ? ` (prev ${prevOrphans.length}, Δ ${currOrphans.length - prevOrphans.length})` : ''));
  reportLines.push('');
  reportLines.push('### New true orphans');
  reportLines.push('');
  reportLines.push(mdList(newOrphans, args.maxItems));
  reportLines.push('');

  reportLines.push('## Duplicates');
  reportLines.push('');
  reportLines.push(`**Duplicate titles** (normalized): **${currDupTitles.size}**` + (prev ? ` (prev ${prevDupTitles.size}, Δ ${currDupTitles.size - prevDupTitles.size})` : ''));
  reportLines.push('');
  reportLines.push('### Newly-duplicate titles');
  reportLines.push('');
  reportLines.push(mdList(newDupTitleKeys.map((t) => `\`${t}\` (${currDupTitles.get(t).length} pages)`), args.maxItems));
  reportLines.push('');

  reportLines.push('## Redirect hygiene');
  reportLines.push('');
  reportLines.push(mdTable(
    [
      ['Redirects', fmtDelta(currRedirect.redirects, prevRedirect.redirects), String(prevRedirect.redirects)],
      ['Missing destination warnings', fmtDelta(currRedirect.missingDestination, prevRedirect.missingDestination), String(prevRedirect.missingDestination)],
      ['Redirect chain warnings', fmtDelta(currRedirect.chains, prevRedirect.chains), String(prevRedirect.chains)],
    ],
    ['Metric', 'Current (Δ)', 'Previous']
  ));
  reportLines.push('');

  reportLines.push('## Hub changes');
  reportLines.push('');
  reportLines.push('Hubs are the top pages by `hubScore` (fallback: inbound links).');
  reportLines.push('');

  if (prev) {
    reportLines.push('### New entrants to Top 50');
    reportLines.push('');
    reportLines.push(mdList(hubChanges.entered.map((x) => `\`${x.id}\` (score ${x.score})`), args.maxItems));
    reportLines.push('');

    reportLines.push('### Exits from Top 50');
    reportLines.push('');
    reportLines.push(mdList(hubChanges.exited.map((x) => `\`${x.id}\` (score ${x.score})`), args.maxItems));
    reportLines.push('');

    reportLines.push('### Biggest rank moves (≥ 10 places)');
    reportLines.push('');
    if (!hubChanges.movers.length) {
      reportLines.push('_None._');
    } else {
      const rows = hubChanges.movers.slice(0, args.maxItems).map((x) => [
        `\`${x.id}\``,
        String(x.score),
        String(x.prevRank),
        String(x.currRank),
        (x.delta > 0 ? `↑${x.delta}` : `↓${Math.abs(x.delta)}`),
      ]);
      reportLines.push(mdTable(rows, ['Page', 'Score', 'Prev rank', 'Curr rank', 'Move']));
    }
    reportLines.push('');
  }

  reportLines.push('### Current Top 20 hubs');
  reportLines.push('');
  const top20 = currTop.slice(0, 20).map((x, i) => [String(i + 1), `\`${x.id}\``, String(x.score), x.navRoot || '']);
  reportLines.push(mdTable(top20, ['Rank', 'Page', 'Score', 'Nav root']));
  reportLines.push('');

  const report = reportLines.join('\n');

  await fs.mkdir(args.reportsDir, { recursive: true });
  const reportPath = path.join(args.reportsDir, `${args.date}.md`);
  const latestPath = path.join(args.reportsDir, `latest.md`);
  await fs.writeFile(reportPath, report, 'utf8');
  await fs.writeFile(latestPath, report, 'utf8');

  if (args.snapshot) {
    const snapDir = path.join(args.snapshotsDir, args.date);
    await fs.mkdir(snapDir, { recursive: true });
    await fs.writeFile(path.join(snapDir, 'index.json'), JSON.stringify(curr), 'utf8');
    const meta = {
      createdAtUtc: new Date().toISOString(),
      fromIndexPath: args.indexPath,
      previousSnapshot: prevDir,
      source: currSummary.source || {},
    };
    await fs.writeFile(path.join(snapDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  }

  console.log(JSON.stringify({ reportPath, previousSnapshot: prevDir, date: args.date }, null, 2));
}

await main();
