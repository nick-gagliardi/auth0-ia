export type RulesDeprecationCategory = 'has_rules_code' | 'links_to_rules' | 'suggests_rules' | 'mentions_rules' | 'is_rules_api' | 'is_hooks_page';
export type RulesDeprecationEvidence = {
    line: number;
    snippet: string;
    category: RulesDeprecationCategory;
};
export type RulesDeprecationItem = {
    id: string;
    filePath: string;
    categories: RulesDeprecationCategory[];
    evidenceCount: number;
    evidence: RulesDeprecationEvidence[];
    severity: 'critical' | 'high' | 'medium' | 'low';
};
export type RulesDeprecationIndex = {
    generatedAtUtc: string;
    pagesScanned: number;
    pagesWithRules: number;
    totalEvidenceCount: number;
    byCriticality: Record<'critical' | 'high' | 'medium' | 'low', number>;
    byCategory: Record<RulesDeprecationCategory, number>;
    items: RulesDeprecationItem[];
};
export declare function buildRulesDeprecationIndex(pages: Array<{
    id: string;
    filePath: string;
    mdx: string;
}>): RulesDeprecationIndex;
