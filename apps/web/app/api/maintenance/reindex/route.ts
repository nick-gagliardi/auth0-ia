import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';

/**
 * POST /api/maintenance/reindex
 * Triggers the GitHub Actions workflow to reindex documentation
 */
export async function POST() {
  try {
    const { user } = await requireSession();

    // Use the user's GitHub access token to trigger the workflow
    const token = user.github_access_token_decrypted;
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'GitHub token not available' },
        { status: 401 }
      );
    }

    // Trigger the workflow_dispatch event for the reindex workflow
    const owner = 'nick-gagliardi';
    const repo = 'auth0-ia';
    const workflowId = 'reindex.yml';

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main', // Branch to run workflow on
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Reindex] GitHub API error:', response.status, errorText);
      return NextResponse.json(
        { ok: false, error: `GitHub API error: ${response.status}` },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Reindex workflow triggered successfully',
    });
  } catch (err: any) {
    console.error('[Reindex] Error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to trigger reindex' },
      { status: 500 }
    );
  }
}
