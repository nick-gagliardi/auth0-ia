export type LintSeverity = 'info' | 'warn' | 'error';
export type Auth0LintWarning = {
    code: 'missing_pkce_mention' | 'missing_state_mention' | 'missing_nonce_mention' | 'token_storage_localstorage' | 'token_storage_sessionstorage' | 'token_storage_cookie' | 'rules_vs_actions_language';
    severity: LintSeverity;
    message: string;
    /** Optional string snippet to help writers quickly locate the issue. */
    evidence?: string;
    /** 1-indexed line number of the evidence snippet, when available. */
    line?: number;
};
export type Auth0LintPageResult = {
    id: string;
    filePath: string;
    warnings: Auth0LintWarning[];
};
export type Auth0LintIndex = {
    pagesScanned: number;
    pagesWithWarnings: number;
    warningCount: number;
    byCode: Record<Auth0LintWarning['code'], number>;
    items: Auth0LintPageResult[];
    byPageId: Record<string, Auth0LintWarning[]>;
};
export declare function lintAuth0MdxPages(pages: Array<{
    id: string;
    filePath: string;
    mdx: string;
}>): Auth0LintIndex;
