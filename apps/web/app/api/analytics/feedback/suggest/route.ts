import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { fetchPublicPageContent, docsPathToUrl } from '@/lib/fetch-page-content';
import type { FeedbackSuggestion } from '@/types';

const BodySchema = z.object({
  feedbackId: z.string(),
  path: z.string().min(1),
  comment: z.string(),
  helpful: z.boolean().nullable(),
  source: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const { user } = await requireSession(true);
    const body = BodySchema.parse(await req.json());

    const pageContent = await fetchPublicPageContent(body.path);

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
      return NextResponse.json(
        { ok: false, error: 'No Anthropic API key configured. Add one in Settings.' },
        { status: 400 },
      );
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (useProxy) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    const contentSection = pageContent
      ? `\nPublished page content:\n${pageContent}`
      : '\nNote: Full page content was not available. Base your suggestions on the feedback alone.';

    const prompt = `You are an Auth0 documentation quality specialist. A reader left feedback on a documentation page and you need to provide actionable suggestions for the technical writing team.

Page: ${docsPathToUrl(body.path)}
Path: ${body.path}
Feedback source: ${body.source ?? 'unknown'}
Helpful: ${body.helpful === null ? 'not specified' : body.helpful ? 'yes' : 'no'}

Reader's comment:
"${body.comment}"
${contentSection}

Analyze the feedback against the page content and return structured improvement suggestions. Each suggestion should be concrete and actionable.

Return your response as JSON only:
{
  "suggestions": [
    {
      "title": "Short summary of the issue",
      "description": "Detailed explanation of the problem the reader encountered",
      "category": "content-gap|clarity|accuracy|navigation|code-example|structure",
      "confidence": "high|medium|low",
      "suggestedAction": "Specific, actionable step the writer should take"
    }
  ]
}

Category definitions:
- content-gap: Missing information the reader expected
- clarity: Confusing wording, ambiguous instructions
- accuracy: Incorrect or outdated information
- navigation: Hard to find or poorly linked content
- code-example: Missing, broken, or unclear code examples
- structure: Poor page organization or flow

Rules:
- Maximum 5 suggestions, focus on quality over quantity.
- Every suggestion must have a concrete suggestedAction (not vague).
- Set confidence to "high" only when the feedback clearly maps to a specific page issue.
- Return ONLY the JSON, no other text.`;

    const model = process.env.ANTHROPIC_MODEL || 'claude-4-5-sonnet';
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Feedback Suggest] AI error:', response.status, errorText);
      return NextResponse.json(
        { ok: false, error: `AI API error: ${response.status}` },
        { status: 502 },
      );
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { ok: false, error: 'Failed to parse AI response — no JSON found in model output.' },
        { status: 502 },
      );
    }

    let parsed: { suggestions?: FeedbackSuggestion[] };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('[Feedback Suggest] JSON parse error:', parseErr, '\nRaw text:', text.slice(0, 500));
      return NextResponse.json(
        { ok: false, error: 'AI returned malformed JSON. Try again.' },
        { status: 502 },
      );
    }
    const suggestions: FeedbackSuggestion[] = parsed.suggestions || [];

    return NextResponse.json({ ok: true, suggestions });
  } catch (err: any) {
    console.error('[Feedback Suggest] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 400 },
    );
  }
}
