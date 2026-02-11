export type NodeType = 'page' | 'snippet';

export type DocNode = {
  id: string;
  type: NodeType;
  filePath: string;
  title?: string;
  permalink?: string;
  navPaths: string[];
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

export type RedirectIndex = {
  redirects: Redirect[];
  warnings: {
    missingDestination: Redirect[];
    missingSource: Redirect[];
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
