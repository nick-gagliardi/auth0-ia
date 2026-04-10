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
  // Use same env vars as client-side (NEXT_PUBLIC_*) with server-side fallbacks
  const baseUrl = process.env.NEXT_PUBLIC_ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const isLiteLLMProxy = baseUrl.includes('llm.atko.ai');
  const model = process.env.NEXT_PUBLIC_ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || 'claude-4-5-sonnet';
  console.log('[Rules Deprecation] AI config:', { baseUrl, model, hasApiKey: !!apiKey });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isLiteLLMProxy) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else {
    headers['x-api-key'] = apiKey;
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
    const { user } = await requireSession(true);
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

    // 4. Have Claude apply the suggestions directly to the MDX source
    const apiKey = user.anthropic_api_key_decrypted || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

    let appliedCount = 0;

    if (apiKey) {
      console.log('[Rules Deprecation] Asking AI to apply changes to real MDX source...');
      const result = await applyWithAi(content, body.suggestions, apiKey);

      if (result) {
        content = result.modifiedContent;
        appliedCount = result.changesApplied;
        console.log(`[Rules Deprecation] AI applied ${appliedCount} of ${body.suggestions.length} changes`);
      }
    }

    // Fallback: try direct string matching if AI didn't work
    if (appliedCount === 0) {
      console.log('[Rules Deprecation] Falling back to direct string matching...');
      for (const suggestion of body.suggestions) {
        if (suggestion.before && content.includes(suggestion.before)) {
          content = content.replace(suggestion.before, suggestion.after);
          appliedCount++;
        }
      }
    }

    if (appliedCount === 0) {
      // Clean up the branch since we won't use it
      try {
        await gh(ghToken, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`, { method: 'DELETE' });
      } catch { /* ignore cleanup errors */ }

      return NextResponse.json(
        {
          ok: false,
          error: 'No changes could be applied. The suggestions may require manual editing.',
        },
        { status: 400 }
      );
    }

    // 6. Commit
    await gh(ghToken, `/repos/${owner}/${repo}/contents/${encodeURIComponent(body.filePath)}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `docs: migrate Rules to Actions in ${body.filePath.replace('main/docs/', '')}`,
        content: b64encode(content),
        sha: file.sha,
        branch: branchName,
      }),
    });

    // 7. Open PR
    const prTitle = body.prTitle || `docs: migrate Rules references to Actions in ${body.filePath.replace('main/docs/', '')}`;
    const prBodyLines = [
      '## Summary',
      '',
      `Migrates Auth0 Rules references to Auth0 Actions in \`${body.filePath.replace('main/docs/', '')}\`.`,
      '',
      `**Changes applied:** ${appliedCount} of ${body.suggestions.length} suggestions`,
      '',
      '## Requested changes',
      '',
      ...body.suggestions.slice(0, 10).map((s, i) => {
        const preview = (s.before || '').slice(0, 80).replace(/\n/g, ' ');
        return `${i + 1}. \`${preview}${(s.before || '').length > 80 ? '...' : ''}\``;
      }),
      '',
      '---',
      '',
      'Generated by auth0-ia Rules Deprecation Tracker (AI-applied to MDX source)',
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

    return NextResponse.json({ ok: true, prUrl: pr.html_url, prNumber: pr.number, branchName, appliedCount, totalSuggestions: body.suggestions.length });
  } catch (err: any) {
    console.error('[Rules Deprecation] open-pr error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 400 }
    );
  }
}
