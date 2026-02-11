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
    nodeIds: string[];
    labels: string[];
    kinds: NavNodeKind[];
    leafLabelFromNav?: string;
};
export declare function parseDocsJsonNav(docsJson: any, repoRoot: string): Promise<{
    navTree: NavTree;
    rawByFilePath: Map<string, RawNavEntry[]>;
}>;
