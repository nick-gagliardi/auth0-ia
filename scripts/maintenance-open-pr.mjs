#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) die(`Missing required env var ${name}`);
  return v;
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: { ...process.env, GPG_TTY: process.env.TTY || '/dev/tty' },
    ...opts,
  });
}

function upsertValidatedOn(mdx, validatedOn) {
  const fmMatch = mdx.match(/^---\n([\s\S]*?)\n---\n?/);
  const line = `validatedOn: ${validatedOn}`;

  if (!fmMatch) {
    return `---\n${line}\n---\n\n${mdx}`;
  }

  const fmBody = fmMatch[1];
  const rest = mdx.slice(fmMatch[0].length);

  const lines = fmBody.split('\n');
  const idx = lines.findIndex((l) => l.trim().startsWith('validatedOn:'));
  if (idx >= 0) lines[idx] = line;
  else lines.push(line);

  return `---\n${lines.join('\n')}\n---\n\n${rest.replace(/^\n+/, '')}`;
}

function splitByFences(mdx) {
  const parts = [];
  const re = /(^```[^\n]*\n[\s\S]*?\n```\s*$)/gm;
  let last = 0;
  let m;
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

function autoFixRulesToActions(mdx) {
  const parts = splitByFences(mdx);
  let replaced = 0;

  const fixed = parts
    .map((p) => {
      if (p.kind === 'code') return p.content;
      const segs = p.content.split(/(`[^`]*`)/g);
      return segs
        .map((s) => {
          if (s.startsWith('`') && s.endsWith('`')) return s;
          return s.replace(/\bRules\b/g, () => {
            replaced += 1;
            return 'Actions';
          });
        })
        .join('');
    })
    .join('');

  return { mdx: fixed, replaced };
}

function autoFixTypos(mdx) {
  const parts = splitByFences(mdx);
  const fixes = [];

  // Common typo corrections
  const typoMap = {
    'teh': 'the',
    'recieve': 'receive',
    'recieved': 'received',
    'recieves': 'receives',
    'recieving': 'receiving',
    'occured': 'occurred',
    'seperate': 'separate',
    'seperated': 'separated',
    'seperates': 'separates',
    'seperating': 'separating',
    'definately': 'definitely',
    'alot': 'a lot',
    'wich': 'which',
    'thier': 'their',
    'accomodate': 'accommodate',
    'accomodation': 'accommodation',
    'occurrance': 'occurrence',
    'neccessary': 'necessary',
    'untill': 'until',
  };

  const fixed = parts
    .map((p) => {
      if (p.kind === 'code') return p.content;
      // Skip inline code
      const segs = p.content.split(/(`[^`]*`)/g);
      return segs
        .map((s) => {
          if (s.startsWith('`') && s.endsWith('`')) return s;
          let result = s;

          // Fix repeated words (e.g., "the the" -> "the")
          result = result.replace(/\b([A-Za-z]{2,})\s+\1\b/gi, (match, word) => {
            fixes.push({ type: 'repeated', from: match, to: word });
            return word;
          });

          // Fix common typos
          for (const [typo, correction] of Object.entries(typoMap)) {
            const re = new RegExp(`\\b${typo}\\b`, 'gi');
            result = result.replace(re, (match) => {
              // Preserve original case
              const corrected = match[0] === match[0].toUpperCase()
                ? correction.charAt(0).toUpperCase() + correction.slice(1)
                : correction;
              fixes.push({ type: 'typo', from: match, to: corrected });
              return corrected;
            });
          }

          return result;
        })
        .join('');
    })
    .join('');

  return { mdx: fixed, fixes };
}

// Fix legacy callout components
// <Note>, <Info>, <Tip> → <Callout icon="file-lines" color="#0EA5E9" iconType="regular">
// <Alert>, <Caution>, <Important>, <Danger> → <Warning>
function autoFixLegacyCallouts(mdx) {
  const fixes = [];
  let fixed = mdx;

  const calloutAttrs = ' icon="file-lines" color="#0EA5E9" iconType="regular"';

  // Map of old component names to new ones
  const calloutReplacements = ['Note', 'Info', 'Tip'];
  const warningReplacements = ['Alert', 'Caution', 'Important', 'Danger'];

  for (const oldName of calloutReplacements) {
    // Opening tags - replace with Callout and standard attributes
    const openRe = new RegExp(`<${oldName}(\\s[^>]*)?>`, 'g');
    fixed = fixed.replace(openRe, (match) => {
      fixes.push({ from: oldName, to: 'Callout' });
      return `<Callout${calloutAttrs}>`;
    });
    // Closing tags
    const closeRe = new RegExp(`</${oldName}>`, 'g');
    fixed = fixed.replace(closeRe, '</Callout>');
  }

  for (const oldName of warningReplacements) {
    // Opening tags - replace with Warning (no extra attributes)
    const openRe = new RegExp(`<${oldName}(\\s[^>]*)?>`, 'g');
    fixed = fixed.replace(openRe, (match) => {
      fixes.push({ from: oldName, to: 'Warning' });
      return `<Warning>`;
    });
    // Closing tags
    const closeRe = new RegExp(`</${oldName}>`, 'g');
    fixed = fixed.replace(closeRe, '</Warning>');
  }

  return { mdx: fixed, fixes };
}

// Fix heading capitalization
// H1 (#): title case - capitalize every word except articles, conjunctions, short prepositions
// H2+ (##, ###, etc.): sentence case - capitalize only first word and proper nouns/acronyms
function autoFixHeadingCase(mdx) {
  const fixes = [];

  // Words to keep lowercase in title case (unless first word)
  const titleCaseLower = new Set([
    'a', 'an', 'the',                           // articles
    'and', 'but', 'or', 'nor', 'for', 'so', 'yet', // coordinating conjunctions
    'as', 'at', 'by', 'in', 'of', 'on', 'to', 'up', 'via'  // short prepositions
  ]);

  // Words/patterns to preserve (acronyms, proper nouns, etc.)
  const preserve = new Set([
    'Auth0', 'OAuth', 'OIDC', 'SSO', 'API', 'APIs', 'SDK', 'SDKs',
    'URL', 'URLs', 'URI', 'URIs', 'JSON', 'JWT', 'JWTs',
    'ID', 'IDs', 'MFA', 'SAML', 'LDAP', 'SCIM',
    'B2C', 'B2B', 'B2E', 'IAM', 'CIAM',
    'SDLC', 'CNAME', 'DNS', 'TLS', 'SSL', 'HTTPS', 'HTTP',
    'iOS', 'macOS', 'JavaScript', 'TypeScript', 'Node.js',
    'GitHub', 'GitLab', 'Azure', 'AWS', 'Google', 'Microsoft',
    'OpenID', 'Connect', 'AD', 'ADFS',
  ]);

  // Check if word should be preserved as-is
  const shouldPreserve = (word) => {
    if (preserve.has(word)) return true;
    // Preserve all-caps words (acronyms)
    if (word.length >= 2 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) return true;
    return false;
  };

  // Convert to title case
  const toTitleCase = (text) => {
    return text.split(/(\s+)/).map((word, idx) => {
      if (/^\s+$/.test(word)) return word; // preserve whitespace
      if (shouldPreserve(word)) return word;

      const lowerWord = word.toLowerCase();
      // First word always capitalized
      if (idx === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      // Keep articles/conjunctions/prepositions lowercase
      if (titleCaseLower.has(lowerWord)) {
        return lowerWord;
      }
      // Capitalize other words
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join('');
  };

  // Convert to sentence case
  const toSentenceCase = (text) => {
    return text.split(/(\s+)/).map((word, idx) => {
      if (/^\s+$/.test(word)) return word; // preserve whitespace
      if (shouldPreserve(word)) return word;

      // First word: capitalize
      if (idx === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      // Other words: lowercase (unless preserved)
      return word.toLowerCase();
    }).join('');
  };

  const fixed = mdx.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, heading) => {
    const level = hashes.length;
    const trimmedHeading = heading.trim();

    let newHeading;
    if (level === 1) {
      // H1: title case
      newHeading = toTitleCase(trimmedHeading);
    } else {
      // H2+: sentence case
      newHeading = toSentenceCase(trimmedHeading);
    }

    if (newHeading !== trimmedHeading) {
      fixes.push({ from: trimmedHeading, to: newHeading, level });
    }

    return `${hashes} ${newHeading}`;
  });

  return { mdx: fixed, fixes };
}

// Convert headings inside callouts to bold text
// ### Heading → **Heading**
function autoFixHeadingsInCallouts(mdx) {
  const fixes = [];

  const fixed = mdx.replace(
    /(<(?:Callout|Warning)[^>]*>)([\s\S]*?)(<\/(?:Callout|Warning)>)/gi,
    (match, openTag, content, closeTag) => {
      const newContent = content.replace(/^(#{1,6})\s+(.+)$/gm, (headingMatch, hashes, text) => {
        fixes.push({ from: headingMatch.trim(), to: `**${text.trim()}**` });
        return `**${text.trim()}**`;
      });
      return `${openTag}${newContent}${closeTag}`;
    }
  );

  return { mdx: fixed, fixes };
}

// Load glossary terms and descriptions
function loadGlossary(docsRepoPath) {
  const glossaryPath = path.join(docsRepoPath, 'main/docs/glossary.mdx');
  if (!fs.existsSync(glossaryPath)) return new Map();

  const content = fs.readFileSync(glossaryPath, 'utf8');
  const terms = new Map();

  // Parse term and description pairs from the GlossaryPage component
  const termRe = /\{\s*term:\s*["']([^"']+)["']\s*,\s*description:\s*["']([^"']+)["']/g;
  let match;
  while ((match = termRe.exec(content))) {
    const term = match[1];
    let description = match[2];
    // Truncate description for tooltip (first sentence or 150 chars)
    const firstSentence = description.match(/^[^.!?]+[.!?]/);
    if (firstSentence && firstSentence[0].length < 200) {
      description = firstSentence[0];
    } else if (description.length > 150) {
      description = description.slice(0, 147) + '...';
    }
    terms.set(term.toLowerCase(), { term, description });
  }

  return terms;
}

// Find existing tooltips in the MDX
function findExistingTooltips(mdx) {
  const tooltips = new Set();

  // Match tooltip href with term param
  const hrefRe = /<Tooltip[^>]*href\s*=\s*["'][^"']*[?&]term=([^"'&]+)/gi;
  let match;
  while ((match = hrefRe.exec(mdx))) {
    tooltips.add(match[1].toLowerCase());
  }

  // Match tooltip text content
  const textRe = /<Tooltip[^>]*>([^<]+)<\/Tooltip>/gi;
  while ((match = textRe.exec(mdx))) {
    tooltips.add(match[1].toLowerCase().trim());
  }

  return tooltips;
}

// Add tooltips for glossary terms (first occurrence only)
function autoAddTooltips(mdx, docsRepoPath) {
  const glossary = loadGlossary(docsRepoPath);
  if (glossary.size === 0) return { mdx, added: [] };

  // Extract frontmatter - don't add tooltips there
  // Frontmatter ends with --- on its own line
  let frontmatter = '';
  let content = mdx;
  if (mdx.startsWith('---')) {
    const endMatch = mdx.match(/\n---\s*\n/);
    if (endMatch) {
      const endIdx = endMatch.index + endMatch[0].length;
      frontmatter = mdx.slice(0, endIdx);
      content = mdx.slice(endIdx);
    }
  }

  const existingTooltips = findExistingTooltips(content);
  const added = [];
  const parts = splitByFences(content);

  // Track which terms we've already added tooltips for
  const addedTerms = new Set();

  const fixed = parts
    .map((p) => {
      if (p.kind === 'code') return p.content;

      // Split by markdown links first [...](...)
      const linkParts = [];
      const linkRe = /(\[[^\]]*\]\([^)]*\))/g;
      let lastIdx = 0;
      let linkMatch;
      while ((linkMatch = linkRe.exec(p.content))) {
        if (linkMatch.index > lastIdx) {
          linkParts.push({ type: 'text', content: p.content.slice(lastIdx, linkMatch.index) });
        }
        linkParts.push({ type: 'link', content: linkMatch[0] });
        lastIdx = linkMatch.index + linkMatch[0].length;
      }
      if (lastIdx < p.content.length) {
        linkParts.push({ type: 'text', content: p.content.slice(lastIdx) });
      }
      if (linkParts.length === 0) {
        linkParts.push({ type: 'text', content: p.content });
      }

      return linkParts.map(linkPart => {
        if (linkPart.type === 'link') return linkPart.content;

        // Skip inline code spans
        const segs = linkPart.content.split(/(`[^`]*`)/g);
        return segs
          .map((s) => {
            if (s.startsWith('`') && s.endsWith('`')) return s;

            let result = s;

          for (const [termLower, { term, description }] of glossary) {
            // Skip if already has tooltip or we already added one
            if (existingTooltips.has(termLower) || addedTerms.has(termLower)) continue;

            // Skip very short terms
            if (term.length < 4) continue;

            // Build regex that:
            // - Doesn't match inside compound words (app_metadata, user-agent)
            // - Doesn't match inside JSX tags
            // - Doesn't match when followed by hyphen+word (Role-based)
            // - Requires word boundaries but excludes underscore/hyphen adjacency
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(
              `(?<![\\w_-])\\b(${escapedTerm})\\b(?![-_]\\w)(?![^<]*>)`,
              'i'
            );

            const match = result.match(regex);
            if (match) {
              const originalTerm = match[1];
              const tooltip = `<Tooltip tip="${description.replace(/"/g, '&quot;')}" cta="View Glossary" href="/docs/glossary?term=${encodeURIComponent(term)}">${originalTerm}</Tooltip>`;

              // Only replace first occurrence
              result = result.replace(regex, tooltip);
              addedTerms.add(termLower);
              added.push({ term: originalTerm, description: description.slice(0, 50) + '...' });

              // Limit how many tooltips we add per file
              if (added.length >= 10) break;
            }
          }

            return result;
          })
          .join('');
      }).join('');
    })
    .join('');

  return { mdx: frontmatter + fixed, added };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    out[key] = val;
    i++;
  }
  return out;
}

const args = parseArgs(process.argv);
const docsRepoPath = requireEnv('MAINTENANCE_DOCS_REPO_PATH');
const defaultUpstreamRepo = requireEnv('MAINTENANCE_UPSTREAM_REPO'); // e.g. auth0/docs-v2 or nick-gagliardi/docs-v2
const defaultBaseBranch = process.env.MAINTENANCE_BASE_BRANCH || 'main';
const forkOwner = requireEnv('MAINTENANCE_FORK_OWNER'); // your GH username/org

const filePath = args.filePath || args.file || '';
const validatedOn = args.validatedOn || '';
const prTitle = args.prTitle || `Content maintenance: validate ${filePath}`;
const prBody = args.prBody || '';

const targetRepo = args.targetRepo || defaultUpstreamRepo;
const baseBranch = args.baseBranch || defaultBaseBranch;

const steps = [];
const step = (s) => steps.push(`${new Date().toISOString()} ${s}`);

if (!filePath) die('Missing --filePath');
if (!/^\d{4}-\d{2}-\d{2}$/.test(validatedOn)) die('Missing/invalid --validatedOn (YYYY-MM-DD)');
step(`Starting maintenance PR for ${filePath}`);
step(`Target repo: ${targetRepo} (base ${baseBranch})`);

const abs = path.resolve(docsRepoPath, filePath);
if (!fs.existsSync(abs)) die(`File not found: ${abs}`);

// Simple branch name: just filename + short date + unique suffix
// e.g., "maint/architecture-0217-a1b2c3" (~30 chars max)
const fileName = path.basename(filePath, path.extname(filePath))
  .replace(/[^a-zA-Z0-9-]/g, '-')
  .slice(0, 20);
const shortDate = validatedOn.replace(/-/g, '').slice(4); // MMDD from YYYY-MM-DD

// Branch pattern without unique suffix for searching existing branches
const branchPattern = `maint/${fileName}-${shortDate}`;

// Check for existing remote branch matching the pattern
let existingBranch = null;
try {
  const remoteBranchesRaw = run('git', ['ls-remote', '--heads', 'origin'], { cwd: docsRepoPath });
  const remoteBranches = remoteBranchesRaw
    .split('\n')
    .filter(Boolean)
    .map(line => line.split('\t')[1]?.replace('refs/heads/', ''))
    .filter(Boolean);

  // Find branch matching our pattern (may have a unique suffix)
  existingBranch = remoteBranches.find(b => b.startsWith(branchPattern));
  if (existingBranch) {
    step(`Found existing branch: ${existingBranch}`);
  }
} catch (e) {
  step('Could not check for existing branches, will create new one');
}

// Generate new branch name with unique suffix (only used if no existing branch found)
const uniq = String(Date.now()).slice(-6);
const newBranchName = `${branchPattern}-${uniq}`;

const statusRaw = run('git', ['status', '--porcelain'], { cwd: docsRepoPath });
const status = statusRaw.trimEnd();
let carryPatch = null;
if (status) {
  const changed = statusRaw
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      // Porcelain format: XY<space>path
      const m = l.match(/^..\s+(.*)$/);
      return m ? m[1] : l.slice(3);
    });

  const unique = Array.from(new Set(changed));
  if (unique.length !== 1 || unique[0] !== filePath) {
    die(
      `Docs repo has uncommitted changes outside the target file.\n` +
        `Please commit/stash first.\n\n${status}`
    );
  }

  // Capture a patch of just the target file.
  carryPatch = run('git', ['diff', '--', filePath], { cwd: docsRepoPath });

  // Now that the patch is saved, restore the file so we can safely switch branches.
  run('git', ['restore', '--', filePath], { cwd: docsRepoPath });
}

// Use existing branch if found, otherwise create new branch
const actualBranchName = existingBranch || newBranchName;

if (existingBranch) {
  step(`Using existing branch: ${existingBranch}`);
  run('git', ['fetch', 'origin', existingBranch], { cwd: docsRepoPath });
  run('git', ['checkout', existingBranch], { cwd: docsRepoPath });
  // Pull latest changes from the branch
  try {
    run('git', ['pull', 'origin', existingBranch], { cwd: docsRepoPath });
  } catch (e) {
    step('Warning: could not pull latest changes from branch');
  }
} else {
  step(`Checkout ${baseBranch}`);
  run('git', ['checkout', baseBranch], { cwd: docsRepoPath });
  step(`Pull latest ${baseBranch}`);
  run('git', ['pull', '--ff-only'], { cwd: docsRepoPath });

  // Create new branch
  try {
    step(`Create branch ${newBranchName}`);
    run('git', ['checkout', '-B', newBranchName], { cwd: docsRepoPath });
  } catch (e) {
    die(`Failed to create branch ${newBranchName}: ${e?.stderr || e}`);
  }
}

// If we had a carried patch (from a dirty working tree), apply it now.
if (carryPatch && carryPatch.trim()) {
  try {
    step('Apply carried patch from dirty working tree');
    execFileSync('git', ['apply', '-'], { cwd: docsRepoPath, input: carryPatch });
  } catch (e) {
    die(`Failed to apply carried patch for ${filePath}. Resolve conflicts manually.`);
  }
}

const originalMdx = fs.readFileSync(abs, 'utf8');
let mdx = upsertValidatedOn(originalMdx, validatedOn);

// Apply all auto-fixes
const rulesFixed = autoFixRulesToActions(mdx);
mdx = rulesFixed.mdx;

const typosFixed = autoFixTypos(mdx);
mdx = typosFixed.mdx;

const calloutsFixed = autoFixLegacyCallouts(mdx);
mdx = calloutsFixed.mdx;

const calloutHeadingsFixed = autoFixHeadingsInCallouts(mdx);
mdx = calloutHeadingsFixed.mdx;

const headingsFixed = autoFixHeadingCase(mdx);
mdx = headingsFixed.mdx;

const tooltipsAdded = autoAddTooltips(mdx, docsRepoPath);
mdx = tooltipsAdded.mdx;

// Check if there are actual changes
if (mdx === originalMdx) {
  die(`No changes to make - file already has validatedOn: ${validatedOn} and no auto-fixes needed.`);
}

fs.writeFileSync(abs, mdx, 'utf8');

step('Stage changes');
run('git', ['add', filePath], { cwd: docsRepoPath });

// Verify there are staged changes
const diffStaged = run('git', ['diff', '--cached', '--name-only'], { cwd: docsRepoPath }).trim();
if (!diffStaged) {
  die('No staged changes after modifying file. This is unexpected.');
}
step(`Staged files: ${diffStaged}`);

step('Commit changes');
run('git', ['commit', '-S', '-m', `chore(docs): content maintenance (${validatedOn})`], { cwd: docsRepoPath });

step('Push branch to remote');
try {
  run('git', ['push', '-u', 'origin', actualBranchName, '--force'], { cwd: docsRepoPath });
} catch (e) {
  die(`Failed to push branch: ${e?.stderr || e?.message || e}`);
}

// Verify the branch exists on the remote
step('Verifying branch on remote...');
try {
  run('git', ['ls-remote', '--heads', 'origin', actualBranchName], { cwd: docsRepoPath });
} catch (e) {
  step('Warning: Could not verify remote branch');
}

// Build PR body with all fixes (used for both create and update)
const autoFixLines = [
  '## Automated fixes',
  '',
  `- validatedOn set to: ${validatedOn}`,
  `- Rules→Actions replacements: ${rulesFixed.replaced}`,
  `- Typo fixes: ${typosFixed.fixes.length}`,
  `- Legacy callouts fixed: ${calloutsFixed.fixes.length}`,
  `- Headings in callouts converted to bold: ${calloutHeadingsFixed.fixes.length}`,
  `- Heading capitalization fixes: ${headingsFixed.fixes.length}`,
  `- Glossary tooltips added: ${tooltipsAdded.added.length}`,
];

if (typosFixed.fixes.length > 0) {
  autoFixLines.push('');
  autoFixLines.push('### Typos corrected');
  for (const fix of typosFixed.fixes.slice(0, 20)) {
    autoFixLines.push(`- "${fix.from}" → "${fix.to}"`);
  }
  if (typosFixed.fixes.length > 20) {
    autoFixLines.push(`- ... and ${typosFixed.fixes.length - 20} more`);
  }
}

if (calloutsFixed.fixes.length > 0) {
  autoFixLines.push('');
  autoFixLines.push('### Legacy callouts updated');
  for (const fix of calloutsFixed.fixes.slice(0, 20)) {
    autoFixLines.push(`- \`<${fix.from}>\` → \`<${fix.to}>\``);
  }
  if (calloutsFixed.fixes.length > 20) {
    autoFixLines.push(`- ... and ${calloutsFixed.fixes.length - 20} more`);
  }
}

if (calloutHeadingsFixed.fixes.length > 0) {
  autoFixLines.push('');
  autoFixLines.push('### Headings in callouts converted to bold');
  for (const fix of calloutHeadingsFixed.fixes.slice(0, 20)) {
    autoFixLines.push(`- \`${fix.from}\` → \`${fix.to}\``);
  }
  if (calloutHeadingsFixed.fixes.length > 20) {
    autoFixLines.push(`- ... and ${calloutHeadingsFixed.fixes.length - 20} more`);
  }
}

if (headingsFixed.fixes.length > 0) {
  autoFixLines.push('');
  autoFixLines.push('### Heading capitalization fixed');
  for (const fix of headingsFixed.fixes.slice(0, 20)) {
    const levelLabel = fix.level === 1 ? 'H1→title case' : `H${fix.level}→sentence case`;
    autoFixLines.push(`- "${fix.from}" → "${fix.to}" (${levelLabel})`);
  }
  if (headingsFixed.fixes.length > 20) {
    autoFixLines.push(`- ... and ${headingsFixed.fixes.length - 20} more`);
  }
}

if (tooltipsAdded.added.length > 0) {
  autoFixLines.push('');
  autoFixLines.push('### Glossary tooltips added');
  for (const t of tooltipsAdded.added.slice(0, 10)) {
    autoFixLines.push(`- **${t.term}**: ${t.description}`);
  }
  if (tooltipsAdded.added.length > 10) {
    autoFixLines.push(`- ... and ${tooltipsAdded.added.length - 10} more`);
  }
}

// Build full PR body
const bodyCombined =
  (prBody ? `${prBody.trim()}\n\n` : '') + autoFixLines.join('\n') + '\n';

// Build compare URL for review with pre-filled title and body
const compareUrl = `https://github.com/${targetRepo}/compare/${baseBranch}...${forkOwner}:${actualBranchName}?expand=1&title=${encodeURIComponent(prTitle)}&body=${encodeURIComponent(bodyCombined)}`;
step(`Branch pushed. Review at: ${compareUrl}`);

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      compareUrl,
      branchName: actualBranchName,
      targetRepo,
      baseBranch,
      rulesReplaceCount: rulesFixed.replaced,
      typoFixCount: typosFixed.fixes.length,
      calloutsFixedCount: calloutsFixed.fixes.length,
      calloutHeadingsFixedCount: calloutHeadingsFixed.fixes.length,
      headingsFixedCount: headingsFixed.fixes.length,
      tooltipsAddedCount: tooltipsAdded.added.length,
      steps,
    },
    null,
    2
  )
);
