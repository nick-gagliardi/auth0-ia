import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { fetchPublicPageContent, docsPathToUrl } from '@/lib/fetch-page-content';

const BodySchema = z.object({
  feedbackId: z.string(),
  path: z.string().min(1),
  comment: z.string(),
  helpful: z.boolean().nullable(),
  source: z.string().optional(),
});

/**
 * POST /api/analytics/feedback/suggest
 *
 * Returns the prepared prompt and page context for the client to call Anthropic
 * directly (bypassing Vercel IP restrictions on the Anthropic API).
 */
export async function POST(req: Request) {
  try {
    await requireSession();
    const body = BodySchema.parse(await req.json());

    const pageContent = await fetchPublicPageContent(body.path);

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

    return NextResponse.json({ ok: true, prompt, model: process.env.ANTHROPIC_MODEL || 'claude-4-5-sonnet' });
  } catch (err: any) {
    console.error('[Feedback Suggest] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 400 },
    );
  }
}
