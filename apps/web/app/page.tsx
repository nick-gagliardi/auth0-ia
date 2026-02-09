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

export default function HomePage() {
  const [query, setQuery] = useState('');
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

  const results = useMemo(() => {
    if (!nodes || !metrics) return [] as (Node & { score: number })[];
    const q = query.trim().toLowerCase();
    const hay = nodes.filter((n) => n.type === 'page');
    if (!q) {
      // default: top hubs
      return [...hay]
        .map((n) => ({ ...n, score: metrics[n.id]?.inboundLinks ?? 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 30);
    }

    const out: (Node & { score: number })[] = [];
    for (const n of hay) {
      const title = (n.title || '').toLowerCase();
      const path = n.filePath.toLowerCase();
      const permalink = (n.permalink || '').toLowerCase();
      const nav = (n.navPaths || []).join(' | ').toLowerCase();
      if (title.includes(q) || path.includes(q) || permalink.includes(q) || nav.includes(q)) {
        // crude scoring: prefer title match + higher inbound
        const score = (title.includes(q) ? 1000 : 0) + (metrics[n.id]?.inboundLinks ?? 0);
        out.push({ ...n, score });
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 50);
  }, [nodes, metrics, query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Search pages</div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try: pkce, universal login, actions, refresh token"
          style={{ width: '100%', padding: 12, fontSize: 14, border: '1px solid #ddd', borderRadius: 8 }}
        />
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          Index source: <code>{INDEX_BASE}</code> (set via <code>NEXT_PUBLIC_INDEX_BASE_URL</code>)
        </div>
      </div>

      {err ? (
        <div style={{ color: '#b00020' }}>
          Failed to load index. You probably need to host <code>nodes.json</code> + <code>metrics.json</code> at{' '}
          <code>{INDEX_BASE}</code>.
          <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{err}</div>
        </div>
      ) : null}

      {!nodes || !metrics ? <div>Loading index…</div> : null}

      {nodes && metrics ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 600 }}>{query.trim() ? 'Matches' : 'Top hubs (by inbound links)'}</div>
            <div style={{ fontSize: 12, color: '#666' }}>{results.length} results</div>
          </div>

          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((n) => {
              const m = metrics[n.id];
              const href = `/explain?id=${encodeURIComponent(n.id)}`;
              return (
                <a
                  key={n.id}
                  href={href}
                  style={{
                    textDecoration: 'none',
                    color: 'inherit',
                    border: '1px solid #eee',
                    borderRadius: 10,
                    padding: 12
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{n.title || n.filePath}</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    <code>{n.filePath}</code>
                  </div>
                  <div style={{ fontSize: 12, color: '#444', marginTop: 6 }}>
                    inbound links: <b>{m?.inboundLinks ?? 0}</b> · outbound links: <b>{m?.outboundLinks ?? 0}</b> · in nav:{' '}
                    <b>{n.navPaths?.length ? 'yes' : 'no'}</b>
                  </div>
                  {n.navPaths?.length ? (
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{n.navPaths[0]}</div>
                  ) : null}
                </a>
              );
            })}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 20, fontSize: 12, color: '#666' }}>
        Next: add dashboards (orphans/top snippets) + weekly index publish.
      </div>
    </div>
  );
}
