'use client';

import { useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BookOpen,
  Search,
  Database,
  Route,
  HeartPulse,
  ListTodo,
  ClipboardCheck,
  GitPullRequest,
  LinkIcon,
  Network,
  GitBranch,
  CheckCircle,
  FileCode,
  LayoutDashboard,
  TrendingUp,
  Terminal,
  Tag,
  FileText,
  History,
  Settings,
  ArrowRight,
  Lightbulb,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

function ToolCard({
  title,
  href,
  icon: Icon,
  description,
  features,
}: {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
  features: string[];
}) {
  return (
    <Link href={href} className="block">
      <Card className="h-full hover:bg-secondary/40 transition-colors">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="w-4 h-4 text-primary" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-xs text-muted-foreground space-y-1">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-primary mt-0.5">-</span>
                {f}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </Link>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-semibold mb-4 mt-10 first:mt-0 flex items-center gap-2 border-b pb-2">
      {children}
    </h2>
  );
}

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <BookOpen className="w-8 h-8" />
            Documentation
          </h1>
          <p className="text-muted-foreground mt-2">
            Complete guide to Auth0 IA - the docs intelligence layer for auth0/docs-v2
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tools">All Tools</TabsTrigger>
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
            <TabsTrigger value="data-model">Data Model</TabsTrigger>
            <TabsTrigger value="setup">Setup</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>What is Auth0 IA?</CardTitle>
              </CardHeader>
              <CardContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>
                  Auth0 IA is a <strong>docs intelligence layer</strong> that sits on top of the{' '}
                  <a href="https://github.com/auth0/docs-v2" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    auth0/docs-v2
                  </a>{' '}
                  repository. It builds a graph index of all pages, snippets, links, and navigation paths, then provides
                  tools to query, audit, and refactor the documentation safely.
                </p>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Core Idea</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Treat docs like a codebase with dependencies. Pages link to pages. Pages import snippets.
                  Navigation defines discoverability. From that graph, we compute blast radius, find orphans,
                  identify hubs, and surface IA debt.
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Who is this for?</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Technical writers, docs engineers, and anyone maintaining Auth0 documentation.
                  Use it to understand page relationships, safely move/rename content, audit for
                  technical correctness, and clean up IA debt.
                </CardContent>
              </Card>
            </div>

            <SectionHeader>
              <Lightbulb className="w-5 h-5" />
              Key Concepts
            </SectionHeader>

            <div className="grid md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Badge variant="secondary">Nodes</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  <p className="mb-2">Everything is a node - pages and snippets.</p>
                  <ul className="space-y-1">
                    <li><strong>page</strong>: MDX files under main/docs/**</li>
                    <li><strong>snippet</strong>: Reusable content under main/snippets/**</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Badge variant="secondary">Edges</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  <p className="mb-2">Relationships between nodes.</p>
                  <ul className="space-y-1">
                    <li><strong>link</strong>: Page A links to Page B</li>
                    <li><strong>import</strong>: Page imports a snippet/component</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Badge variant="secondary">Metrics</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  <p className="mb-2">Computed stats for each node.</p>
                  <ul className="space-y-1">
                    <li><strong>inboundLinks</strong>: Pages linking here</li>
                    <li><strong>navDepth</strong>: Depth in docs.json nav</li>
                    <li><strong>impactPages</strong>: Blast radius for snippets</li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <SectionHeader>
              <Workflow className="w-5 h-5" />
              Getting Started
            </SectionHeader>

            <div className="space-y-3">
              <Card className="border-l-4 border-l-primary">
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 text-primary rounded-full w-8 h-8 flex items-center justify-center font-bold shrink-0">
                      1
                    </div>
                    <div>
                      <div className="font-medium">Search for a page</div>
                      <div className="text-sm text-muted-foreground">
                        Use the home page search or go to <Link href="/explain" className="text-primary hover:underline">Explain</Link> to find
                        any page by title, path, or permalink.
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-primary">
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 text-primary rounded-full w-8 h-8 flex items-center justify-center font-bold shrink-0">
                      2
                    </div>
                    <div>
                      <div className="font-medium">Understand context</div>
                      <div className="text-sm text-muted-foreground">
                        Explain shows inbound links, outbound links, navigation paths, and orphan status.
                        Understand the page&apos;s role in the docs ecosystem before making changes.
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-primary">
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 text-primary rounded-full w-8 h-8 flex items-center justify-center font-bold shrink-0">
                      3
                    </div>
                    <div>
                      <div className="font-medium">Audit & Fix</div>
                      <div className="text-sm text-muted-foreground">
                        Use <Link href="/audit" className="text-primary hover:underline">Audit</Link> to check technical correctness,{' '}
                        <Link href="/health" className="text-primary hover:underline">Health</Link> to find orphans,
                        or <Link href="/refactor" className="text-primary hover:underline">Refactor</Link> to safely move pages.
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ALL TOOLS TAB */}
          <TabsContent value="tools" className="space-y-8">
            <SectionHeader>
              <Search className="w-5 h-5" />
              Search & Explore
            </SectionHeader>
            <div className="grid md:grid-cols-3 gap-4">
              <ToolCard
                title="Explain"
                href="/explain"
                icon={Search}
                description="Deep dive into any page or snippet"
                features={[
                  'View inbound/outbound links',
                  'See navigation paths',
                  'Check orphan status',
                  'Find related content',
                  'Direct GitHub links',
                ]}
              />
              <ToolCard
                title="Query"
                href="/query"
                icon={Database}
                description="SQL-like queries over the index"
                features={[
                  'Filter by any metric',
                  'Sort and limit results',
                  'Export to CSV/JSON',
                  'Saved query presets',
                ]}
              />
              <ToolCard
                title="Journeys"
                href="/journeys"
                icon={Route}
                description="Explore predefined user journeys"
                features={[
                  'Visualize content paths',
                  'Find journey gaps',
                  'Map user flows',
                ]}
              />
            </div>

            <SectionHeader>
              <HeartPulse className="w-5 h-5" />
              Health & Audit
            </SectionHeader>
            <div className="grid md:grid-cols-3 gap-4">
              <ToolCard
                title="Health"
                href="/health"
                icon={HeartPulse}
                description="Documentation health dashboard"
                features={[
                  'Health score overview',
                  'True orphans (no nav + no links)',
                  'Reference orphans (nav but no links)',
                  'Deep content (nav depth 6+)',
                  'Dead ends (high in, low out)',
                ]}
              />
              <ToolCard
                title="Work Queue"
                href="/work-queue"
                icon={ListTodo}
                description="Daily IA backlog for triage"
                features={[
                  'Select items for action',
                  'Export to GitHub Issues',
                  'Export to CSV',
                  'Filter by type',
                ]}
              />
              <ToolCard
                title="Audit"
                href="/audit"
                icon={ClipboardCheck}
                description="Technical correctness checks"
                features={[
                  'Single page audits',
                  'Batch audits (multiple URLs)',
                  'AI-powered suggestions',
                  'Check broken links, images, code',
                  'One-click fix generation',
                ]}
              />
              <ToolCard
                title="PR Review"
                href="/pr-review"
                icon={GitPullRequest}
                description="Audit docs PRs before merge"
                features={[
                  'Paste any docs PR URL',
                  'Auto-audit changed files',
                  'Generate review comments',
                  'Publish comments to PR',
                ]}
              />
              <ToolCard
                title="Broken Links"
                href="/broken-links"
                icon={LinkIcon}
                description="Find all broken internal links"
                features={[
                  'Links to missing pages',
                  'Links to missing anchors',
                  'Grouped by source file',
                ]}
              />
            </div>

            <SectionHeader>
              <Network className="w-5 h-5" />
              Maintenance
            </SectionHeader>
            <div className="grid md:grid-cols-3 gap-4">
              <ToolCard
                title="Redirects"
                href="/redirects"
                icon={Network}
                description="Redirect hygiene checker"
                features={[
                  'Find redirect chains',
                  'Detect redirect loops',
                  'Missing destinations',
                  'Derived from docs.json',
                ]}
              />
              <ToolCard
                title="Refactor"
                href="/refactor"
                icon={GitBranch}
                description="Safely move/rename pages"
                features={[
                  'Generate move plans',
                  'Auto-create redirects',
                  'Update inbound links',
                  'Create PR with changes',
                  'Download plan as JSON',
                ]}
              />
              <ToolCard
                title="Verify"
                href="/verify"
                icon={CheckCircle}
                description="Verify page attributes"
                features={[
                  'Check frontmatter',
                  'Validate metadata',
                  'Find missing fields',
                ]}
              />
              <ToolCard
                title="Snippet Migration"
                href="/snippet-migration"
                icon={FileCode}
                description="Track snippet migrations"
                features={[
                  'Find old snippet usage',
                  'Plan migrations',
                  'Track progress',
                ]}
              />
            </div>

            <SectionHeader>
              <LayoutDashboard className="w-5 h-5" />
              Analytics
            </SectionHeader>
            <div className="grid md:grid-cols-3 gap-4">
              <ToolCard
                title="Dashboards"
                href="/dashboards"
                icon={LayoutDashboard}
                description="Key metrics at a glance"
                features={[
                  'Top hub pages',
                  'Most-used snippets',
                  'Cross-nav pairs',
                  'Shadow hubs',
                  'Journey maps',
                ]}
              />
              <ToolCard
                title="Impact"
                href="/impact"
                icon={TrendingUp}
                description="Snippet impact analysis"
                features={[
                  'Transitive blast radius',
                  'Find high-impact snippets',
                  'Plan changes safely',
                ]}
              />
              <ToolCard
                title="Curl Validator"
                href="/curl-validator"
                icon={Terminal}
                description="Validate curl examples"
                features={[
                  'Test curl commands from docs',
                  'Check auth requirements',
                  'Find 404s and errors',
                  'Live execution mode',
                ]}
              />
            </div>

            <SectionHeader>
              <Tag className="w-5 h-5" />
              Reference
            </SectionHeader>
            <div className="grid md:grid-cols-3 gap-4">
              <ToolCard
                title="Nav Labels"
                href="/nav-labels"
                icon={Tag}
                description="Browse navigation tree labels"
                features={[
                  'See all nav sections',
                  'Find pages by nav path',
                  'Understand IA structure',
                ]}
              />
              <ToolCard
                title="Landing Pages"
                href="/landing-pages"
                icon={FileText}
                description="Browse landing/index pages"
                features={[
                  'Find section entry points',
                  'Check landing page health',
                ]}
              />
            </div>

            <SectionHeader>
              <Settings className="w-5 h-5" />
              User
            </SectionHeader>
            <div className="grid md:grid-cols-2 gap-4">
              <ToolCard
                title="History"
                href="/history"
                icon={History}
                description="Your activity history"
                features={[
                  'Recent audits',
                  'Pages explored',
                  'PR reviews',
                  'Refactor operations',
                ]}
              />
              <ToolCard
                title="Settings"
                href="/settings"
                icon={Settings}
                description="Configure your experience"
                features={[
                  'API key management',
                  'GitHub integration',
                  'Preferences',
                ]}
              />
            </div>
          </TabsContent>

          {/* WORKFLOWS TAB */}
          <TabsContent value="workflows" className="space-y-6">
            <SectionHeader>
              <Workflow className="w-5 h-5" />
              Common Workflows
            </SectionHeader>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">1. IA Cleanup - Finding and Fixing Orphans</CardTitle>
                <CardDescription>Reduce IA debt by addressing orphaned content</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Steps</h4>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>Go to <Link href="/health" className="text-primary hover:underline">Health</Link> dashboard</li>
                      <li>Start with &quot;True Orphans&quot; - pages with no nav AND no inbound links</li>
                      <li>Click a page to open in Explain</li>
                      <li>Decide: delete, archive, or add to navigation</li>
                      <li>Use <Link href="/work-queue" className="text-primary hover:underline">Work Queue</Link> to export items as GitHub issues</li>
                    </ol>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Orphan Types</h4>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      <li><strong>True Orphan:</strong> Not in nav + zero inbound links. Often safe to delete.</li>
                      <li><strong>Reference Orphan:</strong> In nav but no inbound links. Needs cross-linking.</li>
                      <li><strong>Nav Orphan:</strong> Has links but not in navigation. May need nav entry.</li>
                      <li><strong>Link Orphan:</strong> Zero inbound links total.</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">2. Safely Moving/Renaming a Page</CardTitle>
                <CardDescription>Use Refactor to move pages without breaking links</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="text-sm text-muted-foreground space-y-3 list-decimal list-inside">
                  <li>Go to <Link href="/refactor" className="text-primary hover:underline">Refactor</Link></li>
                  <li>Search for and select the source page</li>
                  <li>Enter the new permalink and/or file path</li>
                  <li>Review the generated plan:
                    <ul className="ml-6 mt-1 space-y-1 list-disc">
                      <li>File moves (git mv operations)</li>
                      <li>Redirects to add</li>
                      <li>Link rewrites in other pages</li>
                    </ul>
                  </li>
                  <li>Toggle options for redirects and link rewrites</li>
                  <li>Click &quot;Create PR&quot; to generate a branch with all changes</li>
                  <li>Review the PR on GitHub and merge</li>
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">3. Auditing Content for Technical Correctness</CardTitle>
                <CardDescription>Ensure docs are technically accurate</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Single Page Audit</h4>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>Go to <Link href="/audit" className="text-primary hover:underline">Audit</Link></li>
                      <li>Paste a docs.auth0.com URL</li>
                      <li>Enable &quot;AI Suggestions&quot; for deeper analysis</li>
                      <li>Click &quot;Run Audit&quot;</li>
                      <li>Review results by category (PASS/FAIL/WARN/MANUAL)</li>
                      <li>Expand items to see evidence</li>
                    </ol>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Batch Audit</h4>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>Switch to &quot;Batch Audit&quot; tab</li>
                      <li>Add URLs one-by-one or paste multiple</li>
                      <li>Set concurrency (1-10 parallel requests)</li>
                      <li>Click &quot;Run Batch Audit&quot;</li>
                      <li>Monitor progress and view aggregate results</li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">4. Reviewing a Docs PR</CardTitle>
                <CardDescription>Audit PRs before they merge</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Go to <Link href="/pr-review" className="text-primary hover:underline">PR Review</Link></li>
                  <li>Paste a GitHub PR URL from auth0/docs-v2</li>
                  <li>Click &quot;Analyze PR&quot; to fetch and audit changed files</li>
                  <li>Review issues found per file</li>
                  <li>Edit or remove suggested comments</li>
                  <li>Click &quot;Publish Review&quot; to post comments to GitHub</li>
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">5. Understanding Snippet Impact</CardTitle>
                <CardDescription>Know the blast radius before changing shared content</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Go to <Link href="/dashboards" className="text-primary hover:underline">Dashboards</Link> → Top Snippets</li>
                  <li>See snippets sorted by &quot;imported by&quot; count</li>
                  <li>Click a snippet to open in <Link href="/explain" className="text-primary hover:underline">Explain</Link></li>
                  <li>View &quot;impact pages&quot; - the transitive count of affected pages</li>
                  <li>Review which pages import this snippet before making changes</li>
                </ol>
              </CardContent>
            </Card>
          </TabsContent>

          {/* DATA MODEL TAB */}
          <TabsContent value="data-model" className="space-y-6">
            <SectionHeader>Data Model</SectionHeader>

            <Card>
              <CardHeader>
                <CardTitle>Nodes</CardTitle>
                <CardDescription>The building blocks of the index</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-sm bg-muted p-4 rounded-lg overflow-x-auto">
                  <pre>{`interface DocNode {
  id: string;          // File path (e.g., "main/docs/authenticate/login.mdx")
  type: 'page' | 'snippet';
  filePath: string;    // Same as id
  title: string | null;
  permalink: string | null;  // URL path (e.g., "/docs/authenticate/login")
  navPaths: string[];  // Navigation breadcrumbs
  lastModified?: string;
}`}</pre>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Edges</CardTitle>
                <CardDescription>Relationships between nodes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-sm bg-muted p-4 rounded-lg overflow-x-auto">
                  <pre>{`// edges-outbound.json: { [nodeId]: { link: string[], import: string[] } }
// edges-inbound.json:  { [nodeId]: { link: string[], import: string[] } }

// "link" edges: Page A links to Page B via markdown/MDX links
// "import" edges: Page A imports Snippet B via import statements`}</pre>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Metrics</CardTitle>
                <CardDescription>Computed statistics for each node</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-sm bg-muted p-4 rounded-lg overflow-x-auto">
                  <pre>{`interface NodeMetrics {
  inboundLinks: number;   // Count of pages linking to this
  outboundLinks: number;  // Count of pages this links to
  importedBy: number;     // Count of pages importing this snippet
  impactPages: number;    // Transitive blast radius (for snippets)
  navDepth: number;       // Depth in navigation tree (0 = root)

  // Orphan flags
  orphanTrue: boolean;    // Not in nav AND no inbound links
  orphanReference: boolean; // In nav but no inbound links
  orphanNav: boolean;     // Has links but not in nav
  orphanLinks: boolean;   // Zero inbound links
}`}</pre>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Index Files</CardTitle>
                <CardDescription>JSON files fetched from the index</CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium">File</th>
                      <th className="text-left py-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b">
                      <td className="py-2 font-mono text-xs">nodes.json</td>
                      <td className="py-2">All pages and snippets</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-mono text-xs">metrics.json</td>
                      <td className="py-2">Computed metrics per node</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-mono text-xs">edges-outbound.json</td>
                      <td className="py-2">Outgoing links/imports per node</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-mono text-xs">edges-inbound.json</td>
                      <td className="py-2">Incoming links/imports per node</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-mono text-xs">redirects.json</td>
                      <td className="py-2">Redirect rules and warnings</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-mono text-xs">summary.json</td>
                      <td className="py-2">Index metadata (generated time, SHA)</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-mono text-xs">curl-validation.json</td>
                      <td className="py-2">Curl command validation results</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Where Data Comes From</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  A Node.js/TypeScript indexer clones <code>auth0/docs-v2</code> and generates JSON files under <code>/index</code>.
                </p>
                <p>
                  The UI fetches these JSON files (default <code>/index</code>; configurable via <code>NEXT_PUBLIC_INDEX_BASE_URL</code>).
                </p>
                <p>
                  Use the header &quot;Data&quot; indicator to see when the index was generated and which docs-v2 git SHA it reflects.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SETUP TAB */}
          <TabsContent value="setup" className="space-y-6">
            <SectionHeader>
              <Settings className="w-5 h-5" />
              Setup & Configuration
            </SectionHeader>

            <Card>
              <CardHeader>
                <CardTitle>Environment Variables</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium">Variable</th>
                      <th className="text-left py-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground font-mono text-xs">
                    <tr className="border-b">
                      <td className="py-2">NEXT_PUBLIC_INDEX_BASE_URL</td>
                      <td className="py-2 font-sans">Base URL for index JSON files</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2">AUTH0_CLIENT_ID</td>
                      <td className="py-2 font-sans">Auth0 application client ID</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2">AUTH0_CLIENT_SECRET</td>
                      <td className="py-2 font-sans">Auth0 application client secret</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2">AUTH0_ISSUER_BASE_URL</td>
                      <td className="py-2 font-sans">Auth0 tenant URL</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2">NEXTAUTH_SECRET</td>
                      <td className="py-2 font-sans">NextAuth.js session secret</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2">MAINTENANCE_DOCS_REPO_PATH</td>
                      <td className="py-2 font-sans">Local path to docs-v2 clone (for refactor)</td>
                    </tr>
                    <tr>
                      <td className="py-2">MAINTENANCE_UPSTREAM_REPO</td>
                      <td className="py-2 font-sans">GitHub repo for PRs (default: auth0/docs-v2)</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>API Keys</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Anthropic API Key (Optional)</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Required for AI-powered suggestions in the Audit tool. Without it, audits will still run
                    but won&apos;t include AI analysis.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Add your key in <Link href="/settings" className="text-primary hover:underline">Settings</Link>. Keys are encrypted at rest.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium mb-2">GitHub Token (Optional)</h4>
                  <p className="text-sm text-muted-foreground">
                    Required for PR Review publishing and Refactor PR creation. Connect via GitHub OAuth in Settings.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Limitations & Caveats</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                  <li>English-only indexing (no FR/JA parity checks yet)</li>
                  <li>Link parsing is best-effort (MDX can contain non-standard constructs)</li>
                  <li>Impact is based on imports/links, not actual traffic analytics</li>
                  <li>Index refresh is currently snapshot-based</li>
                  <li>Refactor requires a local clone of docs-v2 on the server</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
