/**
 * API Route: /api/analytics/page-views
 *
 * Fetches page view analytics from Mintlify Analytics API
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

    // Fetch page views
    const pageViewsData = await client.getPageViews({
      dateFrom,
      dateTo,
    });

    // Sort by views descending
    const sortedViews = pageViewsData.views.sort((a, b) => b.views - a.views);

    return NextResponse.json({
      views: sortedViews,
      total: pageViewsData.total,
      topPages: sortedViews.slice(0, 20),
      filters: {
        dateFrom,
        dateTo,
      },
    });
  } catch (error) {
    console.error('Error fetching Mintlify page views:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch page views',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
