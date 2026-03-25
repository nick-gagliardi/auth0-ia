import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireSession();

    const body = await req.json();
    const {
      targetSite,
      generatedFiles,
      navigationUpdate,
      featureSummary,
      docsToUpdate,
      crossLinks,
    } = body;

    if (!generatedFiles || generatedFiles.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No files to create' },
        { status: 400 }
      );
    }

    // Clone docs-v2 repo to a new temp directory for PR creation
    const tmpDir = os.tmpdir();
    const workDir = path.join(tmpDir, `doc-gen-pr-${Date.now()}`);
    const repoUrl = 'https://github.com/auth0/docs-v2.git';

    console.log('[DocGenerator PR] Cloning docs-v2 repo...');
    await execAsync(`git clone ${repoUrl} ${workDir}`);

    // Configure git
    await execAsync('git config user.email "github-actions[bot]@users.noreply.github.com"', { cwd: workDir });
    await execAsync('git config user.name "github-actions[bot]"', { cwd: workDir });

    // Create branch
    const branchName = `doc-gen/${targetSite}/${Date.now()}`;
    await execAsync(`git checkout -b ${branchName}`, { cwd: workDir });

    // Write generated files
    for (const file of generatedFiles) {
      const filePath = path.join(workDir, file.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content, 'utf-8');
      await execAsync(`git add "${file.path}"`, { cwd: workDir });
    }

    // Update docs.json if navigation update provided
    if (navigationUpdate?.jsonSnippet) {
      const docsJsonPath = path.join(workDir, targetSite, 'docs.json');
      try {
        const docsJson = await fs.readFile(docsJsonPath, 'utf-8');
        // This is simplistic - in reality you'd need to parse and merge JSON properly
        // For now, add a comment about manual nav update needed
        const updatedJson = docsJson + `\n\n/* TODO: Add navigation entry:\n${navigationUpdate.jsonSnippet}\n*/`;
        await fs.writeFile(docsJsonPath, updatedJson, 'utf-8');
        await execAsync(`git add ${targetSite}/docs.json`, { cwd: workDir });
      } catch (err) {
        console.warn('[DocGenerator PR] Could not update docs.json:', err);
      }
    }

    // Build PR body
    const prBody = buildPrBody(featureSummary, generatedFiles, docsToUpdate, crossLinks, navigationUpdate);

    // Commit
    const commitMsg = `docs: add documentation for ${featureSummary?.what || 'new feature'}

Generated via Doc Generator tool`;
    await execAsync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: workDir });

    // Push to user's fork using their GitHub token
    const token = user.github_access_token_decrypted;
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'GitHub token not available' },
        { status: 401 }
      );
    }

    // Get GitHub username
    const githubUser = user.github_username || 'unknown';

    // Set remote to user's fork (or create one)
    const forkUrl = `https://${token}@github.com/${githubUser}/docs-v2.git`;

    try {
      await execAsync(`git remote add fork ${forkUrl}`, { cwd: workDir });
    } catch {
      // Remote might already exist
    }

    // Push to fork
    try {
      await execAsync(`git push fork ${branchName}`, { cwd: workDir });
    } catch (err: any) {
      // User might not have a fork - need to create one via GitHub API
      console.log('[DocGenerator PR] Creating fork...');
      const forkRes = await fetch('https://api.github.com/repos/auth0/docs-v2/forks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!forkRes.ok) {
        throw new Error(`Failed to create fork: ${await forkRes.text()}`);
      }

      // Wait a bit for fork to be created
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Try push again
      await execAsync(`git push fork ${branchName}`, { cwd: workDir });
    }

    // Create PR via GitHub API
    const prRes = await fetch('https://api.github.com/repos/auth0/docs-v2/pulls', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `docs: ${featureSummary?.what || 'Add new documentation'}`,
        body: prBody,
        head: `${githubUser}:${branchName}`,
        base: 'main',
      }),
    });

    if (!prRes.ok) {
      const errorText = await prRes.text();
      throw new Error(`Failed to create PR: ${errorText}`);
    }

    const pr = await prRes.json();

    // Clean up work directory
    await fs.rm(workDir, { recursive: true, force: true });

    return NextResponse.json({
      ok: true,
      prUrl: pr.html_url,
      prNumber: pr.number,
    });
  } catch (err: any) {
    console.error('[DocGenerator PR] Error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to create PR' },
      { status: 500 }
    );
  }
}

function buildPrBody(
  featureSummary: any,
  generatedFiles: any[],
  docsToUpdate: any[],
  crossLinks: any[],
  navigationUpdate: any
): string {
  const lines = [
    '## Documentation Generated',
    '',
    '### Feature Summary',
    '',
    `**What:** ${featureSummary?.what || 'N/A'}`,
    `**Who:** ${featureSummary?.who || 'N/A'}`,
    `**Why:** ${featureSummary?.why || 'N/A'}`,
    '',
    '### New Documentation Files',
    '',
  ];

  for (const file of generatedFiles) {
    lines.push(`- \`${file.path}\`: ${file.title}`);
  }

  if (docsToUpdate && docsToUpdate.length > 0) {
    lines.push('', '### Existing Docs to Update', '');
    for (const update of docsToUpdate) {
      lines.push(`- \`${update.path}\`: ${update.change}`);
    }
  }

  if (crossLinks && crossLinks.length > 0) {
    lines.push('', '### Suggested Cross-Links', '');
    for (const link of crossLinks) {
      lines.push(`- From \`${link.fromPage}\`: ${link.linkText}`);
    }
  }

  if (navigationUpdate) {
    lines.push('', '### Navigation Update', '');
    lines.push(`**Section:** ${navigationUpdate.section}`);
    lines.push('', '```json', navigationUpdate.jsonSnippet || 'See code', '```');
  }

  lines.push('', '---');
  lines.push('Generated with Doc Generator tool');

  return lines.join('\n');
}
