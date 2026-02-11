import { useQuery } from '@tanstack/react-query';
import type {
  DocNode,
  Metrics,
  EdgeMap,
  Summary,
  SimilarityIndex,
  CrossNavPairs,
  ShadowHubs,
  RedirectIndex,
  LinkHrefIndex,
  DeadEndsIndex,
  JourneyMapsIndex,
  Auth0LintIndex,
  NavTree,
  NavPagesIndex,
  NavLabelCollisionsIndex,
  SnippetMigrationIndex,
} from '@/types';
import { useIndexBundle } from '@/hooks/use-index-bundle';

const INDEX_BASE = process.env.NEXT_PUBLIC_INDEX_BASE_URL || '/index';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${INDEX_BASE}/${path}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

// Prefer the single-file bundle when present; fall back to legacy per-file JSON.
export function useNodes() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['nodes'],
    queryFn: async () => (b.data?.nodes ?? fetchJson<DocNode[]>('nodes.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useMetrics() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['metrics'],
    queryFn: async () => (b.data?.metrics ?? fetchJson<Metrics>('metrics.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useEdgesInbound() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['edges_inbound'],
    queryFn: async () => (b.data?.edges?.inbound ?? fetchJson<EdgeMap>('edges_inbound.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useEdgesOutbound() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['edges_outbound'],
    queryFn: async () => (b.data?.edges?.outbound ?? fetchJson<EdgeMap>('edges_outbound.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useSummary() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['summary'],
    queryFn: async () => (b.data?.summary ?? fetchJson<Summary>('summary.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useSimilarity() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['similarity'],
    queryFn: async () => (b.data?.similarity ?? fetchJson<SimilarityIndex>('similarity.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useCrossNavPairs() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['cross_nav_pairs'],
    queryFn: async () => (b.data?.crossNavPairs ?? fetchJson<CrossNavPairs>('cross_nav_pairs.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useShadowHubs() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['shadow_hubs'],
    queryFn: async () => (b.data?.shadowHubs ?? fetchJson<ShadowHubs>('shadow_hubs.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useRedirects() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['redirects'],
    queryFn: async () => (b.data?.redirects ?? fetchJson<RedirectIndex>('redirects.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useAuth0Lint() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['auth0_lint'],
    queryFn: async () => (b.data?.auth0Lint ?? fetchJson<Auth0LintIndex>('auth0_lint.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useLinkHrefsOut() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['link_hrefs_outbound'],
    queryFn: async () => (b.data?.linkHrefsOut ?? fetchJson<LinkHrefIndex>('link_hrefs_outbound.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useSnippetMigration() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['snippet_migration'],
    queryFn: async () => (b.data?.snippetMigration ?? fetchJson<SnippetMigrationIndex>('snippet_migration.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useNavTree() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['nav_tree'],
    queryFn: async () => (b.data?.nav?.tree ?? fetchJson<NavTree>('nav_tree.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useNavPages() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['nav_pages'],
    queryFn: async () => (b.data?.nav?.pages ?? fetchJson<NavPagesIndex>('nav_pages.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useNavLabelCollisions() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['nav_label_collisions'],
    queryFn: async () => (b.data?.nav?.labelCollisions ?? fetchJson<NavLabelCollisionsIndex>('nav_label_collisions.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useDeadEnds() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['dead_ends'],
    queryFn: async () => (b.data?.deadEnds ?? fetchJson<DeadEndsIndex>('dead_ends.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}

export function useJourneyMaps() {
  const b = useIndexBundle();
  return useQuery({
    queryKey: ['journey_maps'],
    queryFn: async () => (b.data?.journeyMaps ?? fetchJson<JourneyMapsIndex>('journey_maps.json')),
    enabled: b.isSuccess || !b.isLoading,
    staleTime: Infinity,
  });
}
