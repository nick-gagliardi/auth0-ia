export type NodeType = 'page' | 'snippet';

export type DocNode = {
  id: string;
  type: NodeType;
  filePath: string;
  title?: string;
  permalink?: string;
  navPaths: string[];
  lastModified?: string; // ISO 8601 timestamp
};

export type NavNodeKind = 'root' | 'tab' | 'dropdown' | 'group' | 'page';

export type NavTreeNode = {
  id: string;
  kind: NavNodeKind;
  label: string;
  route?: string;
  filePath?: string;
  children: NavTreeNode[];
};

export type NavTree = {
  generatedAtUtc: string;
  language: string;
  root: NavTreeNode;
};

export type NavLeafLabelSource = 'nav' | 'frontmatter' | 'fallback';

export type PageNavPathMeta = {
  route: string;
  nodeIds: string[];
  labels: string[];
  kinds: NavNodeKind[];
  leafLabel: string;
  leafLabelSource: NavLeafLabelSource;
  pathString: string;
  containerString: string;
};

export type PageNavMeta = {
  filePath: string;
  navDepth?: number;
  navNodePaths: PageNavPathMeta[];
  navLabel?: string;
  navLabelSource?: NavLeafLabelSource;
};

export type NavPagesIndex = Record<string, PageNavMeta>;

export type NavLabelCollisionsIndex = {
  generatedAtUtc: string;
  collisions: Array<{
    label: string;
    count: number;
    pages: Array<{ id: string; filePath: string; title?: string; navPath?: string }>;
  }>;
};

export type NodeMetrics = {
  inboundLinks: number;
  outboundLinks: number;
  importedBy: number;
  impactPages?: number;
  navDepth?: number;
  orphanNav?: boolean;
  orphanLinks?: boolean;
  orphanTrue?: boolean;
  orphanReference?: boolean;
  deepNav?: boolean;
  hubScore?: number;
  deadEnd?: boolean;
  deadEndScore?: number;
};

export type Metrics = Record<string, NodeMetrics>;

export type EdgeMap = Record<string, { link: string[]; import: string[]; redirect: string[] }>;

export type SimilarityItem = {
  id: string;
  score: number;
  simOut: number;
  simIn: number;
  sharedOut: number;
  sharedIn: number;
  reasons: string[];
  isCrossNav: boolean | null;
  diffFolder: boolean | null;
  highValueConvergence: boolean;
};

export type SimilarityIndex = Record<string, SimilarityItem[]>;

export type CrossNavPairs = {
  generatedAtUtc: string;
  hubCutoff: number;
  minIntersection: number;
  scoreThreshold: number;
  pairs: Array<{
    a: string;
    b: string;
    score: number;
    simOut: number;
    simIn: number;
    sharedOut: number;
    sharedIn: number;
    convergenceType: 'journey' | 'context' | 'mixed';
    aNav: string | null;
    bNav: string | null;
    aFolder: string | null;
    bFolder: string | null;
  }>;
};

export type ShadowHubs = {
  generatedAtUtc: string;
  hubCutoff: number;
  shadowThreshold: number;
  minAuthorityDelta: number;
  count: number;
  items: Array<{
    shadowId: string;
    hubId: string;
    score: number;
    simOut: number;
    simIn: number;
    sharedOut: number;
    sharedIn: number;
    shadowInbound: number;
    hubInbound: number;
    shadowNavDepth?: number;
    shadowOrphanTrue?: boolean;
    shadowOrphanReference?: boolean;
    shadowDeepNav?: boolean;
  }>;
};

export type DeadEndsIndex = {
  generatedAtUtc: string;
  minInbound: number;
  maxOutbound: number;
  count: number;
  items: Array<{
    id: string;
    inboundLinks: number;
    outboundLinks: number;
    deadEndScore: number;
    navRoot: string | null;
    navDepth?: number;
  }>;
};

export type JourneyMapsIndex = {
  generatedAtUtc: string;
  maxLen: number;
  minLen: number;
  startsPerRoot: number;
  branching: number;
  topPerRoot: number;
  globalTop: Array<{
    path: string[];
    score: number;
    support: number;
    navRoot: string | null;
  }>;
  byNavRoot: Record<
    string,
    {
      paths: Array<{
        path: string[];
        score: number;
        support: number;
      }>;
    }
  >;
};


export type Redirect = { source: string; destination: string };

export type RedirectResolution = Redirect & {
  finalDestination: string | null;
  hops: number;
  loop: boolean;
};

export type RedirectIndex = {
  redirects: Redirect[];
  warnings: {
    missingDestination: Redirect[];
    missingSource: Redirect[];
    missingDestinationResolvable?: RedirectResolution[];
    missingDestinationUnresolvable?: RedirectResolution[];
    loops: { source: string; chain: string[] }[];
    chains: { source: string; chain: string[] }[];
  };
};

export type LinkHref = { href: string; toId: string };
export type LinkHrefIndex = Record<string, LinkHref[]>;

export type Auth0LintSeverity = 'info' | 'warn' | 'error';

export type Auth0LintWarning = {
  code:
    | 'missing_pkce_mention'
    | 'missing_state_mention'
    | 'missing_nonce_mention'
    | 'token_storage_localstorage'
    | 'token_storage_sessionstorage'
    | 'token_storage_cookie'
    | 'rules_vs_actions_language';
  severity: Auth0LintSeverity;
  message: string;
  evidence?: string;
  line?: number;
};

export type Auth0LintPageResult = {
  id: string;
  filePath: string;
  warnings: Auth0LintWarning[];
};

export type Auth0LintIndex = {
  pagesScanned: number;
  pagesWithWarnings: number;
  warningCount: number;
  byCode: Record<Auth0LintWarning['code'], number>;
  items: Auth0LintPageResult[];
  byPageId: Record<string, Auth0LintWarning[]>;
};

export type SnippetMigrationItem = {
  filePath: string;
  startLine: number;
  endLine: number;
  lang: string | null;
  code: string;
  hash: string;
  snippetId: string;
  occurrences: number;
  preview: string;
};

export type SnippetMigrationIndex = {
  generatedAtUtc: string;
  pagesScanned: number;
  blocksFound: number;
  uniqueBlocks: number;
  byLang: Record<string, number>;
  items: SnippetMigrationItem[];
};

// Rules deprecation types
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

// Curl validation types
export type CurlValidationResult = {
  id: string;
  filePath: string;
  line: number;
  startLine: number;
  snippet: string;
  originalCommand: string;
  modifiedCommand: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  executed: boolean;
  statusCode?: number;
  statusText?: string;
  responseTimeMs?: number;
  error?: string;
  category: 'working' | 'auth_required' | 'not_found' | 'failing' | 'not_executed' | 'skipped';
  skipReason?: string;
};

export type CurlValidationStats = {
  total: number;
  executed: number;
  working: number;
  authRequired: number;
  notFound: number;
  failing: number;
  notExecuted: number;
  skipped: number;
  byDomain: Record<string, number>;
  byMethod: Record<string, number>;
};

export type EndpointHealthReport = {
  generatedAtUtc: string;
  summary: {
    totalEndpoints: number;
    healthy: number;
    authRequired: number;
    broken: number;
    notTested: number;
  };
  endpoints: Array<{
    url: string;
    method: string;
    status: 'healthy' | 'auth_required' | 'broken' | 'not_tested';
    occurrences: number;
    files: string[];
    lastStatusCode?: number;
    avgResponseTimeMs?: number;
    errors: string[];
  }>;
};

export type CurlValidationIndex = {
  generatedAtUtc: string;
  config: {
    testDomain: string;
    timeoutMs: number;
    rateLimitDelayMs: number;
    maxRetries: number;
    maxRequestsPerMinute: number;
    getOnly: boolean;
  };
  stats: CurlValidationStats;
  results: CurlValidationResult[];
  healthReport?: EndpointHealthReport;
};

export type IndexBundle = {
  summary: Summary;
  nodes: DocNode[];
  metrics: Metrics;
  edges: {
    inbound: EdgeMap;
    outbound: EdgeMap;
  };
  linkHrefsOut: LinkHrefIndex;
  redirects: RedirectIndex;
  nav?: {
    tree: NavTree;
    pages: NavPagesIndex;
    labelCollisions: NavLabelCollisionsIndex;
  };
  auth0Lint?: Auth0LintIndex;
  snippetMigration?: SnippetMigrationIndex;
  rulesDeprecation?: RulesDeprecationIndex;
  curlValidator?: CurlValidationIndex;
  similarity: SimilarityIndex;
  crossNavPairs: CrossNavPairs;
  shadowHubs: ShadowHubs;
  deadEnds: DeadEndsIndex;
  journeyMaps: JourneyMapsIndex;
};

export type Summary = {
  generatedAtUtc: string;
  source?: {
    repoUrl: string;
    ref: string;
    gitSha: string;
  };
  nodes: number;
  pages: number;
  snippets: number;
};

// Audit types
export type AuditCheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'NA' | 'MANUAL';

export type AuditCheckItem = {
  id: string;
  label: string;
  status: AuditCheckStatus;
  details?: string;
  evidence?: any;
};

export type AuditSuggestionType =
  | 'tooltip'
  | 'heading-case'
  | 'callout-migration'
  | 'heading-in-callout'
  | 'typo';

export type AuditSuggestion = {
  id: string;
  type: AuditSuggestionType;
  description: string;
  line?: number;
  original: string;      // The text to find/replace
  suggestion: string;    // The replacement text
  context?: string;      // Surrounding context for display
};

// AI-generated suggestions (not auto-applicable)
export type AiSuggestionCategory = 'grammar' | 'clarity' | 'technical' | 'content-gap' | 'link-suggestion' | 'tone';

export type AiSuggestion = {
  category: AiSuggestionCategory;
  title: string;
  description: string;
  original?: string;
  suggestion?: string;
  line?: number;
};

export type AuditResult = {
  ok: boolean;
  error?: string;
  url: string;
  filePath?: string;
  pageTitle?: string;
  checkedAt: string;
  screenshot?: string; // base64 PNG
  checks: AuditCheckItem[];
  suggestions?: AuditSuggestion[];  // Actionable suggestions with accept/decline
  aiSuggestions?: AiSuggestion[];   // AI-generated suggestions (review only)
  mdxContent?: string;              // MDX content for client-side AI processing
  summary: {
    pass: number;
    fail: number;
    warn: number;
    na: number;
    manual: number;
  };
};

// ---------------------------------------------------------------------------
// Analytics Intelligence types
// ---------------------------------------------------------------------------

/** AI-generated actionable suggestion for a feedback item */
export interface FeedbackSuggestion {
  title: string;
  description: string;
  category: 'content-gap' | 'clarity' | 'accuracy' | 'navigation' | 'code-example' | 'structure';
  confidence: 'high' | 'medium' | 'low';
  suggestedAction: string;
  /** Generated before/after content for PR creation (populated by second AI call) */
  before?: string;
  after?: string;
  filePath?: string;
}

/** Insight type identifiers produced by the algorithmic correlation engine */
export type InsightType =
  | 'orphan-traffic'
  | 'high-traffic-low-helpfulness'
  | 'dead-end-traffic'
  | 'convergence-point'
  | 'content-gap'
  | 'unlinked-high-search'
  | 'shadow-hub-traffic'
  | 'cross-nav-friction';

/** Shared shape for both algorithmic and AI-generated insights */
export interface AnalyticsInsight {
  type: InsightType;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  affectedPages: string[];
  recommendation: string;
  evidence: Record<string, unknown>;
}

/** Node representation for the site-graph heatmap visualisation */
export interface GraphHeatmapNode {
  id: string;
  title: string;
  path: string;
  views: number;
  helpfulnessRatio: number | null;
  hubScore: number;
  deadEnd: boolean;
  orphan: boolean;
  navDepth: number;
}
