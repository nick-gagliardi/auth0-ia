import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { requireSession } from '@/lib/session';

type ReviewComment = {
  path: string;
  body: string;
  line?: number;
  originalText?: string;
  suggestion?: string;
};

type PublishResult = {
  ok: boolean;
  error?: string;
  reviewUrl?: string;
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
          GH_TOKEN: token,
          GITHUB_TOKEN: token,
        };
      }
    }

    return execSync(fullCmd, execOptions);
  } catch (e: any) {
    throw new Error(e?.stderr || e?.message || String(e));
  }
}

// Helper to run shell commands with GitHub token
function runWithToken(cmd: string, githubToken?: string): string {
  const token = githubToken || process.env.MAINTENANCE_GH_TOKEN;
  const env = token ? {
    ...process.env,
    GH_TOKEN: token,
    GITHUB_TOKEN: token,
  } : process.env;

  return execSync(cmd, {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    env,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse<PublishResult>> {
  try {
    // Get authenticated user and their GitHub token
    const { user } = await requireSession();
    const githubToken = user.github_access_token_decrypted;

    const { prUrl, comments, summary } = await req.json();

    if (!prUrl || typeof prUrl !== 'string') {
      return NextResponse.json({ ok: false, error: 'Missing prUrl' }, { status: 400 });
    }

    // Parse PR URL
    const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
      return NextResponse.json({ ok: false, error: 'Invalid PR URL format' }, { status: 400 });
    }

    const [, owner, repo, prNumber] = match;
    const fullRepo = `${owner}/${repo}`;

    // Get PR details including the head commit SHA
    const prDetailsRaw = run('gh', [
      'pr', 'view', prNumber,
      '--repo', fullRepo,
      '--json', 'headRefOid',
    ], { githubToken });
    const prDetails = JSON.parse(prDetailsRaw);
    const commitId = prDetails.headRefOid;

    // Get the diff to find line positions
    const diffRaw = run('gh', [
      'pr', 'diff', prNumber,
      '--repo', fullRepo,
    ], { githubToken });

    // Parse diff to build a map of file -> line -> can comment
    // GitHub allows comments on any line visible in the diff (added, context, or removed)
    const diffLines = new Map<string, Set<number>>();
    const lines = diffRaw.split('\n');
    let currentFile = '';
    let fileLineNum = 0;

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        const fileMatch = line.match(/b\/(.+)$/);
        if (fileMatch) {
          currentFile = fileMatch[1];
          diffLines.set(currentFile, new Set());
        }
        continue;
      }

      if (line.startsWith('@@')) {
        const hunkMatch = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
        if (hunkMatch) {
          fileLineNum = parseInt(hunkMatch[1], 10) - 1;
        }
        continue;
      }

      if (!currentFile) continue;

      if (line.startsWith('-')) {
        // Deleted line - don't increment file line number, can't comment
        continue;
      }

      if (line.startsWith('\\')) {
        // "No newline at end of file" - skip
        continue;
      }

      // Context line (no prefix) or added line (+) - we can comment on these
      fileLineNum++;
      const fileSet = diffLines.get(currentFile);
      if (fileSet) {
        fileSet.add(fileLineNum);
      }
    }

    // Log what we parsed from the diff (full list for debugging)
    for (const [file, fileLines] of diffLines) {
      const sorted = Array.from(fileLines).sort((a, b) => a - b);
      console.log(`Diff lines for ${file}: [${sorted.join(', ')}] (${sorted.length} total)`);
    }

    // Build inline review comments - only for lines in the diff
    // GitHub doesn't allow multiple comments on the same line, so we deduplicate
    const inlineComments: { path: string; line: number; body: string }[] = [];
    const generalComments: ReviewComment[] = [];
    const usedLines = new Set<string>(); // Track path:line to prevent duplicates

    for (const comment of (comments || [])) {
      const fileSet = diffLines.get(comment.path);
      const canInline = comment.line && fileSet && fileSet.has(comment.line);
      const lineKey = `${comment.path}:${comment.line}`;
      const lineAlreadyUsed = usedLines.has(lineKey);

      console.log(`Comment on ${comment.path}:${comment.line} - canInline=${canInline}, lineAlreadyUsed=${lineAlreadyUsed}, fileSet has ${fileSet?.size || 0} lines`);

      if (canInline && !lineAlreadyUsed) {
        usedLines.add(lineKey);
        let body = comment.body;

        // If there's a suggestion, format it as a GitHub suggestion block
        if (comment.suggestion && comment.originalText) {
          body = `${comment.body}\n\n\`\`\`suggestion\n${comment.suggestion}\n\`\`\``;
        }

        inlineComments.push({
          path: comment.path,
          line: comment.line!,
          body,
        });
      } else {
        // Can't inline (not in diff, or line already has a comment) - add to general comments
        generalComments.push(comment);
      }
    }

    // Build summary body
    let reviewBody = summary || '## Content Audit Review\n\n_Automated review from Auth0-IA audit tool._';

    if (generalComments.length > 0) {
      reviewBody += '\n\n---\n\n### Audit Findings\n\n';

      const byFile = new Map<string, ReviewComment[]>();
      for (const c of generalComments) {
        if (!byFile.has(c.path)) byFile.set(c.path, []);
        byFile.get(c.path)!.push(c);
      }

      for (const [filePath, fileComments] of byFile) {
        reviewBody += `\n#### 📄 \`${filePath}\`\n\n`;
        for (const c of fileComments) {
          const lineNum = c.line ? `Line ${c.line}` : 'General';
          const messageFirstLine = c.body.split('\n')[0];

          if (c.suggestion && c.originalText) {
            // Has a concrete suggestion with original text
            reviewBody += `- **${lineNum}:** ${messageFirstLine}\n`;
            reviewBody += `  <details><summary>💡 Suggested fix</summary>\n\n`;
            reviewBody += `  **Replace:**\n  \`\`\`\n  ${c.originalText}\n  \`\`\`\n\n`;
            reviewBody += `  **With:**\n  \`\`\`\n  ${c.suggestion}\n  \`\`\`\n  </details>\n\n`;
          } else if (c.suggestion) {
            // Has suggestion but no original text
            reviewBody += `- **${lineNum}:** ${messageFirstLine}\n`;
            reviewBody += `  - 💡 Suggestion: \`${c.suggestion}\`\n\n`;
          } else {
            // No suggestion
            reviewBody += `- **${lineNum}:** ${messageFirstLine}\n\n`;
          }
        }
      }
    }

    // First, delete any pending reviews from the current user
    try {
      const pendingReviewsRaw = runWithToken(
        `gh api /repos/${fullRepo}/pulls/${prNumber}/reviews --jq '[.[] | select(.state == "PENDING")] | .[0].id' 2>/dev/null || echo ""`,
        githubToken
      ).trim();

      if (pendingReviewsRaw && pendingReviewsRaw !== 'null') {
        console.log(`Found pending review ${pendingReviewsRaw}, deleting...`);
        runWithToken(
          `gh api --method DELETE /repos/${fullRepo}/pulls/${prNumber}/reviews/${pendingReviewsRaw} 2>&1 || true`,
          githubToken
        );
        console.log('Deleted pending review');
      }
    } catch (e) {
      console.log('No pending review to delete or error checking:', e);
    }

    // Try to post inline comments as a review first
    if (inlineComments.length > 0) {
      const reviewPayload = {
        commit_id: commitId,
        body: reviewBody,
        event: 'COMMENT',
        comments: inlineComments.map(c => ({
          path: c.path,
          line: c.line,
          side: 'RIGHT', // Comment on the new version of the file
          body: c.body,
        })),
      };

      const tmpFile = path.join(os.tmpdir(), `pr-review-${Date.now()}.json`);
      const payloadStr = JSON.stringify(reviewPayload, null, 2);
      fs.writeFileSync(tmpFile, payloadStr, 'utf8');

      // Debug: log payload for troubleshooting
      console.log('Review payload:', payloadStr.slice(0, 500) + '...');
      console.log('Comment count:', reviewPayload.comments.length);
      console.log('Inline comments:', JSON.stringify(reviewPayload.comments, null, 2));

      try {
        // Use -i to include headers and capture the full response
        const result = runWithToken(
          `gh api --method POST /repos/${fullRepo}/pulls/${prNumber}/reviews --input ${tmpFile} 2>&1 || true`,
          githubToken
        );
        console.log('GitHub API response:', result);

        if (result.includes('Unprocessable Entity') || result.includes('422')) {
          throw new Error(result);
        }
        console.log('Review created successfully with inline comments!');
      } catch (reviewErr: any) {
        console.error('Review API error:', reviewErr?.message);
        // If review API fails, fall back to posting as regular comment
        const fallbackBody = reviewBody;
        if (inlineComments.length > 0) {
          const byFileInline = new Map<string, typeof inlineComments>();
          for (const c of inlineComments) {
            if (!byFileInline.has(c.path)) byFileInline.set(c.path, []);
            byFileInline.get(c.path)!.push(c);
          }
          let inlineSection = '\n\n---\n\n### Issues on Changed Lines\n\n_(Could not add inline - API error. Please apply manually.)_\n\n';
          for (const [fp, cmts] of byFileInline) {
            inlineSection += `\n#### 📄 \`${fp}\`\n\n`;
            for (const c of cmts) {
              inlineSection += `- **Line ${c.line}:** ${c.body}\n\n`;
            }
          }
          const combinedBody = fallbackBody + inlineSection;
          const fallbackFile = path.join(os.tmpdir(), `pr-review-fallback-${Date.now()}.md`);
          fs.writeFileSync(fallbackFile, combinedBody, 'utf8');
          try {
            run('gh', ['pr', 'comment', prNumber, '--repo', fullRepo, '--body-file', fallbackFile], { githubToken });
          } finally {
            try { fs.unlinkSync(fallbackFile); } catch {}
          }
        }
      } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
      }
    } else if (generalComments.length > 0 || reviewBody) {
      // No inline comments, just post the general review
      const tmpFile = path.join(os.tmpdir(), `pr-review-${Date.now()}.md`);
      fs.writeFileSync(tmpFile, reviewBody, 'utf8');

      try {
        run('gh', [
          'pr', 'comment', prNumber,
          '--repo', fullRepo,
          '--body-file', tmpFile,
        ], { githubToken });
      } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
      }
    }

    return NextResponse.json({
      ok: true,
      reviewUrl: `https://github.com/${fullRepo}/pull/${prNumber}`,
    });

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
