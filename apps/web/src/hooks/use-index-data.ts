import { useQuery } from '@tanstack/react-query';
import type { DocNode, Metrics, EdgeMap, Summary, SimilarityIndex, CrossNavPairs, ShadowHubs } from '@/types';

const INDEX_BASE = process.env.NEXT_PUBLIC_INDEX_BASE_URL || '/index';

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

export function useSimilarity() {
  return useQuery({ queryKey: ['similarity'], queryFn: () => fetchJson<SimilarityIndex>('similarity.json'), staleTime: Infinity });
}

export function useCrossNavPairs() {
  return useQuery({ queryKey: ['cross_nav_pairs'], queryFn: () => fetchJson<CrossNavPairs>('cross_nav_pairs.json'), staleTime: Infinity });
}

export function useShadowHubs() {
  return useQuery({ queryKey: ['shadow_hubs'], queryFn: () => fetchJson<ShadowHubs>('shadow_hubs.json'), staleTime: Infinity });
}
