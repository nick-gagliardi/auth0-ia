import type { InsightType } from '@/types';

/** Badge variant for severity level */
export function severityVariant(s: string): 'destructive' | 'default' | 'secondary' | 'outline' {
  switch (s) {
    case 'high': return 'destructive';
    case 'medium': return 'default';
    case 'low': return 'secondary';
    default: return 'outline';
  }
}

/** Tailwind border class for severity (left-border cards) */
export function severityBorder(s: string): string {
  switch (s) {
    case 'high': return 'border-l-4 border-l-destructive';
    case 'medium': return 'border-l-4 border-l-orange-400';
    case 'low': return 'border-l-4 border-l-blue-300';
    default: return '';
  }
}

/** Category badge colors */
export function categoryColor(c: string): string {
  switch (c) {
    case 'content-gap': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'clarity': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'accuracy': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'navigation': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    case 'code-example': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'structure': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
}

/** Insight type display label */
export function insightTypeLabel(type: InsightType): string {
  switch (type) {
    case 'orphan-traffic': return 'Orphan Traffic';
    case 'high-traffic-low-helpfulness': return 'Low Helpfulness';
    case 'dead-end-traffic': return 'Dead End';
    case 'convergence-point': return 'Convergence Point';
    case 'content-gap': return 'Content Gap';
    case 'unlinked-high-search': return 'Unlinked Search';
    case 'shadow-hub-traffic': return 'Shadow Hub';
    case 'cross-nav-friction': return 'Cross-Nav Friction';
    default: return type;
  }
}
