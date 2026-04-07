/**
 * API Route: /api/analytics/search-queries
 *
 * Fetches search query analytics from Mintlify Analytics API
 */

import { NextRequest, NextResponse } from 'next/server';
import { MintlifyClient } from '@/lib/mintlify-client';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic'; // Always fetch fresh data

export async function GET(request: NextRequest) {
  try {
    // Get user session and check for user credentials first
    const { user } = await requireSession(true);

    let apiKey: string | undefined;
    let projectId: string | undefined;

    // Priority 1: User's personal credentials (decrypted)
    if (user.mintlify_api_key_decrypted && user.mintlify_project_id_decrypted) {
      apiKey = user.mintlify_api_key_decrypted;
      projectId = user.mintlify_project_id_decrypted;
    }
    // Priority 2: Environment variables (fallback)
    else if (process.env.MINTLIFY_API_KEY && process.env.MINTLIFY_PROJECT_ID) {
      apiKey = process.env.MINTLIFY_API_KEY;
      projectId = process.env.MINTLIFY_PROJECT_ID;
    }

    if (!apiKey || !projectId) {
      return NextResponse.json(
        {
          error: 'Mintlify analytics not configured',
          message: 'Configure your Mintlify credentials in Settings or set environment variables',
        },
        { status: 503 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;

    // Create Mintlify client with user credentials or env vars
    const client = new MintlifyClient({ apiKey, projectId });

    // Fetch search queries
    const searchData = await client.getSearchQueries({
      dateFrom,
      dateTo,
    });

    // Sort by count descending
    const sortedQueries = searchData.queries.sort((a, b) => b.count - a.count);

    return NextResponse.json({
      queries: sortedQueries,
      total: searchData.total,
      topQueries: sortedQueries.slice(0, 20),
      filters: {
        dateFrom,
        dateTo,
      },
    });
  } catch (error) {
    console.error('Error fetching Mintlify search queries:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch search queries',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
