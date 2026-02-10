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

async function fetchPermalinkSet(req: Request) {
  try {
    const origin = new URL(req.url).origin;
    const base = process.env.NEXT_PUBLIC_INDEX_BASE_URL || '/index';
    const nodesUrl = new URL(`${base.replace(/\/$/, '')}/nodes.json`, origin);
    const nodesRes = await fetch(nodesUrl.toString(), { cache: 'no-store' });
    if (!nodesRes.ok) return null;
    const nodes = (await nodesRes.json()) as Array<{ permalink?: string }>;
    return new Set(nodes.map((n) => n.permalink).filter(Boolean) as string[]);
  } catch {
    return null;
  }
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

  // Lightweight typo checks (heuristic): repeated words + a small set of common misspellings.
  const typosFound: Array<{ kind: 'repeated-word' | 'common-typo'; match: string; snippet: string }> = [];

  const repeatedRe = /\b([A-Za-z]{2,})\s+\1\b/gi;
  while ((rm = repeatedRe.exec(textOnly))) {
    const idx = rm.index;
    typosFound.push({
      kind: 'repeated-word',
      match: rm[0],
      snippet: textOnly.slice(Math.max(0, idx - 40), idx + 40).replace(/\s+/g, ' '),
    });
    if (typosFound.length >= 25) break;
  }

  const commonTypoRes: RegExp[] = [
    /\bteh\b/gi,
    /\brecieve\b/gi,
    /\boccured\b/gi,
    /\bseperat(e|ed|es|ing)?\b/gi,
    /\bdefinately\b/gi,
    /\balot\b/gi,
    /\bwich\b/gi,
  ];

  for (const re of commonTypoRes) {
    while ((rm = re.exec(textOnly))) {
      const idx = rm.index;
      typosFound.push({
        kind: 'common-typo',
        match: rm[0],
        snippet: textOnly.slice(Math.max(0, idx - 40), idx + 40).replace(/\s+/g, ' '),
      });
      if (typosFound.length >= 25) break;
    }
    if (typosFound.length >= 25) break;
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

  const nonShellLangs = new Set(
    fenced
      .map((b) => (b.lang || '').toLowerCase())
      .filter(Boolean)
      .filter((l) => !['curl', 'bash', 'sh', 'shell', 'zsh'].includes(l))
  );

  const hasHarSample = fenced.some((b) => {
    const lang = (b.lang || '').toLowerCase();
    if (lang.includes('har')) return true;
    return /\"log\"\s*:\s*\{/.test(b.content);
  });

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
        if (ln.match(/^\s*#{1,6}\s+/)) break;
        // stop at fence start to avoid swallowing multi-language blocks
        if (ln.match(/^\s*(```|~~~)\s*/)) break;
        buf.push(ln);
        i += 1;
      }
      curlBlocks.push({ lang: 'unfenced', content: buf.join('\n') });
      if (curlBlocks.length >= 20) break;
    }
  }

  const internalDocsLinksAll = [...mdLinks, ...jsxHrefs].filter((u) => u.startsWith('/docs/'));
  const internalDocsLinks = internalDocsLinksAll.filter((u) => {
    // Exclude non-page routes from broken-link validation.
    if (u.includes('?')) return false;
    if (u.startsWith('/docs/images/')) return false;
    return true;
  });

  return {
    rulesOccurrences,
    typosFound,
    linkCount: mdLinks.length + jsxHrefs.length,
    internalDocsLinks,
    internalDocsLinksAll,
    images: [...mdImgs, ...imgSrcs],
    fenceLangs,
    curlBlocks,
    detected: {
      hasScreenshots: [...mdImgs, ...imgSrcs].length > 0,
      hasAnyCodeFences: fenced.length > 0,
      sdkLangs: Array.from(nonShellLangs).slice(0, 30),
      hasHarSample,
    },
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

    // Skip execution if the URL includes unresolved placeholders.
    if (/[{}]/.test(parsed.url) || /%7B|%7D/i.test(parsed.url)) {
      out.push({
        index: i,
        method: parsed.method,
        url: parsed.url,
        status: 0,
        ok: false,
        requestPreview: redact(normalized).slice(0, previewLimit),
        note: 'SKIPPED: unresolved placeholders in URL',
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

function computeProdUrl(filePath: string) {
  const base = process.env.MAINTENANCE_PROD_BASE_URL || 'https://auth0.com/docs';
  let p = filePath.replace(/\\/g, '/');
  p = p.replace(/^main\/docs\//, '');
  p = p.replace(/\.mdx$/i, '');
  p = p.replace(/\/index$/i, '');
  return `${base}/${p}`;
}

async function runRenderCheck(url: string) {
  if ((process.env.MAINTENANCE_PLAYWRIGHT || '').toLowerCase() === 'off') {
    return { ok: false, skipped: true, reason: 'MAINTENANCE_PLAYWRIGHT=off' };
  }

  const { chromium } = await import('playwright');
  const chromePath = process.env.MAINTENANCE_CHROME_PATH;
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath || undefined,
  });
  const page = await browser.newPage();

  const expected = ['cURL', 'C#', 'Go', 'Java', 'Node.JS', 'Obj-C', 'PHP', 'Python', 'Ruby', 'Swift'];

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Strategy A: ARIA tablist
    const tablist = page.locator('[role="tablist"]').first();
    const hasTablist = (await tablist.count()) > 0;

    let foundLabels: string[] = [];
    let clickResults: Array<{ label: string; ok: boolean; note?: string }> = [];

    if (hasTablist) {
      const tabs = tablist.locator('[role="tab"]');
      const tabCount = await tabs.count();
      if (tabCount < 2) {
        return { ok: false, url, error: `Tablist found but only ${tabCount} tab(s).` };
      }

      const maxTabs = Math.min(tabCount, 12);
      for (let i = 0; i < maxTabs; i++) {
        const t = tabs.nth(i);
        const label = (await t.innerText()).trim();
        foundLabels.push(label);
        await t.click({ timeout: 10000 });
        const code = page.locator('pre code').filter({ hasText: /\S/ }).first();
        const visible = await code.isVisible().catch(() => false);
        clickResults.push({ label, ok: visible, note: visible ? undefined : 'No visible non-empty code block found' });
      }

      const missingExpected = expected.filter((e) => !foundLabels.includes(e));
      const pass = clickResults.every((r) => r.ok);
      return {
        ok: pass,
        url,
        strategy: 'aria-tablist',
        tabCount,
        foundLabels,
        missingExpected,
        warning: missingExpected.length ? `Missing expected tabs: ${missingExpected.join(', ')}` : null,
        clickResults,
      };
    }

    // Strategy B: text-based language switcher (auth0.com sometimes doesn't use role=tablist)
    // Find visible language labels on the page.
    const found: string[] = [];
    for (const label of expected) {
      const loc = page.getByText(label, { exact: true }).first();
      const n = await loc.count();
      if (n > 0) {
        const vis = await loc.isVisible().catch(() => false);
        if (vis) found.push(label);
      }
    }

    if (found.length < 2) {
      return { ok: false, url, error: 'No tablist found on page (and fewer than 2 expected language labels visible).' };
    }

    // Click through a few labels and ensure code exists.
    const max = Math.min(found.length, 8);
    for (let i = 0; i < max; i++) {
      const label = found[i];
      const loc = page.getByText(label, { exact: true }).first();
      await loc.click({ timeout: 10000 }).catch(() => {});
      const code = page.locator('pre code').filter({ hasText: /\S/ }).first();
      const visible = await code.isVisible().catch(() => false);
      clickResults.push({ label, ok: visible, note: visible ? undefined : 'No visible non-empty code block found after click' });
      foundLabels.push(label);
    }

    const missingExpected = expected.filter((e) => !foundLabels.includes(e));
    const pass = clickResults.every((r) => r.ok);

    return {
      ok: pass,
      url,
      strategy: 'text-labels',
      tabCount: found.length,
      foundLabels,
      missingExpected,
      warning: missingExpected.length ? `Missing expected tabs: ${missingExpected.join(', ')}` : null,
      clickResults,
    };
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
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

    const productionUrl = computeProdUrl(body.filePath);
    const renderCheck = await runRenderCheck(productionUrl).catch((e: any) => ({ ok: false, url: productionUrl, error: e?.message || String(e) }));

    const permalinkSet = await fetchPermalinkSet(req);
    const brokenInternalDocsLinks = permalinkSet
      ? analysis.internalDocsLinks.filter((u: string) => !permalinkSet.has(u))
      : null;

    let curlSmoke: any = { ok: false, error: 'Not run' };
    let curlExec: any = [];

    try {
      const { domain, accessToken } = await getMgmtApiToken();
      curlSmoke = await runCurlSmoke(domain, accessToken);
      curlExec = await executeCurlBlocks(analysis.curlBlocks, domain, accessToken);
    } catch (e: any) {
      curlSmoke = { ok: false, error: e?.message || String(e) };
    }

    // Technical correctness checklist auto-evaluation
    const hasCurl = analysis.curlBlocks.length > 0;
    const curlAnySkipped = Array.isArray(curlExec) && curlExec.some((x: any) => typeof x?.note === 'string' && x.note.startsWith('SKIPPED:'));
    const curlAllOk = hasCurl && Array.isArray(curlExec) && curlExec.length > 0 && curlExec.every((x: any) => x.ok);

    const hasSdk = (analysis.detected?.sdkLangs || []).length > 0;
    const hasHar = Boolean(analysis.detected?.hasHarSample);
    const hasScreens = Boolean(analysis.detected?.hasScreenshots);

    const checklistAuto = {
      codeSamples: {
        curl: hasCurl ? (curlAllOk ? 'PASS' : curlAnySkipped ? 'MANUAL' : 'FAIL') : 'NA',
        tabRendering: renderCheck && (renderCheck as any).ok ? 'PASS' : (renderCheck as any)?.skipped ? 'MANUAL' : 'FAIL',
        tabRenderingWarning: (renderCheck as any)?.warning || null,
        sdk: hasSdk ? 'MANUAL' : 'NA',
        har: hasHar ? 'MANUAL' : 'NA',
        missingSamples: analysis.detected?.hasAnyCodeFences || hasCurl ? 'MANUAL' : 'NA',
        removeObjcSwift: (analysis.detected?.sdkLangs || []).some((l: string) => ['swift', 'objc', 'objective-c', 'objectivec'].includes(l))
          ? 'MANUAL'
          : 'NA',
      },
      dashboard: {
        screenshots: hasScreens ? 'MANUAL' : 'NA',
        screenshotsHiRes: hasScreens ? 'MANUAL' : 'NA',
        stepsWork: hasScreens ? 'MANUAL' : 'NA',
      },
      housekeeping: {
        rulesToActions: analysis.rulesOccurrences.length === 0 ? 'PASS' : 'FAIL',
        brokenLinks: brokenInternalDocsLinks === null ? (analysis.internalDocsLinks.length ? 'MANUAL' : 'NA') : brokenInternalDocsLinks.length === 0 ? 'PASS' : 'FAIL',
        typos: (analysis as any).typosFound?.length ? 'FAIL' : 'PASS',
      },
      evidence: {
        rulesMentions: analysis.rulesOccurrences.slice(0, 5),
        brokenInternalDocsLinks: brokenInternalDocsLinks ? brokenInternalDocsLinks.slice(0, 25) : null,
        typosFound: (analysis as any).typosFound?.slice(0, 10) || [],
        screenshotsFound: hasScreens ? analysis.images.slice(0, 10) : [],
      },
    };

    return NextResponse.json({ ok: true, analysis: { ...analysis, brokenInternalDocsLinks, productionUrl }, renderCheck, curlSmoke, curlExec, checklistAuto });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 400 });
  }
}
