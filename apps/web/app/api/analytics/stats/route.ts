/**
 * API Route: /api/analytics/stats
 *
 * Fetches feedback statistics from Mintlify Analytics API
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
    const source = searchParams.get('source') as 'contextual' | 'code_snippet' | 'thumbs_only' | undefined;
    const status = searchParams.get('status') as 'pending' | 'in_progress' | 'resolved' | 'dismissed' | undefined;

    // Create Mintlify client with user credentials or env vars
    const client = new MintlifyClient({ apiKey, projectId });

    // Fetch stats
    const stats = await client.getFeedbackStats({
      dateFrom,
      dateTo,
      source,
      status,
    });

    // Calculate additional insights
    const topPages = Object.entries(stats.byPage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([path, count]) => ({ path, count }));

    const unhelpfulPages = Object.entries(stats.byPage)
      .map(([path]) => {
        const pageFeedback = stats.byPage[path];
        return { path, count: pageFeedback };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return NextResponse.json({
      stats: {
        total: stats.total,
        helpful: stats.helpful,
        unhelpful: stats.unhelpful,
        helpfulRate: stats.total > 0 ? (stats.helpful / stats.total * 100).toFixed(1) : 0,
        bySource: stats.bySource,
        byStatus: stats.byStatus,
      },
      insights: {
        topPages,
        unhelpfulPages,
        pagesWithFeedback: Object.keys(stats.byPage).length,
      },
      filters: {
        dateFrom,
        dateTo,
        source,
        status,
      },
    });
  } catch (error) {
    console.error('Error fetching Mintlify stats:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch stats',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
