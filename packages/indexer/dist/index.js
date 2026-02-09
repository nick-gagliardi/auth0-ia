import fs from 'node:fs/promises';
import path from 'node:path';
import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';
import yaml from 'js-yaml';
const exec = promisify(_exec);
function uniq(arr) {
    return [...new Set(arr)];
}
async function ensureClone(repoUrl, ref, workdir) {
    const gitDir = path.join(workdir, '.git');
    try {
        await fs.stat(gitDir);
        await exec(`git -C ${workdir} fetch --all --prune`);
    }
    catch {
        await fs.mkdir(path.dirname(workdir), { recursive: true });
        await exec(`git clone --depth 1 --branch ${ref} ${repoUrl} ${workdir}`);
        return;
    }
    await exec(`git -C ${workdir} checkout ${ref}`);
    await exec(`git -C ${workdir} reset --hard origin/${ref}`);
}
function parseFrontmatter(mdx) {
    // very small frontmatter parser: expects leading --- block
    if (!mdx.startsWith('---'))
        return {};
    const end = mdx.indexOf('\n---', 3);
    if (end === -1)
        return {};
    const raw = mdx.slice(3, end);
    try {
        const data = yaml.load(raw);
        return {
            title: typeof data?.title === 'string' ? data.title : undefined,
            permalink: typeof data?.permalink === 'string' ? data.permalink : undefined
        };
    }
    catch {
        return {};
    }
}
function extractImports(mdx) {
    const out = [];
    // match: from '/snippets/...'
    const re = /from\s+['\"](\/snippets\/[^'\"]+)['\"]/g;
    let m;
    while ((m = re.exec(mdx)))
        out.push(m[1]);
    return out;
}
function extractLinks(mdx) {
    const out = [];
    // Markdown links: ](/docs/...) or ](../something)
    const re = /\]\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(mdx))) {
        const href = m[1].split('#')[0].trim();
        if (!href)
            continue;
        if (href.startsWith('/docs/'))
            out.push(href);
    }
    return out;
}
function normalizeDocsPathFromHref(href) {
    // /docs/foo/bar -> main/docs/foo/bar.mdx (best-effort)
    const p = href.replace(/^\/docs\//, '');
    if (!p)
        return null;
    return `main/docs/${p}.mdx`;
}
async function listFiles(root, exts) {
    const out = [];
    const stack = [root];
    while (stack.length) {
        const dir = stack.pop();
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory())
                stack.push(full);
            else if (e.isFile()) {
                const ext = path.extname(e.name);
                if (exts.has(ext))
                    out.push(full);
            }
        }
    }
    return out;
}
async function navPathsFromDocsJson(docsJson, repoRoot) {
    // docs.json contains navigation.languages[].tabs[].dropdowns[].pages (strings like "docs/get-started")
    const map = new Map();
    const langs = docsJson?.navigation?.languages ?? [];
    const en = langs.find((l) => l?.language === 'en') ?? langs[0];
    const tabs = en?.tabs ?? [];
    async function resolveNavPageToFilePath(p) {
        // Normalize to "docs/..." (relative to /main)
        let rel = p;
        if (rel.startsWith('/'))
            rel = rel.slice(1);
        if (!rel.startsWith('docs/'))
            rel = `docs/${rel}`;
        const candidates = [
            `main/${rel}.mdx`,
            `main/${rel}/index.mdx`,
            `main/${rel}.md`,
            `main/${rel}/index.md`
        ];
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
    async function visitNavItems(items, prefix, depth) {
        for (const item of items ?? []) {
            if (typeof item === 'string') {
                const filePath = await resolveNavPageToFilePath(item);
                if (!filePath)
                    continue;
                const navPathStr = prefix.join(' > ');
                const prev = map.get(filePath);
                if (!prev)
                    map.set(filePath, { navPaths: [navPathStr], navDepth: depth });
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
            await visitNavItems(t.pages, [tabName].filter(Boolean), 1);
        }
        for (const dd of t?.dropdowns ?? []) {
            const ddName = dd?.dropdown;
            const prefix = [tabName, ddName].filter(Boolean);
            await visitNavItems(dd?.pages, prefix, prefix.length);
        }
    }
    // uniq navPaths
    for (const v of map.values())
        v.navPaths = uniq(v.navPaths);
    return map;
}
export async function buildIndex(opts) {
    await ensureClone(opts.repoUrl, opts.ref, opts.workdir);
    const repoRoot = opts.workdir;
    const siteRoot = path.join(repoRoot, 'main'); // docs-v2 has /main (site)
    const docsJsonPath = path.join(siteRoot, 'docs.json');
    const docsJson = JSON.parse(await fs.readFile(docsJsonPath, 'utf8'));
    const navMap = await navPathsFromDocsJson(docsJson, repoRoot);
    const docsRoot = path.join(siteRoot, 'docs');
    const snippetsRoot = path.join(siteRoot, 'snippets');
    const mdxFiles = (await listFiles(docsRoot, new Set(['.mdx']))).filter((p) => !p.includes(`${path.sep}fr-ca${path.sep}`) && !p.includes(`${path.sep}ja-jp${path.sep}`));
    const snippetFiles = await listFiles(snippetsRoot, new Set(['.mdx', '.jsx', '.js', '.ts', '.tsx']));
    const nodes = [];
    const outbound = {};
    const inbound = {};
    function ensureEdge(id) {
        outbound[id] ??= { link: [], import: [], redirect: [] };
        inbound[id] ??= { link: [], import: [], redirect: [] };
    }
    function addEdge(kind, from, to) {
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
            if (!toFile)
                continue;
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
    const metrics = {};
    const nodeSet = new Set(nodes.map((n) => n.id));
    for (const n of nodes) {
        const id = n.id;
        const inboundLinks = (inbound[id]?.link?.length ?? 0);
        const outboundLinks = (outbound[id]?.link?.length ?? 0);
        const importedBy = (inbound[id]?.import?.length ?? 0);
        const nav = navMap.get(id);
        const orphanNav = n.type === 'page' ? (n.navPaths.length === 0) : false;
        const orphanLinks = n.type === 'page' ? inboundLinks === 0 : false;
        metrics[id] = {
            inboundLinks,
            outboundLinks,
            importedBy,
            navDepth: nav?.navDepth,
            orphanNav,
            orphanLinks,
            hubScore: inboundLinks
        };
    }
    // ensure outDir
    await fs.mkdir(opts.outDir, { recursive: true });
    await fs.writeFile(path.join(opts.outDir, 'nodes.json'), JSON.stringify(nodes, null, 2));
    await fs.writeFile(path.join(opts.outDir, 'edges_outbound.json'), JSON.stringify(outbound, null, 2));
    await fs.writeFile(path.join(opts.outDir, 'edges_inbound.json'), JSON.stringify(inbound, null, 2));
    await fs.writeFile(path.join(opts.outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
    // small summary
    await fs.writeFile(path.join(opts.outDir, 'summary.json'), JSON.stringify({
        generatedAtUtc: new Date().toISOString(),
        nodes: nodes.length,
        pages: nodes.filter((n) => n.type === 'page').length,
        snippets: nodes.filter((n) => n.type === 'snippet').length
    }, null, 2));
    // quick sanity: warn about link targets that don't exist
    const missingTargets = new Set();
    for (const [from, e] of Object.entries(outbound)) {
        for (const to of e.link)
            if (!nodeSet.has(to))
                missingTargets.add(to);
    }
    await fs.writeFile(path.join(opts.outDir, 'missing_link_targets.json'), JSON.stringify([...missingTargets].sort(), null, 2));
}
