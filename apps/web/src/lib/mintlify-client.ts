/**
 * Mintlify Analytics API Client
 *
 * Provides typed interfaces for fetching analytics data from Mintlify API.
 *
 * @see https://mintlify.com/docs/api-reference/analytics
 */

const MINTLIFY_API_BASE = 'https://api.mintlify.com/v1';

export interface MintlifyConfig {
  apiKey: string;
  projectId: string;
}

export interface FeedbackItem {
  id: string;
  path: string;
  comment: string;
  createdAt: string;
  source: 'contextual' | 'code_snippet' | 'thumbs_only';
  status: 'pending' | 'in_progress' | 'resolved' | 'dismissed';
  helpful: boolean | null;
  contact: string | null;
  // For code_snippet source
  code?: string;
  filename?: string;
  lang?: string;
}

export interface FeedbackResponse {
  feedback: FeedbackItem[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface FeedbackFilters {
  dateFrom?: string; // ISO 8601 or YYYY-MM-DD
  dateTo?: string;
  source?: 'code_snippet' | 'contextual' | 'thumbs_only';
  status?: 'pending' | 'in_progress' | 'resolved' | 'dismissed';
  limit?: number; // 1-100, default 50
  cursor?: string;
}

export class MintlifyClient {
  private config: MintlifyConfig;

  constructor(config: MintlifyConfig) {
    this.config = config;
  }

  private async fetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${MINTLIFY_API_BASE}${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mintlify API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get user feedback from documentation pages
   */
  async getFeedback(filters?: FeedbackFilters): Promise<FeedbackResponse> {
    const params: Record<string, string> = {};

    if (filters?.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters?.dateTo) params.dateTo = filters.dateTo;
    if (filters?.source) params.source = filters.source;
    if (filters?.status) params.status = filters.status;
    if (filters?.limit) params.limit = String(filters.limit);
    if (filters?.cursor) params.cursor = filters.cursor;

    return this.fetch<FeedbackResponse>(
      `/analytics/${this.config.projectId}/feedback`,
      params
    );
  }

  /**
   * Get all feedback items with automatic pagination
   */
  async getAllFeedback(filters?: Omit<FeedbackFilters, 'cursor' | 'limit'>): Promise<FeedbackItem[]> {
    const allFeedback: FeedbackItem[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getFeedback({
        ...filters,
        limit: 100, // Max per request
        cursor,
      });

      allFeedback.push(...response.feedback);
      cursor = response.nextCursor;
      hasMore = response.hasMore;
    }

    return allFeedback;
  }

  /**
   * Get feedback for a specific page
   */
  async getFeedbackForPage(pagePath: string, filters?: Omit<FeedbackFilters, 'cursor' | 'limit'>): Promise<FeedbackItem[]> {
    const allFeedback = await this.getAllFeedback(filters);
    return allFeedback.filter(item => item.path === pagePath);
  }

  /**
   * Get feedback statistics
   */
  async getFeedbackStats(filters?: Omit<FeedbackFilters, 'cursor' | 'limit'>): Promise<{
    total: number;
    helpful: number;
    unhelpful: number;
    bySource: Record<string, number>;
    byStatus: Record<string, number>;
    byPage: Record<string, number>;
  }> {
    const allFeedback = await this.getAllFeedback(filters);

    const stats = {
      total: allFeedback.length,
      helpful: allFeedback.filter(f => f.helpful === true).length,
      unhelpful: allFeedback.filter(f => f.helpful === false).length,
      bySource: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      byPage: {} as Record<string, number>,
    };

    allFeedback.forEach(item => {
      // Count by source
      stats.bySource[item.source] = (stats.bySource[item.source] || 0) + 1;

      // Count by status
      stats.byStatus[item.status] = (stats.byStatus[item.status] || 0) + 1;

      // Count by page
      stats.byPage[item.path] = (stats.byPage[item.path] || 0) + 1;
    });

    return stats;
  }
}

/**
 * Create a Mintlify client from environment variables
 */
export function createMintlifyClient(): MintlifyClient {
  const apiKey = process.env.MINTLIFY_API_KEY;
  const projectId = process.env.MINTLIFY_PROJECT_ID;

  if (!apiKey || !projectId) {
    throw new Error('MINTLIFY_API_KEY and MINTLIFY_PROJECT_ID must be set in environment variables');
  }

  return new MintlifyClient({ apiKey, projectId });
}
