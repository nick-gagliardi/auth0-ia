import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { fetchPublicPageContent, docsPathToUrl } from '@/lib/fetch-page-content';

const BodySchema = z.object({
  path: z.string().min(1),
  suggestion: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    suggestedAction: z.string(),
  }),
});

/**
 * POST /api/analytics/feedback/apply-changes
 *
 * Builds the Claude prompt server-side (fetches page content, etc.) and
 * returns it so the client can call Claude directly from the browser.
 * This avoids Vercel IP restrictions on the LiteLLM proxy.
 */
export async function POST(req: Request) {
  try {
    await requireSession(true);
    const body = BodySchema.parse(await req.json());

    const pageContent = await fetchPublicPageContent(body.path);
    if (!pageContent) {
      return NextResponse.json(
        { ok: false, error: `Could not fetch page content for ${body.path}. Ensure the page is published.` },
        { status: 404 },
      );
    }

    const prompt = `You are an Auth0 documentation editor. You have been given a page from auth0.com/docs and a specific improvement suggestion from a reader feedback triage system. Your job is to produce precise before/after text replacements that implement the suggestion.

Page URL: ${docsPathToUrl(body.path)}
Page path: ${body.path}

## Improvement Suggestion
Title: ${body.suggestion.title}
Category: ${body.suggestion.category}
Description: ${body.suggestion.description}
Suggested Action: ${body.suggestion.suggestedAction}

## Current Page Content
${pageContent}

## Your Task

Produce one or more text replacements that implement the suggestion. Each replacement should contain:
- \`before\`: The exact text from the current page that should be replaced (must match verbatim)
- \`after\`: The improved text that should replace it

Return your response as JSON only:
{
  "filePath": "articles/${body.path.replace(/^\/docs\//, '').replace(/^\//, '')}.mdx",
  "replacements": [
    {
      "before": "exact text from the page to replace",
      "after": "improved replacement text"
    }
  ],
  "summary": "Brief description of what was changed and why"
}

Rules:
- The \`before\` text must be an EXACT substring of the current page content (verbatim match required).
- Keep replacements minimal and focused — only change what's needed to implement the suggestion.
- Preserve the existing formatting style (markdown conventions, heading levels, etc.).
- If the suggestion requires adding new content (not replacing existing text), use an empty string for \`before\` is NOT allowed — instead find a nearby anchor point and include it in both \`before\` and \`after\`.
- Maximum 3 replacements. Quality over quantity.
- Return ONLY the JSON, no other text.`;

    return NextResponse.json({ ok: true, prompt, maxTokens: 4096 });
  } catch (err: any) {
    console.error('[Feedback Apply Changes] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 400 },
    );
  }
}
