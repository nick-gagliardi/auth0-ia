export type LintSeverity = 'info' | 'warn' | 'error';

export type Auth0LintWarning = {
  code:
    | 'missing_pkce_mention'
    | 'missing_state_mention'
    | 'missing_nonce_mention'
    | 'token_storage_localstorage'
    | 'token_storage_sessionstorage'
    | 'token_storage_cookie'
    | 'rules_vs_actions_language';
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

function normalizeText(s: string): string {
  // Keep deterministic and cheap: lowercase, normalize line endings.
  return s.replace(/\r\n?/g, '\n').toLowerCase();
}

function findFirstLineContaining(text: string, needle: RegExp): { line: number; evidence: string } | null {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (needle.test(lines[i])) {
      return { line: i + 1, evidence: lines[i].trim().slice(0, 180) };
    }
  }
  return null;
}

function hasAny(text: string, needles: RegExp[]): boolean {
  return needles.some((re) => re.test(text));
}

function seemsLikeOauthFlow(text: string): boolean {
  return hasAny(text, [
    /authorization\s+code/, // prose
    /response_type\s*=\s*code/, // examples
    /\/authorize\b/, // endpoint
    /oauth\b/,
    /oidc\b/,
    /openid\b/,
    /pkce\b/
  ]);
}

function seemsLikeOidcIdTokenFlow(text: string): boolean {
  return hasAny(text, [/(^|\b)id[_-]?token\b/, /\bnonce\b/, /\bopenid\b/]);
}

function mentionsPkce(text: string): boolean {
  return hasAny(text, [/\bpkce\b/, /code[_-]?verifier/, /code[_-]?challenge/]);
}

function mentionsState(text: string): boolean {
  return hasAny(text, [/\bstate\b/]);
}

function mentionsNonce(text: string): boolean {
  return hasAny(text, [/\bnonce\b/]);
}

function mentionsLocalStorage(text: string): boolean {
  return hasAny(text, [/\blocalstorage\b/, /window\.localstorage/, /localStorage\./i]);
}

function mentionsSessionStorage(text: string): boolean {
  return hasAny(text, [/\bsessionstorage\b/, /window\.sessionstorage/, /sessionStorage\./i]);
}

function mentionsCookies(text: string): boolean {
  return hasAny(text, [/\bcookie\b/, /document\.cookie/]);
}

function hasStorageWarningLanguage(text: string): boolean {
  // Minimal heuristic: if the page includes some risk language around storage,
  // treat it as already cautioning the reader.
  return hasAny(text, [/xss/, /not\s+recommended/, /avoid/, /risk/, /vulnerab/, /attack/, /security/]);
}

function mentionsRulesOrHooks(text: string): boolean {
  // Avoid flagging arbitrary english "rules" by requiring Auth0-adjacent context.
  if (!/\bauth0\b/.test(text) && !/\brules\b/.test(text) && !/\bhooks\b/.test(text)) return false;
  return hasAny(text, [/\brules\b/, /\bhooks\b/, /rules\s+engine/]);
}

function mentionsActions(text: string): boolean {
  return hasAny(text, [/\bactions\b/, /\bauth0\s+actions\b/]);
}

function buildByCode(): Auth0LintIndex['byCode'] {
  return {
    missing_pkce_mention: 0,
    missing_state_mention: 0,
    missing_nonce_mention: 0,
    token_storage_localstorage: 0,
    token_storage_sessionstorage: 0,
    token_storage_cookie: 0,
    rules_vs_actions_language: 0
  };
}

export function lintAuth0MdxPages(pages: Array<{ id: string; filePath: string; mdx: string }>): Auth0LintIndex {
  const items: Auth0LintPageResult[] = [];
  const byCode = buildByCode();
  const byPageId: Record<string, Auth0LintWarning[]> = {};

  for (const p of pages) {
    const mdxRaw = p.mdx.replace(/\r\n?/g, '\n');
    const text = normalizeText(mdxRaw);
    const warnings: Auth0LintWarning[] = [];

    // --- PKCE / state / nonce mentions ---
    // Only warn when the page looks like it is describing OAuth/OIDC flows.
    if (seemsLikeOauthFlow(text)) {
      if (/authorization\s+code/.test(text) || /response_type\s*=\s*code/.test(text) || /\/authorize\b/.test(text)) {
        if (!mentionsPkce(text)) {
          const hit = findFirstLineContaining(mdxRaw, /authorization\s+code|response_type\s*=\s*code|\/authorize\b/i);
          warnings.push({
            code: 'missing_pkce_mention',
            severity: 'warn',
            message:
              'OAuth Authorization Code flow appears in this page, but PKCE is not mentioned (PKCE is recommended for public clients).',
            evidence: hit?.evidence,
            line: hit?.line
          });
        }
        if (!mentionsState(text)) {
          const hit = findFirstLineContaining(mdxRaw, /authorization\s+code|response_type\s*=\s*code|\/authorize\b/i);
          warnings.push({
            code: 'missing_state_mention',
            severity: 'warn',
            message: 'OAuth flow appears in this page, but CSRF "state" is not mentioned.',
            evidence: hit?.evidence,
            line: hit?.line
          });
        }
      }

      // Nonce is relevant to OIDC flows that return an ID Token.
      if (seemsLikeOidcIdTokenFlow(text) && hasAny(text, [/\bid[_-]?token\b/, /\bopenid\b/]) && !mentionsNonce(text)) {
        const hit = findFirstLineContaining(mdxRaw, /id[_-]?token|openid/i);
        warnings.push({
          code: 'missing_nonce_mention',
          severity: 'warn',
          message: 'OIDC / id_token appears in this page, but "nonce" is not mentioned (nonce is recommended to mitigate replay).',
          evidence: hit?.evidence,
          line: hit?.line
        });
      }
    }

    // --- Token storage footguns ---
    // Flag localStorage/sessionStorage references unless the page includes warning language.
    if (mentionsLocalStorage(text) && !hasStorageWarningLanguage(text)) {
      const hit = findFirstLineContaining(mdxRaw, /localStorage/i);
      warnings.push({
        code: 'token_storage_localstorage',
        severity: 'error',
        message:
          'This page mentions localStorage. Storing tokens in localStorage is a common XSS footgun; ensure the guidance is explicit and safe.',
        evidence: hit?.evidence,
        line: hit?.line
      });
    }
    if (mentionsSessionStorage(text) && !hasStorageWarningLanguage(text)) {
      const hit = findFirstLineContaining(mdxRaw, /sessionStorage/i);
      warnings.push({
        code: 'token_storage_sessionstorage',
        severity: 'warn',
        message:
          'This page mentions sessionStorage. Storing tokens in Web Storage can be an XSS footgun; ensure the guidance is explicit and safe.',
        evidence: hit?.evidence,
        line: hit?.line
      });
    }
    if (
      mentionsCookies(text) &&
      hasAny(text, [/access[_-]?token|id[_-]?token|refresh[_-]?token|token\b/]) &&
      !hasAny(text, [/httponly/, /secure/, /samesite/])
    ) {
      const hit = findFirstLineContaining(mdxRaw, /cookie|document\.cookie/i);
      warnings.push({
        code: 'token_storage_cookie',
        severity: 'info',
        message:
          'This page mentions cookies alongside tokens. Consider explicitly noting secure cookie attributes (HttpOnly/Secure/SameSite) where appropriate.',
        evidence: hit?.evidence,
        line: hit?.line
      });
    }

    // --- Rules vs Actions language ---
    // Auth0 Rules/Hooks are legacy; warn if the page uses the terms without Actions context.
    if (mentionsRulesOrHooks(text) && !mentionsActions(text)) {
      const hit = findFirstLineContaining(mdxRaw, /\bRules\b|\bHooks\b|rules\s+engine/i);
      warnings.push({
        code: 'rules_vs_actions_language',
        severity: 'warn',
        message:
          'This page references Auth0 Rules/Hooks without mentioning Actions. Rules/Hooks are legacy; consider updating wording to Actions or explicitly marking legacy guidance.',
        evidence: hit?.evidence,
        line: hit?.line
      });
    }

    // deterministic ordering
    warnings.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : (a.line ?? 0) - (b.line ?? 0)));

    byPageId[p.id] = warnings;
    for (const w of warnings) byCode[w.code] = (byCode[w.code] ?? 0) + 1;

    items.push({ id: p.id, filePath: p.filePath, warnings });
  }

  // deterministic ordering
  items.sort((a, b) => (a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0));

  const warningCount = items.reduce((acc, x) => acc + x.warnings.length, 0);
  const pagesWithWarnings = items.filter((x) => x.warnings.length > 0).length;

  return {
    pagesScanned: pages.length,
    pagesWithWarnings,
    warningCount,
    byCode,
    items,
    byPageId
  };
}
