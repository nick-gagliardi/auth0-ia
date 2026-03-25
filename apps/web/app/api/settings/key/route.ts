import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';

/**
 * GET /api/settings/key
 * Returns the user's decrypted Anthropic API key for client-side use
 * This bypasses IP restrictions by allowing the browser to call the Anthropic API directly
 */
export async function GET() {
  try {
    const { user } = await requireSession(true); // Include decrypted key

    if (!user.anthropic_api_key_decrypted) {
      return NextResponse.json(
        { ok: false, error: 'No API key configured' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      apiKey: user.anthropic_api_key_decrypted,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unauthorized' },
      { status: 401 }
    );
  }
}
