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
 * Ask Claude to refine the approximate suggestions against the real MDX source.
 * Returns exact before/after pairs that can be safely find-replaced.
 */
async function refineSuggestionsWithAi(
  mdxContent: string,
  approximateSuggestions: Array<{ before: string; after: string }>,
  apiKey: string,
): Promise<Array<{ before: string; after: string }>> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const isLiteLLMProxy = baseUrl.includes('llm.atko.ai');
  const model = process.env.ANTHROPIC_MODEL || 'claude-4-5-sonnet';

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isLiteLLMProxy) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  }

  const suggestionsBlock = approximateSuggestions.map((s, i) =>
    `### Suggestion ${i + 1}\nApproximate before: ${JSON.stringify(s.before)}\nIntended after: ${JSON.stringify(s.after)}`
  ).join('\n\n');

  const prompt = `You are a precise text-replacement engine. You are given an MDX file and a set of approximate find-replace suggestions. The "before" text in each suggestion is APPROXIMATE — it was generated without access to the real file, so it may have whitespace, formatting, or minor wording differences.

Your job: for each suggestion, find the EXACT text in the MDX file that corresponds to the approximate "before", and return the precise before/after pair that can be used for a literal string replacement.

<mdx-file-content>
${mdxContent.slice(0, 25000)}
</mdx-file-content>

## Approximate Suggestions
${suggestionsBlock}

## Instructions
For each suggestion:
1. Find the exact substring in the MDX that matches the intent of the approximate "before"
2. Copy it VERBATIM (exact whitespace, newlines, markdown formatting, backticks, everything)
3. Produce the "after" text that should replace it, maintaining the same formatting style

Return ONLY a JSON object:
{
  "refined": [
    {
      "before": "EXACT verbatim text from the MDX file (must be findable via string.includes())",
      "after": "replacement text"
    }
  ]
}

Critical rules:
- "before" MUST be an exact substring of the MDX file — copy it character-for-character
- Include enough context in "before" to be unique (avoid matching multiple places)
- Preserve MDX formatting (backticks, links, frontmatter, JSX components)
- If you cannot find a match for a suggestion, omit it from the array
- Return ONLY the JSON, no other text`;

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    console.error('[Rules Deprecation] AI refinement error:', response.status);
    return []; // Fall back to direct application
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.refined || [];
  } catch {
    return [];
  }
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

    // 4. Refine suggestions with Claude using the real MDX source
    const apiKey = user.anthropic_api_key_decrypted || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

    let refinedSuggestions = body.suggestions;
    if (apiKey) {
      console.log('[Rules Deprecation] Refining suggestions with AI against real MDX source...');
      const refined = await refineSuggestionsWithAi(content, body.suggestions, apiKey);
      if (refined.length > 0) {
        refinedSuggestions = refined;
        console.log(`[Rules Deprecation] AI refined ${refined.length} suggestions from ${body.suggestions.length} originals`);
      } else {
        console.warn('[Rules Deprecation] AI refinement returned no results, falling back to direct match');
      }
    }

    // 5. Apply refined suggestions
    let appliedCount = 0;
    const applied: string[] = [];
    const skipped: string[] = [];

    for (const suggestion of refinedSuggestions) {
      if (!suggestion.before) { skipped.push('(empty before)'); continue; }

      if (content.includes(suggestion.before)) {
        content = content.replace(suggestion.before, suggestion.after);
        appliedCount++;
        applied.push(suggestion.before.slice(0, 80));
      } else {
        skipped.push(suggestion.before.slice(0, 80));
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
          error: `No suggestions could be applied even after AI refinement. The changes may require manual editing.`,
          skipped,
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
      `**Changes applied:** ${appliedCount} of ${refinedSuggestions.length} suggestions`,
      '',
      '## Applied',
      '',
      ...applied.map((a, i) => `${i + 1}. \`${a.replace(/\n/g, ' ')}\``),
      '',
      ...(skipped.length > 0 ? [
        '## Skipped (could not match in source)',
        '',
        ...skipped.map((s, i) => `${i + 1}. \`${s.replace(/\n/g, ' ')}\``),
        '',
      ] : []),
      '---',
      '',
      'Generated by auth0-ia Rules Deprecation Tracker (AI-refined against MDX source)',
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

    return NextResponse.json({ ok: true, prUrl: pr.html_url, prNumber: pr.number, branchName, appliedCount, skippedCount: skipped.length, skipped });
  } catch (err: any) {
    console.error('[Rules Deprecation] open-pr error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 400 }
    );
  }
}
