import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  targetRepo: z.string().default('Nick-Gagliardi/docs-v2'),
  filePath: z.string().min(1),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  lang: z.string().nullable().optional(),
  snippetId: z.string().min(3),
  hash: z.string().min(10),
  migrateAllOccurrences: z.boolean().optional().default(false),
});

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function b64encodeUtf8(s: string) {
  return Buffer.from(s, 'utf8').toString('base64');
}

function b64decodeUtf8(s: string) {
  return Buffer.from(s, 'base64').toString('utf8');
}

function normalizeForHash(code: string): string {
  return code
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .trim();
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  // @ts-ignore
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function extForLang(lang: string | null | undefined): string {
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

async function gh<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API error ${res.status} ${res.statusText}: ${text}`);
  }

  return (await res.json()) as T;
}

function replaceLines(mdx: string, startLine: number, endLine: number, replacement: string): string {
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

export async function POST(req: Request) {
  try {
    const bodyRaw = await req.json();
    const body = BodySchema.parse(bodyRaw);

    const mode = (process.env.MAINTENANCE_MODE || 'vercel').toLowerCase();

    if (mode === 'local') {
      const { execFile } = await import('node:child_process');
      const { resolve, dirname, join } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const { readFile } = await import('node:fs/promises');

      async function findRepoRoot(startDir: string): Promise<string> {
        let cur = startDir;
        for (let i = 0; i < 12; i++) {
          try {
            const pkgPath = join(cur, 'package.json');
            const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
            if (pkg?.name === 'auth0-ia') return cur;
          } catch {
            // ignore
          }
          const parent = dirname(cur);
          if (parent === cur) break;
          cur = parent;
        }
        throw new Error('Could not locate auth0-ia repo root (package.json)');
      }

      const here = dirname(fileURLToPath(import.meta.url));
      const repoRoot = await findRepoRoot(here);
      const scriptPath = resolve(repoRoot, 'scripts/snippet-migrate-open-pr.mjs');

      const payload = await new Promise<any>((resolveP, rejectP) => {
        execFile(
          process.execPath,
          [
            scriptPath,
            '--targetRepo',
            body.targetRepo,
            '--baseBranch',
            'main',
            '--filePath',
            body.filePath,
            '--startLine',
            String(body.startLine),
            '--endLine',
            String(body.endLine),
            '--lang',
            String(body.lang || ''),
            '--snippetId',
            body.snippetId,
            '--hash',
            body.hash,
            '--migrateAllOccurrences',
            String(Boolean(body.migrateAllOccurrences)),
          ],
          { env: process.env, maxBuffer: 50 * 1024 * 1024 },
          (err, stdout, stderr) => {
            if (err) {
              rejectP(new Error(stderr || err.message));
              return;
            }
            try {
              resolveP(JSON.parse(String(stdout || '').trim()));
            } catch {
              rejectP(new Error(`Unexpected output from local script:\n${stdout}\n${stderr}`));
            }
          }
        );
      });

      return NextResponse.json(payload);
    }

    const token = requireEnv('MAINTENANCE_GH_TOKEN');

    const [owner, repo] = body.targetRepo.split('/');
    if (!owner || !repo) throw new Error(`Invalid targetRepo: ${body.targetRepo}`);

    const repoInfo = await gh<{ default_branch: string }>(token, `/repos/${owner}/${repo}`);
    const baseBranch = repoInfo.default_branch;

    const baseRef = await gh<{ object: { sha: string } }>(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
    const baseSha = baseRef.object.sha;

    const yyyyMmDd = new Date().toISOString().slice(0, 10);
    const branchName = `snippet-migration/${body.snippetId}-${yyyyMmDd}`;

    await gh(token, `/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
    });

    // Load MDX file
    const file = await gh<{ sha: string; content: string; encoding: string }>(
      token,
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(body.filePath)}?ref=${encodeURIComponent(branchName)}`
    );

    if (file.encoding !== 'base64') throw new Error(`Unexpected encoding: ${file.encoding}`);
    const original = b64decodeUtf8(file.content.replace(/\n/g, ''));

    // Verify hash matches fenced block contents in the requested line range.
    const lines = original.replace(/\r\n/g, '\n').split('\n');
    const snippetLines = lines.slice(body.startLine, body.endLine - 1); // between fences
    const code = snippetLines.join('\n');
    const actualHash = await sha256Hex(normalizeForHash(code));
    if (actualHash !== body.hash) {
      throw new Error(`Snippet hash mismatch. Expected ${body.hash.slice(0, 10)}…, got ${actualHash.slice(0, 10)}…`);
    }

    const embedLang = (body.lang || '').toLowerCase() || null;
    const embed = `<Snippet id="${body.snippetId}" lang="${embedLang || 'text'}" />`;

    const updatedMdx = replaceLines(original, body.startLine, body.endLine, embed);

    // Create snippet file
    const ext = extForLang(body.lang);
    const snippetPath = `main/snippets/${body.snippetId}/${ext}.${ext}`.replace(`${ext}.${ext}`, `${body.lang ? body.lang.toLowerCase() : 'text'}.${ext}`);

    // Ensure snippet content ends with newline
    const snippetContent = code.replace(/\s+$/g, '') + '\n';

    await gh(token, `/repos/${owner}/${repo}/contents/${encodeURIComponent(snippetPath)}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `chore(snippets): add ${body.snippetId} (${body.lang || 'text'})`,
        content: b64encodeUtf8(snippetContent),
        branch: branchName,
      }),
    });

    // Upsert registry.json
    const registryPath = 'main/snippets/registry.json';
    let registry: any = { version: 1, items: {} };
    let registrySha: string | null = null;

    try {
      const reg = await gh<{ sha: string; content: string; encoding: string }>(
        token,
        `/repos/${owner}/${repo}/contents/${encodeURIComponent(registryPath)}?ref=${encodeURIComponent(branchName)}`
      );
      registrySha = reg.sha;
      registry = JSON.parse(b64decodeUtf8(reg.content.replace(/\n/g, '')));
    } catch {
      // create new
    }

    registry.items ??= {};
    const entry = registry.items[body.snippetId] || { langs: {}, createdFrom: [] };
    entry.langs[body.lang || 'text'] = snippetPath;
    entry.hash = body.hash;
    entry.createdFrom = entry.createdFrom || [];
    entry.createdFrom.push({ filePath: body.filePath, startLine: body.startLine, endLine: body.endLine });
    registry.items[body.snippetId] = entry;

    await gh(token, `/repos/${owner}/${repo}/contents/${encodeURIComponent(registryPath)}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `chore(snippets): register ${body.snippetId}`,
        content: b64encodeUtf8(JSON.stringify(registry, null, 2) + '\n'),
        sha: registrySha || undefined,
        branch: branchName,
      }),
    });

    // Commit MDX update
    await gh(token, `/repos/${owner}/${repo}/contents/${encodeURIComponent(body.filePath)}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `docs: migrate fenced snippet to ${body.snippetId}`,
        content: b64encodeUtf8(updatedMdx),
        sha: file.sha,
        branch: branchName,
      }),
    });

    // Open PR
    const pr = await gh<{ html_url: string; number: number }>(token, `/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: `Snippet migration: ${body.snippetId}`,
        head: branchName,
        base: baseBranch,
        body: [
          `Migrates a hardcoded fenced block into \`main/snippets/${body.snippetId}/\` and replaces it with a Snippet embed.`,
          '',
          `- source: ${body.filePath}:${body.startLine}-${body.endLine}`,
          `- lang: ${body.lang || '(none)'}`,
          `- snippetId: ${body.snippetId}`,
          '',
          'Note: this PR assumes a `<Snippet />` component will be available in docs-v2 to render snippet files.',
        ].join('\n'),
      }),
    });

    return NextResponse.json({ ok: true, prUrl: pr.html_url, prNumber: pr.number, branchName, snippetPath });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 400 });
  }
}
