import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  targetRepo: z.string().optional(), // owner/name
  filePath: z.string().min(1),
  validatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prTitle: z.string().optional(),
  prBody: z.string().optional(),
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
    const token = requireEnv('MAINTENANCE_GH_TOKEN');
    const defaultTarget = process.env.MAINTENANCE_TARGET_REPO || 'auth0/docs-v2';

    const bodyRaw = await req.json();
    const body = BodySchema.parse(bodyRaw);

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
    const updated = upsertValidatedOn(original, body.validatedOn);

    // 4) Commit change
    await gh(token, `/repos/${owner}/${repo}/contents/${encodeURIComponent(body.filePath)}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `chore(docs): set validatedOn ${body.validatedOn}`,
        content: b64encodeUtf8(updated),
        sha: file.sha,
        branch: branchName,
      }),
    });

    // 5) Open PR
    const prTitle = body.prTitle || `Content maintenance: validate ${body.filePath}`;
    const prBody =
      body.prBody ||
      `Automated content maintenance update.\n\n- Set front matter: validatedOn: ${body.validatedOn}\n\nFollow-ups (manual):\n- Verify screenshots and code samples per checklist\n- Fix broken links / Rules→Actions as needed\n`;

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
