'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, FileText, Code2, Copy, Github } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import AppLayout from '@/components/AppLayout';
import { useEdgesInbound, useEdgesOutbound, useMetrics, useNodes } from '@/hooks/use-index-data';

function EdgeList({
  title,
  icon: Icon,
  edges,
  nodeMap
}: {
  title: string;
  icon: React.ElementType;
  edges: { link: string[]; import: string[]; redirect: string[] };
  nodeMap: Map<string, { title?: string; filePath: string }>;
}) {
  const total = edges.link.length + edges.import.length + edges.redirect.length;

  function label(id: string) {
    const n = nodeMap.get(id);
    return n?.title || n?.filePath || id;
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-bold">{title}</h3>
        <Badge variant="secondary" className="ml-auto">
          {total}
        </Badge>
      </div>

      {edges.link.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Links ({edges.link.length})
          </div>
          <ul className="space-y-1">
            {edges.link.slice(0, 50).map((x) => (
              <li key={x}>
                <Link
                  href={`/explain?id=${encodeURIComponent(x)}`}
                  className="text-sm text-primary hover:underline truncate block"
                >
                  {label(x)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {edges.import.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Imports ({edges.import.length})
          </div>
          <ul className="space-y-1">
            {edges.import.slice(0, 50).map((x) => (
              <li key={x}>
                <Link
                  href={`/explain?id=${encodeURIComponent(x)}`}
                  className="text-sm text-accent hover:underline truncate block"
                >
                  {label(x)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {edges.redirect.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Redirects ({edges.redirect.length})
          </div>
          <ul className="space-y-1">
            {edges.redirect.slice(0, 50).map((x) => (
              <li key={x} className="text-sm text-muted-foreground truncate">
                {x}
              </li>
            ))}
          </ul>
        </div>
      )}

      {total === 0 && <p className="text-sm text-muted-foreground">None</p>}
    </div>
  );
}

export default function ExplainPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const { data: nodes, isLoading: l1 } = useNodes();
  const { data: metrics, isLoading: l2 } = useMetrics();
  const { data: inbound, isLoading: l3 } = useEdgesInbound();
  const { data: outbound, isLoading: l4 } = useEdgesOutbound();

  const loading = l1 || l2 || l3 || l4;

  const nodeMap = useMemo(() => {
    const m = new Map<string, { title?: string; filePath: string }>();
    nodes?.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  const node = useMemo(() => nodes?.find((n) => n.id === id) ?? null, [nodes, id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  if (!id) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">
          Missing <code>?id=</code> parameter
        </div>
      </AppLayout>
    );
  }

  if (!node) {
    return (
      <AppLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground mb-2">Node not found</p>
          <code className="text-sm">{id}</code>
        </div>
      </AppLayout>
    );
  }

  const m = metrics?.[node.id];
  const inE = inbound?.[node.id] || { link: [], import: [], redirect: [] };
  const outE = outbound?.[node.id] || { link: [], import: [], redirect: [] };

  const docsV2BlobBase = process.env.NEXT_PUBLIC_DOCS_V2_BLOB_BASE || 'https://github.com/auth0/docs-v2/blob/main';
  const docsV2Url = `${docsV2BlobBase}/${node.filePath}`;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', description: `${label} copied to clipboard` });
    } catch {
      toast({ title: 'Copy failed', description: 'Could not access clipboard', variant: 'destructive' });
    }
  }

  const deepLink = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to search
        </Link>

        <div className="rounded-xl border bg-card p-6 mb-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              {node.type === 'snippet' ? (
                <Code2 className="w-5 h-5 text-accent" />
              ) : (
                <FileText className="w-5 h-5 text-primary" />
              )}
              <Badge variant="secondary">{node.type}</Badge>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => copy(node.id, 'Node id')}>
                <Copy className="w-4 h-4 mr-2" />
                Copy id
              </Button>
              <Button variant="outline" size="sm" onClick={() => copy(node.filePath, 'File path')}>
                <Copy className="w-4 h-4 mr-2" />
                Copy path
              </Button>
              <Button variant="outline" size="sm" onClick={() => copy(deepLink, 'Link')} disabled={!deepLink}>
                <Copy className="w-4 h-4 mr-2" />
                Copy link
              </Button>
              <a href={docsV2Url} target="_blank" rel="noreferrer">
                <Button variant="default" size="sm">
                  <Github className="w-4 h-4 mr-2" />
                  View in GitHub
                </Button>
              </a>
            </div>
          </div>

          <h1 className="text-2xl font-bold mb-2">{node.title || node.filePath}</h1>
          <code className="text-sm text-muted-foreground block mb-4">{node.id}</code>

          {m && (
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1">
                <ArrowDownLeft className="w-4 h-4 text-primary" /> <b>{m.inboundLinks}</b> inbound
              </div>
              <div className="flex items-center gap-1">
                <ArrowUpRight className="w-4 h-4 text-accent" /> <b>{m.outboundLinks}</b> outbound
              </div>
              <div>
                imported by: <b>{m.importedBy}</b>
              </div>
              {m.impactPages != null && (
                <div>
                  impact pages: <b>{m.impactPages}</b>
                </div>
              )}
              {m.hubScore != null && (
                <div>
                  hub score: <b>{m.hubScore}</b>
                </div>
              )}
            </div>
          )}

          {node.navPaths?.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Navigation paths
              </div>
              <ul className="space-y-1">
                {node.navPaths.map((p) => (
                  <li key={p} className="text-sm">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EdgeList title="Inbound" icon={ArrowDownLeft} edges={inE} nodeMap={nodeMap} />
          <EdgeList title="Outbound" icon={ArrowUpRight} edges={outE} nodeMap={nodeMap} />
        </div>
      </div>
    </AppLayout>
  );
}
