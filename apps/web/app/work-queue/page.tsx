'use client';

import { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, Link2Off, Download, Github, FileSpreadsheet, Copy, Check } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import NodeCard from '@/components/NodeCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useAuth0Lint,
  useCrossNavPairs,
  useDeadEnds,
  useEdgesOutbound,
  useLinkHrefsOut,
  useMetrics,
  useNodes,
} from '@/hooks/use-index-data';
import type { DocNode, NodeMetrics, Auth0LintWarning } from '@/types';

// Types for selection
interface SelectedItem {
  id: string;
  node: DocNode;
  metrics?: NodeMetrics;
  warnings?: Auth0LintWarning[];
  extraData?: Record<string, any>;
}

interface SelectionState {
  [tabValue: string]: Set<string>;
}

function scoreDeepImportant(m: any) {
  const depth = m?.navDepth ?? 0;
  const inbound = m?.inboundLinks ?? 0;
  return inbound * 10 + depth * 2;
}

// Generate GitHub Issue markdown for selected items
function generateGitHubMarkdown(items: SelectedItem[], tabValue: string, tabLabel: string): string {
  const now = new Date().toISOString().split('T')[0];
  
  let markdown = `## Work Queue Export: ${tabLabel}\n\n`;
  markdown += `**Exported:** ${now}  \n`;
  markdown += `**Items:** ${items.length}\n\n`;
  markdown += `---\n\n`;

  items.forEach((item, idx) => {
    const n = item.node;
    const m = item.metrics;
    
    markdown += `### ${idx + 1}. ${n.title || n.filePath}\n\n`;
    markdown += `- **File:** \`${n.filePath}\`\n`;
    markdown += `- **ID:** \`${n.id}\`\n`;
    
    if (n.permalink) {
      markdown += `- **URL:** ${n.permalink}\n`;
    }
    
    if (m) {
      markdown += `- **Inbound Links:** ${m.inboundLinks}\n`;
      markdown += `- **Outbound Links:** ${m.outboundLinks}\n`;
      if (m.navDepth !== undefined) {
        markdown += `- **Nav Depth:** ${m.navDepth}\n`;
      }
    }
    
    if (n.navPaths?.length > 0) {
      markdown += `- **Navigation:** ${n.navPaths[0]}\n`;
    }
    
    // Include warnings for auth0-lint tab
    if (item.warnings && item.warnings.length > 0) {
      markdown += `- **Issues:** ${item.warnings.length}\n`;
      markdown += `  - Errors: ${item.warnings.filter(w => w.severity === 'error').length}\n`;
      markdown += `  - Warnings: ${item.warnings.filter(w => w.severity === 'warn').length}\n`;
    }
    
    // Include dead-end specific data
    if (item.extraData?.inboundLinks !== undefined) {
      markdown += `- **Inbound:** ${item.extraData.inboundLinks}\n`;
      markdown += `- **Outbound:** ${item.extraData.outboundLinks}\n`;
      if (item.extraData.navRoot) {
        markdown += `- **Nav Root:** ${item.extraData.navRoot}\n`;
      }
    }
    
    markdown += `\n`;
    
    // Recommended actions based on tab type
    markdown += `**Recommended Actions:**\n`;
    switch (tabValue) {
      case 'ref-orphans':
        markdown += `- [ ] Review if this page should have cross-links from related hub pages\n`;
        markdown += `- [ ] Add links from pages that reference similar topics\n`;
        markdown += `- [ ] Consider adding to a "Related Topics" section\n`;
        break;
      case 'true-orphans':
        markdown += `- [ ] **Triage:** Decide if this page should be kept, deleted, or redirected\n`;
        markdown += `- [ ] If keeping: Add to navigation or create inbound links\n`;
        markdown += `- [ ] If removing: Set up redirect to canonical page\n`;
        break;
      case 'deep-important':
        markdown += `- [ ] Consider moving this content up in navigation hierarchy\n`;
        markdown += `- [ ] Create a hub/landing page that links to this content\n`;
        markdown += `- [ ] Add more prominent cross-links from higher-level pages\n`;
        break;
      case 'dead-ends':
        markdown += `- [ ] Add "Next Steps" or "Related Topics" section\n`;
        markdown += `- [ ] Link to relevant follow-up content\n`;
        markdown += `- [ ] Consider creating a journey path from this page\n`;
        break;
      case 'auth0-lint':
        markdown += `- [ ] Review each warning and fix issues:\n`;
        item.warnings?.forEach(w => {
          markdown += `  - [ ] ${w.message}\n`;
        });
        break;
      default:
        markdown += `- [ ] Review and take appropriate action\n`;
    }
    
    markdown += `\n---\n\n`;
  });

  // Add summary section
  markdown += `## Summary\n\n`;
  markdown += `- Total items: **${items.length}**\n`;
  markdown += `- Export type: **${tabLabel}**\n`;
  markdown += `- [ ] Review complete\n`;
  markdown += `- [ ] Actions assigned\n`;

  return markdown;
}

// Generate Jira CSV for selected items
function generateJiraCSV(items: SelectedItem[], tabValue: string, tabLabel: string): string {
  // CSV header
  const headers = ['Summary', 'Description', 'Labels', 'Priority'];
  
  const rows = items.map(item => {
    const n = item.node;
    const m = item.metrics;
    
    // Summary: Page title + issue type
    const summary = `${n.title || n.filePath} - ${tabLabel}`;
    
    // Description: Full details
    let description = `h2. Page Details\n\n`;
    description += `*File:* ${n.filePath}\n`;
    description += `*ID:* ${n.id}\n`;
    if (n.permalink) {
      description += `*URL:* ${n.permalink}\n`;
    }
    
    if (m) {
      description += `*Inbound Links:* ${m.inboundLinks}\n`;
      description += `*Outbound Links:* ${m.outboundLinks}\n`;
      if (m.navDepth !== undefined) {
        description += `*Nav Depth:* ${m.navDepth}\n`;
      }
    }
    
    if (n.navPaths?.length > 0) {
      description += `*Navigation:* ${n.navPaths[0]}\n`;
    }
    
    if (item.warnings && item.warnings.length > 0) {
      description += `\nh3. Issues (${item.warnings.length})\n\n`;
      item.warnings.forEach(w => {
        description += `* ${w.severity.toUpperCase()}: ${w.message}\n`;
      });
    }
    
    // Recommended actions
    description += `\nh3. Recommended Actions\n\n`;
    switch (tabValue) {
      case 'ref-orphans':
        description += `# Review if this page should have cross-links from related hub pages\n`;
        description += `# Add links from pages that reference similar topics\n`;
        description += `# Consider adding to a "Related Topics" section\n`;
        break;
      case 'true-orphans':
        description += `# Triage: Decide if this page should be kept, deleted, or redirected\n`;
        description += `# If keeping: Add to navigation or create inbound links\n`;
        description += `# If removing: Set up redirect to canonical page\n`;
        break;
      case 'deep-important':
        description += `# Consider moving this content up in navigation hierarchy\n`;
        description += `# Create a hub/landing page that links to this content\n`;
        description += `# Add more prominent cross-links from higher-level pages\n`;
        break;
      case 'dead-ends':
        description += `# Add "Next Steps" or "Related Topics" section\n`;
        description += `# Link to relevant follow-up content\n`;
        description += `# Consider creating a journey path from this page\n`;
        break;
      case 'auth0-lint':
        description += `# Review each warning and fix issues:\n`;
        item.warnings?.forEach(w => {
          description += `# ${w.message}\n`;
        });
        break;
      default:
        description += `# Review and take appropriate action\n`;
    }
    
    // Labels
    const labels = ['docs-ia', tabValue];
    if (item.warnings && item.warnings.length > 0) {
      labels.push('auth0-lint');
    }
    if (m?.orphanTrue) labels.push('orphan');
    if (m?.orphanReference) labels.push('ref-orphan');
    
    // Priority based on metrics
    let priority = 'Medium';
    if (m) {
      if (m.inboundLinks >= 50 || (item.warnings?.some(w => w.severity === 'error'))) {
        priority = 'High';
      } else if (m.inboundLinks <= 5 && (tabValue === 'true-orphans' || tabValue === 'ref-orphans')) {
        priority = 'Low';
      }
    }
    
    // Escape CSV fields
    const escapeCSV = (field: string) => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };
    
    return [
      escapeCSV(summary),
      escapeCSV(description),
      escapeCSV(labels.join(',')),
      escapeCSV(priority)
    ].join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
}

// Export Actions Component
function ExportActions({
  selectedCount,
  onExportGitHub,
  onExportJira,
  onClearSelection,
}: {
  selectedCount: number;
  onExportGitHub: () => string;
  onExportJira: () => string;
  onClearSelection: () => void;
}) {
  const [copied, setCopied] = useState(false);
  
  const handleCopyGitHub = async () => {
    await navigator.clipboard.writeText(onExportGitHub());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJira = () => {
    const csv = onExportJira();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `work-queue-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="flex items-center gap-3">
      {selectedCount > 0 && (
        <span className="text-sm text-muted-foreground">
          {selectedCount} selected
        </span>
      )}
      
      {selectedCount > 0 && (
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          Clear
        </Button>
      )}
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            disabled={selectedCount === 0}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Export Selected Items</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleCopyGitHub} className="gap-2 cursor-pointer">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied!' : 'Copy as GitHub Issue'}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownloadJira} className="gap-2 cursor-pointer">
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export to Jira CSV</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Work Queue Item with Checkbox wrapper
function WorkQueueItem({
  id,
  node,
  metrics,
  selected,
  onSelect,
  children,
}: {
  id: string;
  node: DocNode;
  metrics?: NodeMetrics;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative group">
      <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(id, checked as boolean)}
          className="bg-background"
        />
      </div>
      <div className={`transition-all ${selected ? 'pl-10' : 'pl-0 group-hover:pl-10'}`}>
        {children}
      </div>
    </div>
  );
}

// Broken Links Checker Component
function BrokenLinksChecker({ pages, nodeById }: { pages: any[]; nodeById: Map<string, any> }) {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: outbound } = useEdgesOutbound();
  const { data: hrefsOut } = useLinkHrefsOut();

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return pages.slice(0, 15);
    return pages
      .filter((p) => {
        const hay = `${p.title || ''} ${p.filePath} ${p.permalink || ''} ${(p.navPaths || []).join(' | ')}`.toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 30);
  }, [q, pages]);

  const selected = selectedId ? nodeById.get(selectedId) : null;

  const missingTargets = useMemo(() => {
    if (!selectedId || !outbound) return [] as string[];
    const targets = outbound[selectedId]?.link ?? [];
    return targets.filter((t) => !nodeById.has(t));
  }, [selectedId, outbound, nodeById]);

  const hrefPairs = useMemo(() => {
    if (!selectedId || !hrefsOut) return [] as Array<{ href: string; toId: string }>;
    return (hrefsOut[selectedId] || []).slice(0, 500);
  }, [selectedId, hrefsOut]);

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">selected</div>
              <div className="text-lg font-semibold">{selected.title || selected.filePath}</div>
              <div className="text-xs text-muted-foreground font-mono break-all">{selected.id}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setSelectedId(null)}>
                Change page
              </Button>
              <Button asChild>
                <Link href={`/explain?id=${encodeURIComponent(selected.id)}`}>Explain</Link>
              </Button>
            </div>
          </div>
        </div>

        {missingTargets.length > 0 && (
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-destructive">Missing targets ({missingTargets.length})</div>
            </div>
            <div className="space-y-2">
              {missingTargets.map((t) => (
                <div key={t} className="rounded-lg border p-3">
                  <div className="text-sm font-mono break-all">{t}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Link2Off className="w-4 h-4 text-muted-foreground" />
            <div className="font-semibold">Outbound links ({hrefPairs.length})</div>
          </div>
          <div className="space-y-2">
            {hrefPairs.map((x, idx) => (
              <div key={`${x.href}||${idx}`} className="rounded-lg border p-3">
                <div className="text-sm font-mono break-all">{x.href}</div>
                {nodeById.has(x.toId) ? (
                  <Link
                    className="text-sm text-primary hover:underline mt-1 inline-block"
                    href={`/explain?id=${encodeURIComponent(x.toId)}`}
                  >
                    Open target
                  </Link>
                ) : (
                  <div className="text-sm text-destructive mt-1">Target not found in index</div>
                )}
              </div>
            ))}
            {hrefPairs.length === 0 && <div className="text-sm text-muted-foreground">No /docs links found.</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search page to check links…"
          className="pl-12 h-12 rounded-2xl"
        />
      </div>
      <div className="space-y-2">
        {matches.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedId(p.id)}
            className="w-full text-left rounded-xl border hover:bg-secondary/40 transition-colors"
          >
            <NodeCard node={p} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function WorkQueuePage() {
  const { data: nodes, isLoading: l1 } = useNodes();
  const { data: metrics, isLoading: l2 } = useMetrics();
  const { data: crossNav, isLoading: l3 } = useCrossNavPairs();
  const { data: deadEnds, isLoading: l4 } = useDeadEnds();
  const { data: auth0Lint, isLoading: l5 } = useAuth0Lint();
  
  const [activeTab, setActiveTab] = useState('ref-orphans');
  const [selection, setSelection] = useState<SelectionState>({});

  const loading = l1 || l2 || l3 || l4 || l5;

  const pages = useMemo(() => nodes?.filter((n) => n.type === 'page') ?? [], [nodes]);

  const referenceOrphans = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((p) => metrics[p.id]?.orphanReference)
      .sort((a, b) => (metrics[b.id]?.navDepth ?? 999) - (metrics[a.id]?.navDepth ?? 999));
  }, [pages, metrics]);

  const deepImportant = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((p) => (metrics[p.id]?.navDepth ?? 0) >= 6 && (metrics[p.id]?.inboundLinks ?? 0) >= 10)
      .sort((a, b) => scoreDeepImportant(metrics[b.id]) - scoreDeepImportant(metrics[a.id]));
  }, [pages, metrics]);

  const trueOrphans = useMemo(() => {
    if (!metrics) return [];
    return pages
      .filter((p) => metrics[p.id]?.orphanTrue)
      .sort((a, b) => (metrics[b.id]?.outboundLinks ?? 0) - (metrics[a.id]?.outboundLinks ?? 0));
  }, [pages, metrics]);

  const auth0LintQueue = useMemo(() => {
    if (!auth0Lint) return [];
    const byId = new Map<string, any>();
    pages.forEach((p) => byId.set(p.id, p));

    function score(warnings: any[]): number {
      let s = 0;
      for (const w of warnings) {
        if (w.severity === 'error') s += 1000;
        else if (w.severity === 'warn') s += 100;
        else s += 10;
      }
      return s + warnings.length;
    }

    return (auth0Lint.items || [])
      .filter((x) => (x.warnings?.length ?? 0) > 0)
      .map((x) => ({
        node: byId.get(x.id) || { id: x.id, filePath: x.filePath, type: 'page' as const, navPaths: [] },
        warnings: x.warnings,
      }))
      .sort(
        (a, b) =>
          score(b.warnings) - score(a.warnings) ||
          (b.warnings.length ?? 0) - (a.warnings.length ?? 0) ||
          (a.node.filePath < b.node.filePath ? -1 : 1)
      )
      .slice(0, 200);
  }, [auth0Lint, pages]);

  const nodeById = useMemo(() => {
    const m = new Map<string, any>();
    nodes?.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  // Selection handlers
  const handleSelect = useCallback((tabValue: string, id: string, checked: boolean) => {
    setSelection(prev => {
      const tabSelection = new Set(prev[tabValue] || []);
      if (checked) {
        tabSelection.add(id);
      } else {
        tabSelection.delete(id);
      }
      return { ...prev, [tabValue]: tabSelection };
    });
  }, []);

  const handleSelectAll = useCallback((tabValue: string, ids: string[]) => {
    setSelection(prev => ({
      ...prev,
      [tabValue]: new Set(ids)
    }));
  }, []);

  const handleClearSelection = useCallback((tabValue: string) => {
    setSelection(prev => ({
      ...prev,
      [tabValue]: new Set()
    }));
  }, []);

  const getSelectedItems = useCallback((tabValue: string, tabData: any[]): SelectedItem[] => {
    const selectedIds = selection[tabValue] || new Set();
    if (selectedIds.size === 0) return [];
    
    return tabData
      .filter(item => {
        const id = item.id || item.node?.id;
        return selectedIds.has(id);
      })
      .map(item => {
        if (tabValue === 'auth0-lint') {
          return {
            id: item.node.id,
            node: item.node,
            metrics: metrics?.[item.node.id],
            warnings: item.warnings,
          };
        }
        if (tabValue === 'dead-ends') {
          const n = nodeById.get(item.id);
          return {
            id: item.id,
            node: n,
            metrics: metrics?.[item.id],
            extraData: {
              inboundLinks: item.inboundLinks,
              outboundLinks: item.outboundLinks,
              navRoot: item.navRoot,
            },
          };
        }
        return {
          id: item.id,
          node: item,
          metrics: metrics?.[item.id],
        };
      })
      .filter(item => item.node); // Filter out any null nodes
  }, [selection, metrics, nodeById]);

  const tabs = [
    {
      value: 'ref-orphans',
      label: `Reference Orphans (${referenceOrphans.length})`,
      help: 'In navigation, but 0 inbound links. Usually a discoverability problem: add cross-links from relevant hub pages.',
      data: referenceOrphans.slice(0, 100),
    },
    {
      value: 'true-orphans',
      label: `True Orphans (${trueOrphans.length})`,
      help: 'Not in nav AND 0 inbound links. Triage: delete/archive, redirect to canonical, or intentionally add to nav.',
      data: trueOrphans.slice(0, 100),
    },
    {
      value: 'deep-important',
      label: `Deep-but-Important (${deepImportant.length})`,
      help: 'Nav depth ≥ 6 and inbound links ≥ 10. Likely buried content that matters: consider moving up nav or creating a hub/landing page.',
      data: deepImportant.slice(0, 100),
    },
    {
      value: 'dead-ends',
      label: `Dead Ends (${deadEnds?.items?.length ?? 0})`,
      help: 'High inbound but low outbound pages. These attract readers but fail to route them onward — add "Next steps" links, improve in-page nav, or create a hub.',
      data: (deadEnds?.items || []).slice(0, 100) as any,
    },
    {
      value: 'auth0-lint',
      label: `Auth0 Checks (${auth0LintQueue.length})`,
      help: 'Heuristic checks for common Auth0 docs issues (PKCE/state/nonce mentions, token storage guidance, Rules vs Actions language).',
      data: auth0LintQueue as any,
    },
    {
      value: 'broken-links',
      label: 'Broken Links',
      help: 'Pick a page and review its outbound /docs links to find missing targets.',
      data: [],
    },
  ];

  const currentTab = tabs.find(t => t.value === activeTab);
  const selectedCount = (selection[activeTab] || new Set()).size;
  const selectedItems = currentTab ? getSelectedItems(activeTab, currentTab.data) : [];

  const handleExportGitHub = () => {
    if (!currentTab) return '';
    return generateGitHubMarkdown(selectedItems, activeTab, currentTab.label);
  };

  const handleExportJira = () => {
    if (!currentTab) return '';
    return generateJiraCSV(selectedItems, activeTab, currentTab.label);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Work Queue</h1>
        <p className="text-muted-foreground mb-8">
          A day-to-day IA backlog for writers. These queues turn graph signals into concrete tasks.
        </p>

        <Tabs defaultValue="ref-orphans" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex-wrap h-auto">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((t) => (
            <TabsContent key={t.value} value={t.value}>
              <div className="flex items-baseline justify-between mb-4">
                <p className="text-sm text-muted-foreground">{t.help}</p>
                {t.value !== 'broken-links' && (
                  <ExportActions
                    selectedCount={(selection[t.value] || new Set()).size}
                    onExportGitHub={() => {
                      const items = getSelectedItems(t.value, t.data);
                      return generateGitHubMarkdown(items, t.value, t.label);
                    }}
                    onExportJira={() => {
                      const items = getSelectedItems(t.value, t.data);
                      return generateJiraCSV(items, t.value, t.label);
                    }}
                    onClearSelection={() => handleClearSelection(t.value)}
                  />
                )}
              </div>
              
              {t.value !== 'broken-links' && t.data.length > 0 && (
                <div className="flex items-center gap-3 mb-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAll(t.value, t.data.map((item: any) => item.id || item.node?.id))}
                  >
                    Select All
                  </Button>
                </div>
              )}

              {t.value === 'broken-links' ? (
                <BrokenLinksChecker pages={pages} nodeById={nodeById} />
              ) : t.value === 'auth0-lint' ? (
                <div className="flex flex-col gap-2">
                  {(t.data as any[]).map((x: any) => {
                    const n = x.node;
                    const warns = x.warnings || [];
                    const errors = warns.filter((w: any) => w.severity === 'error').length;
                    const warnsCount = warns.filter((w: any) => w.severity === 'warn').length;
                    const isSelected = (selection[t.value] || new Set()).has(n.id);
                    
                    return (
                      <WorkQueueItem
                        key={n.id}
                        id={n.id}
                        node={n}
                        metrics={metrics?.[n.id]}
                        selected={isSelected}
                        onSelect={(id, checked) => handleSelect(t.value, id, checked)}
                      >
                        <div className="rounded-xl border bg-card p-4">
                          <div className="text-xs text-muted-foreground mb-2">
                            issues <b>{warns.length}</b> · errors <b>{errors}</b> · warns <b>{warnsCount}</b>
                          </div>
                          <Link href={`/explain?id=${encodeURIComponent(n.id)}`}>
                            <NodeCard node={n} metrics={metrics?.[n.id]} />
                          </Link>
                        </div>
                      </WorkQueueItem>
                    );
                  })}
                </div>
              ) : t.value === 'dead-ends' ? (
                <div className="flex flex-col gap-2">
                  {(t.data as any[]).map((x: any) => {
                    const n = nodeById.get(x.id);
                    if (!n) return null;
                    const isSelected = (selection[t.value] || new Set()).has(x.id);
                    
                    return (
                      <WorkQueueItem
                        key={x.id}
                        id={x.id}
                        node={n}
                        metrics={metrics?.[x.id]}
                        selected={isSelected}
                        onSelect={(id, checked) => handleSelect(t.value, id, checked)}
                      >
                        <div className="rounded-xl border bg-card p-4">
                          <div className="text-xs text-muted-foreground mb-2">
                            inbound <b>{x.inboundLinks}</b> · outbound <b>{x.outboundLinks}</b>
                            {x.navRoot ? (
                              <span className="ml-2 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide">
                                {x.navRoot}
                              </span>
                            ) : null}
                          </div>
                          <NodeCard node={n} metrics={metrics?.[x.id]} />
                        </div>
                      </WorkQueueItem>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {(t.data as any[]).map((n: any) => {
                    const isSelected = (selection[t.value] || new Set()).has(n.id);
                    
                    return (
                      <WorkQueueItem
                        key={n.id}
                        id={n.id}
                        node={n}
                        metrics={metrics?.[n.id]}
                        selected={isSelected}
                        onSelect={(id, checked) => handleSelect(t.value, id, checked)}
                      >
                        <Link href={`/explain?id=${encodeURIComponent(n.id)}`}>
                          <NodeCard node={n} metrics={metrics?.[n.id]} />
                        </Link>
                      </WorkQueueItem>
                    );
                  })}
                </div>
              )}

              {t.data.length >= 100 && t.value !== 'broken-links' ? (
                <p className="text-xs text-muted-foreground mt-4">Showing first 100 items</p>
              ) : null}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}
