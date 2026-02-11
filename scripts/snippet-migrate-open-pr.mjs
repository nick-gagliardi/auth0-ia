#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(_execFile);

function arg(name, def = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return def;
  const v = process.argv[idx + 1];
  if (!v || v.startsWith('--')) return def;
  return v;
}

function boolArg(name, def = false) {
  const v = arg(name, null);
  if (v == null) return def;
  return v === 'true' || v === '1' || v === 'yes';
}

function required(name) {
  const v = arg(name, null);
  if (!v) throw new Error(`Missing required arg --${name}`);
  return v;
}

function normalizeForHash(code) {
  return code
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .trim();
}

async function sha256Hex(input) {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function extForLang(lang) {
  const l = (lang || '').toLowerCase();
  if (!l) return 'txt';
  if (l === 'bash' || l === 'sh' || l === 'shell' || l === 'curl') return 'sh';
  if (l === 'js' || l === 'javascript') return 'js';
  if (l === 'ts' || l === 'typescript') return 'ts';
  if (l === 'py' || l === 'python') return 'py';
  if (l === 'rb' || l === 'ruby') return 'rb';
  if (l === 'go') return 'go';
  if (l === 'java') return 'java';
  if (l === 'csharp' || l === 'cs' || l === 'c#') return 'cs';
  if (l === 'php') return 'php';
  if (l === 'json') return 'json';
  if (l === 'yaml' || l === 'yml') return 'yml';
  return l.replace(/[^a-z0-9]+/g, '') || 'txt';
}

function replaceLines(mdx, startLine, endLine, replacement) {
  const lines = mdx.replace(/\r\n/g, '\n').split('\n');
  const startIdx = startLine - 1;
  const endIdx = endLine - 1;
  if (startIdx < 0 || endIdx >= lines.length || endIdx < startIdx) {
    throw new Error(`Invalid line range ${startLine}-${endLine} for file with ${lines.length} lines`);
  }
  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx + 1);
  const repLines = replacement.replace(/\r\n/g, '\n').split('\n');
  return [...before, ...repLines, ...after].join('\n');
}

async function run(cmd, args, opts = {}) {
  const { stdout } = await execFile(cmd, args, { maxBuffer: 50 * 1024 * 1024, ...opts });
  return String(stdout || '').trim();
}

async function main() {
  const targetRepo = required('targetRepo'); // owner/name
  const filePath = required('filePath');
  const startLine = Number(required('startLine'));
  const endLine = Number(required('endLine'));
  const lang = arg('lang', '') || '';
  const snippetId = required('snippetId');
  const expectedHash = required('hash');
  const baseBranch = arg('baseBranch', 'main');
  const migrateAll = boolArg('migrateAllOccurrences', false);

  if (migrateAll) {
    throw new Error('migrateAllOccurrences not implemented in local mode yet');
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'snippet-migrate-'));
  const repoDir = path.join(tmp, 'docs-v2');

  // Clone using gh (uses your local auth, SSH/https handled by gh)
  await run('gh', ['repo', 'clone', targetRepo, repoDir, '--', '--depth', '1']);

  // Ensure base branch
  await run('git', ['-C', repoDir, 'checkout', baseBranch]);

  const yyyyMmDd = new Date().toISOString().slice(0, 10);
  const branchName = `snippet-migration/${snippetId}-${yyyyMmDd}`;
  await run('git', ['-C', repoDir, 'checkout', '-b', branchName]);

  const absMdx = path.join(repoDir, filePath);
  const original = await fs.readFile(absMdx, 'utf8');
  const lines = original.replace(/\r\n/g, '\n').split('\n');

  const snippetLines = lines.slice(startLine, endLine - 1); // between fences
  const code = snippetLines.join('\n');
  const actualHash = await sha256Hex(normalizeForHash(code));
  if (actualHash !== expectedHash) {
    throw new Error(`Snippet hash mismatch. Expected ${expectedHash.slice(0, 10)}…, got ${actualHash.slice(0, 10)}…`);
  }

  const ext = extForLang(lang);
  const langKey = lang ? lang.toLowerCase() : 'text';
  const snippetPath = `main/snippets/${snippetId}/${langKey}.${ext}`;
  const absSnippet = path.join(repoDir, snippetPath);
  await fs.mkdir(path.dirname(absSnippet), { recursive: true });
  await fs.writeFile(absSnippet, code.replace(/\s+$/g, '') + '\n', 'utf8');

  // registry
  const registryPath = 'main/snippets/registry.json';
  const absReg = path.join(repoDir, registryPath);
  let registry = { version: 1, items: {} };
  try {
    registry = JSON.parse(await fs.readFile(absReg, 'utf8'));
  } catch {
    // new file
  }
  registry.items ??= {};
  const entry = registry.items[snippetId] || { langs: {}, createdFrom: [] };
  entry.langs[langKey] = snippetPath;
  entry.hash = expectedHash;
  entry.createdFrom = entry.createdFrom || [];
  entry.createdFrom.push({ filePath, startLine, endLine });
  registry.items[snippetId] = entry;
  await fs.mkdir(path.dirname(absReg), { recursive: true });
  await fs.writeFile(absReg, JSON.stringify(registry, null, 2) + '\n', 'utf8');

  // replace mdx
  const embed = `<Snippet id="${snippetId}" lang="${langKey}" />`;
  const updatedMdx = replaceLines(original, startLine, endLine, embed);
  await fs.writeFile(absMdx, updatedMdx, 'utf8');

  // commit
  await run('git', ['-C', repoDir, 'add', filePath, snippetPath, registryPath]);
  // Avoid GPG signing issues in non-interactive environments.
  await run('git', ['-C', repoDir, '-c', 'commit.gpgsign=false', 'commit', '-m', `Snippet migration: ${snippetId}`]);
  await run('git', ['-C', repoDir, 'push', '-u', 'origin', branchName]);

  // PR
  const prBody = [
    `Migrates a hardcoded fenced block into \`main/snippets/${snippetId}/\` and replaces it with a Snippet embed.`,
    '',
    `- source: ${filePath}:${startLine}-${endLine}`,
    `- lang: ${lang || '(none)'}`,
    `- snippetId: ${snippetId}`,
    '',
    'Note: this PR assumes a `<Snippet />` component will be available in docs-v2 to render snippet files.',
  ].join('\n');

  const prUrl = await run('gh', [
    'pr',
    'create',
    '--repo',
    targetRepo,
    '--base',
    baseBranch,
    '--head',
    branchName,
    '--title',
    `Snippet migration: ${snippetId}`,
    '--body',
    prBody,
  ]);

  process.stdout.write(JSON.stringify({ ok: true, prUrl, branchName, snippetPath }, null, 2));
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e));
  process.exit(1);
});
