import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { updateUserGithubPat } from '@/lib/db';
import { encrypt } from '@/lib/encryption';

const UpdatePatSchema = z.object({
  githubPat: z.string().min(1),
});

/**
 * POST /api/settings/github-pat
 * Saves the user's GitHub Personal Access Token (encrypted)
 */
export async function POST(req: Request) {
  try {
    const { user } = await requireSession();
    const body = UpdatePatSchema.parse(await req.json());

    // Basic validation - GitHub PATs start with certain prefixes
    const pat = body.githubPat.trim();
    if (!pat.startsWith('ghp_') && !pat.startsWith('github_pat_')) {
      return NextResponse.json(
        { ok: false, error: 'Invalid GitHub PAT format. PATs should start with "ghp_" or "github_pat_"' },
        { status: 400 }
      );
    }

    // Encrypt and save the PAT
    const encryptedPat = encrypt(pat);
    await updateUserGithubPat(user.id, encryptedPat);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json(
        { ok: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to save GitHub PAT' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings/github-pat
 * Clears the user's GitHub PAT
 */
export async function DELETE() {
  try {
    const { user } = await requireSession();
    await updateUserGithubPat(user.id, null);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to delete GitHub PAT' },
      { status: 500 }
    );
  }
}
