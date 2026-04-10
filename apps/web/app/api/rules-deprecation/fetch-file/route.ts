import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';

const BodySchema = z.object({
  filePath: z.string().min(1),
});

async function gh<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API error ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function POST(req: Request) {
  try {
    const { user } = await requireSession();
    const body = BodySchema.parse(await req.json());

    const ghToken = process.env.MAINTENANCE_GH_TOKEN || user.github_pat_decrypted || user.github_access_token_decrypted;
    if (!ghToken) throw new Error('No GitHub token configured.');

    const targetRepo = process.env.MAINTENANCE_UPSTREAM_REPO || 'auth0/docs-v2';
    const [owner, repo] = targetRepo.split('/');
    const baseBranch = process.env.MAINTENANCE_BASE_BRANCH || 'main';

    const file = await gh<{ content: string; encoding: string }>(
      ghToken,
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(body.filePath)}?ref=${encodeURIComponent(baseBranch)}`
    );

    if (file.encoding !== 'base64') throw new Error(`Unexpected encoding: ${file.encoding}`);
    const content = Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8');

    return NextResponse.json({ ok: true, content });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 400 });
  }
}
