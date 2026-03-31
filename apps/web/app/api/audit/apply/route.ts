import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as path from 'path';
import type { AuditSuggestion } from '@/types';
import { requireSession } from '@/lib/session';
import { fetchFile, getBranchSha, createBranch, updateFile, createPullRequest } from '../../lib/github';

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

export async function POST(req: Request) {
  try {
    // Get authenticated user and their GitHub token
    const { user } = await requireSession();

    // Prefer GitHub PAT over OAuth token (PAT bypasses OAuth app restrictions)
    const githubToken = user.github_pat_decrypted || user.github_access_token_decrypted;

    const body = BodySchema.parse(await req.json());
    const { filePath, validatedOn, prTitle, prBody, suggestions } = body;

    if (!githubToken) {
      return NextResponse.json({
        ok: false,
        error: 'GitHub authentication required. Please connect your GitHub account or configure a Personal Access Token in settings.',
      }, { status: 401 });
    }

    const targetRepo = process.env.MAINTENANCE_UPSTREAM_REPO || 'auth0/docs-v2';
    const baseBranch = process.env.MAINTENANCE_BASE_BRANCH || 'main';

    // Fetch file from GitHub API
    const file = await fetchFile(githubToken, targetRepo, filePath, baseBranch);
    let content = file.content;

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

    // Generate branch name
    const fileName = path.basename(filePath, path.extname(filePath))
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .slice(0, 20);
    const shortDate = validatedOn.replace(/-/g, '').slice(4); // MMDD
    const uniq = String(Date.now()).slice(-6);
    const branchName = `maint/${fileName}-${shortDate}-${uniq}`;

    // Get the current SHA of the base branch
    const baseSha = await getBranchSha(githubToken, targetRepo, baseBranch);

    // Create a new branch from base
    await createBranch(githubToken, targetRepo, branchName, baseSha);

    // Commit message
    const commitMsg = `chore(docs): content maintenance (${validatedOn})

Applied ${appliedCount} suggestion(s):
${suggestions.slice(0, 5).map(s => `- ${s.type}: ${s.description}`).join('\n')}
${suggestions.length > 5 ? `... and ${suggestions.length - 5} more` : ''}

Co-Authored-By: ${user.github_username} (via Auth0 IA)`;

    // Update the file on the new branch
    await updateFile(
      githubToken,
      targetRepo,
      filePath,
      content,
      commitMsg,
      branchName,
      file.sha
    );

    // Create pull request
    const pr = await createPullRequest(
      githubToken,
      targetRepo,
      prTitle,
      prBody || '',
      branchName,
      baseBranch
    );

    return NextResponse.json({
      ok: true,
      appliedCount,
      branchName,
      compareUrl: pr.url,
      prNumber: pr.number,
    });

  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err?.message || String(err),
    }, { status: 500 });
  }
}
