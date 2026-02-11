function normalizeForHash(code) {
    // Keep semantics stable; normalize line endings + trim trailing whitespace.
    return code
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((l) => l.replace(/\s+$/g, ''))
        .join('\n')
        .trim();
}
async function sha256Hex(input) {
    const buf = new TextEncoder().encode(input);
    // @ts-ignore
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const arr = Array.from(new Uint8Array(digest));
    return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}
function preview(code, max = 140) {
    const one = code.replace(/\s+/g, ' ').trim();
    if (one.length <= max)
        return one;
    return one.slice(0, max - 1) + '…';
}
export async function extractFencedBlocks(args) {
    const { filePath, mdx } = args;
    const lines = mdx.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const m = line.match(/^```\s*([^\s`]*)\s*$/);
        if (!m) {
            i++;
            continue;
        }
        const langRaw = (m[1] || '').trim();
        const lang = langRaw ? langRaw : null;
        const startFenceLine = i;
        // Find closing fence
        let j = i + 1;
        while (j < lines.length && !lines[j].match(/^```\s*$/))
            j++;
        if (j >= lines.length)
            break; // unclosed fence
        const codeLines = lines.slice(i + 1, j);
        const code = codeLines.join('\n');
        const norm = normalizeForHash(code);
        const hash = await sha256Hex(norm);
        out.push({
            filePath,
            startLine: startFenceLine + 1,
            endLine: j + 1,
            lang,
            code,
            hash,
        });
        i = j + 1;
    }
    return out;
}
export async function buildSnippetMigrationIndex(pages) {
    const occurrences = [];
    const byLang = {};
    for (const p of pages) {
        const blocks = await extractFencedBlocks({ filePath: p.filePath, mdx: p.mdx });
        for (const b of blocks) {
            occurrences.push(b);
            const k = (b.lang || '(none)').toLowerCase();
            byLang[k] = (byLang[k] || 0) + 1;
        }
    }
    // group by hash
    const groups = new Map();
    for (const o of occurrences) {
        const arr = groups.get(o.hash) ?? [];
        arr.push(o);
        groups.set(o.hash, arr);
    }
    const items = [];
    for (const [hash, arr] of groups.entries()) {
        // Pick canonical occurrence: shortest filePath + earliest line
        const canonical = [...arr].sort((a, b) => a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine)[0];
        const short = hash.slice(0, 10);
        const snippetId = `s_${short}`;
        items.push({
            ...canonical,
            snippetId,
            occurrences: arr.length,
            preview: preview(canonical.code),
        });
    }
    // deterministic
    items.sort((a, b) => b.occurrences - a.occurrences || a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine);
    return {
        generatedAtUtc: new Date().toISOString(),
        pagesScanned: pages.length,
        blocksFound: occurrences.length,
        uniqueBlocks: groups.size,
        byLang,
        items,
    };
}
