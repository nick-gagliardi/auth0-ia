# auth0-ia

A standalone, public **Docs Intelligence Layer** for the Auth0 `docs-v2` repo.

Goal: build a weekly-refreshed **docs graph index** (pages ↔ links ↔ snippets ↔ nav ↔ redirects) and a Vercel-hosted UI to query it for IA + maintenance work.

## What this will do (MVP)

- Clone `auth0/docs-v2` on a schedule
- Build an English-only index from:
  - `main/docs/**/*.mdx` (excluding `fr-ca/` and `ja-jp/`)
  - `main/snippets/**/*.{mdx,jsx,js,ts,tsx}`
  - `main/docs.json`
- Emit query-friendly JSON:
  - `nodes.json` (path/title/permalink/navPath)
  - `edges_*.json` (inbound/outbound links + imports)
  - `metrics.json` (hub score, snippet blast radius, nav/link orphans)
  - `redirects.json` (redirect hygiene)
- Provide a web UI:
  - search
  - explain (page/snippet dependencies)
  - impact/blast radius
  - orphans dashboards

## Repo layout (proposed)

```
/apps/web           # Next.js UI (Vercel)
/packages/indexer   # Node indexer library
/scripts/build-index.ts
/index-schema.md
```

## Development (planned)

- `pnpm i`
- `pnpm dev` (web)
- `pnpm build:index` (generate index)

## Notes

This repo is intentionally **standalone** (sits on top of docs-v2). It does not change Mintlify or docs-v2 workflows.
