import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';

const BodySchema = z.object({
  filePath: z.string().min(1),
  categories: z.array(z.string()),
  evidence: z.array(z.object({
    line: z.number(),
    snippet: z.string(),
    category: z.string(),
  })),
});

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
    const { user } = await requireSession(true);
    const body = BodySchema.parse(await req.json());

    // Fetch page content from GitHub (use global maintenance token, already SSO-authorized)
    const ghToken = process.env.MAINTENANCE_GH_TOKEN || user.github_pat_decrypted || user.github_access_token_decrypted;
    if (!ghToken) {
      return NextResponse.json({ ok: false, error: 'No GitHub token configured (MAINTENANCE_GH_TOKEN or user PAT).' }, { status: 400 });
    }
    const targetRepo = process.env.MAINTENANCE_UPSTREAM_REPO || 'auth0/docs-v2';
    const [owner, repo] = targetRepo.split('/');
    const baseBranch = process.env.MAINTENANCE_BASE_BRANCH || 'main';

    const file = await gh<{ content: string; encoding: string }>(
      ghToken,
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(body.filePath)}?ref=${encodeURIComponent(baseBranch)}`
    );

    if (file.encoding !== 'base64') throw new Error(`Unexpected encoding: ${file.encoding}`);
    const content = Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8');

    // Call Claude for suggestions
    const apiKey = user.anthropic_api_key_decrypted || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
    const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'No Anthropic API key configured. Add one in Settings.' }, { status: 400 });
    }

    const isLiteLLMProxy = baseUrl.includes('llm.atko.ai');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (isLiteLLMProxy) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    const evidenceBlock = body.evidence
      .slice(0, 10)
      .map((e) => `- Line ${e.line} (${e.category}): "${e.snippet}"`)
      .join('\n');

    const prompt = `You are an Auth0 documentation migration specialist. Auth0 Rules (the legacy JavaScript-based extensibility system using \`function(user, context, callback)\`) has reached end-of-life and must be migrated to Auth0 Actions (the new serverless function system using \`exports.onExecutePostLogin = async (event, api) =>\`).

Analyze the following documentation page and provide specific rewrite suggestions to remove or update all Auth0 Rules references.

File: ${body.filePath}
Categories detected: ${body.categories.join(', ')}

Evidence of Rules references found:
${evidenceBlock}

Page content:
${content.slice(0, 20000)}

For each Rules reference, provide a concrete suggestion. Handle these cases:
1. **Code examples**: Rewrite \`function(user, context, callback)\` signatures to Actions format (\`exports.onExecutePostLogin\`). Map \`context.*\` to \`event.*\` / \`api.*\`. Remove \`callback()\` in favor of return values.
2. **Links**: Replace \`/docs/customize/rules\` with \`/docs/customize/actions\` equivalents.
3. **Prose**: Replace "Rules" product references with "Actions" where appropriate. Add deprecation notices where the page still needs to reference Rules for context.
4. **Suggestions to use Rules**: Reframe guidance to recommend Actions instead.

Return your response as JSON only:
{
  "suggestions": [
    {
      "before": "The exact original text from the document (verbatim, used for find-replace)",
      "after": "The exact replacement text",
      "explanation": "Brief explanation of why this change is needed",
      "category": "code|link|prose|suggestion",
      "confidence": "high|medium|low"
    }
  ]
}

Rules:
- "before" must be EXACT text from the document (copy verbatim)
- "after" must be the EXACT replacement (not instructions)
- For deletions, set "after" to ""
- Focus on the most impactful changes. Maximum 15 suggestions.
- Only include suggestions where you're confident there's a real issue.
- Return ONLY the JSON, no other text.`;

    const model = process.env.ANTHROPIC_MODEL || 'claude-4-5-sonnet';
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
      const errorText = await response.text();
      console.error('[Rules Deprecation] AI error:', response.status, errorText);
      return NextResponse.json({ ok: false, error: `AI API error: ${response.status}` }, { status: 502 });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ ok: false, error: 'Failed to parse AI response' }, { status: 502 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ok: true, suggestions: parsed.suggestions || [] });
  } catch (err: any) {
    console.error('[Rules Deprecation] suggest error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 400 }
    );
  }
}
