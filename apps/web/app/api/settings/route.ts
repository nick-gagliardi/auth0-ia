import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { updateUserAnthropicKey, getUserById } from '@/lib/db';
import { encrypt } from '@/lib/encryption';

const UpdateKeySchema = z.object({
  anthropicApiKey: z.string().min(1),
});

/**
 * GET /api/settings
 * Returns current user's settings (GitHub username, whether they have Anthropic key configured)
 */
export async function GET() {
  try {
    const { user } = await requireSession(true); // Include Anthropic key to check if it exists

    return NextResponse.json({
      ok: true,
      githubUsername: user.github_username,
      hasAnthropicKey: !!user.anthropic_api_key_decrypted,
      // Never return the actual key
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unauthorized' },
      { status: 401 }
    );
  }
}

/**
 * POST /api/settings
 * Saves the user's Anthropic API key (encrypted)
 * Validates the key by making a test call to Anthropic API
 */
export async function POST(req: Request) {
  try {
    const { user } = await requireSession();
    const body = UpdateKeySchema.parse(await req.json());

    // Validate the API key by making a test call to Anthropic
    const testResult = await testAnthropicKey(body.anthropicApiKey);
    if (!testResult.ok) {
      return NextResponse.json(
        { ok: false, error: testResult.error || 'Invalid Anthropic API key' },
        { status: 400 }
      );
    }

    // Encrypt and save the key
    const encryptedKey = encrypt(body.anthropicApiKey);
    await updateUserAnthropicKey(user.id, encryptedKey);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json(
        { ok: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to save API key' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings
 * Clears the user's Anthropic API key
 */
export async function DELETE() {
  try {
    const { user } = await requireSession();
    await updateUserAnthropicKey(user.id, null);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to delete API key' },
      { status: 500 }
    );
  }
}

/**
 * Test an Anthropic API key by making a simple API call
 */
async function testAnthropicKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    // Use model name compatible with Okta LiteLLM proxy
    const model = process.env.ANTHROPIC_MODEL || 'claude-4-5-sonnet';

    // Okta LiteLLM uses OpenAI-compatible format with Bearer token
    const isLiteLLMProxy = baseUrl.includes('llm.atko.ai');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Use Bearer token format for LiteLLM, x-api-key for standard Anthropic
    if (isLiteLLMProxy) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    console.log('[Settings] Testing Anthropic key:', {
      baseUrl,
      model,
      keyPrefix: apiKey.substring(0, 10) + '...',
    });

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: 'Hi',
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Settings] Anthropic API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        baseUrl,
        model,
      });

      let errorMessage = `API Error (${response.status}): `;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage += errorJson.error?.message || errorJson.message || errorJson.error?.type || 'Invalid API key';
      } catch {
        // If error is not JSON, use the raw text if it's short
        if (errorText.length < 200) {
          errorMessage += errorText;
        } else {
          errorMessage += response.status === 403 ? 'Forbidden - check API key and model permissions' : 'Invalid API key';
        }
      }

      return { ok: false, error: errorMessage };
    }

    return { ok: true };
  } catch (err: any) {
    console.error('[Settings] Anthropic test error:', err);
    return { ok: false, error: err?.message || 'Failed to validate API key' };
  }
}
