import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@vercel/postgres';
import { requireSession } from '@/lib/session';

const BodySchema = z.object({
  filePath: z.string().min(1),
  suggestions: z.array(z.object({
    before: z.string(),
    after: z.string(),
  })),
  prTitle: z.string().optional(),
  prBody: z.string().optional(),
  targetRepo: z.string().optional(),
});

function b64encode(s: string) {
  return Buffer.from(s, 'utf8').toString('base64');
}

async function gh<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function POST(req: Request) {
  try {
    const { user } = await requireSession();
    const body = BodySchema.parse(await req.json());

    const ghToken = process.env.MAINTENANCE_GH_TOKEN || user.github_pat_decrypted || user.github_access_token_decrypted;
    if (!ghToken) throw new Error('No GitHub token configured (MAINTENANCE_GH_TOKEN or user PAT).');
    const defaultTarget = process.env.MAINTENANCE_UPSTREAM_REPO || 'auth0/docs-v2';
    const targetRepo = (body.targetRepo || defaultTarget).trim();
    const [owner, repo] = targetRepo.split('/');
    if (!owner || !repo) throw new Error(`Invalid targetRepo: ${targetRepo}`);

    const baseBranch = process.env.MAINTENANCE_BASE_BRANCH || 'main';

    // 1. Get base branch SHA
    const baseRef = await gh<{ object: { sha: string } }>(
      ghToken,
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`
    );
    const baseSha = baseRef.object.sha;

    // 2. Create branch
    const slug = body.filePath
      .replace(/^[./]+/, '')
      .replace(/[^a-zA-Z0-9/_-]+/g, '-')
      .slice(0, 80)
      .replace(/\//g, '-');
    const branchName = `rules-deprecation/${slug}-${Date.now()}`;

    await gh(ghToken, `/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
    });

    // 3. Fetch file content
    const file = await gh<{ sha: string; content: string; encoding: string }>(
      ghToken,
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(body.filePath)}?ref=${encodeURIComponent(branchName)}`
    );
    if (file.encoding !== 'base64') throw new Error(`Unexpected encoding: ${file.encoding}`);
    let content = Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8');

    // 4. Apply suggestions with fuzzy matching
    let appliedCount = 0;
    const applied: string[] = [];
    const skipped: string[] = [];

    for (const suggestion of body.suggestions) {
      if (!suggestion.before) { skipped.push('(empty before)'); continue; }

      // Try exact match first
      if (content.includes(suggestion.before)) {
        content = content.replace(suggestion.before, suggestion.after);
        appliedCount++;
        applied.push(suggestion.before.slice(0, 60));
        continue;
      }

      // Try normalized whitespace match: collapse runs of whitespace to single space
      const normalizedBefore = suggestion.before.replace(/\s+/g, ' ').trim();
      const lines = content.split('\n');
      let matched = false;

      // Sliding window over lines to find a match
      for (let i = 0; i < lines.length && !matched; i++) {
        for (let j = i + 1; j <= Math.min(i + 20, lines.length); j++) {
          const chunk = lines.slice(i, j).join('\n');
          const normalizedChunk = chunk.replace(/\s+/g, ' ').trim();
          if (normalizedChunk === normalizedBefore) {
            content = content.replace(chunk, suggestion.after);
            appliedCount++;
            applied.push(suggestion.before.slice(0, 60));
            matched = true;
            break;
          }
        }
      }

      // Try substring match: find the longest unique substring from "before" in the content
      if (!matched && normalizedBefore.length > 30) {
        // Use the middle portion as an anchor (more unique than start/end)
        const mid = Math.floor(normalizedBefore.length / 2);
        const anchor = normalizedBefore.slice(Math.max(0, mid - 40), mid + 40).trim();
        if (anchor.length > 20) {
          // Find the line containing this anchor
          const anchorIdx = content.indexOf(anchor);
          if (anchorIdx === -1) {
            // Try with normalized content
            const normContent = content.replace(/\s+/g, ' ');
            const normIdx = normContent.indexOf(anchor);
            if (normIdx === -1) {
              skipped.push(suggestion.before.slice(0, 60));
            } else {
              // Can't safely replace with normalized content, skip
              skipped.push(suggestion.before.slice(0, 60) + ' (fuzzy only)');
            }
          } else {
            skipped.push(suggestion.before.slice(0, 60) + ' (partial match, skipped for safety)');
          }
        } else {
          skipped.push(suggestion.before.slice(0, 60));
        }
      } else if (!matched) {
        skipped.push(suggestion.before.slice(0, 60));
      }
    }

    if (appliedCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `No suggestions could be applied. The AI-generated "before" text didn't match the actual file content.`,
          skipped,
        },
        { status: 400 }
      );
    }

    // 5. Commit
    await gh(ghToken, `/repos/${owner}/${repo}/contents/${encodeURIComponent(body.filePath)}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `docs: migrate Rules to Actions in ${body.filePath.replace('main/docs/', '')}`,
        content: b64encode(content),
        sha: file.sha,
        branch: branchName,
      }),
    });

    // 6. Open PR
    const prTitle = body.prTitle || `docs: migrate Rules references to Actions in ${body.filePath.replace('main/docs/', '')}`;
    const prBodyLines = [
      '## Summary',
      '',
      `Migrates Auth0 Rules references to Auth0 Actions in \`${body.filePath.replace('main/docs/', '')}\`.`,
      '',
      `**Changes applied:** ${appliedCount} of ${body.suggestions.length} suggestions`,
      '',
      '## Applied',
      '',
      ...applied.map((a, i) => `${i + 1}. \`${a.replace(/\n/g, ' ')}...\``),
      '',
      ...(skipped.length > 0 ? [
        '## Skipped (could not match in source)',
        '',
        ...skipped.map((s, i) => `${i + 1}. \`${s.replace(/\n/g, ' ')}\``),
        '',
        '> Skipped suggestions had "before" text that didn\'t exactly match the MDX source. These may need manual review.',
        '',
      ] : []),
      '---',
      '',
      'Generated by auth0-ia Rules Deprecation Tracker',
    ];

    const pr = await gh<{ html_url: string; number: number }>(
      ghToken,
      `/repos/${owner}/${repo}/pulls`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: prTitle,
          head: branchName,
          base: baseBranch,
          body: body.prBody || prBodyLines.join('\n'),
        }),
      }
    );

    // 7. Update status in DB
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS rules_deprecation_status (
          file_path TEXT PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'pending',
          pr_url TEXT,
          notes TEXT,
          updated_by TEXT,
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `;
      await sql`
        INSERT INTO rules_deprecation_status (file_path, status, pr_url, updated_by, updated_at)
        VALUES (${body.filePath}, 'in_progress', ${pr.html_url}, ${user.github_username}, NOW())
        ON CONFLICT (file_path) DO UPDATE SET
          status = 'in_progress',
          pr_url = ${pr.html_url},
          updated_by = ${user.github_username},
          updated_at = NOW()
      `;
    } catch (dbErr) {
      // Non-fatal: PR was created, just status tracking failed
      console.warn('[Rules Deprecation] DB status update failed:', dbErr);
    }

    return NextResponse.json({ ok: true, prUrl: pr.html_url, prNumber: pr.number, branchName, appliedCount, skippedCount: skipped.length, skipped });
  } catch (err: any) {
    console.error('[Rules Deprecation] open-pr error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 400 }
    );
  }
}
