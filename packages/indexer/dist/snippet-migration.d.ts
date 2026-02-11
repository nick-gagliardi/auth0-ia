export type SnippetOccurrence = {
    filePath: string;
    startLine: number;
    endLine: number;
    lang: string | null;
    code: string;
    hash: string;
};
export type SnippetMigrationItem = SnippetOccurrence & {
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
export declare function extractFencedBlocks(args: {
    filePath: string;
    mdx: string;
}): Promise<SnippetOccurrence[]>;
export declare function buildSnippetMigrationIndex(pages: Array<{
    filePath: string;
    mdx: string;
}>): Promise<SnippetMigrationIndex>;
