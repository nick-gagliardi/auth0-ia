import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@vercel/postgres';
import { requireSession } from '@/lib/session';

const BodySchema = z.object({
  filePath: z.string().min(1),
  modifiedContent: z.string().min(1),          // The full modified MDX (AI-applied client-side)
  changesApplied: z.number().int().min(1),      // How many changes were applied
  totalSuggestions: z.number().int().optional(),
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

/**
 * Ask Claude to apply the suggestions directly to the MDX source and return
 * the complete modified file. This avoids the fragile find-replace approach
 * where multiline code blocks and special characters cause match failures.
 */
async function applyWithAi(
  mdxContent: string,
  suggestions: Array<{ before: string; after: string }>,
  apiKey: string,
): Promise<{ modifiedContent: string; changesApplied: number } | null> {
  // If the proxy URL is configured but no proxy token exists, bypass the proxy
  // and call Anthropic directly with the user's stored key.
  const configuredBaseUrl = process.env.NEXT_PUBLIC_ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const isLiteLLMProxy = configuredBaseUrl.includes('llm.atko.ai');
  const proxyToken = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

  const useProxy = isLiteLLMProxy && !!proxyToken;
  const baseUrl = useProxy ? configuredBaseUrl : 'https://api.anthropic.com';
  const finalKey = useProxy ? proxyToken : apiKey;
  const model = process.env.NEXT_PUBLIC_ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
  console.log('[Rules Deprecation] AI config:', { baseUrl, model, useProxy });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (useProxy) {
    headers['Authorization'] = `Bearer ${finalKey}`;
  } else {
    headers['x-api-key'] = finalKey;
    headers['anthropic-version'] = '2023-06-01';
  }

  const suggestionsBlock = suggestions.map((s, i) =>
    `### Change ${i + 1}\nWhat to find (approximate): ${JSON.stringify(s.before)}\nReplace with: ${JSON.stringify(s.after)}`
  ).join('\n\n');

  const prompt = `You are given an MDX documentation file and a set of changes to apply. Each change has an approximate "before" text (which may not match the file exactly) and the intended replacement.

Apply ALL the changes to the file and return the COMPLETE modified file.

<mdx-file-content>
${mdxContent}
</mdx-file-content>

## Changes to apply
${suggestionsBlock}

## Instructions
1. For each change, find the corresponding text in the MDX file (it may differ slightly from the approximate "before")
2. Replace it with the specified replacement text
3. Preserve all other content EXACTLY as-is (frontmatter, formatting, components, links, whitespace)
4. Return the COMPLETE modified file

Return your response in this exact format:
<applied-count>N</applied-count>
<modified-file>
...the complete modified MDX file...
</modified-file>

Critical rules:
- Output the ENTIRE file, not just changed sections
- Do NOT add, remove, or modify anything that isn't covered by the changes above
- Preserve exact whitespace, newlines, and formatting of unchanged content
- The applied-count should reflect how many of the changes you actually applied`;

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 16384,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('[Rules Deprecation] AI apply error:', response.status, errText.slice(0, 500));
    return null;
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  console.log('[Rules Deprecation] AI response length:', text.length, 'first 200 chars:', text.slice(0, 200));

  // Extract applied count
  const countMatch = text.match(/<applied-count>(\d+)<\/applied-count>/);
  const changesApplied = countMatch ? parseInt(countMatch[1], 10) : 0;

  // Extract modified file
  const fileMatch = text.match(/<modified-file>\n?([\s\S]*?)\n?<\/modified-file>/);
  if (!fileMatch) {
    console.error('[Rules Deprecation] Could not find <modified-file> tags in AI response. Response preview:', text.slice(0, 500));
    return null;
  }

  const modifiedContent = fileMatch[1];

  // Sanity check: modified file should be similar length (not truncated or wildly different)
  if (modifiedContent.length < mdxContent.length * 0.5 || modifiedContent.length > mdxContent.length * 2) {
    console.warn('[Rules Deprecation] AI output length suspicious, skipping', {
      original: mdxContent.length,
      modified: modifiedContent.length,
    });
    return null;
  }

  return { modifiedContent, changesApplied };
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

    // 3. Fetch file SHA (needed for the commit)
    const file = await gh<{ sha: string }>(
      ghToken,
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(body.filePath)}?ref=${encodeURIComponent(branchName)}`
    );

    // 4. Commit the modified content (AI changes already applied client-side)
    await gh(ghToken, `/repos/${owner}/${repo}/contents/${encodeURIComponent(body.filePath)}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `docs: migrate Rules to Actions in ${body.filePath.replace('main/docs/', '')}`,
        content: b64encode(body.modifiedContent),
        sha: file.sha,
        branch: branchName,
      }),
    });

    // 5. Open PR
    const appliedCount = body.changesApplied;
    const totalSuggestions = body.totalSuggestions || appliedCount;
    const prTitle = body.prTitle || `docs: migrate Rules references to Actions in ${body.filePath.replace('main/docs/', '')}`;
    const prBodyLines = [
      '## Summary',
      '',
      `Migrates Auth0 Rules references to Auth0 Actions in \`${body.filePath.replace('main/docs/', '')}\`.`,
      '',
      `**Changes applied:** ${appliedCount} of ${totalSuggestions} suggestions`,
      '',
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

    // 8. Update status in DB
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
      console.warn('[Rules Deprecation] DB status update failed:', dbErr);
    }

    return NextResponse.json({ ok: true, prUrl: pr.html_url, prNumber: pr.number, branchName, appliedCount, totalSuggestions });
  } catch (err: any) {
    console.error('[Rules Deprecation] open-pr error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 400 }
    );
  }
}
