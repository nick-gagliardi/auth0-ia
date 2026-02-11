#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...opts,
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    out[key] = val;
    i++;
  }
  return out;
}

function boolish(v) {
  if (typeof v !== 'string') return Boolean(v);
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function assertRelPath(p, label) {
  if (typeof p !== 'string' || !p.trim()) die(`Invalid ${label}: must be a non-empty string`);
  const norm = p.replace(/\\/g, '/');
  if (norm.startsWith('/') || norm.includes('..')) die(`Unsafe ${label} path: ${p}`);
  return norm.replace(/^\.\//, '');
}

function ensureParentDir(absPath) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
}

function fileLooksText(absPath) {
  const base = path.basename(absPath);
  if (base.startsWith('.')) return false;
  const ext = path.extname(absPath).toLowerCase();
  return [
    '.md',
    '.mdx',
    '.html',
    '.htm',
    '.txt',
    '.json',
    '.yaml',
    '.yml',
    '.js',
    '.ts',
    '.tsx',
    '.jsx',
  ].includes(ext);
}

function walkFiles(dirAbs) {
  const out = [];
  const stack = [dirAbs];
  while (stack.length) {
    const cur = stack.pop();
    const ents = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of ents) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) out.push(p);
    }
  }
  return out;
}

function globToRegExp(glob) {
  // Minimal glob: **, *, ?, and literal chars.
  // Matches path with forward slashes.
  let s = glob.replace(/\\/g, '/');
  // Escape regexp specials
  s = s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // Replace **/ or **
  s = s.replace(/\\\*\\\*\//g, '(?:.+/)?');
  s = s.replace(/\\\*\\\*/g, '.+');
  s = s.replace(/\\\*/g, '[^/]*');
  s = s.replace(/\\\?/g, '[^/]');
  return new RegExp(`^${s}$`);
}

function nowSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

const args = parseArgs(process.argv);

const repoPath = args.repoPath || '';
const planFile = args.planFile || '';
const dryRun = boolish(args.dryRun || 'false');

const targetRepo = args.targetRepo || '';
const baseBranch = args.baseBranch || 'main';
const commitMessage = args.commitMessage || 'chore(docs): apply refactor plan';
const prTitle = args.prTitle || 'Docs refactor (automated)';
const prBody = args.prBody || '';

if (!repoPath) die('Missing --repoPath');
if (!planFile) die('Missing --planFile');

const repoAbs = path.resolve(process.cwd(), repoPath);
if (!fs.existsSync(repoAbs)) die(`Repo path not found: ${repoAbs}`);

const planAbs = path.resolve(process.cwd(), planFile);
if (!fs.existsSync(planAbs)) die(`Plan file not found: ${planAbs}`);

let plan;
try {
  plan = JSON.parse(fs.readFileSync(planAbs, 'utf8'));
} catch (e) {
  die(`Failed to parse plan JSON: ${e}`);
}

const moves = Array.isArray(plan.moves) ? plan.moves : [];
const redirects = Array.isArray(plan.redirects) ? plan.redirects : [];
const linkRewrites = Array.isArray(plan.linkRewrites) ? plan.linkRewrites : [];

const steps = [];
const step = (s) => steps.push(`${new Date().toISOString()} ${s}`);

function safeJoin(rel) {
  const safe = assertRelPath(rel, 'path');
  const abs = path.resolve(repoAbs, safe);
  if (!abs.startsWith(repoAbs + path.sep)) die(`Path escapes repo: ${rel}`);
  return { safe, abs };
}

// Ensure git repo
try {
  run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: repoAbs });
} catch {
  die(`Not a git repo: ${repoAbs}`);
}

const status = run('git', ['status', '--porcelain'], { cwd: repoAbs }).trim();
if (status) {
  die(`Docs repo has uncommitted changes; refusing to run.\n\n${status}`);
}

// Create branch name
const planHash = crypto
  .createHash('sha256')
  .update(JSON.stringify(plan))
  .digest('hex')
  .slice(0, 8);

let branchName = (args.branchName || '').trim();
if (!branchName) branchName = `refactor/${nowSlug()}-${planHash}`;

// Preflight validation
for (const [i, m] of moves.entries()) {
  if (!m || typeof m !== 'object') die(`moves[${i}] must be an object`);
  if (!m.from || !m.to) die(`moves[${i}] missing from/to`);
  const from = safeJoin(m.from);
  const to = safeJoin(m.to);
  if (!fs.existsSync(from.abs)) die(`moves[${i}] source not found: ${from.safe}`);
  if (fs.existsSync(to.abs)) die(`moves[${i}] destination already exists: ${to.safe}`);
}

for (const [i, r] of redirects.entries()) {
  if (!r || typeof r !== 'object') die(`redirects[${i}] must be an object`);
  if (!r.from || !r.to) die(`redirects[${i}] missing from/to`);
  if (typeof r.from !== 'string' || typeof r.to !== 'string') die(`redirects[${i}] from/to must be strings`);
}

for (const [i, lr] of linkRewrites.entries()) {
  if (!lr || typeof lr !== 'object') die(`linkRewrites[${i}] must be an object`);
  const globs = lr.globs || lr.glob || lr.files;
  if (!globs) die(`linkRewrites[${i}] must include globs/glob/files`);
  const reps = lr.replacements || lr.replace || lr.rewrites;
  if (!Array.isArray(reps) || reps.length === 0) die(`linkRewrites[${i}] must include replacements[]`);
  for (const [j, rep] of reps.entries()) {
    if (!rep || typeof rep !== 'object') die(`linkRewrites[${i}].replacements[${j}] must be an object`);
    if (typeof rep.from !== 'string' || typeof rep.to !== 'string') {
      die(`linkRewrites[${i}].replacements[${j}] missing from/to strings`);
    }
  }
}

step(`Base branch: ${baseBranch}`);
step(`Branch name: ${branchName}`);
step(`Dry run: ${dryRun}`);

if (!dryRun) {
  step(`Checkout base branch ${baseBranch}`);
  run('git', ['checkout', baseBranch], { cwd: repoAbs });
  step(`Pull latest ${baseBranch}`);
  run('git', ['pull', '--ff-only'], { cwd: repoAbs });

  step(`Create branch ${branchName}`);
  run('git', ['checkout', '-B', branchName], { cwd: repoAbs });
}

const summary = {
  moves: { requested: moves.length, applied: 0 },
  redirects: { requested: redirects.length, applied: 0, file: '' },
  linkRewrites: { requested: linkRewrites.length, filesChanged: 0, replacements: 0 },
};

// Apply moves
for (const m of moves) {
  const from = safeJoin(m.from);
  const to = safeJoin(m.to);
  step(`Move: ${from.safe} -> ${to.safe}`);
  if (!dryRun) {
    ensureParentDir(to.abs);
    run('git', ['mv', from.safe, to.safe], { cwd: repoAbs });
  }
  summary.moves.applied++;
}

// Apply redirects (generic JSON file merge)
if (redirects.length) {
  const redirectsFile = assertRelPath(plan.redirectsFile || 'redirects.generated.json', 'redirectsFile');
  const rAbs = path.resolve(repoAbs, redirectsFile);
  if (!rAbs.startsWith(repoAbs + path.sep)) die(`redirectsFile escapes repo: ${redirectsFile}`);

  let existing = [];
  if (fs.existsSync(rAbs)) {
    try {
      existing = JSON.parse(fs.readFileSync(rAbs, 'utf8'));
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }
  }

  const byFrom = new Map();
  for (const r of existing) {
    if (r && typeof r === 'object' && typeof r.from === 'string') byFrom.set(r.from, r);
  }
  for (const r of redirects) {
    byFrom.set(r.from, { ...r });
  }

  const merged = Array.from(byFrom.values()).sort((a, b) => String(a.from).localeCompare(String(b.from)));
  step(`Redirects: upsert ${redirects.length} entries into ${redirectsFile}`);

  if (!dryRun) {
    ensureParentDir(rAbs);
    fs.writeFileSync(rAbs, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  }

  summary.redirects.applied = redirects.length;
  summary.redirects.file = redirectsFile;
}

// Apply link rewrites
if (linkRewrites.length) {
  const allFilesAbs = walkFiles(repoAbs);

  // Precompute rel paths
  const relByAbs = new Map();
  for (const f of allFilesAbs) {
    const rel = path.relative(repoAbs, f).replace(/\\/g, '/');
    relByAbs.set(f, rel);
  }

  const changedFiles = new Set();

  for (const lr of linkRewrites) {
    const globsRaw = lr.globs || lr.glob || lr.files;
    const globs = Array.isArray(globsRaw) ? globsRaw : [globsRaw];
    const regexes = globs.map((g) => globToRegExp(assertRelPath(String(g), 'glob')));

    const replacements = lr.replacements || lr.replace || lr.rewrites;

    const matched = allFilesAbs.filter((abs) => {
      const rel = relByAbs.get(abs);
      if (!rel) return false;
      if (!fileLooksText(abs)) return false;
      return regexes.some((re) => re.test(rel));
    });

    step(`Link rewrite: matched ${matched.length} files for globs: ${globs.join(', ')}`);

    for (const abs of matched) {
      const rel = relByAbs.get(abs);
      let text = fs.readFileSync(abs, 'utf8');
      let changed = false;

      for (const rep of replacements) {
        const from = String(rep.from);
        const to = String(rep.to);
        if (!from) continue;
        const before = text;
        text = text.split(from).join(to);
        if (text !== before) {
          changed = true;
          const count = (before.length - before.split(from).join('').length) / from.length;
          summary.linkRewrites.replacements += Number.isFinite(count) ? count : 1;
        }
      }

      if (changed) {
        changedFiles.add(rel);
        if (!dryRun) fs.writeFileSync(abs, text, 'utf8');
      }
    }
  }

  summary.linkRewrites.filesChanged = changedFiles.size;
}

if (dryRun) {
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        dryRun: true,
        branchName,
        summary,
        steps,
      },
      null,
      2
    )
  );
  process.exit(0);
}

// Commit + PR
step('Stage changes');
run('git', ['add', '-A'], { cwd: repoAbs });

const diff = run('git', ['diff', '--cached', '--name-only'], { cwd: repoAbs }).trim();
if (!diff) {
  die('No changes to commit after applying plan.');
}

step('Commit changes');
run('git', ['commit', '--no-gpg-sign', '-m', commitMessage], { cwd: repoAbs });

step('Push branch');
run('git', ['push', '-u', 'origin', branchName], { cwd: repoAbs });

let prUrl = '';
if (targetRepo) {
  // Use gh (preinstalled on ubuntu-latest). GITHUB_TOKEN is picked up automatically.
  step('Open PR via gh');
  prUrl = run(
    'gh',
    [
      'pr',
      'create',
      '--repo',
      targetRepo,
      '--base',
      baseBranch,
      '--head',
      branchName,
      '--title',
      prTitle,
      '--body',
      prBody || `Automated refactor plan applied.\n\nPlan hash: ${planHash}`,
    ],
    { cwd: repoAbs }
  ).trim();
  step(`PR created: ${prUrl}`);
} else {
  step('Skipping PR creation (missing --targetRepo)');
}

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      dryRun: false,
      branchName,
      prUrl,
      summary,
      steps,
    },
    null,
    2
  )
);
