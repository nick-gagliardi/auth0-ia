import { NextResponse } from 'next/server';
import { z } from 'zod';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { requireSession } from '@/lib/session';

const RefactorPlanSchema = z.object({
  kind: z.literal('refactor-plan'),
  version: z.number(),
  operation: z.enum(['move-page', 'move-subtree']),
  source: z.object({
    id: z.string(),
    title: z.string().nullable(),
    permalink: z.string(),
    filePath: z.string(),
    navPaths: z.array(z.string()),
  }),
  destination: z.object({
    permalink: z.string().nullable(),
    filePath: z.string().nullable(),
  }),
  proposed: z.object({
    moves: z.array(z.object({
      from: z.string(),
      to: z.string(),
    })),
    redirects: z.array(z.object({
      from: z.string(),
      to: z.string(),
    })),
    linkRewrites: z.array(z.object({
      file: z.string(),
      oldLink: z.string(),
      newLink: z.string(),
      line: z.number().optional(),
    })),
    docsJsonEdits: z.array(z.any()),
  }),
});

const BodySchema = z.object({
  plan: RefactorPlanSchema,
  prTitle: z.string().min(1),
  prBody: z.string().optional(),
  applyLinkRewrites: z.boolean().default(true),
  applyRedirects: z.boolean().default(true),
});

function run(cmd: string, args: string[], options?: { cwd?: string; githubToken?: string }): string {
  try {
    const execOptions: any = {
      cwd: options?.cwd,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    };

    if (options?.githubToken && cmd === 'git') {
      const token = options.githubToken || process.env.MAINTENANCE_GH_TOKEN;
      if (token) {
        execOptions.env = {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GH_TOKEN: token,
        };
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
    const { user } = await requireSession();
    const githubToken = user.github_access_token_decrypted;

    const body = BodySchema.parse(await req.json());
    const { plan, prTitle, prBody, applyLinkRewrites, applyRedirects } = body;

    const docsRepoPath = process.env.MAINTENANCE_DOCS_REPO_PATH;
    if (!docsRepoPath) {
      return NextResponse.json({
        ok: false,
        error: 'MAINTENANCE_DOCS_REPO_PATH not configured',
      }, { status: 400 });
    }

    const targetRepo = process.env.MAINTENANCE_UPSTREAM_REPO || 'auth0/docs-v2';
    const baseBranch = process.env.MAINTENANCE_BASE_BRANCH || 'main';

    // Verify source file exists
    const sourceAbs = path.resolve(docsRepoPath, plan.source.filePath);
    if (!fs.existsSync(sourceAbs)) {
      return NextResponse.json({
        ok: false,
        error: `Source file not found: ${plan.source.filePath}`,
      }, { status: 400 });
    }

    // Generate branch name
    const timestamp = Date.now();
    const slug = plan.source.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) || 'refactor';
    const branchName = `refactor/${slug}-${timestamp}`;

    // 1. Ensure we're on latest base branch
    run('git', ['fetch', 'origin', baseBranch], { cwd: docsRepoPath, githubToken });
    run('git', ['checkout', baseBranch], { cwd: docsRepoPath, githubToken });
    run('git', ['reset', '--hard', `origin/${baseBranch}`], { cwd: docsRepoPath, githubToken });

    // 2. Create and checkout new branch
    run('git', ['checkout', '-b', branchName], { cwd: docsRepoPath, githubToken });

    const changes: string[] = [];

    // 3. Apply file moves
    for (const move of plan.proposed.moves) {
      const fromAbs = path.resolve(docsRepoPath, move.from);
      const toAbs = path.resolve(docsRepoPath, move.to);

      if (!fs.existsSync(fromAbs)) {
        continue; // Skip if source doesn't exist
      }

      // Ensure destination directory exists
      const toDir = path.dirname(toAbs);
      if (!fs.existsSync(toDir)) {
        fs.mkdirSync(toDir, { recursive: true });
      }

      // Use git mv for proper tracking
      run('git', ['mv', move.from, move.to], { cwd: docsRepoPath, githubToken });
      changes.push(`Moved: ${move.from} → ${move.to}`);
    }

    // 4. Apply redirects (add to redirects config file if it exists)
    if (applyRedirects && plan.proposed.redirects.length > 0) {
      const redirectsPath = path.resolve(docsRepoPath, 'main/redirects.json');
      if (fs.existsSync(redirectsPath)) {
        try {
          const redirectsContent = fs.readFileSync(redirectsPath, 'utf-8');
          const redirects = JSON.parse(redirectsContent);

          for (const redirect of plan.proposed.redirects) {
            // Add redirect entry
            redirects.push({
              source: redirect.from,
              destination: redirect.to,
              permanent: true,
            });
            changes.push(`Redirect: ${redirect.from} → ${redirect.to}`);
          }

          fs.writeFileSync(redirectsPath, JSON.stringify(redirects, null, 2) + '\n');
        } catch (e) {
          // If redirects.json doesn't exist or can't be parsed, skip
          console.error('Could not update redirects.json:', e);
        }
      }
    }

    // 5. Apply link rewrites
    if (applyLinkRewrites && plan.proposed.linkRewrites.length > 0) {
      for (const rewrite of plan.proposed.linkRewrites) {
        const fileAbs = path.resolve(docsRepoPath, rewrite.file);
        if (!fs.existsSync(fileAbs)) continue;

        let content = fs.readFileSync(fileAbs, 'utf-8');
        const original = content;

        // Replace all instances of the old link with the new link
        const oldLinkPattern = rewrite.oldLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(oldLinkPattern, 'g');
        content = content.replace(regex, rewrite.newLink);

        if (content !== original) {
          fs.writeFileSync(fileAbs, content);
          changes.push(`Updated link in: ${rewrite.file}`);
        }
      }
    }

    // 6. Stage and commit
    run('git', ['add', '-A'], { cwd: docsRepoPath, githubToken });

    const commitMessage = [
      prTitle,
      '',
      'Changes:',
      ...changes.map(c => `- ${c}`),
      '',
      '---',
      'Generated by Auth0 IA Refactor Assistant',
    ].join('\n');

    run('git', ['commit', '-m', commitMessage], { cwd: docsRepoPath, githubToken });

    // 7. Push branch
    run('git', ['push', '-u', 'origin', branchName], { cwd: docsRepoPath, githubToken });

    // 8. Generate compare URL
    const compareUrl = `https://github.com/${targetRepo}/compare/${baseBranch}...${branchName}?expand=1&title=${encodeURIComponent(prTitle)}&body=${encodeURIComponent(prBody || '')}`;

    return NextResponse.json({
      ok: true,
      branchName,
      compareUrl,
      changes,
    });
  } catch (e: any) {
    console.error('Refactor error:', e);
    return NextResponse.json({
      ok: false,
      error: e?.message || 'Unknown error',
    }, { status: 500 });
  }
}
