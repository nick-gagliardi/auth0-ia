import { useQuery } from '@tanstack/react-query';
import type { DocNode, Metrics, EdgeMap, Summary } from '@/types';

const INDEX_BASE = '/index';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${INDEX_BASE}/${path}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

export function useNodes() {
  return useQuery({ queryKey: ['nodes'], queryFn: () => fetchJson<DocNode[]>('nodes.json'), staleTime: Infinity });
}

export function useMetrics() {
  return useQuery({ queryKey: ['metrics'], queryFn: () => fetchJson<Metrics>('metrics.json'), staleTime: Infinity });
}

export function useEdgesInbound() {
  return useQuery({ queryKey: ['edges_inbound'], queryFn: () => fetchJson<EdgeMap>('edges_inbound.json'), staleTime: Infinity });
}

export function useEdgesOutbound() {
  return useQuery({ queryKey: ['edges_outbound'], queryFn: () => fetchJson<EdgeMap>('edges_outbound.json'), staleTime: Infinity });
}

export function useSummary() {
  return useQuery({ queryKey: ['summary'], queryFn: () => fetchJson<Summary>('summary.json'), staleTime: Infinity });
}
