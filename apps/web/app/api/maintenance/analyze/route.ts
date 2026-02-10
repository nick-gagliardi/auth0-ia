import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  filePath: z.string().min(1),
});

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function splitByFences(mdx: string) {
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

function analyzeMdx(mdx: string) {
  const parts = splitByFences(mdx);
  const textOnly = parts.filter((p) => p.kind === 'text').map((p) => p.content).join('');

  // Rules occurrences (non-fenced)
  const rulesOccurrences: { snippet: string }[] = [];
  const rulesRe = /\bRules\b/g;
  let rm: RegExpExecArray | null;
  while ((rm = rulesRe.exec(textOnly))) {
    const i = rm.index;
    rulesOccurrences.push({
      snippet: textOnly.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' '),
    });
    if (rulesOccurrences.length >= 25) break;
  }

  // Links
  const mdLinks: string[] = [];
  const mdLinkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  let lm: RegExpExecArray | null;
  while ((lm = mdLinkRe.exec(mdx))) {
    mdLinks.push(lm[1]);
    if (mdLinks.length >= 500) break;
  }
  const jsxHrefs: string[] = [];
  const hrefRe = /\bhref\s*=\s*"([^"]+)"/g;
  while ((lm = hrefRe.exec(mdx))) {
    jsxHrefs.push(lm[1]);
    if (jsxHrefs.length >= 500) break;
  }

  // Images (flag for manual review)
  const mdImgs: string[] = [];
  const mdImgRe = /!\[[^\]]*\]\(([^)]+)\)/g;
  while ((lm = mdImgRe.exec(mdx))) {
    mdImgs.push(lm[1]);
    if (mdImgs.length >= 200) break;
  }
  const imgSrcs: string[] = [];
  const imgRe = /<img[^>]*\bsrc\s*=\s*"([^"]+)"/gi;
  while ((lm = imgRe.exec(mdx))) {
    imgSrcs.push(lm[1]);
    if (imgSrcs.length >= 200) break;
  }

  // Code fence languages
  const fenceLangs: string[] = [];
  const fenceLangRe = /^```\s*([^\s\n]*)/gm;
  while ((lm = fenceLangRe.exec(mdx))) {
    fenceLangs.push(lm[1] || '(none)');
    if (fenceLangs.length >= 500) break;
  }

  // Extract curl blocks (very heuristic)
  const curlBlocks: { lang: string; content: string }[] = [];
  const fenceRe = /^```\s*([^\s\n]*)\n([\s\S]*?)\n```\s*$/gm;
  let fm: RegExpExecArray | null;
  while ((fm = fenceRe.exec(mdx))) {
    const lang = (fm[1] || '').toLowerCase();
    const content = fm[2] || '';
    const firstLine = content.trimStart().split('\n')[0] || '';
    if (lang === 'curl' || firstLine.trim().startsWith('curl ')) {
      curlBlocks.push({ lang: lang || 'unknown', content });
      if (curlBlocks.length >= 50) break;
    }
  }

  return {
    rulesOccurrences,
    linkCount: mdLinks.length + jsxHrefs.length,
    internalDocsLinks: [...mdLinks, ...jsxHrefs].filter((u) => u.startsWith('/docs/')),
    images: [...mdImgs, ...imgSrcs],
    fenceLangs,
    curlBlocks,
  };
}

async function runCurlSmoke() {
  // Minimal proof of life: fetch mgmt api token.
  const domain = requireEnv('AUTH0_DOMAIN');
  const clientId = requireEnv('AUTH0_CLIENT_ID');
  const clientSecret = requireEnv('AUTH0_CLIENT_SECRET');

  const tokenRes = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
  });

  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) {
    return { ok: false, error: `Token fetch failed: ${tokenRes.status} ${tokenRes.statusText}: ${tokenText.slice(0, 500)}` };
  }

  let tokenJson: any;
  try {
    tokenJson = JSON.parse(tokenText);
  } catch {
    return { ok: false, error: `Token fetch returned non-JSON: ${tokenText.slice(0, 500)}` };
  }

  const accessToken = tokenJson.access_token as string | undefined;
  if (!accessToken) return { ok: false, error: 'Token fetch succeeded but no access_token present.' };

  // Read-only sanity call
  const sanity = await fetch(`https://${domain}/api/v2/clients?per_page=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  return {
    ok: true,
    tokenOk: true,
    sanityStatus: sanity.status,
  };
}

export async function POST(req: Request) {
  try {
    const mode = (process.env.MAINTENANCE_MODE || 'vercel').toLowerCase();
    if (mode !== 'local') {
      return NextResponse.json(
        { ok: false, error: 'Analyze endpoint currently supported only in local mode.' },
        { status: 400 }
      );
    }

    const body = BodySchema.parse(await req.json());

    const { resolve } = await import('node:path');
    const fs = await import('node:fs/promises');

    const docsRepoPath = requireEnv('MAINTENANCE_DOCS_REPO_PATH');
    const abs = resolve(docsRepoPath, body.filePath);
    const mdx = await fs.readFile(abs, 'utf8');

    const analysis = analyzeMdx(mdx);
    const curlSmoke = await runCurlSmoke().catch((e: any) => ({ ok: false, error: e?.message || String(e) }));

    return NextResponse.json({ ok: true, analysis, curlSmoke });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 400 });
  }
}
