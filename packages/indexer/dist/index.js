import fs from 'node:fs/promises';
import path from 'node:path';
import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';
import yaml from 'js-yaml';
import { buildSnippetMigrationIndex } from './snippet-migration.js';
import { lintAuth0MdxPages } from './auth0-lint.js';
import { parseDocsJsonNav } from './nav.js';
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
function normalizeHref(href) {
    // store as a stable, comparable string
    return href.split('#')[0].trim();
}
function normalizeDocsPathCandidatesFromHref(href) {
    // /docs/foo/bar -> try:
    // - main/docs/foo/bar.mdx
    // - main/docs/foo/bar/index.mdx
    // (plus md variants)
    const p = href.replace(/^\/docs\//, '');
    if (!p)
        return [];
    const base = `main/docs/${p}`;
    return [`${base}.mdx`, `${base}/index.mdx`, `${base}.md`, `${base}/index.md`];
}
async function resolveDocsHrefToFile(href, repoRoot) {
    for (const c of normalizeDocsPathCandidatesFromHref(href)) {
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
function extractRedirectsFromDocsJson(docsJson) {
    const raw = docsJson?.redirects ?? docsJson?.navigation?.redirects ?? [];
    const out = [];
    if (!Array.isArray(raw))
        return out;
    for (const r of raw) {
        if (!r)
            continue;
        const source = (r.source ?? r.from ?? r.src);
        const destination = (r.destination ?? r.to ?? r.dest);
        if (typeof source !== 'string' || typeof destination !== 'string')
            continue;
        out.push({ source, destination });
    }
    return out;
}
function resolveRouteLike(x) {
    // Normalize to /docs/... routes where possible.
    if (!x)
        return x;
    if (x.startsWith('http://') || x.startsWith('https://'))
        return x;
    if (!x.startsWith('/'))
        x = `/${x}`;
    // docs.json sometimes uses /docs/foo, docs/foo, or /foo (rare). Keep as-is.
    return x;
}
async function routeToFilePath(route, repoRoot) {
    const r = resolveRouteLike(route);
    if (r.startsWith('/docs/'))
        return resolveDocsHrefToFile(r, repoRoot);
    if (r.startsWith('/docs'))
        return resolveDocsHrefToFile(r.replace(/^\/docs$/, '/docs/'), repoRoot);
    if (r.startsWith('/')) {
        // best-effort: if someone stored "docs/foo" without leading /docs
        if (r.startsWith('/docs/'))
            return resolveDocsHrefToFile(r, repoRoot);
    }
    return null;
}
function buildRedirectWarnings(redirects) {
    // Chains/loops are computed purely over route strings.
    const next = new Map();
    for (const r of redirects)
        next.set(resolveRouteLike(r.source), resolveRouteLike(r.destination));
    const chains = [];
    const loops = [];
    for (const r of redirects) {
        const start = resolveRouteLike(r.source);
        const seen = new Set();
        const chain = [start];
        let cur = start;
        while (true) {
            const n = next.get(cur);
            if (!n)
                break;
            const nn = resolveRouteLike(n);
            chain.push(nn);
            if (seen.has(nn)) {
                loops.push({ source: start, chain });
                break;
            }
            seen.add(nn);
            cur = nn;
            if (chain.length > 25)
                break;
        }
        if (chain.length >= 3 && !loops.find((x) => x.source === start)) {
            chains.push({ source: start, chain });
        }
    }
    // Placeholders; these require file existence checks later.
    return { missingDestination: [], missingSource: [], loops, chains };
}
export async function buildIndex(opts) {
    await ensureClone(opts.repoUrl, opts.ref, opts.workdir);
    const repoRoot = opts.workdir;
    const siteRoot = path.join(repoRoot, 'main'); // docs-v2 has /main (site)
    const docsJsonPath = path.join(siteRoot, 'docs.json');
    const docsJson = JSON.parse(await fs.readFile(docsJsonPath, 'utf8'));
    const { navTree, rawByFilePath: rawNavByFilePath } = await parseDocsJsonNav(docsJson, repoRoot);
    const redirects = extractRedirectsFromDocsJson(docsJson);
    const pageNavMeta = {};
    const docsRoot = path.join(siteRoot, 'docs');
    const snippetsRoot = path.join(siteRoot, 'snippets');
    const mdxFiles = (await listFiles(docsRoot, new Set(['.mdx']))).filter((p) => !p.includes(`${path.sep}fr-ca${path.sep}`) && !p.includes(`${path.sep}ja-jp${path.sep}`));
    const snippetFiles = await listFiles(snippetsRoot, new Set(['.mdx', '.jsx', '.js', '.ts', '.tsx']));
    const nodes = [];
    const outbound = {};
    const inbound = {};
    const linkHrefsOut = {};
    const pagesForLint = [];
    function ensureEdge(id) {
        outbound[id] ??= { link: [], import: [], redirect: [] };
        inbound[id] ??= { link: [], import: [], redirect: [] };
        linkHrefsOut[id] ??= [];
    }
    function addEdge(kind, from, to) {
        ensureEdge(from);
        ensureEdge(to);
        outbound[from][kind].push(to);
        inbound[to][kind].push(from);
    }
    function fallbackLeafLabelFromFilePath(filePath) {
        const base = path.basename(filePath).replace(/\.(mdx|md)$/i, '');
        return base.replace(/[-_]/g, ' ').trim() || base;
    }
    function containerDepthFromEntry(e) {
        // kinds includes tab/dropdown/group/page; depth excludes the leaf page.
        return Math.max(0, e.kinds.length - 1);
    }
    // pages
    for (const full of mdxFiles) {
        const rel = path.relative(repoRoot, full).replaceAll('\\', '/');
        const mdx = await fs.readFile(full, 'utf8');
        const fm = parseFrontmatter(mdx);
        const rawEntries = rawNavByFilePath.get(rel) ?? [];
        const navNodePaths = rawEntries.map((e) => {
            const leafLabel = e.leafLabelFromNav || fm.title || fallbackLeafLabelFromFilePath(rel);
            const leafLabelSource = e.leafLabelFromNav ? 'nav' : fm.title ? 'frontmatter' : 'fallback';
            const containerLabels = e.labels.slice(0, -1);
            const containerString = containerLabels.join(' > ');
            const labels = [...containerLabels, leafLabel];
            return {
                route: e.route,
                nodeIds: e.nodeIds,
                labels,
                kinds: e.kinds,
                leafLabel,
                leafLabelSource,
                containerString,
                pathString: labels.join(' > ')
            };
        });
        const navPaths = uniq(navNodePaths.map((p) => p.pathString));
        const navDepth = rawEntries.length ? Math.min(...rawEntries.map(containerDepthFromEntry)) : undefined;
        const primaryLabel = navNodePaths[0]?.leafLabel;
        const primaryLabelSource = navNodePaths[0]?.leafLabelSource;
        pageNavMeta[rel] = {
            filePath: rel,
            navDepth,
            navNodePaths,
            navLabel: primaryLabel,
            navLabelSource: primaryLabelSource
        };
        const id = rel;
        pagesForLint.push({ id, filePath: rel, mdx });
        nodes.push({
            id,
            type: 'page',
            filePath: rel,
            title: fm.title,
            permalink: fm.permalink,
            navPaths
        });
        ensureEdge(id);
        // links
        for (const hrefRaw of extractLinks(mdx)) {
            const href = normalizeHref(hrefRaw);
            const toFile = await resolveDocsHrefToFile(href, repoRoot);
            if (!toFile)
                continue;
            addEdge('link', id, toFile);
            linkHrefsOut[id].push({ href, toId: toFile });
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
        }
        catch {
            // ignore
        }
    }
    // redirects (docs.json)
    for (const r of redirects) {
        const srcFile = await routeToFilePath(r.source, repoRoot);
        const dstFile = await routeToFilePath(r.destination, repoRoot);
        if (!srcFile || !dstFile)
            continue;
        addEdge('redirect', srcFile, dstFile);
    }
    // de-dupe edges
    for (const id of Object.keys(outbound)) {
        outbound[id].link = uniq(outbound[id].link);
        outbound[id].import = uniq(outbound[id].import);
        outbound[id].redirect = uniq(outbound[id].redirect);
        // de-dupe href list
        const seen = new Set();
        linkHrefsOut[id] = (linkHrefsOut[id] || []).filter((x) => {
            const k = `${x.href}||${x.toId}`;
            if (seen.has(k))
                return false;
            seen.add(k);
            return true;
        });
    }
    for (const id of Object.keys(inbound)) {
        inbound[id].link = uniq(inbound[id].link);
        inbound[id].import = uniq(inbound[id].import);
        inbound[id].redirect = uniq(inbound[id].redirect);
    }
    // metrics
    const metrics = {};
    const nodeSet = new Set(nodes.map((n) => n.id));
    const nodeTypeById = new Map(nodes.map((n) => [n.id, n.type]));
    // For snippets: compute transitive impact (unique pages reached via reverse import graph)
    function computeSnippetImpactPages(snippetId) {
        const seen = new Set();
        const queue = [snippetId];
        const impactedPages = new Set();
        while (queue.length) {
            const cur = queue.shift();
            if (seen.has(cur))
                continue;
            seen.add(cur);
            const importers = inbound[cur]?.import ?? [];
            for (const from of importers) {
                const t = nodeTypeById.get(from);
                if (t === 'page')
                    impactedPages.add(from);
                if (t === 'snippet')
                    queue.push(from);
            }
        }
        return impactedPages.size;
    }
    for (const n of nodes) {
        const id = n.id;
        const inboundLinks = (inbound[id]?.link?.length ?? 0);
        const outboundLinks = (outbound[id]?.link?.length ?? 0);
        const importedBy = (inbound[id]?.import?.length ?? 0);
        const orphanNav = n.type === 'page' ? n.navPaths.length === 0 : false;
        const orphanLinks = n.type === 'page' ? inboundLinks === 0 : false;
        const orphanTrue = n.type === 'page' ? orphanNav && orphanLinks : false;
        const orphanReference = n.type === 'page' ? !orphanNav && orphanLinks : false;
        const navDepth = n.type === 'page' ? pageNavMeta[id]?.navDepth : undefined;
        const deepNav = n.type === 'page' && typeof navDepth === 'number' ? navDepth >= 5 : false;
        const deadEndScore = n.type === 'page' ? inboundLinks / Math.max(1, outboundLinks) : 0;
        const deadEnd = n.type === 'page' ? inboundLinks >= 20 && outboundLinks <= 1 : false;
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
            hubScore: inboundLinks,
            deadEnd,
            deadEndScore: n.type === 'page' ? Number(deadEndScore.toFixed(4)) : undefined
        };
    }
    // redirect hygiene (routes)
    const redirectWarnings = buildRedirectWarnings(redirects);
    const missingDestination = [];
    const missingSource = [];
    for (const r of redirects) {
        const srcFile = await routeToFilePath(r.source, repoRoot);
        const dstFile = await routeToFilePath(r.destination, repoRoot);
        if (!srcFile)
            missingSource.push({ source: resolveRouteLike(r.source), destination: resolveRouteLike(r.destination) });
        if (!dstFile)
            missingDestination.push({ source: resolveRouteLike(r.source), destination: resolveRouteLike(r.destination) });
    }
    const redirectIndex = {
        redirects: redirects.map((r) => ({ source: resolveRouteLike(r.source), destination: resolveRouteLike(r.destination) })),
        warnings: {
            ...redirectWarnings,
            missingDestination,
            missingSource
        }
    };
    // ensure outDir
    await fs.mkdir(opts.outDir, { recursive: true });
    await fs.writeFile(path.join(opts.outDir, 'nodes.json'), JSON.stringify(nodes, null, 2));
    await fs.writeFile(path.join(opts.outDir, 'edges_outbound.json'), JSON.stringify(outbound, null, 2));
    await fs.writeFile(path.join(opts.outDir, 'edges_inbound.json'), JSON.stringify(inbound, null, 2));
    await fs.writeFile(path.join(opts.outDir, 'link_hrefs_outbound.json'), JSON.stringify(linkHrefsOut, null, 2));
    await fs.writeFile(path.join(opts.outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
    await fs.writeFile(path.join(opts.outDir, 'redirects.json'), JSON.stringify(redirectIndex, null, 2));
    // --- Nav Label Intelligence ---
    const labelToPages = new Map();
    for (const n of nodes) {
        if (n.type !== 'page')
            continue;
        const meta = pageNavMeta[n.id];
        const label = meta?.navLabel;
        if (!label)
            continue;
        const arr = labelToPages.get(label) ?? [];
        arr.push({ id: n.id, filePath: n.filePath, title: n.title, navPath: meta?.navNodePaths?.[0]?.pathString });
        labelToPages.set(label, arr);
    }
    const collisions = {
        generatedAtUtc: new Date().toISOString(),
        collisions: [...labelToPages.entries()]
            .filter(([, pages]) => pages.length > 1)
            .map(([label, pages]) => ({ label, count: pages.length, pages }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    };
    await fs.writeFile(path.join(opts.outDir, 'nav_tree.json'), JSON.stringify(navTree, null, 2));
    await fs.writeFile(path.join(opts.outDir, 'nav_pages.json'), JSON.stringify(pageNavMeta, null, 2));
    await fs.writeFile(path.join(opts.outDir, 'nav_label_collisions.json'), JSON.stringify(collisions, null, 2));
    const auth0Lint = lintAuth0MdxPages(pagesForLint);
    await fs.writeFile(path.join(opts.outDir, 'auth0_lint.json'), JSON.stringify(auth0Lint, null, 2));
    // --- Snippet migration inventory (fenced blocks) ---
    const snippetMigration = await buildSnippetMigrationIndex(pagesForLint.map((p) => ({ filePath: p.filePath, mdx: p.mdx })));
    await fs.writeFile(path.join(opts.outDir, 'snippet_migration.json'), JSON.stringify(snippetMigration, null, 2));
    // --- Path Convergence (links-only) similarity index (pages ↔ pages) ---
    // Goals:
    // - use outbound/inbound *link* neighbors (no snippet imports)
    // - exclude global hubs (nodes with inboundLinks > 50)
    // - only consider pairs with intersection >= 3
    const pages = nodes.filter((n) => n.type === 'page');
    const pageIds = pages.map((p) => p.id);
    const pageSet = new Set(pageIds);
    const hubCutoff = 50;
    const hubBlacklist = new Set(pageIds.filter((id) => (metrics[id]?.inboundLinks ?? 0) > hubCutoff));
    function filteredOut(id) {
        const s = new Set();
        for (const to of outbound[id]?.link ?? []) {
            if (!pageSet.has(to))
                continue;
            if (hubBlacklist.has(to))
                continue;
            s.add(to);
        }
        return s;
    }
    function filteredIn(id) {
        const s = new Set();
        for (const from of inbound[id]?.link ?? []) {
            if (!pageSet.has(from))
                continue;
            if (hubBlacklist.has(from))
                continue;
            s.add(from);
        }
        return s;
    }
    const outSets = new Map();
    const inSets = new Map();
    for (const id of pageIds) {
        outSets.set(id, filteredOut(id));
        inSets.set(id, filteredIn(id));
    }
    const invOut = new Map();
    const invIn = new Map();
    for (const id of pageIds) {
        for (const nb of outSets.get(id)) {
            const arr = invOut.get(nb) ?? [];
            arr.push(id);
            invOut.set(nb, arr);
        }
        for (const nb of inSets.get(id)) {
            const arr = invIn.get(nb) ?? [];
            arr.push(id);
            invIn.set(nb, arr);
        }
    }
    const sharedOut = new Map();
    const sharedIn = new Map();
    function pairKey(a, b) {
        return a < b ? `${a}||${b}` : `${b}||${a}`;
    }
    function bump(map, a, b) {
        if (a === b)
            return;
        const k = pairKey(a, b);
        map.set(k, (map.get(k) ?? 0) + 1);
    }
    function accumulate(inv, map) {
        for (const [, pagesList] of inv) {
            if (pagesList.length < 2)
                continue;
            // avoid O(n^2) blowups on rare large lists (hubs are filtered, but be safe)
            if (pagesList.length > 400)
                continue;
            for (let i = 0; i < pagesList.length; i++) {
                for (let j = i + 1; j < pagesList.length; j++)
                    bump(map, pagesList[i], pagesList[j]);
            }
        }
    }
    accumulate(invOut, sharedOut);
    accumulate(invIn, sharedIn);
    function jaccard(a, b) {
        if (a.size === 0 && b.size === 0)
            return 0;
        let inter = 0;
        const [small, big] = a.size < b.size ? [a, b] : [b, a];
        for (const x of small)
            if (big.has(x))
                inter++;
        const union = a.size + b.size - inter;
        return union === 0 ? 0 : inter / union;
    }
    function navRoot(navPaths) {
        const p = navPaths?.[0];
        if (!p)
            return null;
        const parts = p.split(' > ').map((x) => x.trim()).filter(Boolean);
        if (parts[0] === 'Documentation' && parts.length >= 2)
            return parts[1];
        return parts.length ? parts[0] : null;
    }
    function topFolder(filePath) {
        const parts = filePath.split('/');
        const idx = parts.indexOf('docs');
        if (idx >= 0 && parts.length > idx + 1)
            return parts[idx + 1];
        return null;
    }
    const similarity = {};
    const crossNavPairs = [];
    const allPairKeys = new Set([...sharedOut.keys(), ...sharedIn.keys()]);
    for (const k of allPairKeys) {
        const [a, b] = k.split('||');
        const so = sharedOut.get(k) ?? 0;
        const si = sharedIn.get(k) ?? 0;
        if (so < 3 && si < 3)
            continue;
        const simOut = jaccard(outSets.get(a), outSets.get(b));
        const simIn = jaccard(inSets.get(a), inSets.get(b));
        const score = 0.6 * simOut + 0.4 * simIn;
        const aNode = pages.find((p) => p.id === a);
        const bNode = pages.find((p) => p.id === b);
        const aRoot = navRoot(aNode.navPaths);
        const bRoot = navRoot(bNode.navPaths);
        const isCrossNav = aRoot && bRoot ? aRoot !== bRoot : null;
        const aFolder = topFolder(aNode.filePath);
        const bFolder = topFolder(bNode.filePath);
        const diffFolder = aFolder && bFolder ? aFolder !== bFolder : null;
        const highValueConvergence = score > 0.4 && isCrossNav === true;
        const reasons = [];
        if (so >= 3)
            reasons.push('shared_outbound');
        if (si >= 3)
            reasons.push('shared_inbound');
        const itemForA = {
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
        const itemForB = { ...itemForA, id: a };
        similarity[a] ??= [];
        similarity[b] ??= [];
        similarity[a].push(itemForA);
        similarity[b].push(itemForB);
        if (highValueConvergence) {
            const convergenceType = simOut > simIn + 0.1 ? 'journey' : simIn > simOut + 0.1 ? 'context' : 'mixed';
            crossNavPairs.push({
                a,
                b,
                score: Number(score.toFixed(4)),
                simOut: Number(simOut.toFixed(4)),
                simIn: Number(simIn.toFixed(4)),
                sharedOut: so,
                sharedIn: si,
                convergenceType,
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
    const crossNavPairsIndex = {
        generatedAtUtc: new Date().toISOString(),
        hubCutoff,
        minIntersection: 3,
        scoreThreshold: 0.4,
        pairs: crossNavPairs.slice(0, 500)
    };
    await fs.writeFile(path.join(opts.outDir, 'similarity.json'), JSON.stringify(similarity, null, 2));
    await fs.writeFile(path.join(opts.outDir, 'cross_nav_pairs.json'), JSON.stringify(crossNavPairsIndex, null, 2));
    // --- Shadow Hub detection ---
    // A "shadow hub" is a low-discoverability page that closely mimics a high-authority hub.
    // Criteria:
    // - low discoverability: orphanTrue OR orphanReference OR deepNav
    // - high mimicry: similarity score > 0.70 to a hub (hub = inboundLinks > hubCutoff)
    // - low authority: shadow inbound links significantly lower than hub inbound links
    const shadowThreshold = 0.70;
    const minAuthorityDelta = 15; // hub has at least this many more inbound links
    const shadowHubs = [];
    for (const p of pageIds) {
        const m = metrics[p];
        const lowDisc = !!(m?.orphanTrue || m?.orphanReference || m?.deepNav);
        if (!lowDisc)
            continue;
        for (const rel of similarity[p] ?? []) {
            const hubId = rel.id;
            if (!hubBlacklist.has(hubId))
                continue;
            if (rel.score < shadowThreshold)
                continue;
            const hubInbound = metrics[hubId]?.inboundLinks ?? 0;
            const shadowInbound = m?.inboundLinks ?? 0;
            if (hubInbound - shadowInbound < minAuthorityDelta)
                continue;
            shadowHubs.push({
                shadowId: p,
                hubId,
                score: rel.score,
                simOut: rel.simOut,
                simIn: rel.simIn,
                sharedOut: rel.sharedOut,
                sharedIn: rel.sharedIn,
                shadowInbound,
                hubInbound,
                shadowNavDepth: m?.navDepth,
                shadowOrphanTrue: m?.orphanTrue,
                shadowOrphanReference: m?.orphanReference,
                shadowDeepNav: m?.deepNav
            });
        }
    }
    shadowHubs.sort((a, b) => b.score - a.score || (b.hubInbound - b.shadowInbound) - (a.hubInbound - a.shadowInbound));
    const shadowHubsIndex = {
        generatedAtUtc: new Date().toISOString(),
        hubCutoff,
        shadowThreshold,
        minAuthorityDelta,
        count: shadowHubs.length,
        items: shadowHubs.slice(0, 500)
    };
    await fs.writeFile(path.join(opts.outDir, 'shadow_hubs.json'), JSON.stringify(shadowHubsIndex, null, 2));
    // --- Dead-end detection ---
    // A "dead end" is a page with high inbound links but very low outbound links.
    // These pages often attract traffic but fail to route users onward.
    const deadEndMinInbound = 20;
    const deadEndMaxOutbound = 1;
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const deadEnds = pageIds
        .map((id) => {
        const m = metrics[id];
        const inboundLinks = m?.inboundLinks ?? 0;
        const outboundLinks = m?.outboundLinks ?? 0;
        const deadEndScore = inboundLinks / Math.max(1, outboundLinks);
        const n = nodeById.get(id);
        return {
            id,
            inboundLinks,
            outboundLinks,
            deadEndScore: Number(deadEndScore.toFixed(4)),
            navRoot: n ? navRoot(n.navPaths) : null,
            navDepth: m?.navDepth,
        };
    })
        .filter((x) => x.inboundLinks >= deadEndMinInbound && x.outboundLinks <= deadEndMaxOutbound)
        .sort((a, b) => b.deadEndScore - a.deadEndScore || b.inboundLinks - a.inboundLinks);
    const deadEndsIndex = {
        generatedAtUtc: new Date().toISOString(),
        minInbound: deadEndMinInbound,
        maxOutbound: deadEndMaxOutbound,
        count: deadEnds.length,
        items: deadEnds.slice(0, 500),
    };
    await fs.writeFile(path.join(opts.outDir, 'dead_ends.json'), JSON.stringify(deadEndsIndex, null, 2));
    // --- Journey Maps ---
    // Heuristic: infer likely "reader journeys" by walking the link graph from strong starting pages.
    // This is *not* clickstream data; it is a structure-derived approximation.
    const journeyMaxLen = 5;
    const journeyMinLen = 3;
    const startsPerRoot = 25;
    const branching = 4;
    const topPerRoot = 40;
    const pageOutbound = new Map();
    for (const id of pageIds) {
        const outs = (outbound[id]?.link ?? []).filter((to) => pageSet.has(to));
        pageOutbound.set(id, outs);
    }
    function nodeRoot(id) {
        const n = nodeById.get(id);
        return n ? navRoot(n.navPaths) : null;
    }
    function candidateWeight(root, to) {
        const m = metrics[to];
        const inbound = m?.inboundLinks ?? 0;
        const out = m?.outboundLinks ?? 0;
        const base = Math.log1p(inbound) * 5 + Math.log1p(out) * 1;
        const sameRootBoost = root && nodeRoot(to) === root ? 5 : 0;
        return base + sameRootBoost;
    }
    const globalAgg = new Map();
    const byRootAgg = new Map();
    function recordPath(root, path, score) {
        const key = path.join('||');
        const g = globalAgg.get(key) ?? { path, scoreSum: 0, support: 0, navRoot: root };
        g.scoreSum += score;
        g.support += 1;
        globalAgg.set(key, g);
        const rKey = root || 'Unknown';
        const rm = byRootAgg.get(rKey) ?? new Map();
        const ri = rm.get(key) ?? { path, scoreSum: 0, support: 0, navRoot: root };
        ri.scoreSum += score;
        ri.support += 1;
        rm.set(key, ri);
        byRootAgg.set(rKey, rm);
    }
    function walkFromStart(startId, root) {
        const startWeight = Math.log1p(metrics[startId]?.inboundLinks ?? 0) * 2;
        function dfs(path, score) {
            if (path.length >= journeyMinLen)
                recordPath(root, path, score);
            if (path.length >= journeyMaxLen)
                return;
            const cur = path[path.length - 1];
            const outs = pageOutbound.get(cur) ?? [];
            if (!outs.length)
                return;
            const ranked = [...outs]
                .filter((to) => !path.includes(to))
                .map((to) => ({ to, w: candidateWeight(root, to) }))
                .sort((a, b) => b.w - a.w)
                .slice(0, branching);
            for (const c of ranked)
                dfs([...path, c.to], score + c.w);
        }
        dfs([startId], startWeight);
    }
    // starts per nav root: top inbound pages, plus a small pool of global hubs.
    const roots = new Map();
    for (const id of pageIds) {
        const r = nodeRoot(id) || 'Unknown';
        const arr = roots.get(r) ?? [];
        arr.push(id);
        roots.set(r, arr);
    }
    const globalHubStarts = [...pageIds]
        .sort((a, b) => (metrics[b]?.inboundLinks ?? 0) - (metrics[a]?.inboundLinks ?? 0))
        .slice(0, 50);
    for (const [rKey, ids] of roots) {
        const rootStarts = [...ids]
            .sort((a, b) => (metrics[b]?.inboundLinks ?? 0) - (metrics[a]?.inboundLinks ?? 0))
            .slice(0, startsPerRoot);
        const merged = [...new Set([...rootStarts, ...globalHubStarts.slice(0, 10)])];
        const root = rKey === 'Unknown' ? null : rKey;
        for (const sId of merged)
            walkFromStart(sId, root);
    }
    function finalizeAgg(map) {
        const arr = [...map.values()].map((x) => ({
            path: x.path,
            score: Number((x.scoreSum / Math.max(1, x.support)).toFixed(4)),
            support: x.support,
            navRoot: x.navRoot,
        }));
        arr.sort((a, b) => b.support - a.support || b.score - a.score);
        return arr;
    }
    const journeyMapsIndex = {
        generatedAtUtc: new Date().toISOString(),
        maxLen: journeyMaxLen,
        minLen: journeyMinLen,
        startsPerRoot,
        branching,
        topPerRoot,
        globalTop: finalizeAgg(globalAgg).slice(0, 200),
        byNavRoot: Object.fromEntries([...byRootAgg.entries()].map(([r, m]) => [r, { paths: finalizeAgg(m).slice(0, topPerRoot) }])),
    };
    await fs.writeFile(path.join(opts.outDir, 'journey_maps.json'), JSON.stringify(journeyMapsIndex, null, 2));
    // circular dependency detection for snippets/components (import graph among snippets)
    const snippetIds = nodes.filter((n) => n.type === 'snippet').map((n) => n.id);
    const snippetSet = new Set(snippetIds);
    const cycles = [];
    const visiting = new Set();
    const visited = new Set();
    function dfs(u, stack) {
        if (visiting.has(u)) {
            const idx = stack.indexOf(u);
            if (idx >= 0)
                cycles.push(stack.slice(idx));
            return;
        }
        if (visited.has(u))
            return;
        visiting.add(u);
        stack.push(u);
        for (const v of outbound[u]?.import ?? []) {
            if (!snippetSet.has(v))
                continue;
            dfs(v, stack);
        }
        stack.pop();
        visiting.delete(u);
        visited.add(u);
    }
    for (const s of snippetIds)
        dfs(s, []);
    // de-dupe cycles by canonical string
    const canon = new Set();
    const uniqCycles = [];
    for (const c of cycles) {
        const key = [...c].sort().join('|');
        if (canon.has(key))
            continue;
        canon.add(key);
        uniqCycles.push(c);
    }
    await fs.writeFile(path.join(opts.outDir, 'circular_snippet_imports.json'), JSON.stringify({ count: uniqCycles.length, cycles: uniqCycles }, null, 2));
    // small summary
    const gitSha = (await exec(`git -C ${repoRoot} rev-parse HEAD`)).stdout.trim();
    const summary = {
        generatedAtUtc: new Date().toISOString(),
        source: {
            repoUrl: opts.repoUrl,
            ref: opts.ref,
            gitSha
        },
        nodes: nodes.length,
        pages: nodes.filter((n) => n.type === 'page').length,
        snippets: nodes.filter((n) => n.type === 'snippet').length
    };
    await fs.writeFile(path.join(opts.outDir, 'summary.json'), JSON.stringify(summary, null, 2));
    // quick sanity: warn about link targets that don't exist
    const missingTargets = new Set();
    for (const [from, e] of Object.entries(outbound)) {
        for (const to of e.link)
            if (!nodeSet.has(to))
                missingTargets.add(to);
    }
    await fs.writeFile(path.join(opts.outDir, 'missing_link_targets.json'), JSON.stringify([...missingTargets].sort(), null, 2));
    // --- Single-file bundle (writer-first: fewer fetches) ---
    // Keep the other JSON files too for backward compatibility.
    const bundle = {
        summary,
        nodes,
        metrics,
        edges: {
            inbound,
            outbound
        },
        linkHrefsOut,
        redirects: redirectIndex,
        nav: {
            tree: navTree,
            pages: pageNavMeta,
            labelCollisions: collisions
        },
        auth0Lint,
        snippetMigration,
        similarity,
        crossNavPairs: crossNavPairsIndex,
        shadowHubs: shadowHubsIndex,
        deadEnds: deadEndsIndex,
        journeyMaps: journeyMapsIndex
    };
    await fs.writeFile(path.join(opts.outDir, 'index.json'), JSON.stringify(bundle, null, 2));
}
