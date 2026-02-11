import { useQuery } from '@tanstack/react-query';
import type { IndexBundle } from '@/types';

const INDEX_BASE = process.env.NEXT_PUBLIC_INDEX_BASE_URL || '/index';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${INDEX_BASE}/${path}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

export function useIndexBundle() {
  return useQuery({
    queryKey: ['index_bundle'],
    queryFn: () => fetchJson<IndexBundle>('index.json'),
    staleTime: Infinity,
  });
}
