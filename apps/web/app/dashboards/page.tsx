'use client';

import { useEffect, useMemo, useState } from 'react';

type NodeType = 'page' | 'snippet';

type Node = {
  id: string;
  type: NodeType;
  filePath: string;
  title?: string;
  permalink?: string;
  navPaths: string[];
};

type Metrics = Record<
  string,
  {
    inboundLinks: number;
    outboundLinks: number;
    importedBy: number;
    navDepth?: number;
    orphanNav?: boolean;
    orphanLinks?: boolean;
    hubScore?: number;
  }
>;

const INDEX_BASE = process.env.NEXT_PUBLIC_INDEX_BASE_URL || '/index';

async function fetchJson<T>(p: string): Promise<T> {
  const res = await fetch(`${INDEX_BASE}/${p}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${p}: ${res.status}`);
  return res.json();
}

export default function DashboardsPage() {
  const [nodes, setNodes] = useState<Node[] | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [n, m] = await Promise.all([fetchJson<Node[]>('nodes.json'), fetchJson<Metrics>('metrics.json')]);
        if (cancelled) return;
        setNodes(n);
        setMetrics(m);
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pages = useMemo(() => (nodes ? nodes.filter((n) => n.type === 'page') : []), [nodes]);
  const snippets = useMemo(() => (nodes ? nodes.filter((n) => n.type === 'snippet') : []), [nodes]);

  const navOrphans = useMemo(() => {
    if (!metrics) return [] as Node[];
    return pages
      .filter((n) => metrics[n.id]?.orphanNav)
      .sort((a, b) => (metrics[b.id]?.inboundLinks ?? 0) - (metrics[a.id]?.inboundLinks ?? 0));
  }, [pages, metrics]);

  const linkOrphans = useMemo(() => {
    if (!metrics) return [] as Node[];
    return pages
      .filter((n) => metrics[n.id]?.orphanLinks)
      .sort((a, b) => (metrics[a.id]?.outboundLinks ?? 0) - (metrics[b.id]?.outboundLinks ?? 0));
  }, [pages, metrics]);

  const topHubs = useMemo(() => {
    if (!metrics) return [] as Node[];
    return [...pages]
      .sort((a, b) => (metrics[b.id]?.inboundLinks ?? 0) - (metrics[a.id]?.inboundLinks ?? 0))
      .slice(0, 50);
  }, [pages, metrics]);

  const topSnippets = useMemo(() => {
    if (!metrics) return [] as Node[];
    return [...snippets]
      .sort((a, b) => (metrics[b.id]?.importedBy ?? 0) - (metrics[a.id]?.importedBy ?? 0))
      .slice(0, 50);
  }, [snippets, metrics]);

  function renderNodeRow(n: Node) {
    const m = metrics?.[n.id];
    return (
      <div
        key={n.id}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          border: '1px solid #eee',
          borderRadius: 10,
          padding: 10
        }}
      >
        <a href={`/explain?id=${encodeURIComponent(n.id)}`} style={{ fontWeight: 650 }}>
          {n.title || n.filePath}
        </a>
        <div style={{ fontSize: 12, color: '#666' }}>
          <code>{n.filePath}</code>
        </div>
        {m ? (
          <div style={{ fontSize: 12, color: '#444' }}>
            inbound: <b>{m.inboundLinks}</b> · outbound: <b>{m.outboundLinks}</b> · importedBy: <b>{m.importedBy}</b> · inNav:{' '}
            <b>{n.navPaths?.length ? 'yes' : 'no'}</b>
          </div>
        ) : null}
        {n.navPaths?.length ? <div style={{ fontSize: 12, color: '#666' }}>{n.navPaths[0]}</div> : null}
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ color: '#b00020' }}>
        Failed to load index from <code>{INDEX_BASE}</code>
        <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{err}</div>
      </div>
    );
  }

  if (!nodes || !metrics) return <div>Loading…</div>;

  return (
    <div style={{ maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <a href="/" style={{ fontSize: 13 }}>
          ← Back to search
        </a>
      </div>

      <div>
        <div style={{ fontWeight: 800, fontSize: 20 }}>Dashboards</div>
        <div style={{ fontSize: 13, color: '#555', marginTop: 6 }}>
          These are index-derived IA + maintenance views. English-only.
        </div>
      </div>

      <section>
        <h3 style={{ margin: '6px 0' }}>Top hubs (pages with most inbound links)</h3>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          Use this to identify “foundation” pages that deserve extra correctness and IA care.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>{topHubs.map(renderNodeRow)}</div>
      </section>

      <section>
        <h3 style={{ margin: '6px 0' }}>Top snippets/components by blast radius</h3>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          Snippets/components are high leverage; changes here affect many pages.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>{topSnippets.map(renderNodeRow)}</div>
      </section>

      <section>
        <h3 style={{ margin: '6px 0' }}>Nav orphans (pages not in docs.json nav)</h3>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          These may be legitimate deep links, legacy content, or missing IA integration.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>{navOrphans.slice(0, 200).map(renderNodeRow)}</div>
        {navOrphans.length > 200 ? (
          <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
            Showing first 200 of {navOrphans.length}.
          </div>
        ) : null}
      </section>

      <section>
        <h3 style={{ margin: '6px 0' }}>Link orphans (0 inbound links)</h3>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          Often undiscoverable. Some will be intentional.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>{linkOrphans.slice(0, 200).map(renderNodeRow)}</div>
        {linkOrphans.length > 200 ? (
          <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
            Showing first 200 of {linkOrphans.length}.
          </div>
        ) : null}
      </section>
    </div>
  );
}
