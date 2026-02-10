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

function extractFencedBlocks(mdx: string) {
  // More forgiving fence parser than regex.
  // Supports ``` and ~~~ fences, and tolerates indentation.
  const lines = mdx.split(/\r?\n/);
  const blocks: { fence: string; lang: string; content: string }[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^\s*(```|~~~)\s*([^\s`]*)\s*$/);
    if (!m) {
      i += 1;
      continue;
    }

    const fence = m[1];
    const lang = (m[2] || '').trim();
    const start = i + 1;
    i = start;
    const contentLines: string[] = [];

    while (i < lines.length) {
      const end = lines[i];
      if (end.match(new RegExp(`^\\s*${fence}\\s*$`))) break;
      contentLines.push(end);
      i += 1;
    }

    // If we didn't find a closing fence, treat as unterminated and stop.
    if (i >= lines.length) break;

    blocks.push({ fence, lang, content: contentLines.join('\n') });
    i += 1; // skip closing fence
  }

  return blocks;
}

function analyzeMdx(mdx: string) {
  const parts = splitByFences(mdx);
  const textOnly = parts.filter((p) => p.kind === 'text').map((p) => p.content).join('');

  // Rules occurrences (non-fenced)
  const rulesOccurrences: { snippet: string }[] = [];
  const rulesRe = /\bRules\b/g;
  let rm: RegExpExecArray | null;
  while ((rm = rulesRe.exec(textOnly))) {
    const idx = rm.index;
    rulesOccurrences.push({
      snippet: textOnly.slice(Math.max(0, idx - 40), idx + 40).replace(/\s+/g, ' '),
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

  const fenced = extractFencedBlocks(mdx);
  const fenceLangs = fenced.map((b) => b.lang || '(none)').slice(0, 200);

  // Extract curl blocks from fenced blocks.
  // Criteria: fence lang is curl/bash/sh/shell OR content contains a curl invocation.
  const curlBlocks: { lang: string; content: string }[] = [];
  for (const b of fenced) {
    const lang = (b.lang || '').toLowerCase();
    const looksLikeShell = ['curl', 'bash', 'sh', 'shell', 'zsh'].includes(lang);
    const hasCurl = /(^|\n)\s*curl\s+/m.test(b.content);
    if (looksLikeShell && hasCurl) {
      curlBlocks.push({ lang: lang || 'unknown', content: b.content });
    }
    if (curlBlocks.length >= 50) break;
  }

  // Fallback: detect unfenced curl snippets (common in bad/legacy formatting).
  if (curlBlocks.length === 0) {
    const lines = mdx.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].match(/^\s*curl\s+/)) continue;
      const buf: string[] = [lines[i]];
      i += 1;
      while (i < lines.length) {
        const ln = lines[i];
        if (ln.trim() === '') break;
        // stop if we hit a heading/list that clearly isn't part of the command
        if (ln.match(/^\s*#{1,6}\s+/)) break;
        buf.push(ln);
        i += 1;
      }
      curlBlocks.push({ lang: 'unfenced', content: buf.join('\n') });
      if (curlBlocks.length >= 20) break;
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

async function getMgmtApiToken() {
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
    throw new Error(`Token fetch failed: ${tokenRes.status} ${tokenRes.statusText}: ${tokenText.slice(0, 500)}`);
  }

  let tokenJson: any;
  try {
    tokenJson = JSON.parse(tokenText);
  } catch {
    throw new Error(`Token fetch returned non-JSON: ${tokenText.slice(0, 500)}`);
  }

  const accessToken = tokenJson.access_token as string | undefined;
  if (!accessToken) throw new Error('Token fetch succeeded but no access_token present.');

  return { domain, accessToken };
}

function normalizeCurlBlock(raw: string, domain: string, accessToken: string) {
  // remove line continuations (backslash + optional spaces + newline)
  let s = raw.replace(/\\\s*\n/g, ' ');
  // common placeholder replacements
  s = s.replaceAll('{managementApiToken}', accessToken);
  // tenant placeholders
  s = s.replaceAll('{yourTenant}.com', domain);
  s = s.replaceAll('{yourTenant}', domain);
  return s;
}

function parseCurl(normalized: string) {
  // ultra-light parser: find method, headers, data, url
  const methodMatch = normalized.match(/\s-X\s+([A-Z]+)/i);
  const method = (methodMatch?.[1] || 'GET').toUpperCase();

  const headers: Record<string, string> = {};
  const headerRe = /\s-H\s+"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(normalized))) {
    const [k, ...rest] = m[1].split(':');
    if (!k || rest.length === 0) continue;
    headers[k.trim()] = rest.join(':').trim();
  }

  // -d '...'
  const dataMatch = normalized.match(/\s-d\s+'([\s\S]*?)'/);
  const data = dataMatch?.[1];

  // url: last https?:// token
  const urlMatch = normalized.match(/(https?:\/\/[^\s]+)/g);
  const url = urlMatch ? urlMatch[urlMatch.length - 1] : null;

  return { method, headers, data, url };
}

function redact(s: string) {
  // conservative redaction for bearer tokens
  return s.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');
}

async function runCurlSmoke(domain: string, accessToken: string) {
  const sanity = await fetch(`https://${domain}/api/v2/clients?per_page=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  return {
    ok: true,
    sanityStatus: sanity.status,
  };
}

function tryParseJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function maybeOverrideActionName(parsed: { method: string; url: string | null; data?: string }, attempt: number) {
  // Execution-only override to avoid polluting the tenant with repeated name collisions.
  // Only applies to POST /api/v2/actions/actions.
  if (!parsed.url) return { data: parsed.data, override: null as null | { from: string; to: string } };
  if (parsed.method !== 'POST') return { data: parsed.data, override: null };
  if (!parsed.url.includes('/api/v2/actions/actions')) return { data: parsed.data, override: null };
  if (!parsed.data) return { data: parsed.data, override: null };

  const json = tryParseJson(parsed.data);
  if (!json || typeof json !== 'object') return { data: parsed.data, override: null };
  const name = (json as any).name;
  if (typeof name !== 'string' || !name) return { data: parsed.data, override: null };

  const suffix = `${Date.now()}-${attempt}`;
  const nextName = `${name}-${suffix}`;
  (json as any).name = nextName;
  return { data: JSON.stringify(json), override: { from: name, to: nextName } };
}

async function executeCurlBlocks(blocks: { lang: string; content: string }[], domain: string, accessToken: string) {
  const max = Number(process.env.MAINTENANCE_CURL_MAX || 5);
  const out: Array<{
    index: number;
    method: string;
    url: string;
    status: number;
    ok: boolean;
    requestPreview?: string;
    responsePreview?: string;
    overrides?: { actionName?: { from: string; to: string } };
    note?: string;
  }> = [];

  const previewLimit = Number(process.env.MAINTENANCE_CURL_PREVIEW_CHARS || 1200);

  for (let i = 0; i < Math.min(blocks.length, max); i++) {
    const b = blocks[i];
    const normalized = normalizeCurlBlock(b.content, domain, accessToken);
    const parsed = parseCurl(normalized);

    if (!parsed.url) {
      out.push({
        index: i,
        method: parsed.method,
        url: '(missing)',
        status: 0,
        ok: false,
        requestPreview: redact(normalized).slice(0, previewLimit),
        note: 'Could not parse URL from curl block.',
      });
      continue;
    }

    // default auth header if placeholder replacement didn't inject it
    const headers = { ...parsed.headers };
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'authorization')) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    let body: string | undefined;
    if (parsed.data !== undefined) body = parsed.data;

    // execution-only overrides
    const override = maybeOverrideActionName({ method: parsed.method, url: parsed.url, data: body }, 0);
    body = override.data;

    const requestPreview = redact(
      `curl (simulated)\nMETHOD: ${parsed.method}\nURL: ${parsed.url}\nHEADERS: ${JSON.stringify(
        Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, k.toLowerCase() === 'authorization' ? 'Bearer [REDACTED]' : v]))
      )}\nBODY: ${body ?? ''}`
    ).slice(0, previewLimit);

    try {
      // If we still hit name collision, retry once with a new override.
      let res = await fetch(parsed.url, {
        method: parsed.method,
        headers,
        body: body !== undefined ? body : undefined,
        cache: 'no-store',
      });

      let text = await res.text().catch(() => '');
      if (!res.ok && parsed.method === 'POST' && parsed.url.includes('/api/v2/actions/actions')) {
        try {
          const j = JSON.parse(text);
          const msg = String(j?.message || '');
          if (msg.toLowerCase().includes('action name has already been taken')) {
            const override2 = maybeOverrideActionName({ method: parsed.method, url: parsed.url, data: body }, 1);
            body = override2.data;
            res = await fetch(parsed.url, { method: parsed.method, headers, body, cache: 'no-store' });
            text = await res.text().catch(() => '');
          }
        } catch {
          // ignore
        }
      }

      const responsePreview = redact(text).slice(0, previewLimit);

      out.push({
        index: i,
        method: parsed.method,
        url: parsed.url,
        status: res.status,
        ok: res.ok,
        requestPreview,
        responsePreview,
        overrides: override.override ? { actionName: override.override } : undefined,
      });
    } catch (e: any) {
      out.push({
        index: i,
        method: parsed.method,
        url: parsed.url,
        status: 0,
        ok: false,
        requestPreview,
        note: redact(e?.message || String(e)).slice(0, previewLimit),
      });
    }
  }

  return out;
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

    let curlSmoke: any = { ok: false, error: 'Not run' };
    let curlExec: any = [];

    try {
      const { domain, accessToken } = await getMgmtApiToken();
      curlSmoke = await runCurlSmoke(domain, accessToken);
      curlExec = await executeCurlBlocks(analysis.curlBlocks, domain, accessToken);
    } catch (e: any) {
      curlSmoke = { ok: false, error: e?.message || String(e) };
    }

    return NextResponse.json({ ok: true, analysis, curlSmoke, curlExec });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 400 });
  }
}
