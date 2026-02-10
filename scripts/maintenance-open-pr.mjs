#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) die(`Missing required env var ${name}`);
  return v;
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...opts,
  });
}

function upsertValidatedOn(mdx, validatedOn) {
  const fmMatch = mdx.match(/^---\n([\s\S]*?)\n---\n?/);
  const line = `validatedOn: ${validatedOn}`;

  if (!fmMatch) {
    return `---\n${line}\n---\n\n${mdx}`;
  }

  const fmBody = fmMatch[1];
  const rest = mdx.slice(fmMatch[0].length);

  const lines = fmBody.split('\n');
  const idx = lines.findIndex((l) => l.trim().startsWith('validatedOn:'));
  if (idx >= 0) lines[idx] = line;
  else lines.push(line);

  return `---\n${lines.join('\n')}\n---\n\n${rest.replace(/^\n+/, '')}`;
}

function splitByFences(mdx) {
  const parts = [];
  const re = /(^```[^\n]*\n[\s\S]*?\n```\s*$)/gm;
  let last = 0;
  let m;
  while ((m = re.exec(mdx))) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > last) parts.push({ kind: 'text', content: mdx.slice(last, start) });
    parts.push({ kind: 'code', content: m[0] });
    last = end;
  }
  if (last < mdx.length) parts.push({ kind: 'text', content: mdx.slice(last) });
  return parts;
}

function autoFixRulesToActions(mdx) {
  const parts = splitByFences(mdx);
  let replaced = 0;

  const fixed = parts
    .map((p) => {
      if (p.kind === 'code') return p.content;
      const segs = p.content.split(/(`[^`]*`)/g);
      return segs
        .map((s) => {
          if (s.startsWith('`') && s.endsWith('`')) return s;
          return s.replace(/\bRules\b/g, () => {
            replaced += 1;
            return 'Actions';
          });
        })
        .join('');
    })
    .join('');

  return { mdx: fixed, replaced };
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

const args = parseArgs(process.argv);
const docsRepoPath = requireEnv('MAINTENANCE_DOCS_REPO_PATH');
const upstreamRepo = requireEnv('MAINTENANCE_UPSTREAM_REPO'); // e.g. auth0/docs-v2
const baseBranch = process.env.MAINTENANCE_BASE_BRANCH || 'main';
const forkOwner = requireEnv('MAINTENANCE_FORK_OWNER'); // your GH username/org

const filePath = args.filePath || args.file || '';
const validatedOn = args.validatedOn || '';
const prTitle = args.prTitle || `Content maintenance: validate ${filePath}`;
const prBody = args.prBody || '';

if (!filePath) die('Missing --filePath');
if (!/^\d{4}-\d{2}-\d{2}$/.test(validatedOn)) die('Missing/invalid --validatedOn (YYYY-MM-DD)');

const abs = path.resolve(docsRepoPath, filePath);
if (!fs.existsSync(abs)) die(`File not found: ${abs}`);

const branchSlug = filePath
  .replace(/^[./]+/, '')
  .replace(/[^a-zA-Z0-9/_-]+/g, '-')
  .slice(0, 80)
  .replace(/\//g, '-');
const branchName = `maintenance/${branchSlug}-${validatedOn}`;

// If the working tree is dirty, allow it ONLY when the only change is the target file.
// We'll carry that change forward by generating a patch, switching branches, then applying it.
const statusRaw = run('git', ['status', '--porcelain'], { cwd: docsRepoPath });
const status = statusRaw.trimEnd();
let carryPatch = null;
if (status) {
  const changed = statusRaw
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      // Porcelain format: XY<space>path
      const m = l.match(/^..\s+(.*)$/);
      return m ? m[1] : l.slice(3);
    });

  const unique = Array.from(new Set(changed));
  if (unique.length !== 1 || unique[0] !== filePath) {
    die(
      `Docs repo has uncommitted changes outside the target file.\n` +
        `Please commit/stash first.\n\n${status}`
    );
  }

  // Capture a patch of just the target file.
  carryPatch = run('git', ['diff', '--', filePath], { cwd: docsRepoPath });

  // Now that the patch is saved, restore the file so we can safely switch branches.
  run('git', ['restore', '--', filePath], { cwd: docsRepoPath });
}

run('git', ['checkout', baseBranch], { cwd: docsRepoPath });
run('git', ['pull', '--ff-only'], { cwd: docsRepoPath });

// Create/overwrite branch locally
try {
  run('git', ['checkout', '-B', branchName], { cwd: docsRepoPath });
} catch (e) {
  die(`Failed to create branch ${branchName}: ${e?.stderr || e}`);
}

// If we had a carried patch (from a dirty working tree), apply it now.
if (carryPatch && carryPatch.trim()) {
  try {
    execFileSync('git', ['apply', '-'], { cwd: docsRepoPath, input: carryPatch });
  } catch (e) {
    die(`Failed to apply carried patch for ${filePath}. Resolve conflicts manually.`);
  }
}

let mdx = fs.readFileSync(abs, 'utf8');
mdx = upsertValidatedOn(mdx, validatedOn);
const fixed = autoFixRulesToActions(mdx);
mdx = fixed.mdx;

fs.writeFileSync(abs, mdx, 'utf8');

run('git', ['add', filePath], { cwd: docsRepoPath });

// Signed commit is controlled by user's git config (commit.gpgsign)
run('git', ['commit', '-m', `chore(docs): content maintenance (${validatedOn})`], { cwd: docsRepoPath });

// Push to fork remote. We assume remote name is "origin" pointing to the fork.
run('git', ['push', '-u', 'origin', branchName], { cwd: docsRepoPath });

// Create PR against upstream using gh.
// head should be forkOwner:branchName
const head = `${forkOwner}:${branchName}`;

const bodyCombined =
  (prBody ? `${prBody.trim()}\n\n` : '') +
  `## Automated fixes\n\n- validatedOn set to: ${validatedOn}\n- Rules→Actions replacements applied: ${fixed.replaced}\n`;

const prUrl = run(
  'gh',
  [
    'pr',
    'create',
    '--repo',
    upstreamRepo,
    '--base',
    baseBranch,
    '--head',
    head,
    '--title',
    prTitle,
    '--body',
    bodyCombined,
  ],
  { cwd: docsRepoPath }
).trim();

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      prUrl,
      branchName,
      rulesReplaceCount: fixed.replaced,
    },
    null,
    2
  )
);
