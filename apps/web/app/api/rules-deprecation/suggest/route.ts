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

// Convert filePath like "main/docs/customize/rules.mdx" to public URL
function filePathToDocsUrl(filePath: string): string {
  let p = filePath.replace(/^main\/docs\//, '').replace(/\.mdx$/, '').replace(/\/index$/, '');
  return `https://auth0.com/docs/${p}`;
}

// Attempt to fetch page content from the public docs site (no auth needed)
async function fetchPublicPageContent(filePath: string): Promise<string | null> {
  const url = filePathToDocsUrl(filePath);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'auth0-ia-docs-tool/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Strip HTML to rough text for context (good enough for Claude to understand the page)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 20000);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { user } = await requireSession(true);
    const body = BodySchema.parse(await req.json());

    // Try to get page content from public docs site (no GitHub auth needed)
    const pageContent = await fetchPublicPageContent(body.filePath);

    // Call Claude for suggestions
    const configuredBaseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    const isLiteLLMProxy = configuredBaseUrl.includes('llm.atko.ai');
    const proxyToken = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
    const userKey = user.anthropic_api_key_decrypted;

    // If the proxy URL is configured but no proxy token exists, bypass the proxy
    // and call Anthropic directly with the user's stored key.
    const useProxy = isLiteLLMProxy && !!proxyToken;
    const apiKey = useProxy ? proxyToken : (userKey || proxyToken);
    const baseUrl = useProxy ? configuredBaseUrl : 'https://api.anthropic.com';

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'No Anthropic API key configured. Add one in Settings.' }, { status: 400 });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (useProxy) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    const evidenceBlock = body.evidence
      .slice(0, 10)
      .map((e) => `- Line ${e.line} (${e.category}): "${e.snippet}"`)
      .join('\n');

    const contentSection = pageContent
      ? `\nPage content (from published docs):\n${pageContent}`
      : '\nNote: Full page content was not available. Base your suggestions on the evidence snippets above.';

    const prompt = `You are an Auth0 documentation migration specialist. Auth0 Rules (the legacy JavaScript-based extensibility system using \`function(user, context, callback)\`) has reached end-of-life and must be migrated to Auth0 Actions (the new serverless function system using \`exports.onExecutePostLogin = async (event, api) =>\`).

Analyze the following documentation page and provide specific rewrite suggestions to remove or update all Auth0 Rules references.

File: ${body.filePath}
Published URL: ${filePathToDocsUrl(body.filePath)}
Categories detected: ${body.categories.join(', ')}

Evidence of Rules references found:
${evidenceBlock}
${contentSection}

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

    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
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
