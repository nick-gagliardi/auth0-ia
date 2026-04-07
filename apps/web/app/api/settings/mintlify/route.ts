/**
 * API Route: /api/settings/mintlify
 *
 * Manages user's Mintlify API credentials (API key and project ID)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { updateUserMintlifyCredentials } from '@/lib/db';
import { encrypt } from '@/lib/encryption';

const UpdateMintlifySchema = z.object({
  mintlifyApiKey: z.string().min(1, 'API key is required'),
  mintlifyProjectId: z.string().min(1, 'Project ID is required'),
});

/**
 * POST /api/settings/mintlify
 * Saves the user's Mintlify API key and project ID (encrypted)
 */
export async function POST(req: Request) {
  try {
    const { user } = await requireSession();
    const body = UpdateMintlifySchema.parse(await req.json());

    // Validate API key format (should start with mint_)
    if (!body.mintlifyApiKey.startsWith('mint_')) {
      return NextResponse.json(
        { ok: false, error: 'Invalid Mintlify API key format. Key should start with "mint_"' },
        { status: 400 }
      );
    }

    // Optional: Test the API key by making a simple call
    const testResult = await testMintlifyKey(body.mintlifyApiKey, body.mintlifyProjectId);
    if (!testResult.ok) {
      return NextResponse.json(
        { ok: false, error: testResult.error || 'Invalid Mintlify credentials' },
        { status: 400 }
      );
    }

    // Encrypt and save the credentials
    const encryptedKey = encrypt(body.mintlifyApiKey);
    const encryptedProjectId = encrypt(body.mintlifyProjectId);

    await updateUserMintlifyCredentials(user.id, encryptedKey, encryptedProjectId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json(
        { ok: false, error: 'Invalid request body. Both API key and project ID are required.' },
        { status: 400 }
      );
    }
    console.error('[Mintlify Settings] Error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to save Mintlify credentials' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings/mintlify
 * Clears the user's Mintlify credentials
 */
export async function DELETE() {
  try {
    const { user } = await requireSession();
    await updateUserMintlifyCredentials(user.id, null, null);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to delete Mintlify credentials' },
      { status: 500 }
    );
  }
}

/**
 * Test Mintlify API key by fetching a small amount of feedback
 */
async function testMintlifyKey(apiKey: string, projectId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `https://api.mintlify.com/v1/analytics/${projectId}/feedback?limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 401) {
        return { ok: false, error: 'Invalid API key. Check your Mintlify API key and try again.' };
      }

      if (response.status === 404 || errorText.includes('Invalid project id')) {
        return { ok: false, error: 'Invalid project ID. Check your Mintlify project ID and try again.' };
      }

      return {
        ok: false,
        error: `API Error (${response.status}): ${errorText.slice(0, 100)}`
      };
    }

    return { ok: true };
  } catch (err: any) {
    console.error('[Mintlify Settings] Test error:', err);
    return { ok: false, error: err?.message || 'Failed to validate Mintlify credentials' };
  }
}
