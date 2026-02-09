'use client';

import AppLayout from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';

export default function DocsPage() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-2">What this is</h1>
        <p className="text-muted-foreground mb-8">
          Auth0 IA is a lightweight “docs intelligence layer” that sits on top of the public
          <a className="text-primary hover:underline" href="https://github.com/auth0/docs-v2" target="_blank" rel="noreferrer">
            {' '}auth0/docs-v2{' '}
          </a>
          repository.
          It builds a graph index (pages ↔ links ↔ snippets ↔ navigation) and lets you query it.
        </p>

        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-semibold mb-2">Core idea</h2>
            <p className="text-sm text-muted-foreground">
              Treat docs like a codebase with dependencies. Pages link to pages. Pages import snippets/components.
              Navigation defines discoverability. From that, we can compute “blast radius”, hubs, orphans, and IA debt.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Where the data comes from</h2>
            <ul className="list-disc pl-6 space-y-2 text-sm">
              <li>
                A Node/TS indexer clones <code>auth0/docs-v2</code> (English-only for now) and generates JSON under <code>/index</code>.
              </li>
              <li>
                The UI fetches those JSON files (default <code>/index</code>; configurable via <code>NEXT_PUBLIC_INDEX_BASE_URL</code>).
              </li>
              <li>
                Use the header <span className="font-medium">Data</span> indicator to see when the index was generated and which docs-v2 git SHA it reflects.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Pages & Snippets (nodes)</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Everything is modeled as a <span className="font-medium">node</span>.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant="secondary">page</Badge>
              <Badge variant="secondary">snippet</Badge>
            </div>
            <ul className="list-disc pl-6 space-y-2 text-sm">
              <li><b>page</b>: an MDX file under <code>main/docs/**</code>.</li>
              <li><b>snippet</b>: a file under <code>main/snippets/**</code> (MDX/JS/TS/JSX/TSX).</li>
              <li>
                Node ids are the <b>file paths</b> (ex: <code>main/docs/authenticate/login/auth0-universal-login.mdx</code>).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Edges (relationships)</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Nodes connect via two main edge types.
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm">
              <li>
                <b>link</b>: a docs page links to another docs page (ex: <code>/docs/secure/tokens</code>).
              </li>
              <li>
                <b>import</b>: a page or snippet imports a snippet/component (ex: <code>{`from "/snippets/AuthCodeBlock.jsx"`}</code>).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Metrics you’ll see</h2>
            <div className="space-y-3 text-sm">
              <div>
                <b>inbound links</b>: how many pages link to this node. High inbound = “hub / foundation page”.
              </div>
              <div>
                <b>outbound links</b>: how many pages this node links to.
              </div>
              <div>
                <b>imported by</b>: how many pages/snippets import this snippet/component.
              </div>
              <div>
                <b>impact pages</b> (snippets): transitive blast radius — unique pages affected through chains of snippet imports.
              </div>
              <div>
                <b>nav depth</b>: how deep the page is in <code>docs.json</code> navigation.
              </div>
              <div>
                <b>deep content</b>: pages with nav depth ≥ 5 (often low-discoverability / “SEO graveyard”).
              </div>
              <div>
                <b>true orphan</b>: not in nav <i>and</i> 0 inbound links. Often safe to delete/archive after review.
              </div>
              <div>
                <b>reference orphan</b>: in nav but 0 inbound links. Usually a cross-linking/discoverability problem.
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">How to use this (practical workflows)</h2>
            <ul className="list-disc pl-6 space-y-2 text-sm">
              <li>
                <b>IA cleanup</b>: Start in <b>Dashboards → True Orphans</b> and validate whether content should be removed or linked into nav.
              </li>
              <li>
                <b>Cross-linking</b>: Use <b>Reference Orphans</b> to find nav pages that need inbound links from hub pages.
              </li>
              <li>
                <b>Change risk</b>: Use <b>Top Snippets</b> and <b>impact pages</b> to identify high-blast-radius components.
              </li>
              <li>
                <b>Editing</b>: On <b>Explain</b>, use the GitHub links to jump directly to the source file in docs-v2.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Limits / caveats (current)</h2>
            <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
              <li>English-only indexing for now (no FR/JA parity checks yet).</li>
              <li>Link parsing is best-effort (MDX can contain non-standard link constructs).</li>
              <li>Impact is based on imports/links, not actual traffic analytics.</li>
              <li>Index refresh is currently manual/snapshot-based; we’ll add weekly publishing next.</li>
            </ul>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
