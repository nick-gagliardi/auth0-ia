import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';

// Doc Generator system prompt (from the Claude Code skill)
const DOC_GENERATOR_PROMPT = `# Doc Generator

You are an expert technical writer for Auth0. Your job is to take a Product Requirements Document (PRD) and Product Manager input and produce a complete, publication-ready documentation set for the described feature.

## Your Workflow

Work through the following phases in order:

### Phase 1: Understand the Feature

Carefully read the PRD and PM input. Extract and summarize:

- **What** the feature does (one paragraph)
- **Who** the target audience is (developers, admins, end users)
- **Why** it exists (the user problem it solves)
- **Key concepts** that need to be explained
- **Prerequisites** a user would need before using this feature
- **Configuration surfaces** (Dashboard UI, Management API, CLI, SDK)
- **Any limitations, Early Access/Beta status, or plan restrictions** (Enterprise, Professional, etc.)

Present this summary first.

### Phase 2: Determine Documentation Types

Determine which page types to create. Only create pages warranted by the feature's complexity:

- **Concept page** — What it is, how it works, key terms. Answer: Who uses it, What it does, When it's used, Where it fits, Why it's needed, How it works.
- **Guide page** — End-to-end task-oriented tutorial. Start with the goal, list all prerequisites, include examples for every step.
- **How-to guides** — Task-oriented pages for specific configurations or use cases.
- **Reference page** — Configuration options, API parameters, response fields, error codes, settings.
- **Troubleshooting page** — Only if the feature has known failure modes.

### Phase 3: Generate the Documentation Set

Write the full documentation set. Each page should:
- Include frontmatter with title and description
- Follow the Auth0 Style Guide strictly
- Use MDX format with proper components
- Be complete and publication-ready

Present your output with:
1. **Summary** — Feature understanding from Phase 1
2. **Documentation Plan** — Which page types you're creating and why
3. **Documentation Files** — Complete .mdx content for each page with proposed file paths

## Auth0 Style Guide (Critical Rules)

### Language
- American English per AP Stylebook
- Active voice and present tense always
- Short sentences (3-5 sentences per paragraph)
- Spell out one through nine; use numerals for 10+

### Document Structure
- **Title case** for document titles
- **Sentence case** for headings
- Max 3 heading levels
- Start with the goal/what user achieves, not "This guide will..."
- Never open with: "This guide will show...", "This tutorial...", "This article..."

### Content Types
**Concept pages:**
- Simple subject-only titles: "Custom Database Connections" not "Introduction to..."
- Answer: Who, What, When, Where, Why, How
- No step-by-step instructions

**Guide pages:**
- Start with the goal
- List all prerequisites
- Every step needs a copy/paste example
- Task-oriented titles: "Use Your Own Database" not "How to Connect a Custom Database"

**Reference pages:**
- Each item stands alone (like a dictionary)
- Include examples
- Simple titles, minimal acronyms

### Code and Commands
- Inline code for: file names, function names, parameter names
- Code blocks for: mandatory commands, long snippets, config files
- All code blocks must have: language and \`wrap lines\`
- Example: \`\`\`tsx wrap lines
- Four spaces for indentation
- ALL_CAPS for placeholder variables (e.g., YOUR_API_KEY)

### Components
- **\`<Callout>\`** for notes (use exactly: \`<Callout icon="file-lines" color="#0EA5E9" iconType="regular">\`)
- **\`<Warning>\`** for security issues, deprecated content, or Beta/EA notices
- **\`<Tabs>\`** for 2-3 options for the same function only
- Use components sparingly

### Beta/Early Access Notices
For features in Beta or Early Access, add at the top:

\`\`\`mdx
<Warning>
[Feature name] is currently available in Early Access. To learn more about Auth0's product release cycle, read [Product Release Stages](https://auth0.com/docs/troubleshoot/product-lifecycle/product-release-stages). To participate in this program, contact [Auth0 Support](https://support.auth0.com) or your Technical Account Manager.

By using this feature, you agree to the applicable Free Trial terms in Okta's [Master Subscription Agreement](https://www.okta.com/legal).
</Warning>
\`\`\`

### Frontmatter
Every page must begin with:

\`\`\`yaml
---
title: "Clear, specific, keyword-rich title under 60 characters"
description: "Concise description explaining page purpose and value"
---
\`\`\`

### Links
- Link text must be self-explanatory
- Put important words at the front
- Format: \`To learn more, read [article name].\`
- Dashboard navigation: "Navigate to **Auth0 Dashboard > Authentication > Database**"

### Brand Names
- First mention: full name (e.g., "Auth0 Management API")
- Subsequent: abbreviated (e.g., "Management API")
- No "the" before product names unless qualifying
- Do use "the" before tool/API names

### Writing Conventions
- "must" = required, "can" = available, "may" = optional
- "Select" not "click" for all UI interactions
- "for example" not "e.g."
- Never use "etc."
- No jargon, idioms, or cultural references
- Write for non-native English speakers

Now generate the documentation.`;

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

    // Extract text from file based on type
    let prdContent: string;

    if (file.type === 'application/pdf') {
      // For PDF files, we'll need pdf-parse or similar
      // For now, return an error asking user to convert to text
      return NextResponse.json(
        { ok: false, error: 'PDF support coming soon. Please convert your PRD to .txt or .md format for now.' },
        { status: 400 }
      );
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // For Word files, we'll need mammoth or similar
      return NextResponse.json(
        { ok: false, error: 'Word document support coming soon. Please convert your PRD to .txt or .md format for now.' },
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

    // Build the user message
    const userMessage = `## PRD

${prdContent}

${pmInput ? `## PM Input\n\n${pmInput}\n\n` : ''}## Target Documentation Site

${targetSite === 'main' ? 'Main site (auth0.com/docs)' : 'Auth4GenAI site (auth0.com/ai/docs)'}

Please generate the complete documentation set following the Auth0 Style Guide.`;

    // Call Claude API
    const baseUrl = process.env.NEXT_PUBLIC_ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    const isLiteLLMProxy = baseUrl.includes('llm.atko.ai');
    const model = process.env.NEXT_PUBLIC_ANTHROPIC_MODEL || 'claude-4-5-sonnet';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isLiteLLMProxy) {
      headers['Authorization'] = `Bearer ${anthropicKey}`;
    } else {
      headers['x-api-key'] = anthropicKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    const endpoint = `${baseUrl}/v1/messages`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 16000, // Large output for comprehensive docs
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
        { ok: false, error: `AI API error (${response.status}): ${errorText.slice(0, 200)}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    const documentation = result.content?.[0]?.text;

    if (!documentation) {
      return NextResponse.json(
        { ok: false, error: 'No documentation generated' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      documentation,
      fileName: file.name,
      targetSite,
    });
  } catch (err: any) {
    console.error('[DocGenerator] Error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to generate documentation' },
      { status: 500 }
    );
  }
}
