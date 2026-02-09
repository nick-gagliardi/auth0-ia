export type NodeType = 'page' | 'snippet';

export type DocNode = {
  id: string;
  type: NodeType;
  filePath: string;
  title?: string;
  permalink?: string;
  navPaths: string[];
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
