# Auth0-IA — Docs Operations Console

A writer-first console for Auth0 documentation operations. Indexes the `auth0/docs-v2` repo and provides tools for information architecture analysis, content auditing, and maintenance workflows.

## Features

### Analysis & Discovery
- **Explain** (`/explain`) - Understand any page or snippet: nav placement, dependencies, inbound/outbound links, similar pages
- **Work Queue** (`/work-queue`) - Automated triage queues: orphans, dead ends, cross-nav duplicates, high-blast-radius snippets
- **Dashboards** (`/dashboards`) - System-level views: top hubs, deep content, journey maps, shadow hubs

### Content Auditing
- **Audit** (`/audit`) - Paste a production URL and get an automated checklist:
  - cURL sample validation
  - Broken link detection
  - Rules → Actions migration check
  - Legacy callout detection (`<Info>` → `<Callout>`)
  - Glossary tooltip suggestions
  - Heading case validation
  - Typo detection
- **PR Review** (`/pr-review`) - Analyze open PRs and post inline suggestions via GitHub Review API

### Maintenance Tools
- **Refactor Assistant** (`/refactor`) - Plan page moves/renames with redirect suggestions
- **Redirect Hygiene** (`/redirects`) - Find chains, loops, and broken redirects
- **Nav Labels** (`/nav-labels`) - Spot confusing nav label collisions
- **Snippet Migration** (`/snippet-migration`) - Convert inline code blocks to reusable snippets
- **cURL Validator** (`/curl-validator`) - Test cURL samples across the docs

## Prerequisites

- **Node.js** 18+
- **pnpm** 9.x (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- **GitHub CLI** (`gh`) authenticated with repo access
- Local clone of `auth0/docs-v2`
- Chrome/Chromium (for Playwright-based checks)

## Installation

```bash
# Clone the repo
git clone https://github.com/atko-scratch/auth0-ia.git
cd auth0-ia

# Install dependencies
pnpm install

# Copy environment template
cp apps/web/.env.example apps/web/.env.local
```

## Configuration

Create `apps/web/.env.local` with:

```bash
# Path to your local docs-v2 clone (required for maintenance features)
MAINTENANCE_DOCS_REPO_PATH=/path/to/docs-v2

# Git configuration for PR creation
MAINTENANCE_UPSTREAM_REPO=auth0/docs-v2
MAINTENANCE_BASE_BRANCH=main
MAINTENANCE_FORK_OWNER=your-github-username

# Chrome path for Playwright (optional, auto-detected on most systems)
MAINTENANCE_CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# Enable maintenance mode features
MAINTENANCE_MODE=true

# GitHub OAuth (optional, for authenticated API calls)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

## Usage

### Run the Dev Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build the Index

The index powers search, explain, work queues, and dashboards:

```bash
pnpm build:index
```

This runs:
1. `packages/indexer` - Parses MDX files and builds the graph
2. `scripts/build-index.mjs` - Generates JSON index files
3. `scripts/sync-index.mjs` - Copies index to `apps/web/public/`

Index files are stored in `/index/`:
- `nodes.json` - Pages and snippets with metadata
- `edges_inbound.json` / `edges_outbound.json` - Link graph
- `metrics.json` - Computed metrics (hub scores, orphan status, etc.)
- `redirects.json` - Redirect mapping and warnings
- `nav_tree.json` - Navigation structure
- `similarity.json` - Page similarity scores
- And more...

### Content Audit Workflow

1. Go to `/audit`
2. Paste a production docs URL (e.g., `https://auth0.com/docs/get-started/...`)
3. Review the checklist results
4. Accept/decline suggested fixes
5. Click "Create PR" to push changes to a maintenance branch

### PR Review Workflow

1. Go to `/pr-review`
2. Enter a PR number from `auth0/docs-v2`
3. Click "Analyze" to scan changed files
4. Review suggestions (tooltips, callouts, Rules→Actions, etc.)
5. Click "Publish Review" to post inline comments via GitHub

## Project Structure

```
auth0-ia/
├── apps/web/              # Next.js 14 app (App Router)
│   ├── app/               # Routes and API endpoints
│   │   ├── api/           # API routes (audit, pr-review, maintenance)
│   │   ├── audit/         # Audit page
│   │   ├── explain/       # Explain page
│   │   ├── work-queue/    # Work queue page
│   │   └── ...
│   ├── src/
│   │   ├── components/    # UI components (shadcn/ui)
│   │   └── types/         # TypeScript types
│   └── public/            # Static assets + index JSON files
├── packages/indexer/      # Index builder library
├── scripts/               # Build and maintenance scripts
│   ├── build-index.mjs
│   ├── sync-index.mjs
│   ├── maintenance-open-pr.mjs
│   └── ...
├── index/                 # Generated index files
└── drift/                 # Drift reports (git-based change tracking)
```

## Key Technologies

- **Next.js 14** (App Router)
- **React 18**
- **Tailwind CSS** + **shadcn/ui**
- **Playwright** (for rendered page checks)
- **GitHub CLI** (for PR operations)

## Scripts Reference

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server on port 3000 |
| `pnpm build` | Production build |
| `pnpm build:index` | Rebuild the docs index |
| `pnpm sync:index` | Copy index files to web app |
| `pnpm drift:report` | Generate drift report from git history |

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `MAINTENANCE_DOCS_REPO_PATH` | Yes* | Path to local `docs-v2` clone |
| `MAINTENANCE_UPSTREAM_REPO` | No | Target repo for PRs (default: `auth0/docs-v2`) |
| `MAINTENANCE_BASE_BRANCH` | No | Base branch for PRs (default: `main`) |
| `MAINTENANCE_FORK_OWNER` | No | GitHub username for fork-based PRs |
| `MAINTENANCE_CHROME_PATH` | No | Path to Chrome for Playwright |
| `MAINTENANCE_MODE` | No | Enable maintenance features |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth app client secret |

*Required for audit and maintenance features

## License

Internal tool - Auth0/Okta use only.

## Contributing

1. Create a feature branch
2. Make changes
3. Run `pnpm typecheck` and `pnpm lint`
4. Submit PR

---

Built with Claude Code.
