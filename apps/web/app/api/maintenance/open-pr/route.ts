import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  targetRepo: z.string().optional(), // owner/name
  filePath: z.string().min(1),
  validatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prTitle: z.string().optional(),
  prBody: z.string().optional(),
  applyAutoFixes: z.boolean().optional().default(true),
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

function upsertValidatedOn(mdx: string, validatedOn: string) {
  const fmMatch = mdx.match(/^---\n([\s\S]*?)\n---\n?/);
  const line = `validatedOn: ${validatedOn}`;

  if (!fmMatch) {
    // No front matter
    return `---\n${line}\n---\n\n${mdx}`;
  }

  const fmBody = fmMatch[1];
  const rest = mdx.slice(fmMatch[0].length);

  const lines = fmBody.split('\n');
  const idx = lines.findIndex((l) => l.trim().startsWith('validatedOn:'));
  if (idx >= 0) {
    lines[idx] = line;
  } else {
    // Append near end; keep deterministic
    lines.push(line);
  }

  return `---\n${lines.join('\n')}\n---\n\n${rest.replace(/^\n+/, '')}`;
}

function splitByFences(mdx: string) {
  // Keep delimiter parts so we can preserve exactly.
  // This is a lightweight heuristic, not a full MDX parser.
  const parts: { kind: 'code' | 'text'; content: string }[] = [];
  const re = /(^```[^\n]*\n[\s\S]*?\n```\s*$)/gm;
  let last = 0;
  let m: RegExpExecArray | null;
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

function analyzeMdx(mdx: string, permalinkSet?: Set<string>) {
  const parts = splitByFences(mdx);
  const textOnly = parts.filter((p) => p.kind === 'text').map((p) => p.content).join('');

  // Find Rules occurrences in non-code regions (still includes inline code; we avoid replacing inline code later).
  const rulesOccurrences: { index: number; snippet: string }[] = [];
  const rulesRe = /\bRules\b/g;
  let rm: RegExpExecArray | null;
  while ((rm = rulesRe.exec(textOnly))) {
    const i = rm.index;
    rulesOccurrences.push({
      index: i,
      snippet: textOnly.slice(Math.max(0, i - 30), i + 30).replace(/\s+/g, ' '),
    });
    if (rulesOccurrences.length >= 50) break;
  }

  // Markdown links: [text](url)
  const mdLinks: string[] = [];
  const mdLinkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  let lm: RegExpExecArray | null;
  while ((lm = mdLinkRe.exec(mdx))) {
    mdLinks.push(lm[1]);
    if (mdLinks.length >= 200) break;
  }

  // JSX href="..."
  const jsxHrefs: string[] = [];
  const hrefRe = /\bhref\s*=\s*"([^"]+)"/g;
  while ((lm = hrefRe.exec(mdx))) {
    jsxHrefs.push(lm[1]);
    if (jsxHrefs.length >= 200) break;
  }

  const internalDocsLinks = [...mdLinks, ...jsxHrefs].filter((u) => u.startsWith('/docs/'));
  const brokenInternalDocsLinks = permalinkSet
    ? internalDocsLinks.filter((u) => !permalinkSet.has(u))
    : [];

  // Code fence languages
  const fenceLangs: string[] = [];
  const fenceLangRe = /^```\s*([^\s\n]*)/gm;
  while ((lm = fenceLangRe.exec(mdx))) {
    fenceLangs.push(lm[1] || '(none)');
    if (fenceLangs.length >= 200) break;
  }

  const objcSwiftFences = fenceLangs.filter((l) => {
    const x = l.toLowerCase();
    return x === 'swift' || x === 'objc' || x === 'objective-c' || x === 'objectivec';
  });

  return {
    rulesOccurrences,
    internalDocsLinksCount: internalDocsLinks.length,
    brokenInternalDocsLinks,
    fenceLangs,
    objcSwiftFenceCount: objcSwiftFences.length,
  };
}

function autoFixRulesToActions(mdx: string) {
  // Replace standalone word Rules -> Actions in non-fenced text, while skipping inline code `...`.
  const parts = splitByFences(mdx);
  let replaced = 0;

  const fixed = parts
    .map((p) => {
      if (p.kind === 'code') return p.content;
      // Split by inline code spans (single backticks). Keep backticks segments as-is.
      const segs = p.content.split(/(`[^`]*`)/g);
      const next = segs
        .map((s) => {
          if (s.startsWith('`') && s.endsWith('`')) return s;
          const before = s;
          const after = s.replace(/\bRules\b/g, () => {
            replaced += 1;
            return 'Actions';
          });
          // Keep as-is if no change
          return after;
        })
        .join('');
      return next;
    })
    .join('');

  return { mdx: fixed, replaced };
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

export async function POST(req: Request) {
  try {
    const mode = (process.env.MAINTENANCE_MODE || 'vercel').toLowerCase();

    const bodyRaw = await req.json();
    const body = BodySchema.parse(bodyRaw);

    if (mode === 'local') {
      // Local mode: shell out to git + gh using the developer's machine credentials.
      const { execFile } = await import('node:child_process');
      const { resolve, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      // Compute script path relative to THIS file, not process.cwd(), so it works in local dev.
      const here = dirname(fileURLToPath(import.meta.url));
      // route.ts -> app/api/maintenance/open-pr/route.ts
      // repo script lives at <repo>/scripts/maintenance-open-pr.mjs
      const scriptPath = resolve(here, '../../../../../../scripts/maintenance-open-pr.mjs');

      const payload = await new Promise<any>((resolve, reject) => {
        execFile(
          process.execPath,
          [
            scriptPath,
            '--filePath',
            body.filePath,
            '--validatedOn',
            body.validatedOn,
            '--prTitle',
            body.prTitle || `Content maintenance: validate ${body.filePath}`,
            '--prBody',
            body.prBody || '',
          ],
          { env: process.env, maxBuffer: 10 * 1024 * 1024 },
          (err, stdout, stderr) => {
            if (err) {
              reject(new Error(stderr || err.message));
              return;
            }
            try {
              resolve(JSON.parse(String(stdout || '').trim()));
            } catch {
              reject(new Error(`Unexpected output from local script:\n${stdout}\n${stderr}`));
            }
          }
        );
      });

      return NextResponse.json(payload);
    }

    // Vercel mode: call GitHub API directly using MAINTENANCE_GH_TOKEN.
    const token = requireEnv('MAINTENANCE_GH_TOKEN');
    const defaultTarget = process.env.MAINTENANCE_TARGET_REPO || 'auth0/docs-v2';

    const targetRepo = (body.targetRepo || defaultTarget).trim();
    const [owner, repo] = targetRepo.split('/');
    if (!owner || !repo) throw new Error(`Invalid targetRepo: ${targetRepo}`);

    // 1) Determine base branch and its latest sha
    const repoInfo = await gh<{ default_branch: string }>(token, `/repos/${owner}/${repo}`);
    const baseBranch = process.env.MAINTENANCE_BASE_BRANCH || repoInfo.default_branch;

    const baseRef = await gh<{ object: { sha: string } }>(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
    const baseSha = baseRef.object.sha;

    // 2) Create new branch
    const slug = body.filePath
      .replace(/^[./]+/, '')
      .replace(/[^a-zA-Z0-9/_-]+/g, '-')
      .slice(0, 80)
      .replace(/\//g, '-');
    const branchName = `maintenance/${slug}-${body.validatedOn}`;

    await gh(token, `/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }),
    });

    // 3) Fetch file content
    const file = await gh<{ sha: string; content: string; encoding: string }>(
      token,
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(body.filePath)}?ref=${encodeURIComponent(branchName)}`
    );

    if (file.encoding !== 'base64') throw new Error(`Unexpected encoding for ${body.filePath}: ${file.encoding}`);

    const original = b64decodeUtf8(file.content.replace(/\n/g, ''));

    // Fetch index nodes to validate internal /docs/ links (best-effort).
    let permalinkSet: Set<string> | undefined;
    try {
      const origin = new URL(req.url).origin;
      const base = process.env.NEXT_PUBLIC_INDEX_BASE_URL || '/index';
      const nodesUrl = new URL(`${base.replace(/\/$/, '')}/nodes.json`, origin);
      const nodesRes = await fetch(nodesUrl.toString(), { cache: 'no-store' });
      if (nodesRes.ok) {
        const nodes = (await nodesRes.json()) as Array<{ permalink?: string }>;
        permalinkSet = new Set(nodes.map((n) => n.permalink).filter(Boolean) as string[]);
      }
    } catch {
      // ignore
    }

    const analysis = analyzeMdx(original, permalinkSet);

    let updated = upsertValidatedOn(original, body.validatedOn);
    let rulesReplaceCount = 0;
    if (body.applyAutoFixes) {
      const fixed = autoFixRulesToActions(updated);
      updated = fixed.mdx;
      rulesReplaceCount = fixed.replaced;
    }

    // 4) Commit change
    await gh(token, `/repos/${owner}/${repo}/contents/${encodeURIComponent(body.filePath)}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `chore(docs): content maintenance (${body.validatedOn})`,
        content: b64encodeUtf8(updated),
        sha: file.sha,
        branch: branchName,
      }),
    });

    // 5) Open PR
    const prTitle = body.prTitle || `Content maintenance: validate ${body.filePath}`;

    const autoSectionLines: string[] = [];
    autoSectionLines.push('## Automated checks (by tool)');
    autoSectionLines.push('');
    autoSectionLines.push(`- validatedOn set to: ${body.validatedOn}`);
    autoSectionLines.push(`- Rules→Actions replacements applied: ${rulesReplaceCount}`);
    autoSectionLines.push(`- Internal /docs/ links found: ${analysis.internalDocsLinksCount}`);
    if (analysis.brokenInternalDocsLinks.length > 0) {
      autoSectionLines.push(`- Broken internal /docs/ links: ${analysis.brokenInternalDocsLinks.length}`);
      for (const x of analysis.brokenInternalDocsLinks.slice(0, 25)) autoSectionLines.push(`  - ${x}`);
    } else if (permalinkSet) {
      autoSectionLines.push('- Broken internal /docs/ links: 0 (best-effort, index-based)');
    } else {
      autoSectionLines.push('- Broken internal /docs/ links: not checked (index unavailable)');
    }
    autoSectionLines.push(`- Code fences detected: ${analysis.fenceLangs.length}`);
    autoSectionLines.push(`- Obj-C/Swift fences detected: ${analysis.objcSwiftFenceCount}`);
    if (analysis.rulesOccurrences.length > 0) {
      autoSectionLines.push('');
      autoSectionLines.push('### Rules mentions (evidence)');
      for (const o of analysis.rulesOccurrences.slice(0, 10)) autoSectionLines.push(`- …${o.snippet}…`);
    }

    const prBody =
      (body.prBody ? `${body.prBody.trim()}\n\n` : '') +
      autoSectionLines.join('\n') +
      '\n\n## Manual checks remaining\n\n- Verify screenshots match Dashboard steps and are high-res/style-compliant\n- Verify cURL / SDK samples actually work (execution)\n- Verify HAR blocks render correctly in Mintlify\n';

    const pr = await gh<{ html_url: string; number: number }>(token, `/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: prTitle,
        head: branchName,
        base: baseBranch,
        body: prBody,
      }),
    });

    return NextResponse.json({ ok: true, prUrl: pr.html_url, prNumber: pr.number, branchName });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 400 }
    );
  }
}
