import { NextRequest, NextResponse } from 'next/server';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

// Rate limiting state (in-memory, per-instance)
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    // Remove old requests outside the window
    this.requests = this.requests.filter((t) => now - t < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      // Wait until the oldest request expires
      const oldest = this.requests[0];
      const waitTime = this.windowMs - (now - oldest);
      if (waitTime > 0) {
        await sleep(waitTime);
      }
      // Recurse to check again
      return this.acquire();
    }

    this.requests.push(now);
  }

  get currentCount(): number {
    const now = Date.now();
    return this.requests.filter((t) => now - t < this.windowMs).length;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Global rate limiter: 60 requests per minute (increased for production use)
const globalRateLimiter = new RateLimiter(60, 60000);

// Auth0 domain patterns to detect and replace (only used in safe mode)
const AUTH0_DOMAIN_PATTERNS = [
  /https:\/\/([a-z0-9-]+)\.auth0\.com/gi,
  /https:\/\/([a-z0-9-]+)\.us\.auth0\.com/gi,
  /https:\/\/([a-z0-9-]+)\.eu\.auth0\.com/gi,
  /https:\/\/([a-z0-9-]+)\.au\.auth0\.com/gi,
];

// Patterns to detect credentials that should be replaced (only used in safe mode)
const SENSITIVE_PATTERNS = [
  { regex: /"client_id":\s*"[^"]+"/gi, replacement: '"client_id": "YOUR_CLIENT_ID"' },
  { regex: /"client_secret":\s*"[^"]+"/gi, replacement: '"client_secret": "YOUR_CLIENT_SECRET"' },
  { regex: /"password":\s*"[^"]+"/gi, replacement: '"password": "USER_PASSWORD"' },
  { regex: /"username":\s*"[^"]+"/gi, replacement: '"username": "user@example.com"' },
  { regex: /"email":\s*"[^"]+"/gi, replacement: '"email": "user@example.com"' },
  { regex: /"token":\s*"[^"]+"/gi, replacement: '"token": "YOUR_TOKEN"' },
  { regex: /"access_token":\s*"[^"]+"/gi, replacement: '"access_token": "YOUR_ACCESS_TOKEN"' },
  { regex: /"refresh_token":\s*"[^"]+"/gi, replacement: '"refresh_token": "YOUR_REFRESH_TOKEN"' },
  { regex: /"id_token":\s*"[^"]+"/gi, replacement: '"id_token": "YOUR_ID_TOKEN"' },
];

// Side-effect HTTP methods
const SIDE_EFFECT_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Test tenant configuration (for safe mode)
const TEST_DOMAIN = process.env.AUTH0_TEST_DOMAIN || 'dev-example.us.auth0.com';

type ParsedCurl = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

type Variables = Record<string, string>;

// Apply variable substitution to a string
function applyVariables(str: string, variables: Variables): string {
  let result = str;
  for (const [key, value] of Object.entries(variables)) {
    // Support both {{var}} and ${var} syntax
    const patterns = [
      new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'gi'),
      new RegExp(`\\$\\{\\s*${escapeRegExp(key)}\\s*\\}`, 'gi'),
    ];
    for (const pattern of patterns) {
      result = result.replace(pattern, value);
    }
  }
  return result;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCurlCommand(command: string): ParsedCurl | null {
  const lines = command.split('\\\n').map((l) => l.trim()).join(' ');
  const singleLine = lines.replace(/\s+/g, ' ').trim();

  // Must contain curl
  if (!singleLine.includes('curl')) return null;

  // Extract URL - look for http:// or https://
  const urlMatch = singleLine.match(/(https?:\/\/[^\s'"]+)/);
  if (!urlMatch) return null;
  let url = urlMatch[1].replace(/['"]/g, '');

  // Also try to extract URL from quoted strings
  const quotedUrlMatch = singleLine.match(/['"]?(https?:\/\/[^'">\s]+)['"]?/);
  if (quotedUrlMatch) {
    url = quotedUrlMatch[1];
  }

  // Extract method - default to GET
  let method = 'GET';
  const methodMatch = singleLine.match(/-X\s+(\w+)/i) || singleLine.match(/--request\s+(\w+)/i);
  if (methodMatch) {
    method = methodMatch[1].toUpperCase();
  } else if (/-d\s|--data/.test(singleLine)) {
    method = 'POST';
  }

  // Extract headers
  const headers: Record<string, string> = {};
  const headerMatches = singleLine.matchAll(/-H\s+['"]([^'"]+)['"]/gi);
  for (const match of headerMatches) {
    const headerStr = match[1];
    const colonIndex = headerStr.indexOf(':');
    if (colonIndex > 0) {
      const key = headerStr.slice(0, colonIndex).trim();
      const value = headerStr.slice(colonIndex + 1).trim();
      headers[key] = value;
    }
  }

  // Extract body data - improved parsing
  let body: string | undefined;

  // Try different body patterns
  const bodyPatterns = [
    /-d\s+'([^']+)'/i,
    /-d\s+"([^"]+)"/i,
    /--data\s+'([^']+)'/i,
    /--data\s+"([^"]+)"/i,
    /--data-raw\s+'([^']+)'/i,
    /--data-raw\s+"([^"]+)"/i,
    /-d\s+(\{[^}]+\})/,
  ];

  for (const pattern of bodyPatterns) {
    const match = singleLine.match(pattern);
    if (match) {
      body = match[1];
      break;
    }
  }

  return { url, method, headers, body };
}

function sanitizeCommand(command: string, safeMode: boolean): string {
  if (!safeMode) return command;

  let sanitized = command;

  // Replace Auth0 domains with test domain
  for (const pattern of AUTH0_DOMAIN_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match, tenant) => {
      return match.replace(tenant + '.auth0.com', TEST_DOMAIN);
    });
  }

  // Replace sensitive data
  for (const { regex, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(regex, replacement);
  }

  return sanitized;
}

function makeSafeForExecution(
  parsed: ParsedCurl,
  safeMode: boolean
): { url: string; headers: Record<string, string>; body?: string } {
  if (!safeMode) {
    // Production mode - pass through as-is
    return {
      url: parsed.url,
      headers: parsed.headers,
      body: parsed.body,
    };
  }

  // Safe mode - sanitize everything
  let url = parsed.url;

  // Replace domain in URL
  for (const pattern of AUTH0_DOMAIN_PATTERNS) {
    url = url.replace(pattern, (match, tenant) => {
      return match.replace(tenant + '.auth0.com', TEST_DOMAIN);
    });
  }

  // Sanitize headers (remove Authorization with real tokens)
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.headers)) {
    if (key.toLowerCase() === 'authorization') {
      // Keep Bearer prefix but replace token
      if (value.toLowerCase().startsWith('bearer ')) {
        headers[key] = 'Bearer YOUR_ACCESS_TOKEN';
      } else {
        headers[key] = 'Basic YOUR_BASE64_CREDENTIALS';
      }
    } else {
      headers[key] = value;
    }
  }

  // Sanitize body
  let body = parsed.body;
  if (body) {
    for (const { regex, replacement } of SENSITIVE_PATTERNS) {
      body = body.replace(regex, replacement);
    }
  }

  return { url, headers, body };
}

async function executeRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
  timeoutMs: number = 10000
): Promise<{ statusCode?: number; statusText?: string; responseTimeMs: number; error?: string; responseBody?: string; responseHeaders?: Record<string, string> }> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const requestHeaders: Record<string, string> = {
        'User-Agent': 'Auth0-IA-CurlValidator/1.0',
        ...headers,
      };

      // Set content-type for body requests if not set
      if (body && !requestHeaders['Content-Type'] && !requestHeaders['content-type']) {
        requestHeaders['Content-Type'] = 'application/json';
      }

      // Set content-length for body
      if (body) {
        requestHeaders['Content-Length'] = Buffer.byteLength(body).toString();
      }

      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers: requestHeaders,
        timeout: timeoutMs,
      };

      const req = client.request(options, (res) => {
        const responseTimeMs = Date.now() - startTime;
        let responseBody = '';

        res.on('data', (chunk) => {
          responseBody += chunk;
        });

        res.on('end', () => {
          // Convert response headers to Record<string, string>
          const responseHeaders: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') {
              responseHeaders[key] = value;
            } else if (Array.isArray(value)) {
              responseHeaders[key] = value.join(', ');
            }
          }

          resolve({
            statusCode: res.statusCode,
            statusText: res.statusMessage,
            responseTimeMs,
            responseBody: responseBody.slice(0, 50000), // Increased limit for production use
            responseHeaders,
          });
        });
      });

      req.on('error', (err) => {
        resolve({
          responseTimeMs: Date.now() - startTime,
          error: err.message,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          responseTimeMs: Date.now() - startTime,
          error: 'Request timeout',
        });
      });

      // Write body if present
      if (body) {
        req.write(body);
      }

      req.end();
    } catch (err: any) {
      resolve({
        responseTimeMs: Date.now() - startTime,
        error: err?.message || 'Invalid URL or request configuration',
      });
    }
  });
}

function categorizeResult(statusCode?: number, error?: string): 'working' | 'auth_required' | 'not_found' | 'failing' {
  if (error) return 'failing';
  if (!statusCode) return 'failing';
  if (statusCode >= 200 && statusCode < 300) return 'working';
  if (statusCode === 401 || statusCode === 403) return 'auth_required';
  if (statusCode === 404) return 'not_found';
  if (statusCode >= 400) return 'failing';
  return 'failing';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { command, options = {}, variables = {} } = body;

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid command parameter' },
        { status: 400 }
      );
    }

    // Parse options
    const timeoutMs = Math.min(options.timeoutMs || 30000, 60000); // Max 60s
    const skipExecution = options.skipExecution || false;
    const safeMode = options.safeMode !== false; // Default to safe mode
    const allowAllMethods = options.allowAllMethods === true; // Must explicitly enable
    const applyRateLimit = options.applyRateLimit !== false; // Default to true

    // Apply variable substitution first
    const processedCommand = applyVariables(command, variables as Variables);

    // Parse the curl command
    const parsed = parseCurlCommand(processedCommand);

    if (!parsed) {
      return NextResponse.json(
        { error: 'Failed to parse curl command. Make sure it contains a valid URL.' },
        { status: 400 }
      );
    }

    // Apply variables to parsed components as well
    parsed.url = applyVariables(parsed.url, variables as Variables);
    if (parsed.body) {
      parsed.body = applyVariables(parsed.body, variables as Variables);
    }
    for (const [key, value] of Object.entries(parsed.headers)) {
      parsed.headers[key] = applyVariables(value, variables as Variables);
    }

    // Make safe for execution (or pass through in production mode)
    const safe = makeSafeForExecution(parsed, safeMode);
    const sanitizedCmd = sanitizeCommand(processedCommand, safeMode);

    // Check safety rules
    const warnings: string[] = [];

    if (!safeMode) {
      warnings.push('Production mode: Using real credentials and endpoints');
    }

    if (!allowAllMethods && SIDE_EFFECT_METHODS.includes(parsed.method)) {
      warnings.push(`${parsed.method} method requires explicit allowAllMethods option`);
    }

    // Prepare response
    const result: {
      originalCommand: string;
      processedCommand: string;
      modifiedCommand: string;
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
      executed: boolean;
      statusCode?: number;
      statusText?: string;
      responseTimeMs?: number;
      responseBody?: string;
      responseHeaders?: Record<string, string>;
      error?: string;
      category: 'working' | 'auth_required' | 'not_found' | 'failing' | 'skipped';
      warnings: string[];
      rateLimitStatus?: {
        currentRequests: number;
        maxRequests: number;
      };
      variablesApplied: string[];
      safeMode: boolean;
    } = {
      originalCommand: command,
      processedCommand: processedCommand,
      modifiedCommand: sanitizedCmd,
      url: safe.url,
      method: parsed.method,
      headers: safe.headers,
      body: safe.body,
      executed: false,
      category: 'skipped',
      warnings,
      variablesApplied: Object.keys(variables),
      safeMode,
    };

    // Skip execution if non-GET in safe mode without allowAllMethods
    if (!allowAllMethods && SIDE_EFFECT_METHODS.includes(parsed.method)) {
      result.warnings.push(`Execution skipped: ${parsed.method} requires allowAllMethods option`);
      return NextResponse.json(result);
    }

    // Skip execution if explicitly requested
    if (skipExecution) {
      result.warnings.push('Execution skipped: skipExecution option was set');
      return NextResponse.json(result);
    }

    // Apply rate limiting if enabled
    if (applyRateLimit) {
      await globalRateLimiter.acquire();
      result.rateLimitStatus = {
        currentRequests: globalRateLimiter.currentCount,
        maxRequests: 60,
      };
    }

    // Execute the request
    const response = await executeRequest(
      safe.url,
      parsed.method,
      safe.headers,
      safe.body,
      timeoutMs
    );

    result.executed = true;
    result.statusCode = response.statusCode;
    result.statusText = response.statusText;
    result.responseTimeMs = response.responseTimeMs;
    result.responseBody = response.responseBody;
    result.responseHeaders = response.responseHeaders;
    result.error = response.error;
    result.category = categorizeResult(response.statusCode, response.error);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Live curl execution error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Also support GET for health checks
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    testDomain: TEST_DOMAIN,
    rateLimit: {
      maxRequests: 60,
      windowMs: 60000,
    },
    features: {
      variableSubstitution: true,
      productionMode: true,
      allHttpMethods: true,
    },
  });
}
