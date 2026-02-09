'use client';

import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, FileText, Code2, Navigation } from 'lucide-react';
import type { DocNode, NodeMetrics } from '@/types';
import { Badge } from '@/components/ui/badge';

interface NodeCardProps {
  node: DocNode;
  metrics?: NodeMetrics;
  rank?: number;
}

export default function NodeCard({ node, metrics, rank }: NodeCardProps) {
  const isSnippet = node.type === 'snippet';

  return (
    <Link
      href={`/explain?id=${encodeURIComponent(node.id)}`}
      className="group block rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30"
    >
      <div className="flex items-start gap-3">
        {rank != null && (
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
            {rank}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isSnippet ? (
              <Code2 className="w-4 h-4 text-accent flex-shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-primary flex-shrink-0" />
            )}
            <span className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
              {node.title || node.filePath}
            </span>
          </div>

          <code className="text-xs text-muted-foreground block truncate mb-2">{node.filePath}</code>

          {metrics && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <ArrowDownLeft className="w-3 h-3" />
                {metrics.inboundLinks} in
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <ArrowUpRight className="w-3 h-3" />
                {metrics.outboundLinks} out
              </span>
              {metrics.importedBy > 0 && (
                <Badge variant="secondary" className="text-xs py-0">
                  imported by {metrics.importedBy}
                </Badge>
              )}
              {metrics.impactPages != null && metrics.impactPages > 0 && (
                <Badge variant="outline" className="text-xs py-0">
                  impacts {metrics.impactPages} pages
                </Badge>
              )}
              {node.navPaths?.length > 0 && (
                <span className="flex items-center gap-1 text-accent">
                  <Navigation className="w-3 h-3" />
                  in nav
                </span>
              )}
              {metrics.orphanNav && (
                <Badge variant="destructive" className="text-xs py-0">
                  nav orphan
                </Badge>
              )}
              {metrics.orphanLinks && (
                <Badge variant="outline" className="text-xs py-0 border-destructive/40 text-destructive">
                  0 inbound
                </Badge>
              )}
            </div>
          )}

          {node.navPaths?.length > 0 && <div className="text-xs text-muted-foreground mt-2 truncate">{node.navPaths[0]}</div>}
        </div>
      </div>
    </Link>
  );
}
