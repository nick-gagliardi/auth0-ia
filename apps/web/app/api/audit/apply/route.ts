import { NextResponse } from 'next/server';
import { z } from 'zod';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { AuditSuggestion } from '@/types';
import { requireSession } from '@/lib/session';

// Escape special regex characters in a string
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SuggestionSchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string(),
  line: z.number().nullable().optional(),
  original: z.string(),
  suggestion: z.string(),
  context: z.string().nullable().optional(),
});

const BodySchema = z.object({
  filePath: z.string().min(1),
  validatedOn: z.string().min(1),
  prTitle: z.string().min(1),
  prBody: z.string().optional(),
  suggestions: z.array(SuggestionSchema),
});

function run(cmd: string, args: string[], options?: { cwd?: string; githubToken?: string }): string {
  try {
    const execOptions: any = {
      cwd: options?.cwd,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    };

    // If GitHub token is provided and we're running git commands, inject authentication
    if (options?.githubToken && cmd === 'git') {
      // Use git credential helper to provide token for GitHub operations
      // Priority: user's token → global env var (for 30-day transition)
      const token = options.githubToken || process.env.MAINTENANCE_GH_TOKEN;
      if (token) {
        execOptions.env = {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0', // Disable interactive prompts
          GH_TOKEN: token, // For GitHub CLI if used
        };

        // Inject git config to use token for authentication via extraheader
        const authHeader = `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
        args = ['-c', `http.https://github.com/.extraheader=${authHeader}`, ...args];
      }
    }

    return execFileSync(cmd, args, execOptions);
  } catch (e: any) {
    throw new Error(e?.stderr || e?.message || String(e));
  }
}

export async function POST(req: Request) {
  try {
    // Get authenticated user and their GitHub token
    const { user } = await requireSession();
    const githubToken = user.github_access_token_decrypted;

    const body = BodySchema.parse(await req.json());
    const { filePath, validatedOn, prTitle, prBody, suggestions } = body;

    const docsRepoPath = process.env.MAINTENANCE_DOCS_REPO_PATH;
    if (!docsRepoPath) {
      return NextResponse.json({
        ok: false,
        error: 'MAINTENANCE_DOCS_REPO_PATH not configured',
      }, { status: 400 });
    }

    const targetRepo = process.env.MAINTENANCE_UPSTREAM_REPO || 'auth0/docs-v2';
    const baseBranch = process.env.MAINTENANCE_BASE_BRANCH || 'main';

    const abs = path.resolve(docsRepoPath, filePath);
    if (!fs.existsSync(abs)) {
      return NextResponse.json({
        ok: false,
        error: `File not found: ${filePath}`,
      }, { status: 400 });
    }

    // Read the current file content
    let content = fs.readFileSync(abs, 'utf-8');

    // Apply suggestions (sort by line number descending to avoid offset issues)
    const sortedSuggestions = [...suggestions].sort((a, b) => (b.line || 0) - (a.line || 0));
    let appliedCount = 0;

    for (const suggestion of sortedSuggestions) {
      // For line-based suggestions (tooltips, heading-case)
      if (suggestion.line && suggestion.original && suggestion.suggestion) {
        const lines = content.split('\n');
        const lineIndex = suggestion.line - 1;
        if (lineIndex >= 0 && lineIndex < lines.length) {
          const currentLine = lines[lineIndex];
          // Verify the line matches what we expect
          if (currentLine === suggestion.original) {
            lines[lineIndex] = suggestion.suggestion;
            content = lines.join('\n');
            appliedCount++;
          } else if (currentLine.includes(suggestion.original.trim().slice(0, 50))) {
            // Partial match - try direct replacement
            lines[lineIndex] = suggestion.suggestion;
            content = lines.join('\n');
            appliedCount++;
          }
        }
      } else {
        // For non-line-based suggestions (callouts, headings in callouts)
        if (content.includes(suggestion.original)) {
          // For callout-migration, replace all occurrences globally
          if (suggestion.type === 'callout-migration') {
            const regex = new RegExp(escapeRegex(suggestion.original), 'g');
            const matches = content.match(regex);
            if (matches) {
              content = content.replace(regex, suggestion.suggestion);
              appliedCount += matches.length;
            }
          } else {
            // Single replacement for other types
            content = content.replace(suggestion.original, suggestion.suggestion);
            appliedCount++;
          }
        }
      }
    }

    // Update validatedOn in frontmatter if not already present
    const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
    if (frontmatterMatch) {
      let frontmatter = frontmatterMatch[2];
      if (frontmatter.includes('validatedOn:')) {
        // Update existing
        frontmatter = frontmatter.replace(/validatedOn:\s*[\d-]+/, `validatedOn: ${validatedOn}`);
      } else {
        // Add new
        frontmatter = frontmatter.trimEnd() + `\nvalidatedOn: ${validatedOn}`;
      }
      content = frontmatterMatch[1] + frontmatter + frontmatterMatch[3] + content.slice(frontmatterMatch[0].length);
    }

    // Write the updated content
    fs.writeFileSync(abs, content, 'utf-8');

    // Create branch and commit
    const fileName = path.basename(filePath, path.extname(filePath))
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .slice(0, 20);
    const shortDate = validatedOn.replace(/-/g, '').slice(4); // MMDD
    const uniq = String(Date.now()).slice(-6);
    const branchName = `maint/${fileName}-${shortDate}-${uniq}`;

    // Ensure we're on the base branch and up to date
    run('git', ['checkout', baseBranch], { cwd: docsRepoPath, githubToken });
    run('git', ['pull', 'origin', baseBranch], { cwd: docsRepoPath, githubToken });

    // Create and checkout new branch
    run('git', ['checkout', '-b', branchName], { cwd: docsRepoPath, githubToken });

    // Stage and commit
    run('git', ['add', filePath], { cwd: docsRepoPath, githubToken });

    const commitMsg = `chore(docs): content maintenance (${validatedOn})

Applied ${appliedCount} suggestion(s):
${suggestions.slice(0, 5).map(s => `- ${s.type}: ${s.description}`).join('\n')}
${suggestions.length > 5 ? `... and ${suggestions.length - 5} more` : ''}

Co-Authored-By: ${user.github_username} (via Auth0 IA)`;

    run('git', ['commit', '-m', commitMsg], { cwd: docsRepoPath, githubToken });

    // Push branch
    run('git', ['push', '-u', 'origin', branchName], { cwd: docsRepoPath, githubToken });

    // Return compare URL
    const compareUrl = `https://github.com/${targetRepo}/compare/${baseBranch}...${branchName}?expand=1&title=${encodeURIComponent(prTitle)}${prBody ? `&body=${encodeURIComponent(prBody)}` : ''}`;

    return NextResponse.json({
      ok: true,
      appliedCount,
      branchName,
      compareUrl,
    });

  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err?.message || String(err),
    }, { status: 500 });
  }
}
