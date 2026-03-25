'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  History,
  ClipboardCheck,
  Search,
  GitPullRequest,
  GitBranch,
  Trash2,
  ExternalLink,
  Clock,
  Filter,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useActivityHistory, ActivityType, ActivityItem } from '@/hooks/use-activity-history';

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

function getActivityIcon(type: ActivityType) {
  switch (type) {
    case 'audit':
      return ClipboardCheck;
    case 'explain':
      return Search;
    case 'pr-review':
      return GitPullRequest;
    case 'refactor':
      return GitBranch;
    case 'search':
      return Search;
    default:
      return History;
  }
}

function getActivityColor(type: ActivityType): string {
  switch (type) {
    case 'audit':
      return 'bg-green-500/10 text-green-600 border-green-500/20';
    case 'explain':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'pr-review':
      return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    case 'refactor':
      return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    case 'search':
      return 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20';
    default:
      return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
  }
}

function getActivityLink(item: ActivityItem): string | undefined {
  switch (item.type) {
    case 'audit':
      return item.url ? `/audit?url=${encodeURIComponent(item.url)}` : undefined;
    case 'explain':
      return item.metadata?.nodeId ? `/explain?id=${encodeURIComponent(item.metadata.nodeId)}` : undefined;
    case 'pr-review':
      return item.url ? `/pr-review?url=${encodeURIComponent(item.url)}` : undefined;
    case 'refactor':
      return item.metadata?.nodeId ? `/refactor?id=${encodeURIComponent(item.metadata.nodeId)}` : undefined;
    default:
      return undefined;
  }
}

function ActivityCard({ item, onRemove }: { item: ActivityItem; onRemove: () => void }) {
  const Icon = getActivityIcon(item.type);
  const link = getActivityLink(item);

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
      <div className={`p-2 rounded-lg ${getActivityColor(item.type)}`}>
        <Icon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className={`text-xs ${getActivityColor(item.type)}`}>
            {item.type}
          </Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTimeAgo(item.timestamp)}
          </span>
        </div>
        <div className="font-medium truncate">{item.title}</div>
        {item.description && (
          <div className="text-sm text-muted-foreground truncate">{item.description}</div>
        )}
        {item.filePath && (
          <div className="text-xs font-mono text-muted-foreground mt-1 truncate">
            {item.filePath}
          </div>
        )}
      </div>

      <div className="flex gap-1">
        {link && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={link}>
              <ExternalLink className="w-4 h-4" />
            </Link>
          </Button>
        )}
        {item.url && item.url.startsWith('http') && (
          <Button variant="ghost" size="sm" asChild>
            <a href={item.url} target="_blank" rel="noreferrer">
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const { history, clearHistory, clearByType, removeItem, getByType } = useActivityHistory();
  const [activeTab, setActiveTab] = useState('all');

  const filteredHistory = useMemo(() => {
    if (activeTab === 'all') return history;
    return getByType(activeTab as ActivityType);
  }, [history, activeTab, getByType]);

  const activityCounts = useMemo(() => ({
    all: history.length,
    audit: getByType('audit').length,
    explain: getByType('explain').length,
    'pr-review': getByType('pr-review').length,
    refactor: getByType('refactor').length,
    search: getByType('search').length,
  }), [history, getByType]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, ActivityItem[]> = {};
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    filteredHistory.forEach(item => {
      const date = new Date(item.timestamp).toDateString();
      let label = date;
      if (date === today) label = 'Today';
      else if (date === yesterday) label = 'Yesterday';

      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });

    return groups;
  }, [filteredHistory]);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <History className="w-8 h-8" />
              Activity History
            </h1>
            <p className="text-muted-foreground mt-1">
              Your recent audits, searches, and actions
            </p>
          </div>

          {history.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Trash2 className="w-4 h-4" />
                  Clear All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {history.length} items from your activity history.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={clearHistory}>Clear All</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex-wrap h-auto">
            <TabsTrigger value="all" className="gap-1.5">
              <Filter className="w-4 h-4" />
              All ({activityCounts.all})
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <ClipboardCheck className="w-4 h-4" />
              Audits ({activityCounts.audit})
            </TabsTrigger>
            <TabsTrigger value="explain" className="gap-1.5">
              <Search className="w-4 h-4" />
              Explored ({activityCounts.explain})
            </TabsTrigger>
            <TabsTrigger value="pr-review" className="gap-1.5">
              <GitPullRequest className="w-4 h-4" />
              PR Reviews ({activityCounts['pr-review']})
            </TabsTrigger>
            <TabsTrigger value="refactor" className="gap-1.5">
              <GitBranch className="w-4 h-4" />
              Refactors ({activityCounts.refactor})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            {filteredHistory.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No activity recorded yet</p>
                  <p className="text-sm mt-2">
                    Your audits, page explorations, and other actions will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedByDate).map(([date, items]) => (
                  <div key={date}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">{date}</h3>
                    <div className="space-y-2">
                      {items.map(item => (
                        <ActivityCard
                          key={item.id}
                          item={item}
                          onRemove={() => removeItem(item.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Quick Stats */}
        {history.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Activity Summary</CardTitle>
              <CardDescription>Your usage over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-3 rounded-lg bg-green-500/10">
                  <div className="text-2xl font-bold text-green-600">{activityCounts.audit}</div>
                  <div className="text-xs text-muted-foreground">Audits</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-500/10">
                  <div className="text-2xl font-bold text-blue-600">{activityCounts.explain}</div>
                  <div className="text-xs text-muted-foreground">Pages Explored</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-purple-500/10">
                  <div className="text-2xl font-bold text-purple-600">{activityCounts['pr-review']}</div>
                  <div className="text-xs text-muted-foreground">PR Reviews</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-orange-500/10">
                  <div className="text-2xl font-bold text-orange-600">{activityCounts.refactor}</div>
                  <div className="text-xs text-muted-foreground">Refactors</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-500/10">
                  <div className="text-2xl font-bold">{activityCounts.all}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
