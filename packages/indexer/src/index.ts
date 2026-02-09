import fs from 'node:fs/promises';
import path from 'node:path';
import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';
import yaml from 'js-yaml';

const exec = promisify(_exec);

type BuildIndexOptions = {
  repoUrl: string;
  ref: string;
  workdir: string;
  outDir: string;
};

type NodeType = 'page' | 'snippet';

type Node = {
  id: string; // canonical: filePath
  type: NodeType;
  filePath: string;
  title?: string;
  permalink?: string;
  navPaths: string[];
};

type EdgeMap = Record<string, { link: string[]; import: string[]; redirect: string[] }>;

type Metrics = Record<
  string,
  {
    inboundLinks: number;
    outboundLinks: number;
    importedBy: number;
    // For snippets/components: unique page count impacted via transitive imports.
    impactPages?: number;
    navDepth?: number;
    orphanNav?: boolean;
    orphanLinks?: boolean;
    orphanTrue?: boolean;
    orphanReference?: boolean;
    deepNav?: boolean;
    hubScore?: number;
  }
>;

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

async function ensureClone(repoUrl: string, ref: string, workdir: string) {
  const gitDir = path.join(workdir, '.git');
  try {
    await fs.stat(gitDir);
    await exec(`git -C ${workdir} fetch --all --prune`);
  } catch {
    await fs.mkdir(path.dirname(workdir), { recursive: true });
    await exec(`git clone --depth 1 --branch ${ref} ${repoUrl} ${workdir}`);
    return;
  }
  await exec(`git -C ${workdir} checkout ${ref}`);
  await exec(`git -C ${workdir} reset --hard origin/${ref}`);
}

function parseFrontmatter(mdx: string): { title?: string; permalink?: string } {
  // very small frontmatter parser: expects leading --- block
  if (!mdx.startsWith('---')) return {};
  const end = mdx.indexOf('\n---', 3);
  if (end === -1) return {};
  const raw = mdx.slice(3, end);
  try {
    const data = yaml.load(raw) as any;
    return {
      title: typeof data?.title === 'string' ? data.title : undefined,
      permalink: typeof data?.permalink === 'string' ? data.permalink : undefined
    };
  } catch {
    return {};
  }
}

function extractImports(mdx: string): string[] {
  const out: string[] = [];
  // match: from '/snippets/...'
  const re = /from\s+['\"](\/snippets\/[^'\"]+)['\"]/g;
  let m;
  while ((m = re.exec(mdx))) out.push(m[1]);
  return out;
}

function extractLinks(mdx: string): string[] {
  const out: string[] = [];
  // Markdown links: ](/docs/...) or ](../something)
  const re = /\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(mdx))) {
    const href = m[1].split('#')[0].trim();
    if (!href) continue;
    if (href.startsWith('/docs/')) out.push(href);
  }
  return out;
}

function normalizeDocsPathFromHref(href: string): string | null {
  // /docs/foo/bar -> main/docs/foo/bar.mdx (best-effort)
  const p = href.replace(/^\/docs\//, '');
  if (!p) return null;
  return `main/docs/${p}.mdx`;
}

async function listFiles(root: string, exts: Set<string>): Promise<string[]> {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) {
        const ext = path.extname(e.name);
        if (exts.has(ext)) out.push(full);
      }
    }
  }
  return out;
}

async function navPathsFromDocsJson(
  docsJson: any,
  repoRoot: string
): Promise<Map<string /*filePath*/, { navPaths: string[]; navDepth: number }>> {
  // docs.json contains navigation.languages[].tabs[].dropdowns[].pages (strings like "docs/get-started")
  const map = new Map<string, { navPaths: string[]; navDepth: number }>();

  const langs = docsJson?.navigation?.languages ?? [];
  const en = langs.find((l: any) => l?.language === 'en') ?? langs[0];
  const tabs = en?.tabs ?? [];

  async function resolveNavPageToFilePath(p: string): Promise<string | null> {
    // Normalize to "docs/..." (relative to /main)
    let rel = p;
    if (rel.startsWith('/')) rel = rel.slice(1);
    if (!rel.startsWith('docs/')) rel = `docs/${rel}`;

    const candidates = [
      `main/${rel}.mdx`,
      `main/${rel}/index.mdx`,
      `main/${rel}.md`,
      `main/${rel}/index.md`
    ];

    for (const c of candidates) {
      try {
        const st = await fs.stat(path.join(repoRoot, c));
        if (st.isFile()) return c;
      } catch {
        // ignore
      }
    }

    return null;
  }

  async function visitNavItems(items: any[], prefix: string[], depth: number) {
    for (const item of items ?? []) {
      if (typeof item === 'string') {
        const filePath = await resolveNavPageToFilePath(item);
        if (!filePath) continue;

        const navPathStr = prefix.join(' > ');
        const prev = map.get(filePath);
        if (!prev) map.set(filePath, { navPaths: [navPathStr], navDepth: depth });
        else {
          prev.navPaths.push(navPathStr);
          prev.navDepth = Math.min(prev.navDepth, depth);
        }
        continue;
      }

      if (item && typeof item === 'object') {
        // Mintlify nav sometimes nests groups:
        // { group: "Name", pages: [ ... ] }
        // or { pages: [ ... ] }
        const groupName = typeof item.group === 'string' ? item.group : undefined;
        const nestedPages = Array.isArray(item.pages) ? item.pages : undefined;
        if (nestedPages) {
          const nextPrefix = groupName ? [...prefix, groupName] : prefix;
          await visitNavItems(nestedPages, nextPrefix, depth + (groupName ? 1 : 0));
        }
      }
    }
  }

  for (const t of tabs) {
    const tabName = t?.tab;

    if (Array.isArray(t?.pages)) {
      await visitNavItems(t.pages, [tabName].filter(Boolean) as string[], 1);
    }

    for (const dd of t?.dropdowns ?? []) {
      const ddName = dd?.dropdown;
      const prefix = [tabName, ddName].filter(Boolean) as string[];
      await visitNavItems(dd?.pages, prefix, prefix.length);
    }
  }

  // uniq navPaths
  for (const v of map.values()) v.navPaths = uniq(v.navPaths);
  return map;
}

export async function buildIndex(opts: BuildIndexOptions) {
  await ensureClone(opts.repoUrl, opts.ref, opts.workdir);

  const repoRoot = opts.workdir;
  const siteRoot = path.join(repoRoot, 'main'); // docs-v2 has /main (site)

  const docsJsonPath = path.join(siteRoot, 'docs.json');
  const docsJson = JSON.parse(await fs.readFile(docsJsonPath, 'utf8'));

  const navMap = await navPathsFromDocsJson(docsJson, repoRoot);

  const docsRoot = path.join(siteRoot, 'docs');
  const snippetsRoot = path.join(siteRoot, 'snippets');

  const mdxFiles = (await listFiles(docsRoot, new Set(['.mdx']))).filter(
    (p) => !p.includes(`${path.sep}fr-ca${path.sep}`) && !p.includes(`${path.sep}ja-jp${path.sep}`)
  );
  const snippetFiles = await listFiles(snippetsRoot, new Set(['.mdx', '.jsx', '.js', '.ts', '.tsx']));

  const nodes: Node[] = [];
  const outbound: EdgeMap = {};
  const inbound: EdgeMap = {};

  function ensureEdge(id: string) {
    outbound[id] ??= { link: [], import: [], redirect: [] };
    inbound[id] ??= { link: [], import: [], redirect: [] };
  }

  function addEdge(kind: 'link' | 'import' | 'redirect', from: string, to: string) {
    ensureEdge(from);
    ensureEdge(to);
    outbound[from][kind].push(to);
    inbound[to][kind].push(from);
  }

  // pages
  for (const full of mdxFiles) {
    const rel = path.relative(repoRoot, full).replaceAll('\\', '/');
    const mdx = await fs.readFile(full, 'utf8');
    const fm = parseFrontmatter(mdx);
    const nav = navMap.get(rel);

    const id = rel;
    nodes.push({
      id,
      type: 'page',
      filePath: rel,
      title: fm.title,
      permalink: fm.permalink,
      navPaths: nav?.navPaths ?? []
    });

    ensureEdge(id);

    // links
    for (const href of extractLinks(mdx)) {
      const toFile = normalizeDocsPathFromHref(href);
      if (!toFile) continue;
      addEdge('link', id, toFile);
    }

    // imports
    for (const imp of extractImports(mdx)) {
      // /snippets/X.jsx -> main/snippets/X.jsx
      const toFile = `main${imp}`.replace(/^main\/snippets\//, 'main/snippets/');
      addEdge('import', id, toFile);
    }
  }

  // snippets/components
  for (const full of snippetFiles) {
    const rel = path.relative(repoRoot, full).replaceAll('\\', '/');
    const id = rel;
    nodes.push({ id, type: 'snippet', filePath: rel, navPaths: [] });
    ensureEdge(id);

    // Also parse snippet imports so we can compute transitive impact/blast radius.
    try {
      const src = await fs.readFile(full, 'utf8');
      for (const imp of extractImports(src)) {
        const toFile = `main${imp}`.replace(/^main\/snippets\//, 'main/snippets/');
        addEdge('import', id, toFile);
      }
    } catch {
      // ignore
    }
  }

  // de-dupe edges
  for (const id of Object.keys(outbound)) {
    outbound[id].link = uniq(outbound[id].link);
    outbound[id].import = uniq(outbound[id].import);
    outbound[id].redirect = uniq(outbound[id].redirect);
  }
  for (const id of Object.keys(inbound)) {
    inbound[id].link = uniq(inbound[id].link);
    inbound[id].import = uniq(inbound[id].import);
    inbound[id].redirect = uniq(inbound[id].redirect);
  }

  // metrics
  const metrics: Metrics = {};
  const nodeSet = new Set(nodes.map((n) => n.id));

  const nodeTypeById = new Map(nodes.map((n) => [n.id, n.type] as const));

  // For snippets: compute transitive impact (unique pages reached via reverse import graph)
  function computeSnippetImpactPages(snippetId: string): number {
    const seen = new Set<string>();
    const queue: string[] = [snippetId];
    const impactedPages = new Set<string>();

    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);

      const importers = inbound[cur]?.import ?? [];
      for (const from of importers) {
        const t = nodeTypeById.get(from);
        if (t === 'page') impactedPages.add(from);
        if (t === 'snippet') queue.push(from);
      }
    }

    return impactedPages.size;
  }

  for (const n of nodes) {
    const id = n.id;
    const inboundLinks = (inbound[id]?.link?.length ?? 0);
    const outboundLinks = (outbound[id]?.link?.length ?? 0);
    const importedBy = (inbound[id]?.import?.length ?? 0);

    const nav = navMap.get(id);
    const orphanNav = n.type === 'page' ? n.navPaths.length === 0 : false;
    const orphanLinks = n.type === 'page' ? inboundLinks === 0 : false;

    const orphanTrue = n.type === 'page' ? orphanNav && orphanLinks : false;
    const orphanReference = n.type === 'page' ? !orphanNav && orphanLinks : false;

    const navDepth = nav?.navDepth;
    const deepNav = n.type === 'page' && typeof navDepth === 'number' ? navDepth >= 5 : false;

    metrics[id] = {
      inboundLinks,
      outboundLinks,
      importedBy,
      impactPages: n.type === 'snippet' ? computeSnippetImpactPages(id) : undefined,
      navDepth,
      orphanNav,
      orphanLinks,
      orphanTrue,
      orphanReference,
      deepNav,
      hubScore: inboundLinks
    };
  }

  // ensure outDir
  await fs.mkdir(opts.outDir, { recursive: true });
  await fs.writeFile(path.join(opts.outDir, 'nodes.json'), JSON.stringify(nodes, null, 2));
  await fs.writeFile(path.join(opts.outDir, 'edges_outbound.json'), JSON.stringify(outbound, null, 2));
  await fs.writeFile(path.join(opts.outDir, 'edges_inbound.json'), JSON.stringify(inbound, null, 2));
  await fs.writeFile(path.join(opts.outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));

  // --- Path Convergence (links-only) similarity index (pages ↔ pages) ---
  // Goals:
  // - use outbound/inbound *link* neighbors (no snippet imports)
  // - exclude global hubs (nodes with inboundLinks > 50)
  // - only consider pairs with intersection >= 3

  const pages = nodes.filter((n) => n.type === 'page');
  const pageIds = pages.map((p) => p.id);
  const pageSet = new Set(pageIds);

  const hubCutoff = 50;
  const hubBlacklist = new Set<string>(pageIds.filter((id) => (metrics[id]?.inboundLinks ?? 0) > hubCutoff));

  function filteredOut(id: string): Set<string> {
    const s = new Set<string>();
    for (const to of outbound[id]?.link ?? []) {
      if (!pageSet.has(to)) continue;
      if (hubBlacklist.has(to)) continue;
      s.add(to);
    }
    return s;
  }

  function filteredIn(id: string): Set<string> {
    const s = new Set<string>();
    for (const from of inbound[id]?.link ?? []) {
      if (!pageSet.has(from)) continue;
      if (hubBlacklist.has(from)) continue;
      s.add(from);
    }
    return s;
  }

  const outSets = new Map<string, Set<string>>();
  const inSets = new Map<string, Set<string>>();
  for (const id of pageIds) {
    outSets.set(id, filteredOut(id));
    inSets.set(id, filteredIn(id));
  }

  const invOut = new Map<string, string[]>();
  const invIn = new Map<string, string[]>();

  for (const id of pageIds) {
    for (const nb of outSets.get(id)!) {
      const arr = invOut.get(nb) ?? [];
      arr.push(id);
      invOut.set(nb, arr);
    }
    for (const nb of inSets.get(id)!) {
      const arr = invIn.get(nb) ?? [];
      arr.push(id);
      invIn.set(nb, arr);
    }
  }

  type PairKey = string;
  const sharedOut = new Map<PairKey, number>();
  const sharedIn = new Map<PairKey, number>();

  function pairKey(a: string, b: string): PairKey {
    return a < b ? `${a}||${b}` : `${b}||${a}`;
  }

  function bump(map: Map<PairKey, number>, a: string, b: string) {
    if (a === b) return;
    const k = pairKey(a, b);
    map.set(k, (map.get(k) ?? 0) + 1);
  }

  function accumulate(inv: Map<string, string[]>, map: Map<PairKey, number>) {
    for (const [, pagesList] of inv) {
      if (pagesList.length < 2) continue;
      // avoid O(n^2) blowups on rare large lists (hubs are filtered, but be safe)
      if (pagesList.length > 400) continue;
      for (let i = 0; i < pagesList.length; i++) {
        for (let j = i + 1; j < pagesList.length; j++) bump(map, pagesList[i], pagesList[j]);
      }
    }
  }

  accumulate(invOut, sharedOut);
  accumulate(invIn, sharedIn);

  function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let inter = 0;
    const [small, big] = a.size < b.size ? [a, b] : [b, a];
    for (const x of small) if (big.has(x)) inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
  }

  function navRoot(navPaths: string[]): string | null {
    const p = navPaths?.[0];
    if (!p) return null;
    const parts = p.split(' > ').map((x) => x.trim()).filter(Boolean);
    if (parts[0] === 'Documentation' && parts.length >= 2) return parts[1];
    return parts.length ? parts[0] : null;
  }

  function topFolder(filePath: string): string | null {
    const parts = filePath.split('/');
    const idx = parts.indexOf('docs');
    if (idx >= 0 && parts.length > idx + 1) return parts[idx + 1];
    return null;
  }

  type SimilarityItem = {
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

  const similarity: Record<string, SimilarityItem[]> = {};
  const crossNavPairs: Array<{
    a: string;
    b: string;
    score: number;
    sharedOut: number;
    sharedIn: number;
    aNav: string | null;
    bNav: string | null;
    aFolder: string | null;
    bFolder: string | null;
  }> = [];

  const allPairKeys = new Set<string>([...sharedOut.keys(), ...sharedIn.keys()]);

  for (const k of allPairKeys) {
    const [a, b] = k.split('||');
    const so = sharedOut.get(k) ?? 0;
    const si = sharedIn.get(k) ?? 0;
    if (so < 3 && si < 3) continue;

    const simOut = jaccard(outSets.get(a)!, outSets.get(b)!);
    const simIn = jaccard(inSets.get(a)!, inSets.get(b)!);
    const score = 0.6 * simOut + 0.4 * simIn;

    const aNode = pages.find((p) => p.id === a)!;
    const bNode = pages.find((p) => p.id === b)!;

    const aRoot = navRoot(aNode.navPaths);
    const bRoot = navRoot(bNode.navPaths);
    const isCrossNav = aRoot && bRoot ? aRoot !== bRoot : null;

    const aFolder = topFolder(aNode.filePath);
    const bFolder = topFolder(bNode.filePath);
    const diffFolder = aFolder && bFolder ? aFolder !== bFolder : null;

    const highValueConvergence = score > 0.4 && isCrossNav === true;

    const reasons = [] as string[];
    if (so >= 3) reasons.push('shared_outbound');
    if (si >= 3) reasons.push('shared_inbound');

    const itemForA: SimilarityItem = {
      id: b,
      score: Number(score.toFixed(4)),
      simOut: Number(simOut.toFixed(4)),
      simIn: Number(simIn.toFixed(4)),
      sharedOut: so,
      sharedIn: si,
      reasons,
      isCrossNav,
      diffFolder,
      highValueConvergence
    };

    const itemForB: SimilarityItem = { ...itemForA, id: a };

    similarity[a] ??= [];
    similarity[b] ??= [];
    similarity[a].push(itemForA);
    similarity[b].push(itemForB);

    if (highValueConvergence) {
      crossNavPairs.push({
        a,
        b,
        score: Number(score.toFixed(4)),
        sharedOut: so,
        sharedIn: si,
        aNav: aRoot,
        bNav: bRoot,
        aFolder,
        bFolder
      });
    }
  }

  for (const id of Object.keys(similarity)) {
    similarity[id] = similarity[id].sort((x, y) => y.score - x.score || y.sharedOut - x.sharedOut).slice(0, 10);
  }

  crossNavPairs.sort((x, y) => y.score - x.score || y.sharedOut - x.sharedOut);

  await fs.writeFile(path.join(opts.outDir, 'similarity.json'), JSON.stringify(similarity, null, 2));
  await fs.writeFile(
    path.join(opts.outDir, 'cross_nav_pairs.json'),
    JSON.stringify(
      {
        generatedAtUtc: new Date().toISOString(),
        hubCutoff,
        minIntersection: 3,
        scoreThreshold: 0.4,
        pairs: crossNavPairs.slice(0, 500)
      },
      null,
      2
    )
  );

  // circular dependency detection for snippets/components (import graph among snippets)
  const snippetIds = nodes.filter((n) => n.type === 'snippet').map((n) => n.id);
  const snippetSet = new Set(snippetIds);
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(u: string, stack: string[]) {
    if (visiting.has(u)) {
      const idx = stack.indexOf(u);
      if (idx >= 0) cycles.push(stack.slice(idx));
      return;
    }
    if (visited.has(u)) return;

    visiting.add(u);
    stack.push(u);

    for (const v of outbound[u]?.import ?? []) {
      if (!snippetSet.has(v)) continue;
      dfs(v, stack);
    }

    stack.pop();
    visiting.delete(u);
    visited.add(u);
  }

  for (const s of snippetIds) dfs(s, []);

  // de-dupe cycles by canonical string
  const canon = new Set<string>();
  const uniqCycles: string[][] = [];
  for (const c of cycles) {
    const key = [...c].sort().join('|');
    if (canon.has(key)) continue;
    canon.add(key);
    uniqCycles.push(c);
  }

  await fs.writeFile(
    path.join(opts.outDir, 'circular_snippet_imports.json'),
    JSON.stringify({ count: uniqCycles.length, cycles: uniqCycles }, null, 2)
  );

  // small summary
  const gitSha = (await exec(`git -C ${repoRoot} rev-parse HEAD`)).stdout.trim();

  await fs.writeFile(
    path.join(opts.outDir, 'summary.json'),
    JSON.stringify(
      {
        generatedAtUtc: new Date().toISOString(),
        source: {
          repoUrl: opts.repoUrl,
          ref: opts.ref,
          gitSha
        },
        nodes: nodes.length,
        pages: nodes.filter((n) => n.type === 'page').length,
        snippets: nodes.filter((n) => n.type === 'snippet').length
      },
      null,
      2
    )
  );

  // quick sanity: warn about link targets that don't exist
  const missingTargets = new Set<string>();
  for (const [from, e] of Object.entries(outbound)) {
    for (const to of e.link) if (!nodeSet.has(to)) missingTargets.add(to);
  }
  await fs.writeFile(path.join(opts.outDir, 'missing_link_targets.json'), JSON.stringify([...missingTargets].sort(), null, 2));
}
