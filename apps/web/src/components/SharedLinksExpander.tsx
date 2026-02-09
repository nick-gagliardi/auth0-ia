'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export default function SharedLinksExpander({
  aId,
  bId,
  outbound,
  metrics,
  nodeMap
}: {
  aId: string;
  bId: string;
  outbound: Record<string, { link: string[]; import: string[]; redirect: string[] }>;
  metrics: Record<string, { inboundLinks: number }>;
  nodeMap: Map<string, { title?: string; filePath: string }>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const hubCutoff = 50;

  const shared = useMemo(() => {
    const a = new Set((outbound[aId]?.link ?? []).filter((x) => (metrics[x]?.inboundLinks ?? 0) <= hubCutoff));
    const b = new Set((outbound[bId]?.link ?? []).filter((x) => (metrics[x]?.inboundLinks ?? 0) <= hubCutoff));
    const out: string[] = [];
    for (const x of a) if (b.has(x)) out.push(x);
    return out.sort();
  }, [aId, bId, outbound, metrics]);

  const md = useMemo(() => {
    const toDocsUrl = (id: string) => {
      // best-effort: convert file path to auth0.com/docs URL
      const fp = nodeMap.get(id)?.filePath || id;
      const rel = fp.replace(/^main\/docs\//, '').replace(/\.mdx$/, '');
      return `https://auth0.com/docs/${rel}`;
    };

    return shared
      .map((id) => {
        const n = nodeMap.get(id);
        const label = (n?.title || n?.filePath || id).replace(/\]/g, '\\]');
        const url = toDocsUrl(id);
        return `- [${label}](${url})`;
      })
      .join('\n');
  }, [shared, nodeMap]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', description: 'Shared links copied as markdown' });
    } catch {
      toast({ title: 'Copy failed', description: 'Could not access clipboard', variant: 'destructive' });
    }
  }

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide Shared Links' : 'View Shared Links'}
        </Button>
        <Badge variant="secondary">{shared.length}</Badge>
        {shared.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => copy(md)}>
            Generate Snippet Candidate
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-3 rounded-lg border bg-background p-3">
          {shared.length === 0 ? (
            <div className="text-sm text-muted-foreground">No shared outbound links after hub filtering.</div>
          ) : (
            <ul className="space-y-1">
              {shared.map((id) => {
                const n = nodeMap.get(id);
                return (
                  <li key={id} className="text-sm">
                    <Link href={`/explain?id=${encodeURIComponent(id)}`} className="text-primary hover:underline">
                      {n?.title || n?.filePath || id}
                    </Link>
                    <span className="text-xs text-muted-foreground ml-2">(inbound: {metrics[id]?.inboundLinks ?? 0})</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
