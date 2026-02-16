import { useQuery } from '@tanstack/react-query';
import type { IndexBundle } from '@/types';

const INDEX_BASE = process.env.NEXT_PUBLIC_INDEX_BASE_URL || '/index';
const DEMO_INDEX_BASE = '/index/demo';

async function fetchJson<T>(path: string, base: string = INDEX_BASE): Promise<T> {
  const res = await fetch(`${base}/${path}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

export function useIndexBundle() {
  return useQuery({
    queryKey: ['index_bundle'],
    queryFn: async () => {
      try {
        return await fetchJson<IndexBundle>('index.json');
      } catch {
        // Fallback to demo data if real index fails
        return await fetchJson<IndexBundle>('index.json', DEMO_INDEX_BASE);
      }
    },
    staleTime: Infinity,
  });
}

// Hook to check if we're using demo data
export function useIsDemoMode(): boolean {
  const { data, error } = useIndexBundle();
  if (!data && !error) return false; // Still loading
  
  // Check if the data source indicates demo mode
  return data?.summary?.source?.ref === 'demo' || 
         data?.summary?.source?.gitSha?.startsWith('demo-mode') ||
         false;
}
