export type RulesDeprecationCategory =
  | 'has_rules_code'
  | 'links_to_rules'
  | 'suggests_rules'
  | 'mentions_rules'
  | 'is_rules_api'
  | 'is_hooks_page';

export type RulesDeprecationEvidence = {
  line: number;
  snippet: string;
  category: RulesDeprecationCategory;
};

export type RulesDeprecationItem = {
  id: string;
  filePath: string;
  categories: RulesDeprecationCategory[];
  evidenceCount: number;
  evidence: RulesDeprecationEvidence[];
  severity: 'critical' | 'high' | 'medium' | 'low';
};

export type RulesDeprecationIndex = {
  generatedAtUtc: string;
  pagesScanned: number;
  pagesWithRules: number;
  totalEvidenceCount: number;
  byCriticality: Record<'critical' | 'high' | 'medium' | 'low', number>;
  byCategory: Record<RulesDeprecationCategory, number>;
  items: RulesDeprecationItem[];
};

// ---------------------------------------------------------------------------
// False-positive filters — lines matching these are NOT Auth0 Rules/Hooks
// ---------------------------------------------------------------------------

const FALSE_POSITIVE_LINE_PATTERNS: RegExp[] = [
  // React / JS framework hooks
  /##\s+Context\s+Hooks/i,
  /React\s+Hooks/i,
  /Hooks-based/i,
  /Custom\s+Hooks/i,
  /hooks-overview\.html/,
  /useResend|useMfaPolling|usePasswordValidation|useUsernameValidation/,
  // Non-Auth0 "rules"
  /ProGuard\s+rules/i,
  /firewall\s+rules/i,
  /validation\s+rules/i,
  /formatting\s+rules/i,
  /naming\s+rules/i,
  /revocation\s+rules/i,
  /composition\s+rules/i,
  /CDN\s+Rules/i,
  /Cloudflare\s+rules/i,
  /WAF\s+rules/i,
  /host.*path\s+rules/i,
  /quota.*rules/i,
  /DIRECTORY\s+NAVIGATION\s+RULES/,
  // SDK type names (not the product feature)
  /PasswordComplexityRule/,
  /MfaPollingResult/,
  /UseResendOptions|UseResendReturn/,
];

function isFalsePositiveLine(line: string): boolean {
  return FALSE_POSITIVE_LINE_PATTERNS.some((re) => re.test(line));
}

// Also filter entire pages that are purely SDK type reference docs with no real Rules content.
const FALSE_POSITIVE_PATH_PATTERNS: RegExp[] = [
  /\/acul\/react-sdk\/API-Reference\/Screens\//,
  /\/acul\/react-sdk\/API-Reference\/Hooks\//,
  /\/acul\/react-sdk\/API-Reference\/Types\/interfaces\/(?!.*Rule)/,
  /\/acul\/js-sdk\/Screens\/type-aliases\//,
];

function isFalsePositivePath(filePath: string): boolean {
  return FALSE_POSITIVE_PATH_PATTERNS.some((re) => re.test(filePath));
}

// ---------------------------------------------------------------------------
// Signal detectors — each returns evidence items for matching lines
// ---------------------------------------------------------------------------

type SignalDetector = {
  category: RulesDeprecationCategory;
  linePatterns: RegExp[];
};

const SIGNAL_DETECTORS: SignalDetector[] = [
  {
    category: 'has_rules_code',
    linePatterns: [
      /function\s*\(\s*user\s*,\s*context\s*,\s*callback\s*\)/,
      /context\.redirect\.url/,
      /context\.clientMetadata/,
      /context\.accessToken/,
      /context\.idToken/,
      /context\.multifactor/,
      /context\.connection\b(?!Profile)/,
    ],
  },
  {
    category: 'links_to_rules',
    linePatterns: [
      /\(\/docs\/customize\/rules/,
      /href="\/docs\/customize\/rules/,
      /href="https:\/\/auth0\.com\/docs\/customize\/rules/,
      /\(\/docs\/manage-users\/user-accounts\/metadata\/manage-metadata-rules/,
      /\(\/docs\/manage-users\/access-control\/rules-for-authorization/,
      /\(\/docs\/manage-users\/access-control\/sample-use-cases-rules/,
      /\(\/docs\/customize\/extensions\/authorization-extension\/use-rules/,
      /manage\.auth0\.com\/#\/rules/,
    ],
  },
  {
    category: 'suggests_rules',
    linePatterns: [
      /(?:use|create|write|add|configure|set\s+up)\s+(?:a\s+)?(?:Auth0\s+)?[Rr]ules?\b/,
      /learn\s+about\s+rules/i,
      /[Rr]ules?\s+(?:to|that|which|can|will|allow)\s/,
    ],
  },
  {
    category: 'mentions_rules',
    linePatterns: [
      /Auth0\s+Rules?\b/,
      /\[Rules?\]/,
      /Rules\s+are\s+JavaScript\s+functions/i,
      /Rules\s+execute/i,
      /end\s+of\s+life.*[Rr]ules/i,
      /[Rr]ules.*end\s+of\s+life/i,
      /[Rr]ules?\s+pipeline/i,
    ],
  },
  {
    category: 'is_rules_api',
    linePatterns: [
      /\/api\/v2\/rules/,
      /\/rules-configs/,
      /(?:post|get|patch|delete|put)\s+\/rules\b/i,
      /openapi:.*rules/,
    ],
  },
  {
    category: 'is_hooks_page',
    linePatterns: [
      /Auth0\s+Hooks?\b/i,
      /\/docs\/customize\/hooks/,
      /\/api\/v2\/hooks/,
      /(?:post|get|patch|delete)\s+\/hooks/i,
      /openapi:.*hooks/,
      /Pre\s+User\s+Registration\s+Hook/i,
      /Post\s+User\s+Registration\s+Hook/i,
      /Client\s+Credentials\s+Exchange\s+Hook/i,
    ],
  },
];

function detectSignals(lines: string[]): RulesDeprecationEvidence[] {
  const evidence: RulesDeprecationEvidence[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip false-positive lines
    if (isFalsePositiveLine(line)) continue;

    for (const detector of SIGNAL_DETECTORS) {
      for (const pattern of detector.linePatterns) {
        if (pattern.test(line)) {
          evidence.push({
            line: i + 1,
            snippet: line.trim().slice(0, 150),
            category: detector.category,
          });
          // Only one match per detector per line
          break;
        }
      }
    }
  }

  return evidence;
}

function deriveSeverity(categories: RulesDeprecationCategory[]): RulesDeprecationItem['severity'] {
  if (categories.includes('has_rules_code')) return 'critical';
  if (categories.includes('is_rules_api') || categories.includes('links_to_rules')) return 'high';
  if (categories.includes('suggests_rules') || categories.includes('is_hooks_page')) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function buildRulesDeprecationIndex(
  pages: Array<{ id: string; filePath: string; mdx: string }>
): RulesDeprecationIndex {
  const items: RulesDeprecationItem[] = [];
  const byCategory: Record<RulesDeprecationCategory, number> = {
    has_rules_code: 0,
    links_to_rules: 0,
    suggests_rules: 0,
    mentions_rules: 0,
    is_rules_api: 0,
    is_hooks_page: 0,
  };
  const byCriticality: Record<'critical' | 'high' | 'medium' | 'low', number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const page of pages) {
    // Skip paths that are known false-positive patterns
    if (isFalsePositivePath(page.filePath)) continue;

    const lines = page.mdx.replace(/\r\n?/g, '\n').split('\n');
    const allEvidence = detectSignals(lines);

    if (allEvidence.length === 0) continue;

    // Deduplicate categories
    const categories = [...new Set(allEvidence.map((e) => e.category))];

    // If the ONLY category is mentions_rules with very few hits, check if it's actually
    // just generic "rules" usage (e.g., "validation rules") that slipped through line-level filters.
    // We do a page-level sanity check: require at least one strong Auth0 context signal.
    if (categories.length === 1 && categories[0] === 'mentions_rules' && allEvidence.length <= 2) {
      const lowerMdx = page.mdx.toLowerCase();
      const hasAuth0Context =
        lowerMdx.includes('/docs/customize/rules') ||
        lowerMdx.includes('auth0 rules') ||
        lowerMdx.includes('auth pipeline') ||
        lowerMdx.includes('rules execute') ||
        lowerMdx.includes('function(user, context, callback') ||
        lowerMdx.includes('function (user, context, callback');
      if (!hasAuth0Context) continue;
    }

    const severity = deriveSeverity(categories);

    items.push({
      id: page.filePath,
      filePath: page.filePath,
      categories,
      evidenceCount: allEvidence.length,
      evidence: allEvidence.slice(0, 10),
      severity,
    });

    for (const cat of categories) byCategory[cat]++;
    byCriticality[severity]++;
  }

  // Sort: critical first, then high, medium, low; within same severity, alphabetical.
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.filePath.localeCompare(b.filePath));

  return {
    generatedAtUtc: new Date().toISOString(),
    pagesScanned: pages.length,
    pagesWithRules: items.length,
    totalEvidenceCount: items.reduce((acc, x) => acc + x.evidenceCount, 0),
    byCriticality,
    byCategory,
    items,
  };
}
