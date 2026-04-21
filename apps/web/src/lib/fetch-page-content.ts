/**
 * Shared helper for fetching published page content from auth0.com/docs.
 *
 * Extracted from the rules-deprecation suggest route so it can be reused by
 * any API route that needs the rendered text of a docs page (e.g. feedback
 * suggestion generation).
 */

/** Convert an internal filePath (e.g. "main/docs/customize/rules.mdx") to its public URL. */
export function filePathToDocsUrl(filePath: string): string {
  const p = filePath
    .replace(/^main\/docs\//, '')
    .replace(/\.mdx$/, '')
    .replace(/\/index$/, '');
  return `https://auth0.com/docs/${p}`;
}

/** Convert a docs path slug (e.g. "/docs/customize/actions") to its public URL. */
export function docsPathToUrl(path: string): string {
  // Normalise: ensure leading /docs/ then prefix with origin
  const slug = path.startsWith('/docs/') ? path : `/docs/${path.replace(/^\//, '')}`;
  return `https://auth0.com${slug}`;
}

/**
 * Fetch the published HTML for a docs page and return a stripped plain-text
 * representation suitable for LLM context windows.
 *
 * @param pathOrFilePath  Either a file path ("main/docs/…") or a URL-style path ("/docs/…" or slug)
 * @param maxChars        Maximum character count to return (default 20 000)
 */
export async function fetchPublicPageContent(
  pathOrFilePath: string,
  maxChars = 20_000,
): Promise<string | null> {
  const url = pathOrFilePath.includes('main/docs/')
    ? filePathToDocsUrl(pathOrFilePath)
    : docsPathToUrl(pathOrFilePath);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'auth0-ia-docs-tool/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    const html = await res.text();
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
    return text.slice(0, maxChars);
  } catch {
    return null;
  }
}
