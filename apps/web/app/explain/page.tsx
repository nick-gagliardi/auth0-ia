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

type EdgeMap = Record<string, { link: string[]; import: string[]; redirect: string[] }>;

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

function useQueryParam(name: string) {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    setValue(url.searchParams.get(name));
  }, [name]);
  return value;
}

export default function ExplainPage() {
  const id = useQueryParam('id');
  const [nodes, setNodes] = useState<Node[] | null>(null);
  const [inbound, setInbound] = useState<EdgeMap | null>(null);
  const [outbound, setOutbound] = useState<EdgeMap | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [n, i, o, m] = await Promise.all([
          fetchJson<Node[]>('nodes.json'),
          fetchJson<EdgeMap>('edges_inbound.json'),
          fetchJson<EdgeMap>('edges_outbound.json'),
          fetchJson<Metrics>('metrics.json')
        ]);
        if (cancelled) return;
        setNodes(n);
        setInbound(i);
        setOutbound(o);
        setMetrics(m);
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const node = useMemo(() => {
    if (!nodes || !id) return null;
    return nodes.find((n) => n.id === id) || null;
  }, [nodes, id]);

  function nodeLabel(nodeId: string): string {
    const n = nodes?.find((x) => x.id === nodeId);
    if (!n) return nodeId;
    return n.title ? `${n.title} (${n.filePath})` : n.filePath;
  }

  if (err) {
    return (
      <div style={{ color: '#b00020' }}>
        Failed to load index from <code>{INDEX_BASE}</code>
        <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{err}</div>
      </div>
    );
  }

  if (!nodes || !inbound || !outbound || !metrics) return <div>Loading…</div>;

  if (!id) return <div>Missing <code>?id=</code></div>;

  if (!node) {
    return (
      <div>
        Node not found: <code>{id}</code>
      </div>
    );
  }

  const m = metrics[node.id];
  const inE = inbound[node.id] || { link: [], import: [], redirect: [] };
  const outE = outbound[node.id] || { link: [], import: [], redirect: [] };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1000 }}>
      <div>
        <a href="/" style={{ fontSize: 13 }}>
          ← Back to search
        </a>
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{node.title || node.filePath}</div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
          <code>{node.id}</code>
        </div>
        <div style={{ fontSize: 13, color: '#444', marginTop: 10 }}>
          inbound links: <b>{m?.inboundLinks ?? 0}</b> · outbound links: <b>{m?.outboundLinks ?? 0}</b> · imported by: <b>{m?.importedBy ?? 0}</b>
        </div>
        {node.navPaths?.length ? (
          <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
            Nav:
            <ul>
              {node.navPaths.slice(0, 5).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 700 }}>Inbound</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <div>
              <b>Links ({inE.link.length})</b>
            </div>
            <ul>
              {inE.link.slice(0, 50).map((x) => (
                <li key={x}>
                  <a href={`/explain?id=${encodeURIComponent(x)}`}>{nodeLabel(x)}</a>
                </li>
              ))}
            </ul>
            <div>
              <b>Imports ({inE.import.length})</b>
            </div>
            <ul>
              {inE.import.slice(0, 50).map((x) => (
                <li key={x}>
                  <a href={`/explain?id=${encodeURIComponent(x)}`}>{nodeLabel(x)}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 700 }}>Outbound</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <div>
              <b>Links ({outE.link.length})</b>
            </div>
            <ul>
              {outE.link.slice(0, 50).map((x) => (
                <li key={x}>
                  <a href={`/explain?id=${encodeURIComponent(x)}`}>{nodeLabel(x)}</a>
                </li>
              ))}
            </ul>
            <div>
              <b>Imports ({outE.import.length})</b>
            </div>
            <ul>
              {outE.import.slice(0, 50).map((x) => (
                <li key={x}>
                  <a href={`/explain?id=${encodeURIComponent(x)}`}>{nodeLabel(x)}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
