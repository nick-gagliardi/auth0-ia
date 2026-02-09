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
