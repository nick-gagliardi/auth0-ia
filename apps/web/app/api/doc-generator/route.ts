import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

// Full Doc Generator system prompt matching the Claude Code skill
const DOC_GENERATOR_PROMPT = `# Doc Generator

You are an expert technical writer for Auth0. Your job is to take a Product Requirements Document (PRD) and Product Manager input and produce a complete, publication-ready documentation set for the described feature.

## Your Task

Analyze the PRD and related docs context, then generate a structured JSON response with the following sections:

1. **Feature Summary** — Understanding of what/who/why/key concepts/prerequisites/configuration
2. **Related Docs Analysis** — What existing docs were found and how they relate
3. **IA Proposal** — Where in the navigation this should go (section, group, title, path, rationale)
4. **Documentation Plan** — Which page types to create and why
5. **Generated Files** — Complete .mdx content for each file
6. **Docs to Update** — Existing files that need changes
7. **Cross Links** — Suggestions for linking from other pages

Return your response as valid JSON with this exact structure:

\`\`\`json
{
  "featureSummary": {
    "what": "One paragraph description",
    "who": "Target audience",
    "why": "Problem it solves",
    "keyConcepts": ["concept1", "concept2"],
    "prerequisites": ["prereq1", "prereq2"],
    "configurationSurfaces": ["Dashboard", "API", "SDK"],
    "limitations": "Any EA/Beta status or restrictions"
  },
  "relatedDocs": [
    {
      "path": "path/to/file.mdx",
      "relationship": "Describes related feature",
      "action": "Add cross-link to new doc"
    }
  ],
  "iaProposal": {
    "section": "Section name from docs.json",
    "group": "Group name if applicable",
    "title": "Page title",
    "path": "proposed/file/path.mdx",
    "rationale": "Why this placement makes sense"
  },
  "documentationPlan": [
    {
      "type": "concept|guide|howto|reference|troubleshooting",
      "title": "Page title",
      "rationale": "Why this page type"
    }
  ],
  "generatedFiles": [
    {
      "path": "docs/path/to/file.mdx",
      "title": "Page Title",
      "content": "Complete .mdx content with frontmatter"
    }
  ],
  "docsToUpdate": [
    {
      "path": "existing/file.mdx",
      "change": "Description of needed change",
      "suggestion": "Specific text to add or modify"
    }
  ],
  "crossLinks": [
    {
      "fromPage": "existing/page.mdx",
      "linkText": "Suggested link text",
      "context": "Where/why to add it"
    }
  ],
  "navigationUpdate": {
    "section": "Section in docs.json",
    "jsonSnippet": "Exact JSON to add to docs.json navigation"
  }
}
\`\`\`

## Auth0 Style Guide (apply to all generated content)

### Language
- American English, active voice, present tense
- Short sentences (3-5 per paragraph)
- Spell out one-nine; numerals for 10+

### Document Structure
- **Title case** for document titles
- **Sentence case** for headings
- Max 3 heading levels
- Start with goal/outcome, never "This guide will..."

### Content Types
**Concept pages:** Simple titles, answer Who/What/When/Where/Why/How, no steps
**Guide pages:** Goal first, list prerequisites, every step has examples
**Reference pages:** Dictionary-style, each item standalone with examples

### Code
- Inline code: file/function/parameter names
- Code blocks: commands, long snippets (always include language + \`wrap lines\`)
- ALL_CAPS for placeholders (YOUR_API_KEY)
- Four-space indentation

### Components
- \`<Callout icon="file-lines" color="#0EA5E9" iconType="regular">\` for notes
- \`<Warning>\` for security/deprecated/EA content
- \`<Tabs>\` only for 2-3 options of same function

### Beta/EA Notice (if applicable)
\`\`\`mdx
<Warning>
[Feature] is currently available in Early Access. Read [Product Release Stages](https://auth0.com/docs/troubleshoot/product-lifecycle/product-release-stages). Contact [Auth0 Support](https://support.auth0.com) or your TAM to participate.

By using this feature, you agree to applicable Free Trial terms in Okta's [Master Subscription Agreement](https://www.okta.com/legal).
</Warning>
\`\`\`

### Frontmatter (required)
\`\`\`yaml
---
title: "Keyword-rich title under 60 chars"
description: "Concise purpose and value"
---
\`\`\`

Return ONLY valid JSON, no other text.`;

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireSession();

    // Get user's API key
    const anthropicKey = user.anthropic_api_key_decrypted;
    if (!anthropicKey) {
      return NextResponse.json(
        { ok: false, error: 'Anthropic API key not configured. Please add it in Settings.' },
        { status: 401 }
      );
    }

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const pmInput = formData.get('pmInput') as string;
    const targetSite = formData.get('targetSite') as string;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Extract text from file
    let prdContent: string;

    if (file.type === 'application/pdf') {
      // PDF parsing requires native dependencies that don't work in serverless
      return NextResponse.json(
        {
          ok: false,
          error: 'PDF files are not supported yet due to serverless limitations. Please convert your PRD to .txt or .md format. You can use: "Save As > Plain Text" in most PDF readers, or online tools like pdf2txt.'
        },
        { status: 400 }
      );
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return NextResponse.json(
        { ok: false, error: 'Word documents are not supported yet. Please save your PRD as .txt or .md format.' },
        { status: 400 }
      );
    } else {
      // Plain text or markdown
      prdContent = await file.text();
    }

    if (!prdContent.trim()) {
      return NextResponse.json(
        { ok: false, error: 'File is empty' },
        { status: 400 }
      );
    }

    // Clone or use cached docs-v2 repo
    let docsRepoPath: string;
    let relatedDocs: Array<{ path: string; excerpt: string }> = [];
    let docsJson = '{}';

    try {
      docsRepoPath = await getDocsRepo();
      console.log('[DocGenerator] Docs repo ready at:', docsRepoPath);

      // Search for related docs (basic keyword search)
      const keywords = extractKeywords(prdContent);
      relatedDocs = await searchDocs(docsRepoPath, targetSite, keywords);
      console.log('[DocGenerator] Found', relatedDocs.length, 'related docs');

      // Read docs.json for navigation context
      const docsJsonPath = path.join(docsRepoPath, targetSite, 'docs.json');
      try {
        docsJson = await fs.readFile(docsJsonPath, 'utf-8');
        console.log('[DocGenerator] Read docs.json, size:', docsJson.length);
      } catch (err) {
        console.warn('[DocGenerator] Could not read docs.json from', docsJsonPath, err);
      }
    } catch (repoErr: any) {
      console.error('[DocGenerator] Failed to clone/access docs repo:', repoErr);
      // Continue without repo context - still generate docs
      console.log('[DocGenerator] Continuing without repo context');
    }

    // Build comprehensive user message
    const userMessage = `## PRD

${prdContent}

${pmInput ? `## PM Input\n\n${pmInput}\n\n` : ''}## Target Documentation Site

${targetSite === 'main' ? 'Main site (auth0.com/docs)' : 'Auth4GenAI site (auth0.com/ai/docs)'}

## Related Documentation Found

The following existing docs were found that may be related:
${relatedDocs.length > 0 ? relatedDocs.map(d => `- ${d.path}: ${d.excerpt}`).join('\n') : 'None found'}

## Current Navigation Structure (docs.json)

\`\`\`json
${docsJson.slice(0, 5000)}
\`\`\`

Generate the complete structured JSON response with feature summary, IA proposal, documentation files, and navigation updates.`;

    // Call Claude API
    const configuredBaseUrl = process.env.NEXT_PUBLIC_ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    const isLiteLLMProxy = configuredBaseUrl.includes('llm.atko.ai');
    const proxyToken = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

    // If the proxy URL is configured but no proxy token exists, bypass the proxy
    // and call Anthropic directly with the user's stored key.
    const useProxy = isLiteLLMProxy && !!proxyToken;
    const baseUrl = useProxy ? configuredBaseUrl : 'https://api.anthropic.com';
    const finalKey = useProxy ? proxyToken : anthropicKey;
    const model = process.env.NEXT_PUBLIC_ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

    console.log('[DocGenerator] Using API:', { baseUrl, model, useProxy });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (useProxy) {
      headers['Authorization'] = `Bearer ${finalKey}`;
    } else {
      headers['x-api-key'] = finalKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    const endpoint = `${baseUrl}/v1/messages`;
    console.log('[DocGenerator] Calling endpoint:', endpoint);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        system: DOC_GENERATOR_PROMPT,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DocGenerator] API error:', response.status, errorText);
      return NextResponse.json(
        { ok: false, error: `AI API error (${response.status}): ${errorText.slice(0, 300)}` },
        { status: response.status }
      );
    }

    // Parse response - handle both JSON and HTML errors
    let result;
    const contentType = response.headers.get('content-type');

    try {
      const responseText = await response.text();

      // Check if response is HTML (error page)
      if (responseText.trim().startsWith('<!') || responseText.trim().startsWith('<html')) {
        console.error('[DocGenerator] Received HTML response instead of JSON:', responseText.slice(0, 500));
        return NextResponse.json(
          { ok: false, error: 'API returned an error page. Please check your API key and endpoint configuration.' },
          { status: 500 }
        );
      }

      result = JSON.parse(responseText);
    } catch (parseErr: any) {
      console.error('[DocGenerator] Failed to parse API response:', parseErr.message);
      return NextResponse.json(
        { ok: false, error: `Failed to parse API response: ${parseErr.message}` },
        { status: 500 }
      );
    }

    const content = result.content?.[0]?.text;

    if (!content) {
      console.error('[DocGenerator] No content in response:', result);
      return NextResponse.json(
        { ok: false, error: 'No content returned from AI. Response: ' + JSON.stringify(result).slice(0, 200) },
        { status: 500 }
      );
    }

    // Extract JSON from response (Claude might wrap it in markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[DocGenerator] No JSON found in response, returning raw content');
      // Fallback: return raw content if JSON parsing fails
      return NextResponse.json({
        ok: true,
        documentation: content,
        fileName: file.name,
        targetSite,
        structured: false,
      });
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('[DocGenerator] Successfully parsed structured response');
      return NextResponse.json({
        ok: true,
        ...parsed,
        fileName: file.name,
        targetSite,
        structured: true,
      });
    } catch (jsonErr: any) {
      console.log('[DocGenerator] Failed to parse JSON, returning raw content:', jsonErr.message);
      // Fallback to raw content
      return NextResponse.json({
        ok: true,
        documentation: content,
        fileName: file.name,
        targetSite,
        structured: false,
      });
    }
  } catch (err: any) {
    console.error('[DocGenerator] Error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to generate documentation' },
      { status: 500 }
    );
  }
}

// Helper: Get or clone docs-v2 repo
async function getDocsRepo(): Promise<string> {
  const tmpDir = os.tmpdir();
  const repoPath = path.join(tmpDir, 'docs-v2-cache');

  try {
    // Check if repo already exists
    await fs.access(repoPath);
    // Pull latest
    await execAsync('git pull origin main', { cwd: repoPath });
    return repoPath;
  } catch {
    // Clone repo
    const repoUrl = 'https://github.com/auth0/docs-v2.git';
    await execAsync(`git clone --depth 1 ${repoUrl} ${repoPath}`);
    return repoPath;
  }
}

// Helper: Extract keywords from PRD
function extractKeywords(prdContent: string): string[] {
  // Simple keyword extraction - get significant words
  const words = prdContent.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 4)
    .filter(w => !['about', 'should', 'would', 'could', 'there', 'which', 'these', 'those'].includes(w));

  // Get most common words
  const freq: Record<string, number> = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

// Helper: Search docs for related content
async function searchDocs(repoPath: string, targetSite: string, keywords: string[]): Promise<Array<{ path: string; excerpt: string }>> {
  if (keywords.length === 0) return [];

  const docsPath = path.join(repoPath, targetSite, 'docs');
  const results: Array<{ path: string; excerpt: string }> = [];

  try {
    // Use grep to search for keywords
    const keywordPattern = keywords.join('|');
    const { stdout } = await execAsync(
      `grep -r -i -l "${keywordPattern}" "${docsPath}" | head -20`,
      { maxBuffer: 1024 * 1024 }
    );

    const files = stdout.trim().split('\n').filter(Boolean);

    for (const file of files.slice(0, 10)) {
      const relativePath = file.replace(repoPath + '/', '');
      try {
        const content = await fs.readFile(file, 'utf-8');
        const excerpt = content.slice(0, 200).replace(/\n/g, ' ');
        results.push({ path: relativePath, excerpt });
      } catch {
        // Skip files we can't read
      }
    }
  } catch {
    // No matches or grep failed
  }

  return results;
}
