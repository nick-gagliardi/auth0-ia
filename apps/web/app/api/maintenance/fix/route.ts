import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  filePath: z.string().min(1),
  // index into detected curl blocks
  curlIndex: z.number().int().min(0).default(0),
  recipe: z.enum(['actions-runtime-node14-to-node18']).default('actions-runtime-node14-to-node18'),
});

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
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

  const tokenJson = JSON.parse(tokenText);
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

  const dataMatch = normalized.match(/\s-d\s+'([\s\S]*?)'/);
  const data = dataMatch?.[1];

  const urlMatch = normalized.match(/(https?:\/\/[^\s]+)/g);
  const url = urlMatch ? urlMatch[urlMatch.length - 1] : null;

  return { method, headers, data, url };
}

function redact(s: string) {
  return s.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');
}

function extractFencedBlocks(mdx: string) {
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

    if (i >= lines.length) break;

    blocks.push({ fence, lang, content: contentLines.join('\n') });
    i += 1;
  }

  return blocks;
}

function extractCurlBlocks(mdx: string) {
  const fenced = extractFencedBlocks(mdx);
  const curlBlocks: { lang: string; content: string }[] = [];

  for (const b of fenced) {
    const lang = (b.lang || '').toLowerCase();
    const looksLikeShell = ['curl', 'bash', 'sh', 'shell', 'zsh'].includes(lang);
    const hasCurl = /(^|\n)\s*curl\s+/m.test(b.content);
    if (looksLikeShell && hasCurl) curlBlocks.push({ lang: lang || 'unknown', content: b.content });
    if (curlBlocks.length >= 50) break;
  }

  if (curlBlocks.length === 0) {
    const lines = mdx.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].match(/^\s*curl\s+/)) continue;
      const buf: string[] = [lines[i]];
      i += 1;
      while (i < lines.length) {
        const ln = lines[i];
        if (ln.trim() === '') break;
        if (ln.match(/^\s*#{1,6}\s+/)) break;
        if (ln.match(/^\s*(```|~~~)\s*/)) break;
        buf.push(ln);
        i += 1;
      }
      curlBlocks.push({ lang: 'unfenced', content: buf.join('\n') });
      if (curlBlocks.length >= 20) break;
    }
  }

  return curlBlocks;
}

async function executeOneCurl(block: { lang: string; content: string }, domain: string, accessToken: string) {
  const previewLimit = Number(process.env.MAINTENANCE_CURL_PREVIEW_CHARS || 1200);

  const normalized = normalizeCurlBlock(block.content, domain, accessToken);
  const parsed = parseCurl(normalized);

  if (!parsed.url) {
    return {
      ok: false,
      status: 0,
      url: '(missing)',
      method: parsed.method,
      requestPreview: redact(normalized).slice(0, previewLimit),
      responsePreview: '',
      note: 'Could not parse URL from curl block.',
    };
  }

  const headers = { ...parsed.headers };
  if (!Object.keys(headers).some((h) => h.toLowerCase() === 'authorization')) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let body = parsed.data;

  const override = maybeOverrideActionName({ method: parsed.method, url: parsed.url, data: body }, 0);
  body = override.data;

  const requestPreview = redact(
    `curl (simulated)\nMETHOD: ${parsed.method}\nURL: ${parsed.url}\nHEADERS: ${JSON.stringify(
      Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, k.toLowerCase() === 'authorization' ? 'Bearer [REDACTED]' : v]))
    )}\nBODY: ${body ?? ''}`
  ).slice(0, previewLimit);

  let res = await fetch(parsed.url, {
    method: parsed.method,
    headers,
    body: body !== undefined ? body : undefined,
    cache: 'no-store',
  });

  let text = await res.text().catch(() => '');

  if (!res.ok && parsed.method === 'POST' && parsed.url.includes('/api/v2/actions/actions')) {
    const j = tryParseJson(text);
    const msg = String((j as any)?.message || '');
    if (msg.toLowerCase().includes('action name has already been taken')) {
      const override2 = maybeOverrideActionName({ method: parsed.method, url: parsed.url, data: body }, 1);
      body = override2.data;
      res = await fetch(parsed.url, { method: parsed.method, headers, body, cache: 'no-store' });
      text = await res.text().catch(() => '');
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    url: parsed.url,
    method: parsed.method,
    requestPreview,
    responsePreview: redact(text).slice(0, previewLimit),
    overrides: override.override ? { actionName: override.override } : undefined,
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

function patchActionsRuntimeNode14ToNode18(mdx: string, curlBlock: string) {
  // Patch ONLY inside the selected curl block (string match replace), to avoid touching unrelated content.
  if (!curlBlock.includes('/api/v2/actions/actions')) {
    return { mdx, changed: false, replaced: 0, note: 'Selected curl block is not an actions/actions request.' };
  }

  // Replace runtime in JSON body (works regardless of whether endpoint appears before/after JSON).
  let replaced = 0;
  const patchedBlock = curlBlock.replace(/("runtime"\s*:\s*")node14(")/g, (_m, p1, p2) => {
    replaced += 1;
    return `${p1}node18${p2}`;
  });

  if (replaced === 0) {
    return { mdx, changed: false, replaced: 0, note: 'No runtime node14 found inside selected curl block.' };
  }

  const idx = mdx.indexOf(curlBlock);
  if (idx < 0) {
    return { mdx, changed: false, replaced: 0, note: 'Could not locate the curl block text in the file for patching.' };
  }

  const next = mdx.slice(0, idx) + patchedBlock + mdx.slice(idx + curlBlock.length);
  return { mdx: next, changed: true, replaced, note: undefined };
}

export async function POST(req: Request) {
  try {
    const mode = (process.env.MAINTENANCE_MODE || 'vercel').toLowerCase();
    if (mode !== 'local') {
      return NextResponse.json({ ok: false, error: 'Fix endpoint currently supported only in local mode.' }, { status: 400 });
    }

    const body = BodySchema.parse(await req.json());

    const { resolve } = await import('node:path');
    const fs = await import('node:fs/promises');

    const docsRepoPath = requireEnv('MAINTENANCE_DOCS_REPO_PATH');
    const abs = resolve(docsRepoPath, body.filePath);

    const mdx0 = await fs.readFile(abs, 'utf8');
    const curlBlocks0 = extractCurlBlocks(mdx0);
    const target = curlBlocks0[body.curlIndex];
    if (!target) throw new Error(`No curl block at index ${body.curlIndex}. Found ${curlBlocks0.length}.`);

    const { domain, accessToken } = await getMgmtApiToken();

    const before = await executeOneCurl(target, domain, accessToken);

    // Decide if recipe applies (based on response message)
    let reason: string | null = null;
    const errJson = tryParseJson(before.responsePreview);
    if (errJson && typeof errJson.message === 'string') reason = errJson.message;

    if (body.recipe === 'actions-runtime-node14-to-node18') {
      if (!reason || !reason.toLowerCase().includes('runtime not supported')) {
        return NextResponse.json({
          ok: false,
          error: `Recipe not applicable. Response message: ${reason || '(none)'}`,
          before,
        });
      }

      const patched = patchActionsRuntimeNode14ToNode18(mdx0, target.content);
      if (!patched.changed) {
        return NextResponse.json({ ok: false, error: patched.note || 'No changes made', before });
      }

      await fs.writeFile(abs, patched.mdx, 'utf8');

      // Re-extract blocks after patch and re-run the same index.
      const mdx1 = await fs.readFile(abs, 'utf8');
      const curlBlocks1 = extractCurlBlocks(mdx1);
      const target2 = curlBlocks1[body.curlIndex] || target;
      const after = await executeOneCurl(target2, domain, accessToken);

      // Detect created resource id (for actions create)
      let createdActionId: string | null = null;
      const afterJson = tryParseJson(after.responsePreview);
      if (afterJson && typeof afterJson.id === 'string') createdActionId = afterJson.id;

      return NextResponse.json({
        ok: true,
        recipe: body.recipe,
        before,
        patch: { replaced: patched.replaced, summary: `runtime: node14 -> node18 (x${patched.replaced})` },
        after,
        created: { actionId: createdActionId },
      });
    }

    return NextResponse.json({ ok: false, error: 'Unknown recipe', before });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 400 });
  }
}
