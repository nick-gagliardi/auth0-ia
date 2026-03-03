import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import type { AuditCheckStatus, DocNode } from '@/types';
import { requireSession } from '@/lib/session';

type PRFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
};

type AuditIssue = {
  file: string;
  line?: number;
  check: string;
  status: AuditCheckStatus;
  message: string;
  suggestion?: string;
  evidence?: any;
};

type PRReviewResult = {
  ok: boolean;
  error?: string;
  pr?: {
    number: number;
    title: string;
    author: string;
    url: string;
    headRef: string;
    baseRef: string;
  };
  files?: PRFile[];
  issues?: AuditIssue[];
};

function run(cmd: string, args: string[], options?: { cwd?: string; githubToken?: string }): string {
  const fullCmd = [cmd, ...args].join(' ');
  try {
    const execOptions: any = {
      cwd: options?.cwd,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    };

    // If GitHub token is provided, inject it via environment variable
    // Priority: user's token → global env var (for 30-day transition)
    if (options?.githubToken) {
      const token = options.githubToken || process.env.MAINTENANCE_GH_TOKEN;
      if (token) {
        execOptions.env = {
          ...process.env,
          GH_TOKEN: token, // GitHub CLI uses GH_TOKEN for authentication
          GITHUB_TOKEN: token, // Some tools use GITHUB_TOKEN
        };
      }
    }

    return execSync(fullCmd, execOptions);
  } catch (e: any) {
    throw new Error(e?.stderr || e?.message || String(e));
  }
}

// Fetch permalinks for broken link check
async function fetchPermalinkSet(req: NextRequest): Promise<Set<string> | null> {
  try {
    const origin = new URL(req.url).origin;
    const base = process.env.NEXT_PUBLIC_INDEX_BASE_URL || '/index';
    const nodesUrl = new URL(`${base.replace(/\/$/, '')}/nodes.json`, origin);
    const res = await fetch(nodesUrl.toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const nodes = (await res.json()) as DocNode[];

    const paths = new Set<string>();
    for (const n of nodes) {
      if (n.type !== 'page') continue;
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

// Load glossary terms
async function loadGlossaryTerms(): Promise<Map<string, string> | null> {
  const docsRepoPath = process.env.MAINTENANCE_DOCS_REPO_PATH;
  if (!docsRepoPath) return null;

  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const glossaryPath = path.join(docsRepoPath, 'main/docs/glossary.mdx');
    const content = await fs.readFile(glossaryPath, 'utf-8');

    const terms = new Map<string, string>();
    const termRe = /term:\s*["']([^"']+)["']/g;
    let match;
    while ((match = termRe.exec(content))) {
      terms.set(match[1].toLowerCase(), match[1]);
    }
    return terms;
  } catch {
    return null;
  }
}

// Find missing tooltips
function findMissingTooltips(
  text: string,
  glossaryTerms: Map<string, string>,
  existingTooltips: string[]
): { term: string; originalTerm: string }[] {
  const missing: { term: string; originalTerm: string }[] = [];
  const tooltipSet = new Set(existingTooltips.map(t => t.toLowerCase()));
  const foundTerms = new Set<string>();

  for (const [termLower, originalTerm] of glossaryTerms) {
    if (tooltipSet.has(termLower)) continue;
    if (termLower.length < 4) continue;
    if (['the', 'and', 'for', 'with', 'from', 'that', 'this', 'beta'].includes(termLower)) continue;

    const regex = new RegExp(`\\b${originalTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(text) && !foundTerms.has(termLower)) {
      foundTerms.add(termLower);
      missing.push({ term: termLower, originalTerm });
    }
    if (missing.length >= 15) break;
  }
  return missing;
}

// Validate external links
async function validateExternalLinks(links: string[]): Promise<{ broken: string[]; checked: number }> {
  const broken: string[] = [];
  const checked = new Set<string>();
  const timeout = 5000;
  const maxLinks = 10; // Lower limit for PR review
  const skipDomains = [
    'manage.auth0.com', 'auth0.com', 'login.auth0.com', 'cdn.auth0.com',
    'marketplace.auth0.com', 'community.auth0.com', 'support.auth0.com',
    'okta.com', 'localhost', '127.0.0.1',
  ];

  const externalLinks = links
    .filter(u => /^https?:\/\//.test(u))
    .filter(u => !u.includes('auth0.com/docs'))
    .filter(u => {
      try {
        const host = new URL(u).hostname;
        return !skipDomains.some(d => host === d || host.endsWith('.' + d));
      } catch { return false; }
    })
    .slice(0, maxLinks);

  for (const url of externalLinks) {
    if (checked.has(url)) continue;
    checked.add(url);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'Auth0-Docs-Audit/1.0' },
      });
      clearTimeout(timeoutId);

      if (!res.ok && res.status !== 403 && res.status !== 405) {
        broken.push(`${url} (${res.status})`);
      }
    } catch (e: any) {
      broken.push(`${url} (${e?.name === 'AbortError' ? 'timeout' : e?.message || 'error'})`);
    }
  }
  return { broken, checked: checked.size };
}

// Get line number from character index in content
function getLineNumber(content: string, index: number): number {
  const before = content.slice(0, index);
  return before.split('\n').length;
}

export async function POST(req: NextRequest): Promise<NextResponse<PRReviewResult>> {
  try {
    // Get authenticated user and their GitHub token
    const { user } = await requireSession();
    const githubToken = user.github_access_token_decrypted;

    const { prUrl } = await req.json();

    if (!prUrl || typeof prUrl !== 'string') {
      return NextResponse.json({ ok: false, error: 'Missing prUrl' }, { status: 400 });
    }

    // Parse PR URL: https://github.com/owner/repo/pull/123
    const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
      return NextResponse.json({ ok: false, error: 'Invalid PR URL format. Expected: https://github.com/owner/repo/pull/123' }, { status: 400 });
    }

    const [, owner, repo, prNumber] = match;
    const fullRepo = `${owner}/${repo}`;

    // Get PR details
    const prDetailsRaw = run('gh', [
      'pr', 'view', prNumber,
      '--repo', fullRepo,
      '--json', 'number,title,author,url,headRefName,baseRefName,files',
    ], { githubToken });
    const prDetails = JSON.parse(prDetailsRaw);

    // Filter to MDX files only
    const mdxFiles = (prDetails.files || []).filter((f: PRFile) =>
      f.path.endsWith('.mdx') || f.path.endsWith('.md')
    );

    if (mdxFiles.length === 0) {
      return NextResponse.json({
        ok: true,
        pr: {
          number: prDetails.number,
          title: prDetails.title,
          author: prDetails.author?.login || 'unknown',
          url: prDetails.url,
          headRef: prDetails.headRefName,
          baseRef: prDetails.baseRefName,
        },
        files: [],
        issues: [],
      });
    }

    // Fetch content of each MDX file from the PR branch and run checks
    const issues: AuditIssue[] = [];
    const { analyzeMdx } = await import('../audit/analyze-helpers');

    for (const file of mdxFiles) {
      if (file.status === 'removed') continue;

      try {
        // Fetch file content from PR branch
        const contentRaw = run('gh', [
          'api',
          `/repos/${fullRepo}/contents/${file.path}?ref=${prDetails.headRefName}`,
          '--jq', '.content',
        ], { githubToken });

        // Decode base64 content
        const content = Buffer.from(contentRaw.trim(), 'base64').toString('utf-8');

        // Run analysis
        const analysis = analyzeMdx(content);

        // Check for issues and generate review comments

        // 1. Legacy callouts
        if (analysis.oldCallouts && analysis.oldCallouts.length > 0) {
          for (const callout of analysis.oldCallouts) {
            issues.push({
              file: file.path,
              check: 'callout-migration',
              status: 'FAIL',
              message: `Legacy callout component \`${callout.type}\` should be replaced with \`<${callout.target}>\``,
              suggestion: callout.target === 'Callout'
                ? `<Callout icon="file-lines" color="#0EA5E9" iconType="regular">`
                : `<Warning>`,
              evidence: { snippet: callout.snippet },
            });
          }
        }

        // 2. Headings inside callouts
        const calloutBlockRe = /<(Callout|Warning)[^>]*>([\s\S]*?)<\/\1>/gi;
        let calloutMatch;
        while ((calloutMatch = calloutBlockRe.exec(content)) !== null) {
          const calloutContent = calloutMatch[2];
          const headingMatches = calloutContent.match(/^(#{1,6})\s+(.+)$/gm);
          if (headingMatches) {
            for (const h of headingMatches) {
              const textMatch = h.match(/^#{1,6}\s+(.+)$/);
              const text = textMatch ? textMatch[1] : h;
              issues.push({
                file: file.path,
                check: 'no-headings-in-callouts',
                status: 'FAIL',
                message: `Heading inside callout should be converted to bold text`,
                suggestion: `**${text.trim()}**`,
                evidence: { original: h },
              });
            }
          }
        }

        // 3. Heading capitalization check - disabled for PR review
        // Too context-dependent for automated suggestions (proper noun phrases like
        // "Role Based Access Control" get incorrectly flagged)

        // 4. Missing validatedOn in frontmatter
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];
          if (!frontmatter.includes('validatedOn:')) {
            issues.push({
              file: file.path,
              check: 'validated-on',
              status: 'WARN',
              message: 'Missing `validatedOn` date in frontmatter',
              suggestion: `Add \`validatedOn: ${new Date().toISOString().slice(0, 10)}\` to frontmatter`,
            });
          }
        }

        // 5. Typos (repeated words)
        const repeatedWordRe = /\b([A-Za-z]{2,})\s+\1\b/gi;
        let typoMatch;
        while ((typoMatch = repeatedWordRe.exec(content)) !== null) {
          issues.push({
            file: file.path,
            check: 'typo',
            status: 'FAIL',
            message: `Repeated word: "${typoMatch[0]}"`,
            suggestion: typoMatch[1],
          });
        }

        // 6. Rules vs Actions language
        if (analysis.rulesOccurrences && analysis.rulesOccurrences.length > 0) {
          for (const occurrence of analysis.rulesOccurrences.slice(0, 5)) {
            issues.push({
              file: file.path,
              check: 'rules-vs-actions',
              status: 'WARN',
              message: `Reference to "Rules" - consider if this should be "Actions"`,
              evidence: { context: occurrence },
            });
          }
        }

        // 7. Code syntax validation
        if (analysis.allCodeBlocks && analysis.allCodeBlocks.length > 0) {
          const { validateCodeBlocks } = await import('../audit/analyze-helpers');
          const syntaxResults = await validateCodeBlocks(analysis.allCodeBlocks);
          for (const result of syntaxResults.results) {
            if (!result.valid && result.error) {
              issues.push({
                file: file.path,
                check: 'code-syntax',
                status: 'FAIL',
                message: `Syntax error in ${result.lang || 'code'} block: ${result.error}`,
                evidence: { lang: result.lang, line: result.line },
              });
            }
          }
        }

        // 8. Broken internal links
        if (analysis.internalDocsLinks && analysis.internalDocsLinks.length > 0) {
          const permalinkSet = await fetchPermalinkSet(req);
          if (permalinkSet) {
            for (const link of analysis.internalDocsLinks) {
              const basePath = link.split('#')[0];
              if (!permalinkSet.has(basePath)) {
                issues.push({
                  file: file.path,
                  check: 'broken-link',
                  status: 'FAIL',
                  message: `Broken internal link: \`${link}\``,
                  suggestion: 'Verify the link path exists',
                });
              }
            }
          }
        }

        // 9. External links validation
        if (analysis.allLinks && analysis.allLinks.length > 0) {
          const externalResult = await validateExternalLinks(analysis.allLinks);
          for (const broken of externalResult.broken) {
            issues.push({
              file: file.path,
              check: 'external-link',
              status: 'WARN',
              message: `External link may be broken: ${broken}`,
            });
          }
        }

        // 10. Missing glossary tooltips
        const glossaryTerms = await loadGlossaryTerms();
        if (glossaryTerms && analysis.textOnly) {
          const missingTooltips = findMissingTooltips(
            analysis.textOnly,
            glossaryTerms,
            analysis.existingTooltips || []
          );
          // Find where frontmatter ends (skip tooltips in frontmatter - YAML can't have JSX)
          const frontmatterEnd = content.match(/^---\n[\s\S]*?\n---\n/);
          const bodyStartIndex = frontmatterEnd ? frontmatterEnd[0].length : 0;

          for (const { originalTerm } of missingTooltips.slice(0, 5)) {
            // Find first occurrence in content AFTER frontmatter
            const termRegex = new RegExp(`\\b${originalTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            let termMatch;
            let validMatch = null;

            // Find first match that's not in frontmatter
            while ((termMatch = termRegex.exec(content)) !== null) {
              if (termMatch.index >= bodyStartIndex) {
                validMatch = termMatch;
                break;
              }
            }

            if (!validMatch) continue; // Skip if only found in frontmatter

            const lineNum = getLineNumber(content, validMatch.index);
            // Use the actual text from the document to preserve case
            const actualText = validMatch[0];

            // Get the full line content for proper GitHub suggestion
            const lines = content.split('\n');
            const originalLine = lines[lineNum - 1] || '';
            // Replace just the term in the line with the tooltip
            const tooltipReplacement = `<Tooltip tip="..." cta="View Glossary" href="/docs/glossary?term=${encodeURIComponent(originalTerm)}">${actualText}</Tooltip>`;
            const lineTermRegex = new RegExp(`\\b${originalTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            const suggestionLine = originalLine.replace(lineTermRegex, tooltipReplacement);

            issues.push({
              file: file.path,
              line: lineNum,
              check: 'glossary-tooltip',
              status: 'WARN',
              message: `Glossary term "${actualText}" could use a tooltip`,
              suggestion: suggestionLine,
              evidence: { originalText: originalLine },
            });
          }
        }

      } catch (e: any) {
        issues.push({
          file: file.path,
          check: 'fetch-error',
          status: 'FAIL',
          message: `Could not analyze file: ${e?.message || String(e)}`,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      pr: {
        number: prDetails.number,
        title: prDetails.title,
        author: prDetails.author?.login || 'unknown',
        url: prDetails.url,
        headRef: prDetails.headRefName,
        baseRef: prDetails.baseRefName,
      },
      files: mdxFiles,
      issues,
    });

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
