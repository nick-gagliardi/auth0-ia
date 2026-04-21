'use client';

import { useMemo, useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Eye, EyeOff, X } from 'lucide-react';
import type { DocNode, Metrics, EdgeMap, GraphHeatmapNode } from '@/types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SiteGraphProps {
  nodes: DocNode[];
  metrics: Metrics;
  edgesOutbound: EdgeMap;
  pageViews: { path: string; views: number }[];
  unhelpfulPages: { path: string; unhelpful: number; total: number }[];
}

type Scope = 'top100' | 'flagged' | 'all';

interface TooltipData {
  node: GraphHeatmapNode;
  x: number;
  y: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normPath(p: string): string {
  return p
    .replace(/^\/docs\//, '')
    .replace(/^docs\//, '')
    .replace(/^main\/docs\//, '')
    .replace(/\.mdx$/, '')
    .replace(/\/index$/, '')
    .replace(/^\/+/, '')
    .toLowerCase();
}

/** Map helpfulness ratio [0..1] to a hex colour: green → yellow → red */
function helpfulnessColor(ratio: number | null): string {
  if (ratio === null) return '#94a3b8'; // slate-400 — no data
  // ratio: 0 = all unhelpful (red), 1 = all helpful (green)
  const helpful = 1 - ratio; // invert: high unhelpful = red
  if (helpful <= 0.5) {
    // green → yellow
    const t = helpful / 0.5;
    const r = Math.round(34 + t * (234 - 34));
    const g = Math.round(197 + t * (179 - 197));
    const b = Math.round(94 + t * (8 - 94));
    return `rgb(${r},${g},${b})`;
  }
  // yellow → red
  const t = (helpful - 0.5) / 0.5;
  const r = Math.round(234 + t * (239 - 234));
  const g = Math.round(179 - t * 179);
  const b = Math.round(8 - t * 8);
  return `rgb(${r},${g},${b})`;
}

function buildGraphData(
  props: SiteGraphProps,
  scope: Scope,
  showOrphans: boolean,
  showDeadEnds: boolean,
): { graphNodes: GraphHeatmapNode[]; flowNodes: Node[]; flowEdges: Edge[] } {
  const viewMap = new Map(props.pageViews.map((p) => [normPath(p.path), p.views]));
  const unhelpMap = new Map(
    props.unhelpfulPages.map((p) => [
      normPath(p.path),
      p.total > 0 ? p.unhelpful / p.total : null,
    ]),
  );

  // Build GraphHeatmapNode array
  let graphNodes: GraphHeatmapNode[] = props.nodes.map((n) => {
    const m = props.metrics[n.id];
    const np = normPath(n.filePath);
    return {
      id: n.id,
      title: n.title || n.filePath.split('/').pop()?.replace('.mdx', '') || n.id,
      path: n.filePath,
      views: viewMap.get(np) ?? 0,
      helpfulnessRatio: unhelpMap.get(np) ?? null,
      hubScore: m?.hubScore ?? 0,
      deadEnd: m?.deadEnd ?? false,
      orphan: m?.orphanTrue ?? false,
      navDepth: m?.navDepth ?? 99,
    };
  });

  // Apply scope filter
  if (scope === 'top100') {
    graphNodes.sort((a, b) => b.views - a.views);
    graphNodes = graphNodes.slice(0, 100);
  } else if (scope === 'flagged') {
    graphNodes = graphNodes.filter(
      (n) =>
        n.orphan ||
        n.deadEnd ||
        (n.helpfulnessRatio !== null && n.helpfulnessRatio > 0.3) ||
        n.hubScore > 5,
    );
  }

  // Apply visibility filters
  if (!showOrphans) graphNodes = graphNodes.filter((n) => !n.orphan);
  if (!showDeadEnds) graphNodes = graphNodes.filter((n) => !n.deadEnd);

  const nodeIds = new Set(graphNodes.map((n) => n.id));
  const maxViews = Math.max(1, ...graphNodes.map((n) => n.views));

  // Layout: grid with navDepth-influenced Y position
  const cols = Math.ceil(Math.sqrt(graphNodes.length));
  const spacing = 200;

  const flowNodes: Node[] = graphNodes.map((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const size = 30 + Math.round((n.views / maxViews) * 70); // 30-100px

    return {
      id: n.id,
      position: { x: col * spacing, y: row * spacing },
      data: { label: n.title, graphNode: n },
      style: {
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: helpfulnessColor(n.helpfulnessRatio),
        border: n.orphan
          ? '3px dashed #ef4444'
          : n.deadEnd
            ? '3px solid #ef4444'
            : n.hubScore > 5
              ? '3px solid #3b82f6'
              : '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '9px',
        color: '#1e293b',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        cursor: 'pointer',
        padding: '4px',
        textAlign: 'center' as const,
        lineHeight: '1.1',
      },
    };
  });

  // Build edges — only between nodes in scope
  const flowEdges: Edge[] = [];
  for (const gn of graphNodes) {
    const outbound = props.edgesOutbound[gn.id];
    if (!outbound) continue;
    const targets = [...(outbound.link || []), ...(outbound.import || [])];
    for (const targetId of targets) {
      if (!nodeIds.has(targetId) || targetId === gn.id) continue;
      flowEdges.push({
        id: `${gn.id}-${targetId}`,
        source: gn.id,
        target: targetId,
        style: { stroke: '#cbd5e1', strokeWidth: 1 },
        animated: false,
      });
    }
  }

  return { graphNodes, flowNodes, flowEdges };
}

// ── Component ────────────────────────────────────────────────────────────────

export function SiteGraphHeatmap(props: SiteGraphProps) {
  const [scope, setScope] = useState<Scope>('top100');
  const [showOrphans, setShowOrphans] = useState(true);
  const [showDeadEnds, setShowDeadEnds] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const { graphNodes, flowNodes: initialNodes, flowEdges: initialEdges } = useMemo(
    () => buildGraphData(props, scope, showOrphans, showDeadEnds),
    [props, scope, showOrphans, showDeadEnds],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when scope/filters change
  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      const gn = graphNodes.find((g) => g.id === node.id);
      if (!gn) return;
      setTooltip({
        node: gn,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [graphNodes],
  );

  const closeTooltip = useCallback(() => setTooltip(null), []);

  if (props.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[500px] text-muted-foreground">
        No index data available. Run the indexer first.
      </div>
    );
  }

  return (
    <div className="relative w-full h-[600px] border rounded-lg overflow-hidden bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={closeTooltip}
        fitView
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={40} size={1} />
        <Controls position="bottom-left" />
        <MiniMap
          nodeColor={(n) => {
            const gn = n.data?.graphNode as GraphHeatmapNode | undefined;
            return gn ? helpfulnessColor(gn.helpfulnessRatio) : '#94a3b8';
          }}
          style={{ height: 100, width: 150 }}
        />

        {/* Controls panel */}
        <Panel position="top-left" className="flex items-center gap-2 flex-wrap">
          <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <SelectTrigger className="w-[180px] h-8 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top100">Top 100 by traffic</SelectItem>
              <SelectItem value="flagged">Flagged pages only</SelectItem>
              <SelectItem value="all">All pages</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={showOrphans ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => setShowOrphans(!showOrphans)}
          >
            {showOrphans ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            Orphans
          </Button>
          <Button
            variant={showDeadEnds ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => setShowDeadEnds(!showDeadEnds)}
          >
            {showDeadEnds ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            Dead Ends
          </Button>

          <Badge variant="secondary" className="text-xs">
            {graphNodes.length} nodes
          </Badge>
        </Panel>

        {/* Legend */}
        <Panel position="top-right">
          <div className="bg-background/90 border rounded-lg p-2 text-xs space-y-1">
            <div className="font-medium mb-1">Legend</div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
              Helpful
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ background: '#eab308' }} />
              Mixed
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
              Unhelpful
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ background: '#94a3b8' }} />
              No data
            </div>
            <hr className="my-1" />
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full"
                style={{ border: '2px dashed #ef4444' }}
              />
              Orphan
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full"
                style={{ border: '2px solid #ef4444' }}
              />
              Dead end
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full"
                style={{ border: '2px solid #3b82f6' }}
              />
              Hub
            </div>
            <div className="text-muted-foreground mt-1">Size = traffic volume</div>
          </div>
        </Panel>
      </ReactFlow>

      {/* Tooltip card */}
      {tooltip && (
        <Card
          className="absolute z-50 w-72 shadow-lg"
          style={{
            left: Math.min(tooltip.x, window.innerWidth - 300),
            top: Math.min(tooltip.y - 200, window.innerHeight - 300),
            position: 'fixed',
          }}
        >
          <CardContent className="p-3 space-y-2">
            <div className="flex items-start justify-between">
              <span className="font-semibold text-sm leading-tight">
                {tooltip.node.title}
              </span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={closeTooltip}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <code className="text-xs text-muted-foreground block">{tooltip.node.path}</code>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground">Views</span>
              <span className="font-medium">{tooltip.node.views.toLocaleString()}</span>
              <span className="text-muted-foreground">Unhelpful %</span>
              <span className="font-medium">
                {tooltip.node.helpfulnessRatio !== null
                  ? `${(tooltip.node.helpfulnessRatio * 100).toFixed(0)}%`
                  : '—'}
              </span>
              <span className="text-muted-foreground">Hub score</span>
              <span className="font-medium">{tooltip.node.hubScore.toFixed(1)}</span>
              <span className="text-muted-foreground">Nav depth</span>
              <span className="font-medium">
                {tooltip.node.navDepth < 99 ? tooltip.node.navDepth : '—'}
              </span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {tooltip.node.orphan && (
                <Badge variant="destructive" className="text-[10px]">
                  Orphan
                </Badge>
              )}
              {tooltip.node.deadEnd && (
                <Badge variant="destructive" className="text-[10px]">
                  Dead End
                </Badge>
              )}
              {tooltip.node.hubScore > 5 && (
                <Badge className="text-[10px]">Hub</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
