import fs from 'node:fs/promises';
import path from 'node:path';
function safeSlug(s) {
    return (s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-_.:/]/g, '')
        .slice(0, 60);
}
async function resolveNavPageToFilePath(p, repoRoot) {
    // Normalize to "docs/..." (relative to /main)
    let rel = p;
    if (rel.startsWith('/'))
        rel = rel.slice(1);
    if (!rel.startsWith('docs/'))
        rel = `docs/${rel}`;
    const candidates = [`main/${rel}.mdx`, `main/${rel}/index.mdx`, `main/${rel}.md`, `main/${rel}/index.md`];
    for (const c of candidates) {
        try {
            const st = await fs.stat(path.join(repoRoot, c));
            if (st.isFile())
                return c;
        }
        catch {
            // ignore
        }
    }
    return null;
}
function extractLabelFromNavObject(item) {
    const v = item?.title ?? item?.label ?? item?.name ?? item?.group ?? item?.dropdown ?? item?.tab;
    return typeof v === 'string' ? v : undefined;
}
function extractRouteFromNavObject(item) {
    const v = item?.href ?? item?.route ?? item?.path ?? item?.page;
    return typeof v === 'string' ? v : undefined;
}
function asArray(x) {
    return Array.isArray(x) ? x : [];
}
export async function parseDocsJsonNav(docsJson, repoRoot) {
    const langs = docsJson?.navigation?.languages ?? [];
    const en = langs.find((l) => l?.language === 'en') ?? langs[0] ?? { language: 'en', tabs: [] };
    const language = typeof en?.language === 'string' ? en.language : 'en';
    const root = {
        id: 'root',
        kind: 'root',
        label: 'root',
        children: []
    };
    const rawByFilePath = new Map();
    function mkId(parentId, kind, label) {
        return `${parentId}/${kind}:${safeSlug(label) || 'unnamed'}`;
    }
    async function addLeafPage(parent, routeLike, leafLabel, pathAcc) {
        const resolved = await resolveNavPageToFilePath(routeLike, repoRoot);
        if (!resolved)
            return;
        const label = leafLabel || routeLike;
        const node = {
            id: mkId(parent.id, 'page', `${label}:${routeLike}`),
            kind: 'page',
            label,
            route: routeLike,
            filePath: resolved,
            children: []
        };
        parent.children.push(node);
        const nodesPath = [...(pathAcc?.nodes ?? []), node];
        const entry = {
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
    async function visitItems(parent, items, pathAcc) {
        for (const item of items ?? []) {
            if (typeof item === 'string') {
                await addLeafPage(parent, item, undefined, pathAcc);
                continue;
            }
            if (!item || typeof item !== 'object')
                continue;
            // Group container: { group: "Name", pages: [...] } or { title: "Name", pages: [...] }
            if (Array.isArray(item.pages)) {
                const groupLabel = extractLabelFromNavObject(item) || 'Group';
                const groupNode = {
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
        const tabNode = {
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
            const ddNode = {
                id: mkId(tabNode.id, 'dropdown', ddLabel),
                kind: 'dropdown',
                label: ddLabel,
                children: []
            };
            tabNode.children.push(ddNode);
            await visitItems(ddNode, dd?.pages, { nodes: [tabNode, ddNode] });
        }
    }
    const navTree = {
        generatedAtUtc: new Date().toISOString(),
        language,
        root
    };
    return { navTree, rawByFilePath };
}
