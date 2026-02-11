import fs from 'node:fs/promises';
import path from 'node:path';

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

export type RawNavEntry = {
  route: string;
  filePath: string;
  // Path from root -> leaf page (includes leaf page node)
  nodeIds: string[];
  labels: string[];
  kinds: NavNodeKind[];
  // Optional explicit label from docs.json for the page node.
  leafLabelFromNav?: string;
};

function safeSlug(s: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.:/]/g, '')
    .slice(0, 60);
}

async function resolveNavPageToFilePath(p: string, repoRoot: string): Promise<string | null> {
  // Normalize to "docs/..." (relative to /main)
  let rel = p;
  if (rel.startsWith('/')) rel = rel.slice(1);
  if (!rel.startsWith('docs/')) rel = `docs/${rel}`;

  const candidates = [`main/${rel}.mdx`, `main/${rel}/index.mdx`, `main/${rel}.md`, `main/${rel}/index.md`];

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

function extractLabelFromNavObject(item: any): string | undefined {
  const v = item?.title ?? item?.label ?? item?.name ?? item?.group ?? item?.dropdown ?? item?.tab;
  return typeof v === 'string' ? v : undefined;
}

function extractRouteFromNavObject(item: any): string | undefined {
  const v = item?.href ?? item?.route ?? item?.path ?? item?.page;
  return typeof v === 'string' ? v : undefined;
}

function asArray(x: any): any[] {
  return Array.isArray(x) ? x : [];
}

export async function parseDocsJsonNav(docsJson: any, repoRoot: string): Promise<{
  navTree: NavTree;
  rawByFilePath: Map<string, RawNavEntry[]>;
}> {
  const langs = docsJson?.navigation?.languages ?? [];
  const en = langs.find((l: any) => l?.language === 'en') ?? langs[0] ?? { language: 'en', tabs: [] };
  const language = typeof en?.language === 'string' ? en.language : 'en';

  const root: NavTreeNode = {
    id: 'root',
    kind: 'root',
    label: 'root',
    children: []
  };

  const rawByFilePath = new Map<string, RawNavEntry[]>();

  function mkId(parentId: string, kind: NavNodeKind, label: string) {
    return `${parentId}/${kind}:${safeSlug(label) || 'unnamed'}`;
  }

  async function addLeafPage(parent: NavTreeNode, routeLike: string, leafLabel?: string, pathAcc?: { nodes: NavTreeNode[] }) {
    const resolved = await resolveNavPageToFilePath(routeLike, repoRoot);
    if (!resolved) return;

    const label = leafLabel || routeLike;
    const node: NavTreeNode = {
      id: mkId(parent.id, 'page', `${label}:${routeLike}`),
      kind: 'page',
      label,
      route: routeLike,
      filePath: resolved,
      children: []
    };
    parent.children.push(node);

    const nodesPath = [...(pathAcc?.nodes ?? []), node];
    const entry: RawNavEntry = {
      route: routeLike,
      filePath: resolved,
      nodeIds: nodesPath.map((n) => n.id),
      labels: nodesPath.map((n) => n.label),
      kinds: nodesPath.map((n) => n.kind),
      leafLabelFromNav: leafLabel
    };

    const prev = rawByFilePath.get(resolved) ?? [];
    prev.push(entry);
    rawByFilePath.set(resolved, prev);
  }

  async function visitItems(parent: NavTreeNode, items: any[], pathAcc: { nodes: NavTreeNode[] }) {
    for (const item of items ?? []) {
      if (typeof item === 'string') {
        await addLeafPage(parent, item, undefined, pathAcc);
        continue;
      }

      if (!item || typeof item !== 'object') continue;

      // Group container: { group: "Name", pages: [...] } or { title: "Name", pages: [...] }
      if (Array.isArray(item.pages)) {
        const groupLabel = extractLabelFromNavObject(item) || 'Group';
        const groupNode: NavTreeNode = {
          id: mkId(parent.id, 'group', groupLabel),
          kind: 'group',
          label: groupLabel,
          children: []
        };
        parent.children.push(groupNode);
        await visitItems(groupNode, item.pages, { nodes: [...pathAcc.nodes, groupNode] });
        continue;
      }

      // Leaf page object: { title/label, href/route/path/page }
      const route = extractRouteFromNavObject(item);
      if (route) {
        const leafLabel = extractLabelFromNavObject(item);
        await addLeafPage(parent, route, leafLabel, pathAcc);
        continue;
      }

      // Unknown shape; ignore.
    }
  }

  for (const t of asArray(en?.tabs)) {
    const tabLabel = typeof t?.tab === 'string' ? t.tab : extractLabelFromNavObject(t) || 'Tab';
    const tabNode: NavTreeNode = {
      id: mkId(root.id, 'tab', tabLabel),
      kind: 'tab',
      label: tabLabel,
      children: []
    };
    root.children.push(tabNode);

    if (Array.isArray(t?.pages)) {
      await visitItems(tabNode, t.pages, { nodes: [tabNode] });
    }

    for (const dd of asArray(t?.dropdowns)) {
      const ddLabel = typeof dd?.dropdown === 'string' ? dd.dropdown : extractLabelFromNavObject(dd) || 'Dropdown';
      const ddNode: NavTreeNode = {
        id: mkId(tabNode.id, 'dropdown', ddLabel),
        kind: 'dropdown',
        label: ddLabel,
        children: []
      };
      tabNode.children.push(ddNode);

      await visitItems(ddNode, dd?.pages, { nodes: [tabNode, ddNode] });
    }
  }

  const navTree: NavTree = {
    generatedAtUtc: new Date().toISOString(),
    language,
    root
  };

  return { navTree, rawByFilePath };
}
