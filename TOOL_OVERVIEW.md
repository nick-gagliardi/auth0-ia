# Auth0-IA — Docs Ops Console (Tool Overview)

Auth0-IA is a writer-first console that indexes the Auth0 docs repo and turns information architecture + maintenance problems into **workflows**.

This doc describes **what the tool does** and **how writers use it** (not how to run/build it).

---

## What Auth0-IA indexes (conceptually)
Auth0-IA builds a queryable snapshot of docs-v2 (EN-only for now):

- **Pages** (MDX) and **Snippets/Components**
- **Links** between pages (`/docs/...`)
- **Snippet imports** (page → snippet/component dependencies)
- **Navigation placement** from `docs.json` (exact nav node paths + labels)
- **Redirects** from `docs.json`
- **Derived metrics** used for triage:
  - inbound/outbound link counts
  - nav depth
  - orphan types
  - snippet blast radius
  - dead-end pages
  - similarity/duplication signals

The output is used to power views like Explain, Work Queue, Dashboards, Redirect hygiene, etc.

---

## Core screens (what each one is for)

### 1) Home
A quick “jumping off point” with search and links to the primary workflows.

---

### 2) Explain (`/explain`)
**Purpose:** “What is this page/snippet? Where does it live? What depends on it?”

Shows (best-effort, index-driven):
- Exact **nav placement** and nav node paths (when available)
- **Inbound links** (who links to this?)
- **Outbound links** (where does this send users?)
- Snippet import context (for snippets/components)
- Similar/related pages (graph-neighborhood similarity)
- Auth0-specific lint findings (when enabled)

Use it before:
- editing high-traffic pages
- moving/renaming content
- touching shared snippets/components

---

### 3) Work Queue (`/work-queue`)
**Purpose:** turn graph signals into a daily writer backlog.

Queues you’ll see include:
- **Reference Orphans**: in nav but 0 inbound links (discoverability issue)
- **True Orphans**: not in nav and 0 inbound links (delete/redirect/add-to-nav candidates)
- **Deep-but-Important**: deep nav depth but heavily linked (buried hubs)
- **Cross-Nav Duplicates**: similar pages in different nav roots (consolidation candidates)
- **Blast Radius Snippets**: snippets/components that impact many pages via imports
- **Dead Ends**: pages with high inbound but very low outbound (missing “next steps”)
- **Auth0 Recipe Checks**: heuristic correctness warnings (PKCE/state/nonce, token storage footguns, Rules vs Actions language)

Use it for:
- daily 10-minute triage
- weekly cleanup cycles

---

### 4) Dashboards (`/dashboards`)
**Purpose:** system-level views of docs health.

Examples:
- **Top hubs**: most-linked pages (high blast radius)
- **Deep content**: buried content that may be legacy or mis-placed
- **Cross-nav duplicates** and **shadow hubs**
- **Journey maps**: heuristic “common reading paths” inferred from the link graph

Use it for:
- planning refactors
- choosing consolidation targets
- identifying high-impact pages to improve

---

### 5) Redirect hygiene (`/redirects`)
**Purpose:** keep URL moves safe.

Flags:
- redirect **chains**
- redirect **loops**
- redirects with **missing sources/destinations** (best-effort)

Use it:
- before/after major nav or URL refactors

---

### 6) Refactor Assistant (`/refactor`)
**Purpose:** plan a move/rename safely (writer-first).

Creates an exportable refactor plan with:
- proposed file moves
- suggested redirects
- a hit-list of pages to update
- best-effort link rewrite suggestions (based on parsed markdown hrefs)

Use it:
- before moving/renaming pages or subtrees

---

### 7) Verify refactor plan (`/verify`)
**Purpose:** post-change sanity checks.

Paste a refactor plan and the tool checks (best-effort):
- which pages still reference the **old** permalink
- whether the **new** permalink has any references (discoverability risk)

---

### 8) Nav labels (`/nav-labels`)
**Purpose:** spot confusing nav label collisions.

Shows:
- nav labels reused across different nav contexts
- pages affected + their exact nav node paths

Use it:
- during IA overhaul to standardize naming

---

### 9) Snippet Migration (`/snippet-migration`)
**Purpose:** migrate hardcoded fenced code blocks in MDX into reusable snippet files.

What it does:
- inventories fenced code blocks as reviewable line items
- dedupes identical blocks (hash + “seen N times”)
- **Migrate** button opens a PR that:
  - writes `main/snippets/<snippetId>/<lang>.<ext>`
  - upserts `main/snippets/registry.json`
  - replaces the fenced block with a `<Snippet id="..." lang="..." />` embed

Use it:
- to reduce snippet drift
- to standardize code samples and unlock snippet-level blast radius analytics

Note: The PR assumes docs-v2 has/will have a `<Snippet />` component to render snippet files.

---

## How to interpret the signals (practical guidance)
- **High inbound links** = high blast radius. Treat changes like “core infrastructure.”
- **Orphans** usually mean either:
  - content is truly obsolete, or
  - content is valuable but poorly integrated (needs nav + cross-links)
- **Dead ends** are great quick wins: add a “Next steps” section with relevant internal links.
- **Cross-nav duplicates** are not always bad—sometimes they’re intentional “journey variants”—but they’re worth review.

---

## What Auth0-IA is *not*
- It’s not a source of truth for product behavior.
- Similarity/duplication detection is heuristic; it’s meant to **surface candidates**, not make decisions automatically.

---

## Glossary
- **Inbound links:** other pages linking *to* this page.
- **Outbound links:** links *from* this page to others.
- **Nav depth:** how deep the page sits in navigation.
- **True orphan:** not in nav and 0 inbound links.
- **Reference orphan:** in nav but 0 inbound links.
- **Blast radius:** how many pages a change might affect.
