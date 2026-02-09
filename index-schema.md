# Index schema (draft)

This tool builds a **queryable JSON index** over the Auth0 `docs-v2` repo.

## Nodes

`index/nodes.json`

```ts
type NodeType = 'page' | 'snippet';

type Node = {
  id: string;              // canonical = filePath
  type: NodeType;
  filePath: string;        // e.g. main/docs/authenticate/login.mdx
  title?: string;
  permalink?: string;
  navPaths: string[];      // e.g. ["Authenticate > Login"]
};
```

## Edges

`index/edges_outbound.json`

```ts
type EdgeKind = 'link' | 'import' | 'redirect';

type OutboundEdges = Record<string /*fromId*/, {
  link: string[];
  import: string[];
  redirect: string[];
}>;
```

`index/edges_inbound.json`

```ts
type InboundEdges = Record<string /*toId*/, {
  link: string[];
  import: string[];
  redirect: string[];
}>;
```

## Metrics

`index/metrics.json`

```ts
type Metrics = Record<string /*nodeId*/, {
  inboundLinks: number;
  outboundLinks: number;
  importedBy: number;      // for snippets
  navDepth?: number;       // min depth if present in nav
  orphanNav?: boolean;     // exists but not in docs.json navigation
  orphanLinks?: boolean;   // 0 inbound link edges (excluding nav)
  hubScore?: number;       // simple centrality proxy (v1: inboundLinks)
}>;
```

## Redirects

`index/redirects.json`

```ts
type Redirect = { source: string; destination: string };

type RedirectIndex = {
  redirects: Redirect[];
  warnings: {
    missingDestination: Redirect[];
    chains: { source: string; chain: string[] }[];
  };
};
```
