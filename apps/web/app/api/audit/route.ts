import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { AuditResult, AuditCheckItem, AuditCheckStatus, AuditSuggestion, DocNode } from '@/types';

const BodySchema = z.object({
  input: z.string().min(1),
});

// Convert file path to production URL
function filePathToUrl(filePath: string): string {
  const base = process.env.MAINTENANCE_PROD_BASE_URL || 'https://auth0.com/docs';
  let p = filePath.trim();
  // Remove main/docs/ prefix
  p = p.replace(/^main\/docs\//, '');
  // Remove .mdx or .md extension
  p = p.replace(/\.mdx?$/i, '');
  // Remove /index suffix
  p = p.replace(/\/index$/i, '');
  return `${base}/${p}`;
}

// Detect if input is a file path or URL
function parseInput(input: string): { type: 'url' | 'filepath'; url: string; filePath?: string } {
  const trimmed = input.trim();

  // Check if it's a URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { type: 'url', url: trimmed };
  }

  // Check if it looks like a file path (contains .md or .mdx, or starts with main/)
  if (trimmed.includes('.md') || trimmed.startsWith('main/')) {
    const url = filePathToUrl(trimmed);
    return { type: 'filepath', url, filePath: trimmed };
  }

  // Assume it's a partial path like "get-started/foo"
  const url = filePathToUrl(trimmed);
  return { type: 'filepath', url, filePath: `main/docs/${trimmed}.mdx` };
}

// Resolve production URL to file path
async function resolveUrlToFilePath(url: string, req: Request): Promise<{ filePath: string; title?: string } | null> {
  try {
    const parsed = new URL(url);

    // Must be auth0.com/docs
    if (!parsed.hostname.endsWith('auth0.com')) {
      return null;
    }

    // Extract path after /docs/
    const match = parsed.pathname.match(/^\/docs\/(.+)/);
    if (!match) {
      // Root docs page
      if (parsed.pathname === '/docs' || parsed.pathname === '/docs/') {
        return { filePath: 'main/docs/index.mdx', title: 'Documentation Home' };
      }
      return null;
    }

    let docPath = match[1].replace(/\/$/, ''); // Remove trailing slash

    // Fetch nodes.json to find matching file
    const origin = new URL(req.url).origin;
    const base = process.env.NEXT_PUBLIC_INDEX_BASE_URL || '/index';
    const nodesUrl = new URL(`${base.replace(/\/$/, '')}/nodes.json`, origin);
    const nodesRes = await fetch(nodesUrl.toString(), { cache: 'no-store' });

    if (!nodesRes.ok) {
      return null;
    }

    const nodes = (await nodesRes.json()) as DocNode[];

    // Try exact match: main/docs/{path}.mdx
    const exactPath = `main/docs/${docPath}.mdx`;
    const exactMatch = nodes.find(n => n.filePath === exactPath);
    if (exactMatch) {
      return { filePath: exactMatch.filePath, title: exactMatch.title };
    }

    // Try index page: main/docs/{path}/index.mdx
    const indexPath = `main/docs/${docPath}/index.mdx`;
    const indexMatch = nodes.find(n => n.filePath === indexPath);
    if (indexMatch) {
      return { filePath: indexMatch.filePath, title: indexMatch.title };
    }

    // Try without .mdx extension variations
    const mdMatch = nodes.find(n => n.filePath === `main/docs/${docPath}.md`);
    if (mdMatch) {
      return { filePath: mdMatch.filePath, title: mdMatch.title };
    }

    return null;
  } catch {
    return null;
  }
}

// Fetch auth0_lint data
async function fetchLintData(req: Request): Promise<Map<string, any[]> | null> {
  try {
    const origin = new URL(req.url).origin;
    const base = process.env.NEXT_PUBLIC_INDEX_BASE_URL || '/index';
    const lintUrl = new URL(`${base.replace(/\/$/, '')}/auth0_lint.json`, origin);
    const res = await fetch(lintUrl.toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return new Map(Object.entries(data.byPageId || {}));
  } catch {
    return null;
  }
}

// Fetch permalinks for broken link check
async function fetchPermalinkSet(req: Request): Promise<Set<string> | null> {
  try {
    const origin = new URL(req.url).origin;
    const base = process.env.NEXT_PUBLIC_INDEX_BASE_URL || '/index';
    const nodesUrl = new URL(`${base.replace(/\/$/, '')}/nodes.json`, origin);
    const res = await fetch(nodesUrl.toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const nodes = (await res.json()) as DocNode[];

    // Build set of valid doc paths
    const paths = new Set<string>();
    for (const n of nodes) {
      if (n.type !== 'page') continue;
      // Convert filePath to /docs/ path
      let p = n.filePath.replace(/^main\/docs\//, '/docs/');
      p = p.replace(/\.mdx?$/, '');
      p = p.replace(/\/index$/, '');
      paths.add(p);
      if (n.permalink) paths.add(n.permalink);
    }
    return paths;
  } catch {
    return null;
  }
}

// Fetch redirects index for checking outdated links
async function fetchRedirectsMap(req: Request): Promise<Map<string, string> | null> {
  try {
    const origin = new URL(req.url).origin;
    const base = process.env.NEXT_PUBLIC_INDEX_BASE_URL || '/index';
    const redirectsUrl = new URL(`${base.replace(/\/$/, '')}/redirects.json`, origin);
    const res = await fetch(redirectsUrl.toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();

    // Build map of source -> destination
    const redirects = new Map<string, string>();
    for (const r of data.redirects || []) {
      // Normalize paths to match link format
      const source = r.source.startsWith('/docs') ? r.source : `/docs${r.source}`;
      redirects.set(source, r.destination);
    }
    return redirects;
  } catch {
    return null;
  }
}

function createCheck(id: string, label: string, status: AuditCheckStatus, details?: string, evidence?: any): AuditCheckItem {
  return { id, label, status, details, evidence };
}

// Load glossary terms from the glossary.mdx file
async function loadGlossaryTerms(): Promise<Map<string, string> | null> {
  const docsRepoPath = process.env.MAINTENANCE_DOCS_REPO_PATH;
  if (!docsRepoPath) return null;

  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const glossaryPath = path.join(docsRepoPath, 'main/docs/glossary.mdx');
    const content = await fs.readFile(glossaryPath, 'utf-8');

    // Parse term definitions from the GlossaryPage component
    const terms = new Map<string, string>();
    const termRe = /term:\s*["']([^"']+)["']/g;
    let match;
    while ((match = termRe.exec(content))) {
      const term = match[1];
      terms.set(term.toLowerCase(), term);
    }
    return terms;
  } catch {
    return null;
  }
}

// Find glossary terms in text that don't have tooltips
function findMissingTooltips(
  text: string,
  glossaryTerms: Map<string, string>,
  existingTooltips: string[]
): { term: string; originalTerm: string }[] {
  const missing: { term: string; originalTerm: string }[] = [];
  const tooltipSet = new Set(existingTooltips.map(t => t.toLowerCase()));
  const foundTerms = new Set<string>();

  for (const [termLower, originalTerm] of glossaryTerms) {
    // Skip if already has tooltip
    if (tooltipSet.has(termLower)) continue;

    // Skip very short/common terms that would cause too many false positives
    if (termLower.length < 4) continue;
    if (['the', 'and', 'for', 'with', 'from', 'that', 'this', 'beta'].includes(termLower)) continue;

    // Check if term appears in text (case-insensitive, whole word)
    const regex = new RegExp(`\\b${originalTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(text) && !foundTerms.has(termLower)) {
      foundTerms.add(termLower);
      missing.push({ term: termLower, originalTerm });
    }

    if (missing.length >= 15) break;
  }

  return missing;
}

// Slugify a heading to match how MDX/markdown generates anchor IDs
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Trim hyphens from ends
}

// Extract anchor IDs from MDX content (headings and explicit ids)
function extractAnchorsFromMdx(mdx: string): Set<string> {
  const anchors = new Set<string>();

  // Match markdown headings: ## Heading Text
  const headingRe = /^#{1,6}\s+(.+)$/gm;
  let match;
  while ((match = headingRe.exec(mdx))) {
    const headingText = match[1].replace(/\{#[\w-]+\}$/, '').trim(); // Remove explicit {#id}
    anchors.add(slugify(headingText));

    // Check for explicit {#custom-id} at end of heading
    const explicitId = match[1].match(/\{#([\w-]+)\}$/);
    if (explicitId) {
      anchors.add(explicitId[1]);
    }
  }

  // Match explicit id attributes: id="something" or id={'something'}
  const idAttrRe = /\bid\s*=\s*["'{]([^"'}]+)["'}]/g;
  while ((match = idAttrRe.exec(mdx))) {
    anchors.add(match[1]);
  }

  // Match HTML anchor names: <a name="something">
  const anchorNameRe = /<a\s+name\s*=\s*["']([^"']+)["']/gi;
  while ((match = anchorNameRe.exec(mdx))) {
    anchors.add(match[1]);
  }

  return anchors;
}

// Validate external links by making HEAD requests
async function validateExternalLinks(links: string[]): Promise<{ broken: string[]; checked: number }> {
  const broken: string[] = [];
  const checked = new Set<string>();
  const timeout = 5000; // 5 second timeout per request
  const maxLinks = 20; // Limit to avoid long waits
  const delayMs = 100; // Small delay between requests

  // Known-good domains that block automated requests or require auth
  const skipDomains = [
    'manage.auth0.com',
    'auth0.com',
    'login.auth0.com',
    'cdn.auth0.com',
    'marketplace.auth0.com',
    'community.auth0.com',
    'support.auth0.com',
    'okta.com',
    'localhost',
    '127.0.0.1',
  ];

  // Filter to unique external URLs (http/https, not auth0.com/docs, not in skip list)
  const externalLinks = links
    .filter(u => /^https?:\/\//.test(u))
    .filter(u => !u.includes('auth0.com/docs'))
    .filter(u => {
      try {
        const host = new URL(u).hostname;
        return !skipDomains.some(d => host === d || host.endsWith('.' + d));
      } catch {
        return false;
      }
    })
    .filter(u => !checked.has(u))
    .slice(0, maxLinks);

  for (const url of externalLinks) {
    checked.add(url);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Auth0-Docs-Audit/1.0',
        },
      });

      clearTimeout(timeoutId);

      // Some sites block HEAD, try GET if we get 405
      if (res.status === 405) {
        const getRes = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(timeout),
          redirect: 'follow',
          headers: {
            'User-Agent': 'Auth0-Docs-Audit/1.0',
          },
        });
        if (!getRes.ok && getRes.status !== 403) {
          broken.push(`${url} (${getRes.status})`);
        }
      } else if (!res.ok && res.status !== 403) {
        // 403 often means bot protection, not actually broken
        broken.push(`${url} (${res.status})`);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        broken.push(`${url} (timeout)`);
      } else {
        broken.push(`${url} (${e?.message || 'error'})`);
      }
    }

    // Small delay to be polite
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return { broken, checked: checked.size };
}

// Validate internal links including anchor validation and redirect detection
async function validateInternalLinks(
  links: string[],
  permalinkSet: Set<string>,
  redirectsMap: Map<string, string> | null
): Promise<{ broken: string[]; redirected: { link: string; destination: string }[] }> {
  const docsRepoPath = process.env.MAINTENANCE_DOCS_REPO_PATH;
  const broken: string[] = [];
  const redirected: { link: string; destination: string }[] = [];
  const anchorCache = new Map<string, Set<string>>();

  for (const link of links) {
    const [basePath, anchor] = link.split('#');

    // First check if base path exists
    if (!permalinkSet.has(basePath)) {
      // Check if it's a redirect
      if (redirectsMap?.has(basePath)) {
        redirected.push({ link, destination: redirectsMap.get(basePath)! });
      } else {
        broken.push(link);
      }
      continue;
    }

    // If there's an anchor and we have the docs repo, validate it
    if (anchor && docsRepoPath) {
      try {
        // Convert /docs/path to file path
        const relativePath = basePath.replace(/^\/docs\//, '');

        // Try different file path patterns
        const possiblePaths = [
          `main/docs/${relativePath}.mdx`,
          `main/docs/${relativePath}/index.mdx`,
          `main/docs/${relativePath}.md`,
        ];

        let anchors = anchorCache.get(basePath);

        if (!anchors) {
          const fs = await import('fs/promises');
          const path = await import('path');

          for (const relPath of possiblePaths) {
            const fullPath = path.join(docsRepoPath, relPath);
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              anchors = extractAnchorsFromMdx(content);
              anchorCache.set(basePath, anchors);
              break;
            } catch {
              // File doesn't exist, try next
            }
          }
        }

        if (anchors && !anchors.has(anchor)) {
          broken.push(link);
        }
      } catch {
        // If we can't read the file, don't flag as broken
      }
    }
  }

  return { broken, redirected };
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const parsed = parseInput(body.input);
    const url = parsed.url;

    // Resolve to file path - either from URL or use provided file path
    let resolved: { filePath: string; title?: string } | null = null;

    if (parsed.type === 'filepath' && parsed.filePath) {
      // Direct file path provided - normalize it
      let fp = parsed.filePath;
      if (!fp.startsWith('main/')) {
        fp = `main/docs/${fp}`;
      }
      if (!fp.endsWith('.mdx') && !fp.endsWith('.md')) {
        fp = `${fp}.mdx`;
      }
      resolved = { filePath: fp };
    } else {
      // URL provided - resolve to file path
      resolved = await resolveUrlToFilePath(url, req);
    }

    if (!resolved) {
      return NextResponse.json({
        ok: false,
        error: 'Could not resolve input to a docs page. Provide a valid URL or file path.',
        url,
        checkedAt: new Date().toISOString(),
        checks: [],
        summary: { pass: 0, fail: 0, warn: 0, na: 0, manual: 0 },
      } satisfies AuditResult);
    }

    const { filePath, title } = resolved;

    // Check if we're in local mode (required for full analysis)
    const mode = (process.env.MAINTENANCE_MODE || 'vercel').toLowerCase();

    const checks: AuditCheckItem[] = [];
    const suggestions: AuditSuggestion[] = [];
    let analysis: any = null;
    let renderCheck: any = null;
    let curlExec: any[] = [];

    if (mode === 'local') {
      // Full analysis using local file system
      const { resolve } = await import('node:path');
      const fs = await import('node:fs/promises');

      const docsRepoPath = process.env.MAINTENANCE_DOCS_REPO_PATH;
      if (!docsRepoPath) {
        return NextResponse.json({
          ok: false,
          error: 'MAINTENANCE_DOCS_REPO_PATH not configured for local mode',
          url,
          filePath,
          checkedAt: new Date().toISOString(),
          checks: [],
          summary: { pass: 0, fail: 0, warn: 0, na: 0, manual: 0 },
        } satisfies AuditResult);
      }

      const abs = resolve(docsRepoPath, filePath);
      let mdx: string;
      try {
        mdx = await fs.readFile(abs, 'utf8');
      } catch {
        return NextResponse.json({
          ok: false,
          error: `File not found in local repo: ${filePath}`,
          url,
          filePath,
          checkedAt: new Date().toISOString(),
          checks: [],
          summary: { pass: 0, fail: 0, warn: 0, na: 0, manual: 0 },
        } satisfies AuditResult);
      }

      // Parse MDX content
      const { analyzeMdx, executeCurlBlocks, getMgmtApiToken, runRenderCheck, computeProdUrl } = await import('./analyze-helpers');
      analysis = analyzeMdx(mdx);

      // Broken links check - validate both base paths and anchors
      const permalinkSet = await fetchPermalinkSet(req);
      const redirectsMap = await fetchRedirectsMap(req);
      const linkValidation = permalinkSet
        ? await validateInternalLinks(analysis.internalDocsLinks, permalinkSet, redirectsMap)
        : null;

      // cURL execution
      try {
        const { domain, accessToken } = await getMgmtApiToken();
        curlExec = await executeCurlBlocks(analysis.curlBlocks, domain, accessToken);
      } catch {
        // Token failed, skip curl execution
      }

      // Render check (Playwright)
      const prodUrl = computeProdUrl(filePath);
      try {
        renderCheck = await runRenderCheck(prodUrl);
      } catch (e: any) {
        renderCheck = { ok: false, error: e?.message || String(e) };
      }

      // Build checklist
      const hasCurl = analysis.curlBlocks.length > 0;
      const curlAllOk = hasCurl && curlExec.length > 0 && curlExec.every((x: any) => x.ok);
      const curlAnySkipped = curlExec.some((x: any) => x.note?.startsWith('SKIPPED:'));

      // Code Samples
      checks.push(createCheck(
        'curl-work',
        'cURL samples work',
        hasCurl ? (curlAllOk ? 'PASS' : curlAnySkipped ? 'WARN' : 'FAIL') : 'NA',
        hasCurl ? `${curlExec.filter((x: any) => x.ok).length}/${curlExec.length} executed successfully` : 'No cURL samples found',
        curlExec.length ? curlExec.slice(0, 5) : undefined
      ));

      checks.push(createCheck(
        'sdk-samples',
        'SDK samples present',
        analysis.detected.sdkLangs.length > 0 ? 'MANUAL' : 'NA',
        analysis.detected.sdkLangs.length > 0 ? `Found: ${analysis.detected.sdkLangs.join(', ')}` : 'No SDK samples detected',
        analysis.detected.sdkLangs
      ));

      // Code syntax validation
      const { validateCodeBlocks } = await import('./analyze-helpers');
      const syntaxResults = await validateCodeBlocks(analysis.allCodeBlocks || []);

      let syntaxStatus: AuditCheckStatus = 'NA';
      let syntaxDetails = 'No code blocks to validate';

      if (syntaxResults.validCount + syntaxResults.invalidCount > 0) {
        if (syntaxResults.invalidCount === 0) {
          syntaxStatus = 'PASS';
          syntaxDetails = `${syntaxResults.validCount} code block(s) validated successfully`;
          if (syntaxResults.skippedCount > 0) {
            syntaxDetails += ` (${syntaxResults.skippedCount} skipped - unsupported language)`;
          }
        } else {
          syntaxStatus = 'FAIL';
          syntaxDetails = `${syntaxResults.invalidCount} syntax error(s) found in ${syntaxResults.validCount + syntaxResults.invalidCount} blocks`;
        }
      } else if (syntaxResults.skippedCount > 0) {
        syntaxStatus = 'MANUAL';
        syntaxDetails = `${syntaxResults.skippedCount} code block(s) need manual review (unsupported languages)`;
      }

      checks.push(createCheck(
        'code-syntax',
        'Code samples have valid syntax',
        syntaxStatus,
        syntaxDetails,
        syntaxResults.results.filter(r => !r.valid).slice(0, 10)
      ));

      checks.push(createCheck(
        'har-samples',
        'HAR samples render',
        analysis.detected.hasHarSample ? 'MANUAL' : 'NA',
        analysis.detected.hasHarSample ? 'HAR sample detected - verify rendering manually' : 'No HAR samples found'
      ));

      // Screenshots
      checks.push(createCheck(
        'screenshots-present',
        'Screenshots present',
        analysis.detected.hasScreenshots ? 'MANUAL' : 'NA',
        analysis.detected.hasScreenshots ? `${analysis.images.length} image(s) found - verify accuracy` : 'No screenshots found',
        analysis.images.slice(0, 10)
      ));

      // Dashboard procedural instructions
      const hasDashboard = analysis.detected.hasDashboardInstructions;
      checks.push(createCheck(
        'dashboard-instructions',
        'Dashboard instructions work',
        hasDashboard ? 'MANUAL' : 'NA',
        hasDashboard
          ? `Dashboard instructions detected - verify steps work in Auth0 Dashboard`
          : 'No Dashboard procedural instructions found',
        hasDashboard ? analysis.detected.dashboardMentions : undefined
      ));

      // Broken Internal Links
      const brokenLinks = linkValidation?.broken || [];
      const redirectedLinks = linkValidation?.redirected || [];

      checks.push(createCheck(
        'broken-links',
        'No broken internal links',
        linkValidation === null ? 'MANUAL' : (brokenLinks.length === 0 ? 'PASS' : 'FAIL'),
        linkValidation === null ? 'Could not verify links' : (brokenLinks.length === 0 ? 'All internal links valid' : `${brokenLinks.length} broken internal link(s)`),
        brokenLinks.length > 0 ? brokenLinks.slice(0, 10) : undefined
      ));

      // Redirected Links (outdated but still working)
      checks.push(createCheck(
        'redirected-links',
        'No outdated internal links',
        linkValidation === null ? 'MANUAL' : (redirectedLinks.length === 0 ? 'PASS' : 'WARN'),
        linkValidation === null
          ? 'Could not verify links'
          : (redirectedLinks.length === 0
              ? 'All internal links are up to date'
              : `${redirectedLinks.length} link(s) use outdated URLs (redirects)`),
        redirectedLinks.length > 0
          ? redirectedLinks.slice(0, 10).map(r => `${r.link} → ${r.destination}`)
          : undefined
      ));

      // External Links
      const externalLinkResult = await validateExternalLinks(analysis.allLinks || []);
      checks.push(createCheck(
        'external-links',
        'External links resolve',
        externalLinkResult.checked === 0 ? 'NA' : (externalLinkResult.broken.length === 0 ? 'PASS' : 'FAIL'),
        externalLinkResult.checked === 0
          ? 'No external links found'
          : (externalLinkResult.broken.length === 0
              ? `${externalLinkResult.checked} external link(s) verified`
              : `${externalLinkResult.broken.length} broken external link(s)`),
        externalLinkResult.broken.length > 0 ? externalLinkResult.broken.slice(0, 10) : undefined
      ));

      // Rules vs Actions
      checks.push(createCheck(
        'rules-actions',
        'Rules → Actions migration',
        analysis.rulesOccurrences.length === 0 ? 'PASS' : 'FAIL',
        analysis.rulesOccurrences.length === 0 ? 'No "Rules" references found' : `${analysis.rulesOccurrences.length} "Rules" reference(s) need migration`,
        analysis.rulesOccurrences.slice(0, 5)
      ));

      // Typos (repeated words)
      const typoCount = analysis.typosFound?.length || 0;
      checks.push(createCheck(
        'typos',
        'No typos detected',
        typoCount === 0 ? 'PASS' : 'FAIL',
        typoCount === 0 ? 'No typos or repeated words found' : `${typoCount} potential typo(s) found`,
        typoCount > 0 ? analysis.typosFound.slice(0, 10) : undefined
      ));

      // Generate typo suggestions
      if (analysis.typosFound) {
        const repeatedWordRe = /\b([A-Za-z]{2,})\s+\1\b/gi;
        const lines = mdx.split('\n');
        let match;
        while ((match = repeatedWordRe.exec(mdx)) !== null) {
          const beforeMatch = mdx.slice(0, match.index);
          const lineNum = beforeMatch.split('\n').length;
          const originalLine = lines[lineNum - 1] || '';
          const suggestion = originalLine.replace(match[0], match[1]);

          suggestions.push({
            id: `typo-${suggestions.length}`,
            type: 'typo',
            description: `Remove repeated word "${match[1]}"`,
            line: lineNum,
            original: originalLine,
            suggestion,
            context: `"${match[0]}" → "${match[1]}"`,
          });
        }
      }

      // Heading case check (H2+ should use sentence case)
      const headingCaseIssues: { heading: string; suggestion: string; line: number }[] = [];
      const headingRe = /^(#{2,6})\s+(.+)$/gm;
      const mdxLines = mdx.split('\n');
      let headingMatch;
      while ((headingMatch = headingRe.exec(mdx)) !== null) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        const beforeMatch = mdx.slice(0, headingMatch.index);
        const lineNum = beforeMatch.split('\n').length;

        // Check for title case (multiple capitalized words that aren't proper nouns)
        const words = text.split(/\s+/);
        const properNouns = new Set([
          'Auth0', 'OAuth', 'OIDC', 'OpenID', 'SAML', 'SCIM', 'LDAP',
          'API', 'SDK', 'CLI', 'SSO', 'JWT', 'JWK', 'JWE', 'JWS', 'MFA', 'URL', 'URI',
          'ID', 'Token', 'Tokens', 'Access', 'Refresh', 'Bearer',
          'Authorization', 'Authentication', 'Identity', 'Credential', 'Credentials',
          'Control', 'Management', 'Provider', 'Protocol',
          'RBAC', 'FGA', 'M2M', 'B2B', 'B2C', 'CIAM', 'IAM', 'IdP', 'SP',
          'Dashboard', 'Actions', 'Rules', 'Hooks', 'Flows', 'Forms',
          'Connections', 'Organizations', 'Tenants', 'Applications',
          'JavaScript', 'TypeScript', 'Node', 'React', 'Angular', 'Vue',
          'iOS', 'Android', 'macOS', 'Windows', 'Linux',
          'AWS', 'Azure', 'GCP', 'Okta', 'Microsoft', 'Google', 'GitHub',
          'Active', 'Directory', 'Entra', 'Internet', 'Web',
        ]);

        const isProperNoun = (w: string) => {
          if (properNouns.has(w)) return true;
          if (/^[A-Z]{2,}$/.test(w)) return true;
          if (/^\([A-Z]{2,}\)$/.test(w)) return true;
          if (w.includes('-')) {
            return w.split('-').some(part => properNouns.has(part) || /^[A-Z]{2,}$/.test(part));
          }
          return false;
        };

        const capitalizedWords = words.filter((w, i) =>
          i > 0 && /^[A-Z]/.test(w) && !isProperNoun(w)
        );

        if (capitalizedWords.length > 0) {
          const sentenceCase = words.map((w, i) => {
            if (i === 0) return w.charAt(0).toUpperCase() + w.slice(1);
            if (isProperNoun(w)) return w;
            return w.toLowerCase();
          }).join(' ');

          if (sentenceCase !== text) {
            headingCaseIssues.push({
              heading: headingMatch[0],
              suggestion: `${'#'.repeat(level)} ${sentenceCase}`,
              line: lineNum,
            });

            suggestions.push({
              id: `heading-case-${suggestions.length}`,
              type: 'heading-case',
              description: `Convert H${level} to sentence case`,
              line: lineNum,
              original: headingMatch[0],
              suggestion: `${'#'.repeat(level)} ${sentenceCase}`,
              context: `"${text}" → "${sentenceCase}"`,
            });
          }
        }
      }

      checks.push(createCheck(
        'heading-case',
        'Headings use sentence case',
        headingCaseIssues.length === 0 ? 'PASS' : 'WARN',
        headingCaseIssues.length === 0
          ? 'All headings use sentence case'
          : `${headingCaseIssues.length} heading(s) may need sentence case`,
        headingCaseIssues.length > 0 ? headingCaseIssues.slice(0, 10) : undefined
      ));

      // Old callout components that need migration
      const oldCallouts = analysis.oldCallouts || [];
      const needsCallout = oldCallouts.filter((c: any) => c.target === 'Callout');
      const needsWarning = oldCallouts.filter((c: any) => c.target === 'Warning');

      checks.push(createCheck(
        'callout-migration',
        'Uses modern callout components',
        oldCallouts.length === 0 ? 'PASS' : 'FAIL',
        oldCallouts.length === 0
          ? 'No legacy note/info/warning components found'
          : [
              needsCallout.length > 0 ? `${needsCallout.length} → <Callout>` : '',
              needsWarning.length > 0 ? `${needsWarning.length} → <Warning>` : '',
            ].filter(Boolean).join(', '),
        oldCallouts.length > 0 ? oldCallouts.slice(0, 10) : undefined
      ));

      // Generate callout migration suggestions (deduplicated by tag type)
      const seenCalloutTags = new Set<string>();
      for (const callout of oldCallouts) {
        const newOpenTag = callout.target === 'Warning'
          ? '<Warning>'
          : '<Callout icon="file-lines" color="#0EA5E9" iconType="regular">';
        const newCloseTag = callout.target === 'Warning' ? '</Warning>' : '</Callout>';

        // Only add one suggestion per unique tag (global replace handles all instances)
        const tagKey = `${callout.openTag}|${callout.closeTag}`;
        if (seenCalloutTags.has(tagKey)) continue;
        seenCalloutTags.add(tagKey);

        // Count how many of this tag type exist
        const openCount = (mdx.match(new RegExp(callout.openTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

        // Store the exact open/close tags for precise replacement
        suggestions.push({
          id: `callout-${suggestions.length}`,
          type: 'callout-migration',
          description: `Replace ${callout.openTag} → ${newOpenTag}${openCount > 1 ? ` (${openCount} instances)` : ''}`,
          original: callout.openTag,
          suggestion: newOpenTag,
          context: callout.snippet.slice(0, 100),
        });

        // Also add closing tag replacement
        suggestions.push({
          id: `callout-close-${suggestions.length}`,
          type: 'callout-migration',
          description: `Replace ${callout.closeTag} → ${newCloseTag}${openCount > 1 ? ` (${openCount} instances)` : ''}`,
          original: callout.closeTag,
          suggestion: newCloseTag,
          context: `Closing tag for ${callout.type}`,
        });
      }

      // Check for headings inside callouts (not allowed)
      const headingsInCallouts: { heading: string; component: string; text: string }[] = [];
      const calloutBlockRe = /<(Callout|Warning)[^>]*>([\s\S]*?)<\/\1>/gi;
      let calloutMatch;
      while ((calloutMatch = calloutBlockRe.exec(mdx)) !== null) {
        const componentName = calloutMatch[1];
        const calloutContent = calloutMatch[2];
        const headingRe = /^(#{1,6})\s+(.+)$/gm;
        let headingMatch;
        while ((headingMatch = headingRe.exec(calloutContent)) !== null) {
          const fullHeading = headingMatch[0].trim();
          const headingText = headingMatch[2].trim();
          headingsInCallouts.push({ heading: fullHeading, component: componentName, text: headingText });

          // Generate suggestion to convert heading to bold
          suggestions.push({
            id: `heading-callout-${suggestions.length}`,
            type: 'heading-in-callout',
            description: `Convert heading to bold text inside <${componentName}>`,
            original: fullHeading,
            suggestion: `**${headingText}**`,
            context: `Inside <${componentName}>`,
          });
        }
      }

      checks.push(createCheck(
        'no-headings-in-callouts',
        'No headings inside callouts',
        headingsInCallouts.length === 0 ? 'PASS' : 'FAIL',
        headingsInCallouts.length === 0
          ? 'No markdown headings found inside Callout/Warning blocks'
          : `${headingsInCallouts.length} heading(s) found inside callouts`,
        headingsInCallouts.length > 0 ? headingsInCallouts.slice(0, 10) : undefined
      ));

      // Glossary tooltips check
      const glossaryTerms = await loadGlossaryTerms();
      if (glossaryTerms && analysis.textOnly) {
        const missingTooltips = findMissingTooltips(
          analysis.textOnly,
          glossaryTerms,
          analysis.existingTooltips || []
        );

        checks.push(createCheck(
          'glossary-tooltips',
          'Glossary terms have tooltips',
          missingTooltips.length === 0 ? 'PASS' : 'WARN',
          missingTooltips.length === 0
            ? 'All glossary terms have tooltips (or none found)'
            : `${missingTooltips.length} glossary term(s) missing tooltips`,
          missingTooltips.length > 0 ? missingTooltips.map(t => t.originalTerm) : undefined
        ));

        // Generate tooltip suggestions (skip frontmatter and URLs)
        const frontmatterEnd = mdx.match(/^---\n[\s\S]*?\n---\n/);
        const bodyStartIndex = frontmatterEnd ? frontmatterEnd[0].length : 0;
        const tooltipLines = mdx.split('\n');

        // Helper to check if position is inside a markdown link (text or URL) or href attribute
        const isInsideLink = (content: string, pos: number): boolean => {
          const before = content.slice(Math.max(0, pos - 500), pos);
          const after = content.slice(pos, pos + 500);

          // Check if we're inside markdown link text [...]
          const lastOpenBracket = before.lastIndexOf('[');
          const lastCloseBracket = before.lastIndexOf(']');
          if (lastOpenBracket > -1 && (lastCloseBracket === -1 || lastOpenBracket > lastCloseBracket)) {
            // We're after a [ - check if there's a ]( after us (meaning we're in link text)
            const afterMatch = after.match(/^\w*\s*\]\s*\(/);
            if (afterMatch || after.indexOf('](') > -1) {
              return true;
            }
          }

          // Check if we're inside markdown link URL ](...)
          const lastLinkStart = before.lastIndexOf('](');
          const lastLinkEnd = before.lastIndexOf(')');
          if (lastLinkStart > -1 && (lastLinkEnd === -1 || lastLinkStart > lastLinkEnd)) {
            // We're after a ]( - check if there's a closing ) after us
            if (after.indexOf(')') > -1) {
              return true;
            }
          }

          // Check if we're inside href="..." or src="..."
          const hrefMatch = before.match(/(?:href|src)\s*=\s*["'][^"']*$/i);
          if (hrefMatch) {
            return true;
          }

          return false;
        };

        for (const { originalTerm } of missingTooltips) {
          // Find first occurrence in body content that's not inside a URL
          const termRegex = new RegExp(`\\b${originalTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
          let termMatch;
          let validMatch = null;

          while ((termMatch = termRegex.exec(mdx)) !== null) {
            if (termMatch.index >= bodyStartIndex && !isInsideLink(mdx, termMatch.index)) {
              validMatch = termMatch;
              break;
            }
          }

          if (!validMatch) continue;

          // Find line number
          const beforeMatch = mdx.slice(0, validMatch.index);
          const lineNum = beforeMatch.split('\n').length;
          const originalLine = tooltipLines[lineNum - 1] || '';
          const actualText = validMatch[0]; // Preserve original case

          // Create full line replacement
          const tooltipReplacement = `<Tooltip tip="..." cta="View Glossary" href="/docs/glossary?term=${encodeURIComponent(originalTerm)}">${actualText}</Tooltip>`;
          const lineTermRegex = new RegExp(`\\b${originalTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          const suggestionLine = originalLine.replace(lineTermRegex, tooltipReplacement);

          suggestions.push({
            id: `tooltip-${suggestions.length}`,
            type: 'tooltip',
            description: `Add tooltip for "${actualText}"`,
            line: lineNum,
            original: originalLine,
            suggestion: suggestionLine,
            context: `Line ${lineNum}`,
          });
        }
      }

      // Tab rendering (from Playwright)
      if (renderCheck) {
        let tabStatus: AuditCheckStatus = 'WARN';
        let tabDetails = 'Rendering check failed';

        if ((renderCheck as any).na) {
          tabStatus = 'NA';
          tabDetails = 'No code samples on this page';
        } else if ((renderCheck as any).skipped) {
          tabStatus = 'MANUAL';
          tabDetails = (renderCheck as any).reason || 'Playwright check skipped';
        } else if (renderCheck.ok) {
          tabStatus = 'PASS';
          tabDetails = (renderCheck as any).strategy === 'aria-tablist'
            ? `Code tabs render correctly (${(renderCheck as any).tabCount} tabs)`
            : `Code blocks present (${(renderCheck as any).codeCount} blocks)`;
        } else if ((renderCheck as any).error) {
          tabDetails = (renderCheck as any).error;
        }

        checks.push(createCheck('tab-rendering', 'Code tabs render correctly', tabStatus, tabDetails, renderCheck));
      }

    } else {
      // Index-only mode - use pre-indexed data
      const lintData = await fetchLintData(req);
      const pageWarnings = lintData?.get(filePath) || [];

      const rulesWarnings = pageWarnings.filter((w: any) => w.code === 'rules_vs_actions_language');

      checks.push(createCheck(
        'rules-actions',
        'Rules → Actions migration',
        rulesWarnings.length === 0 ? 'PASS' : 'FAIL',
        rulesWarnings.length === 0 ? 'No Rules references found' : `${rulesWarnings.length} Rules reference(s)`,
        rulesWarnings.slice(0, 5)
      ));

      // Other checks require local mode
      checks.push(createCheck('curl-work', 'cURL samples work', 'MANUAL', 'Requires local mode for execution'));
      checks.push(createCheck('sdk-samples', 'SDK samples present', 'MANUAL', 'Requires local mode'));
      checks.push(createCheck('har-samples', 'HAR samples render', 'MANUAL', 'Requires local mode'));
      checks.push(createCheck('screenshots-present', 'Screenshots present', 'MANUAL', 'Requires local mode'));
      checks.push(createCheck('broken-links', 'No broken links', 'MANUAL', 'Requires local mode'));
      checks.push(createCheck('validated-on', 'validatedOn frontmatter', 'MANUAL', 'Requires local mode'));
    }

    // Calculate summary
    const summary = {
      pass: checks.filter(c => c.status === 'PASS').length,
      fail: checks.filter(c => c.status === 'FAIL').length,
      warn: checks.filter(c => c.status === 'WARN').length,
      na: checks.filter(c => c.status === 'NA').length,
      manual: checks.filter(c => c.status === 'MANUAL').length,
    };

    return NextResponse.json({
      ok: true,
      url,
      filePath,
      pageTitle: title,
      checkedAt: new Date().toISOString(),
      screenshot: (renderCheck as any)?.screenshot,
      checks,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      summary,
    } satisfies AuditResult);

  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err?.message || String(err),
      url: '',
      checkedAt: new Date().toISOString(),
      checks: [],
      summary: { pass: 0, fail: 0, warn: 0, na: 0, manual: 0 },
    } satisfies AuditResult, { status: 400 });
  }
}
