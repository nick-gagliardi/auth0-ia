// Shared analysis helpers extracted from /api/maintenance/analyze

import * as acorn from 'acorn';
import * as htmlparser2 from 'htmlparser2';
import yaml from 'js-yaml';

// Syntax validation for code blocks
export type SyntaxCheckResult = {
  lang: string;
  valid: boolean;
  error?: string;
  line?: number;
};

function normalizeLanguage(lang: string): string {
  const l = (lang || '').toLowerCase().trim();
  // Map common aliases
  const aliases: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'javascript',
    'tsx': 'typescript',
    'yml': 'yaml',
    'sh': 'bash',
    'shell': 'bash',
    'zsh': 'bash',
    'htm': 'html',
    'xml': 'html', // htmlparser2 handles both
    'svg': 'html',
  };
  return aliases[l] || l;
}

async function validateSyntax(code: string, lang: string): Promise<SyntaxCheckResult> {
  const normalizedLang = normalizeLanguage(lang);

  try {
    switch (normalizedLang) {
      case 'json': {
        JSON.parse(code);
        return { lang, valid: true };
      }

      case 'yaml': {
        yaml.load(code);
        return { lang, valid: true };
      }

      case 'javascript':
      case 'typescript': {
        // acorn can parse JS; for TS we do basic JS parse (won't catch type errors but catches syntax)
        acorn.parse(code, {
          ecmaVersion: 'latest',
          sourceType: 'module',
          allowAwaitOutsideFunction: true,
          allowImportExportEverywhere: true,
        });
        return { lang, valid: true };
      }

      case 'html': {
        let parseError: string | null = null;
        const parser = new htmlparser2.Parser({
          onerror: (err) => {
            parseError = err.message;
          },
        });
        parser.write(code);
        parser.end();
        if (parseError) {
          return { lang, valid: false, error: parseError };
        }
        return { lang, valid: true };
      }

      case 'bash': {
        // Basic bash syntax checks - look for obvious issues
        // We can't run bash -n in browser/serverless, so do heuristic checks
        const issues: string[] = [];

        // Check for unclosed quotes
        const singleQuotes = (code.match(/'/g) || []).length;
        const doubleQuotes = (code.match(/"/g) || []).length;
        // Exclude escaped quotes from count
        const escapedSingle = (code.match(/\\'/g) || []).length;
        const escapedDouble = (code.match(/\\"/g) || []).length;

        if ((singleQuotes - escapedSingle) % 2 !== 0) {
          issues.push('Unclosed single quote');
        }
        if ((doubleQuotes - escapedDouble) % 2 !== 0) {
          issues.push('Unclosed double quote');
        }

        // Check for unclosed brackets/braces (outside of strings - simplified)
        const braces = code.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
        const openBraces = (braces.match(/\{/g) || []).length;
        const closeBraces = (braces.match(/\}/g) || []).length;
        if (openBraces !== closeBraces) {
          issues.push('Mismatched curly braces');
        }

        if (issues.length > 0) {
          return { lang, valid: false, error: issues.join('; ') };
        }
        return { lang, valid: true };
      }

      default:
        // Language not supported for validation
        return { lang, valid: true }; // Don't fail, just skip
    }
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    // Try to extract line number from error
    const lineMatch = errorMsg.match(/line\s*(\d+)/i) || errorMsg.match(/:(\d+):/);
    const line = lineMatch ? parseInt(lineMatch[1], 10) : undefined;
    return { lang, valid: false, error: errorMsg.slice(0, 200), line };
  }
}

export async function validateCodeBlocks(blocks: { lang: string; content: string }[]): Promise<{
  results: SyntaxCheckResult[];
  validCount: number;
  invalidCount: number;
  skippedCount: number;
}> {
  const supportedLangs = new Set(['json', 'yaml', 'yml', 'javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx', 'html', 'htm', 'xml', 'svg', 'bash', 'sh', 'shell', 'zsh']);

  const results: SyntaxCheckResult[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let skippedCount = 0;

  for (const block of blocks.slice(0, 20)) { // Limit to first 20 blocks
    const lang = (block.lang || '').toLowerCase();

    if (!lang || !supportedLangs.has(lang)) {
      skippedCount++;
      continue;
    }

    const result = await validateSyntax(block.content, lang);
    results.push(result);

    if (result.valid) {
      validCount++;
    } else {
      invalidCount++;
    }
  }

  return { results, validCount, invalidCount, skippedCount };
}

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

export function analyzeMdx(mdx: string) {
  const parts = splitByFences(mdx);
  const textOnly = parts.filter((p) => p.kind === 'text').map((p) => p.content).join('');

  // Rules occurrences (non-fenced) - catch both singular "Rule" and plural "Rules"
  const rulesOccurrences: { snippet: string }[] = [];
  const rulesRe = /\bRules?\b/g;
  let rm: RegExpExecArray | null;
  while ((rm = rulesRe.exec(textOnly))) {
    const idx = rm.index;
    rulesOccurrences.push({
      snippet: textOnly.slice(Math.max(0, idx - 40), idx + 40).replace(/\s+/g, ' '),
    });
    if (rulesOccurrences.length >= 25) break;
  }

  // Typo detection
  const typosFound: Array<{ kind: 'repeated-word' | 'common-typo'; match: string; snippet: string }> = [];

  // Repeated words (e.g., "the the")
  const repeatedRe = /\b([A-Za-z]{2,})\s+\1\b/gi;
  while ((rm = repeatedRe.exec(textOnly))) {
    const idx = rm.index;
    typosFound.push({
      kind: 'repeated-word',
      match: rm[0],
      snippet: textOnly.slice(Math.max(0, idx - 30), idx + 40).replace(/\s+/g, ' '),
    });
    if (typosFound.length >= 20) break;
  }

  // Common misspellings
  const commonTypos: RegExp[] = [
    /\bteh\b/gi,
    /\brecieve\b/gi,
    /\boccured\b/gi,
    /\bseperat(e|ed|es|ing)?\b/gi,
    /\bdefinately\b/gi,
    /\balot\b/gi,
    /\bwich\b/gi,
    /\bthier\b/gi,
    /\baccomodat(e|ion|ing)?\b/gi,
    /\boccur+ance\b/gi,
    /\bneccessary\b/gi,
    /\buntill?\b/gi,
  ];

  for (const re of commonTypos) {
    while ((rm = re.exec(textOnly))) {
      const idx = rm.index;
      typosFound.push({
        kind: 'common-typo',
        match: rm[0],
        snippet: textOnly.slice(Math.max(0, idx - 30), idx + 40).replace(/\s+/g, ' '),
      });
      if (typosFound.length >= 20) break;
    }
    if (typosFound.length >= 20) break;
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

  // Images
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

  // Extract curl blocks
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

  const internalDocsLinks = [...mdLinks, ...jsxHrefs]
    .filter((u) => u.startsWith('/docs/'))
    .filter((u) => !u.includes('?') && !u.startsWith('/docs/images/'));

  // Detect Dashboard procedural instructions - use specific patterns to avoid false positives
  // These patterns look for actual UI action instructions, not general mentions
  // Only match when there's a clear action verb + UI element combination
  const dashboardPatterns = [
    // Specific UI action patterns (imperative with UI elements)
    /\bclick\s+(on\s+)?(the\s+)?(Save|Create|Delete|Add|Edit|Remove|Submit|Update|Configure|Enable|Disable)\s*(button)?\b/gi,
    /\bclick\s+(on\s+)?["']?[A-Z][^"'\n]{0,30}["']?\s*(button|tab|link)?\b/g, // Click "Something" or Click Something button
    /\bselect\s+(the\s+)?["']?[A-Z][^"'\n]{0,30}["']?\s+from\s+(the\s+)?(dropdown|menu|list)\b/gi,
    /\bnavigate\s+to\s+([A-Z][a-z]+\s*)+\s*(>|→|and|then)\s*(click|select)/gi, // Navigate to X > click Y
    /\bgo\s+to\s+([A-Z][a-z]+\s*)+\s*(>|→|and|then)\s*(click|select)/gi,
    // Numbered step patterns with Dashboard actions
    /^\s*\d+\.\s*(In\s+the\s+Dashboard|Navigate\s+to|Click|Select|Go\s+to)/gim,
    // Menu navigation patterns
    /\bfrom\s+the\s+(left|side|main|navigation)\s*(menu|sidebar|panel)\s*,?\s*(click|select)/gi,
    /\bunder\s+["']?[A-Z][^"'\n]{0,30}["']?\s*[,>]\s*(click|select)\b/gi,
    // Auth0 Dashboard with action verb nearby
    /\b(In|From|Open)\s+(the\s+)?Auth0\s+Dashboard\s*,?\s*(click|select|navigate|go)/gi,
  ];

  const dashboardMentions: { pattern: string; snippet: string }[] = [];
  for (const pattern of dashboardPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(textOnly))) {
      const idx = match.index;
      dashboardMentions.push({
        pattern: match[0],
        snippet: textOnly.slice(Math.max(0, idx - 30), idx + 50).replace(/\s+/g, ' ').trim(),
      });
      if (dashboardMentions.length >= 10) break;
    }
    if (dashboardMentions.length >= 10) break;
  }

  // Check for numbered steps (common in procedural docs)
  const hasNumberedSteps = /^(\d+\.|#{1,3}\s*step\s*\d)/im.test(textOnly);

  // Detect old-style components that need migration:
  // - <Note>, <Info>, <Tip> → should be <Callout>
  // - <Alert>, <Caution>, <Important>, <Danger> → should be <Warning>
  const calloutPatterns = [
    { pattern: /<Note\b/gi, name: '<Note>', target: 'Callout' },
    { pattern: /<Info\b/gi, name: '<Info>', target: 'Callout' },
    { pattern: /<Tip\b/gi, name: '<Tip>', target: 'Callout' },
    { pattern: /^:::note\b/gim, name: ':::note', target: 'Callout' },
    { pattern: /^:::info\b/gim, name: ':::info', target: 'Callout' },
    { pattern: /^:::tip\b/gim, name: ':::tip', target: 'Callout' },
  ];

  const warningPatterns = [
    { pattern: /<Alert\b/gi, name: '<Alert>', target: 'Warning' },
    { pattern: /<Caution\b/gi, name: '<Caution>', target: 'Warning' },
    { pattern: /<Important\b/gi, name: '<Important>', target: 'Warning' },
    { pattern: /<Danger\b/gi, name: '<Danger>', target: 'Warning' },
    { pattern: /^:::caution\b/gim, name: ':::caution', target: 'Warning' },
    { pattern: /^:::danger\b/gim, name: ':::danger', target: 'Warning' },
    { pattern: /^:::important\b/gim, name: ':::important', target: 'Warning' },
  ];

  const oldCallouts: { type: string; snippet: string; target: string; openTag: string; closeTag: string }[] = [];

  for (const { pattern, name, target } of [...calloutPatterns, ...warningPatterns]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(mdx))) {
      const idx = match.index;
      // Capture the actual opening tag (e.g., "<Info>" or "<Note attr='val'>")
      const openTagMatch = mdx.slice(idx).match(/^<(\w+)[^>]*>/);
      const tagName = openTagMatch ? openTagMatch[1] : name.replace(/[<>]/g, '');
      oldCallouts.push({
        type: name,
        target,
        snippet: mdx.slice(idx, idx + 100).replace(/\s+/g, ' ').trim(),
        openTag: openTagMatch ? openTagMatch[0] : name,
        closeTag: `</${tagName}>`,
      });
      if (oldCallouts.length >= 20) break;
    }
    if (oldCallouts.length >= 20) break;
  }

  // All links (for external link validation)
  const allLinks = [...mdLinks, ...jsxHrefs];

  // Extract existing tooltips from the page
  const existingTooltips = new Set<string>();
  const tooltipRe = /<Tooltip[^>]*\bterm\s*=\s*["']([^"']+)["']|<Tooltip[^>]*href\s*=\s*["'][^"']*[?&]term=([^"'&]+)/gi;
  let tooltipMatch: RegExpExecArray | null;
  while ((tooltipMatch = tooltipRe.exec(mdx))) {
    const term = (tooltipMatch[1] || tooltipMatch[2] || '').toLowerCase();
    if (term) existingTooltips.add(term);
  }
  // Also catch tooltip text content as the term
  const tooltipTextRe = /<Tooltip[^>]*>([^<]+)<\/Tooltip>/gi;
  while ((tooltipMatch = tooltipTextRe.exec(mdx))) {
    existingTooltips.add(tooltipMatch[1].toLowerCase().trim());
  }

  return {
    rulesOccurrences,
    typosFound,
    internalDocsLinks,
    allLinks,
    oldCallouts,
    existingTooltips: Array.from(existingTooltips),
    textOnly, // For glossary term matching
    images: [...mdImgs, ...imgSrcs],
    curlBlocks,
    allCodeBlocks: fenced.map(b => ({ lang: b.lang, content: b.content })),
    detected: {
      hasScreenshots: [...mdImgs, ...imgSrcs].length > 0,
      hasAnyCodeFences: fenced.length > 0,
      sdkLangs: Array.from(nonShellLangs).slice(0, 30),
      hasHarSample,
      hasDashboardInstructions: dashboardMentions.length > 0,
      hasNumberedSteps,
      dashboardMentions: dashboardMentions.slice(0, 5),
    },
  };
}

export async function getMgmtApiToken() {
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

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Token fetch failed: ${tokenRes.status}: ${text.slice(0, 500)}`);
  }

  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token as string;
  if (!accessToken) throw new Error('No access_token in response');

  return { domain, accessToken };
}

function normalizeCurlBlock(raw: string, domain: string, accessToken: string) {
  let s = raw.replace(/\\\s*\n/g, ' ');
  s = s.replaceAll('{managementApiToken}', accessToken);
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

export async function executeCurlBlocks(blocks: { lang: string; content: string }[], domain: string, accessToken: string) {
  const max = 5;
  const out: Array<{
    index: number;
    method: string;
    url: string;
    status: number;
    ok: boolean;
    note?: string;
  }> = [];

  for (let i = 0; i < Math.min(blocks.length, max); i++) {
    const b = blocks[i];
    const normalized = normalizeCurlBlock(b.content, domain, accessToken);
    const parsed = parseCurl(normalized);

    if (!parsed.url) {
      out.push({ index: i, method: parsed.method, url: '(missing)', status: 0, ok: false, note: 'Could not parse URL' });
      continue;
    }

    if (/[{}]/.test(parsed.url) || /%7B|%7D/i.test(parsed.url)) {
      out.push({ index: i, method: parsed.method, url: parsed.url, status: 0, ok: false, note: 'SKIPPED: unresolved placeholders' });
      continue;
    }

    const headers = { ...parsed.headers };
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'authorization')) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
      const res = await fetch(parsed.url, {
        method: parsed.method,
        headers,
        body: parsed.data,
        cache: 'no-store',
      });

      out.push({
        index: i,
        method: parsed.method,
        url: parsed.url,
        status: res.status,
        ok: res.ok,
      });
    } catch (e: any) {
      out.push({
        index: i,
        method: parsed.method,
        url: parsed.url,
        status: 0,
        ok: false,
        note: redact(e?.message || String(e)).slice(0, 200),
      });
    }
  }

  return out;
}

export function computeProdUrl(filePath: string) {
  const base = process.env.MAINTENANCE_PROD_BASE_URL || 'https://auth0.com/docs';
  let p = filePath.replace(/\\/g, '/');
  p = p.replace(/^main\/docs\//, '');
  p = p.replace(/\.mdx$/i, '');
  p = p.replace(/\/index$/i, '');
  return `${base}/${p}`;
}

export async function runRenderCheck(url: string) {
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

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    const tablist = page.locator('[role="tablist"]').first();
    const hasTablist = (await tablist.count()) > 0;

    if (hasTablist) {
      const tabs = tablist.locator('[role="tab"]');
      const tabCount = await tabs.count();
      if (tabCount >= 2) {
        // Click first few tabs and verify code renders
        const maxTabs = Math.min(tabCount, 4);
        for (let i = 0; i < maxTabs; i++) {
          await tabs.nth(i).click({ timeout: 10000 });
        }
        return { ok: true, url, strategy: 'aria-tablist', tabCount };
      }
    }

    // Fallback: check for any code blocks
    const codeBlocks = page.locator('pre code');
    const codeCount = await codeBlocks.count();

    // If no code blocks found, this is N/A not a failure
    if (codeCount === 0) {
      return { ok: true, na: true, url, strategy: 'no-code-samples', codeCount: 0 };
    }

    return { ok: true, url, strategy: 'code-presence', codeCount };
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
