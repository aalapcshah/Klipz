/**
 * Knowledge Graph Visualization Page
 * Interactive network visualization of tag relationships and file connections
 * Features: Clustering, relationship filtering, export (JSON/CSV)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Network,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  Filter,
  Tag,
  FileText,
  Link2,
  Globe,
  Database,
  BookOpen,
  Brain,
  Settings,
  Download,
  Share2,
  Loader2,
  Info,
  FolderTree,
  Layers,
  FileJson,
  FileSpreadsheet,
} from "lucide-react";
import { TagHierarchyManager } from "@/components/TagHierarchyManager";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

interface GraphNode {
  id: string;
  label: string;
  type: "tag" | "file" | "entity";
  source?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  size?: number;
  color?: string;
  fileCount?: number;
  confidence?: number;
  cluster?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
}

interface Cluster {
  id: number;
  nodes: string[];
  centerX: number;
  centerY: number;
  color: string;
  label: string;
}

const SOURCE_COLORS: Record<string, string> = {
  wikidata: "#3B82F6",
  dbpedia: "#22C55E",
  "schema.org": "#A855F7",
  llm: "#F59E0B",
  manual: "#6B7280",
  ai: "#EC4899",
};

const NODE_TYPE_COLORS: Record<string, string> = {
  tag: "#3B82F6",
  file: "#22C55E",
  entity: "#A855F7",
};

const CLUSTER_COLORS = [
  "#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16",
];

// Simple clustering algorithm based on edge connections
function clusterNodes(nodes: GraphNode[], edges: GraphEdge[], maxClusters: number = 10): Cluster[] {
  const adjacencyMap = new Map<string, Set<string>>();
  
  // Build adjacency map
  edges.forEach(edge => {
    if (!adjacencyMap.has(edge.source)) adjacencyMap.set(edge.source, new Set());
    if (!adjacencyMap.has(edge.target)) adjacencyMap.set(edge.target, new Set());
    adjacencyMap.get(edge.source)!.add(edge.target);
    adjacencyMap.get(edge.target)!.add(edge.source);
  });
  
  const visited = new Set<string>();
  const clusters: Cluster[] = [];
  
  // Find connected components
  nodes.forEach(node => {
    if (visited.has(node.id)) return;
    
    const clusterNodes: string[] = [];
    const queue = [node.id];
    
    while (queue.length > 0 && clusters.length < maxClusters) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      
      visited.add(current);
      clusterNodes.push(current);
      
      const neighbors = adjacencyMap.get(current) || new Set();
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      });
    }
    
    if (clusterNodes.length > 0) {
      clusters.push({
        id: clusters.length,
        nodes: clusterNodes,
        centerX: 0,
        centerY: 0,
        color: CLUSTER_COLORS[clusters.length % CLUSTER_COLORS.length],
        label: `Cluster ${clusters.length + 1}`,
      });
    }
  });
  
  return clusters;
}

export default function KnowledgeGraphPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showLabels, setShowLabels] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [showClusters, setShowClusters] = useState(false);
  const [minEdgeWeight, setMinEdgeWeight] = useState(0.3);
  const [nodeFilter, setNodeFilter] = useState<"all" | "tags" | "files" | "entities">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [relationshipTypeFilter, setRelationshipTypeFilter] = useState<"all" | "co-occurrence" | "semantic">("all");
  const [maxNodes, setMaxNodes] = useState(500);

  // Fetch graph data
  const { data: graphData, isLoading, refetch } = trpc.knowledgeGraph.getGraphData.useQuery(
    { includeFiles: true, minSimilarity: minEdgeWeight },
    { enabled: true }
  );

  const { data: stats } = trpc.knowledgeGraph.getStats.useQuery();

  // Export mutation
  const exportMutation = trpc.knowledgeGraph.exportGraphData.useMutation({
    onSuccess: (data) => {
      if (data.format === 'json' && data.data && data.filename) {
        // Download JSON file
        const blob = new Blob([data.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Graph exported as JSON');
      } else if (data.nodesData && data.edgesData && data.nodesFilename && data.edgesFilename) {
        // Download CSV files (nodes and edges)
        const nodesBlob = new Blob([data.nodesData], { type: 'text/csv' });
        const nodesUrl = URL.createObjectURL(nodesBlob);
        const nodesA = document.createElement('a');
        nodesA.href = nodesUrl;
        nodesA.download = data.nodesFilename;
        nodesA.click();
        URL.revokeObjectURL(nodesUrl);
        
        setTimeout(() => {
          const edgesBlob = new Blob([data.edgesData!], { type: 'text/csv' });
          const edgesUrl = URL.createObjectURL(edgesBlob);
          const edgesA = document.createElement('a');
          edgesA.href = edgesUrl;
          edgesA.download = data.edgesFilename!;
          edgesA.click();
          URL.revokeObjectURL(edgesUrl);
        }, 500);
        
        toast.success('Graph exported as CSV (2 files)');
      }
    },
    onError: (error) => {
      toast.error(`Export failed: ${error.message}`);
    },
  });

  const handleExport = (format: 'json' | 'csv') => {
    exportMutation.mutate({
      format,
      includeFiles: nodeFilter === 'all' || nodeFilter === 'files',
      minSimilarity: minEdgeWeight,
      relationshipType: relationshipTypeFilter,
    });
  };

  // Initialize nodes from graph data
  useEffect(() => {
    if (!graphData) return;

    const newNodes: GraphNode[] = [];
    const newEdges: GraphEdge[] = [];
    const nodeMap = new Map<string, GraphNode>();

    // Add nodes from graph data (tags and files are combined in nodes array)
    graphData.nodes?.forEach((nodeData: { id: string; type: string; label: string; weight?: number; metadata?: any }) => {
      const graphNode: GraphNode = {
        id: nodeData.id,
        label: nodeData.label,
        type: nodeData.type as "tag" | "file" | "entity",
        source: "internal",
        size: nodeData.type === "tag" ? Math.min(20 + (nodeData.weight || 1) * 3, 40) : 15,
        color: nodeData.type === "tag" ? NODE_TYPE_COLORS.tag : NODE_TYPE_COLORS.file,
      };
      newNodes.push(graphNode);
      nodeMap.set(graphNode.id, graphNode);
    });

    // Add edges
    graphData.edges?.forEach((edge: { source: string; target: string; weight: number; type: string }) => {
      if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
        newEdges.push({
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
          type: edge.type,
        });
      }
    });

    // Initialize positions using force-directed layout
    const width = containerRef.current?.clientWidth || 800;
    const height = containerRef.current?.clientHeight || 600;
    
    newNodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / newNodes.length;
      const radius = Math.min(width, height) * 0.3;
      node.x = width / 2 + radius * Math.cos(angle);
      node.y = height / 2 + radius * Math.sin(angle);
      node.vx = 0;
      node.vy = 0;
    });

    // Calculate clusters
    const newClusters = clusterNodes(newNodes, newEdges);
    
    // Assign cluster IDs to nodes
    newClusters.forEach(cluster => {
      cluster.nodes.forEach(nodeId => {
        const node = newNodes.find(n => n.id === nodeId);
        if (node) {
          node.cluster = cluster.id;
          if (showClusters) {
            node.color = cluster.color;
          }
        }
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
    setClusters(newClusters);
  }, [graphData, showClusters]);

  // Filter edges by relationship type
  const filteredEdges = useMemo(() => {
    if (relationshipTypeFilter === 'all') return edges;
    return edges.filter(e => e.type === relationshipTypeFilter);
  }, [edges, relationshipTypeFilter]);

  // Force-directed layout simulation
  useEffect(() => {
    if (nodes.length === 0) return;

    const simulate = () => {
      const width = containerRef.current?.clientWidth || 800;
      const height = containerRef.current?.clientHeight || 600;
      const centerX = width / 2;
      const centerY = height / 2;

      // Apply forces
      nodes.forEach((node) => {
        if (!node.x || !node.y) return;

        // Center gravity
        node.vx = (node.vx || 0) + (centerX - node.x) * 0.001;
        node.vy = (node.vy || 0) + (centerY - node.y) * 0.001;

        // Repulsion from other nodes
        nodes.forEach((other) => {
          if (node.id === other.id || !other.x || !other.y) return;
          const dx = node.x! - other.x;
          const dy = node.y! - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 500 / (dist * dist);
          node.vx! += (dx / dist) * force;
          node.vy! += (dy / dist) * force;
        });
      });

      // Apply edge forces (attraction)
      filteredEdges.forEach((edge) => {
        const source = nodes.find((n) => n.id === edge.source);
        const target = nodes.find((n) => n.id === edge.target);
        if (!source || !target || !source.x || !target.x || !source.y || !target.y) return;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 100) * 0.01 * edge.weight;

        source.vx! += (dx / dist) * force;
        source.vy! += (dy / dist) * force;
        target.vx! -= (dx / dist) * force;
        target.vy! -= (dy / dist) * force;
      });

      // Update positions with damping
      nodes.forEach((node) => {
        if (!node.x || !node.y) return;
        node.vx = (node.vx || 0) * 0.9;
        node.vy = (node.vy || 0) * 0.9;
        node.x += node.vx;
        node.y += node.vy;

        // Keep within bounds
        node.x = Math.max(50, Math.min(width - 50, node.x));
        node.y = Math.max(50, Math.min(height - 50, node.y));
      });

      setNodes([...nodes]);
      animationRef.current = requestAnimationFrame(simulate);
    };

    animationRef.current = requestAnimationFrame(simulate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [nodes.length, filteredEdges.length]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = containerRef.current?.clientWidth || 800;
    const height = containerRef.current?.clientHeight || 600;
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    // Apply zoom and offset
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    // Filter nodes
    let filteredNodes = nodes.filter((node) => {
      if (nodeFilter !== "all" && node.type !== nodeFilter.slice(0, -1)) return false;
      if (sourceFilter !== "all" && node.source !== sourceFilter) return false;
      if (searchQuery && !node.label.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });

    // Apply max nodes limit for performance
    if (filteredNodes.length > maxNodes) {
      // Sort by weight/importance and take top N
      filteredNodes = filteredNodes
        .sort((a, b) => (b.size || 15) - (a.size || 15))
        .slice(0, maxNodes);
    }

    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

    // Draw cluster backgrounds if enabled
    if (showClusters && clusters.length > 0) {
      clusters.forEach(cluster => {
        const clusterNodes = filteredNodes.filter(n => n.cluster === cluster.id);
        if (clusterNodes.length < 2) return;
        
        // Calculate cluster bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        clusterNodes.forEach(node => {
          if (node.x && node.y) {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x);
            maxY = Math.max(maxY, node.y);
          }
        });
        
        // Draw cluster background
        const padding = 40;
        ctx.beginPath();
        ctx.roundRect(minX - padding, minY - padding, maxX - minX + padding * 2, maxY - minY + padding * 2, 20);
        ctx.fillStyle = cluster.color + "15"; // 15% opacity
        ctx.fill();
        ctx.strokeStyle = cluster.color + "40";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw cluster label
        ctx.fillStyle = cluster.color;
        ctx.font = "bold 14px sans-serif";
        ctx.fillText(cluster.label, minX - padding + 10, minY - padding + 20);
      });
    }

    // Draw edges
    if (showEdges) {
      filteredEdges.forEach((edge) => {
        if (!filteredNodeIds.has(edge.source) || !filteredNodeIds.has(edge.target)) return;
        if (edge.weight < minEdgeWeight) return;

        const source = nodes.find((n) => n.id === edge.source);
        const target = nodes.find((n) => n.id === edge.target);
        if (!source || !target || !source.x || !target.x || !source.y || !target.y) return;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        
        // Color edges by type
        if (edge.type === 'co-occurrence') {
          ctx.strokeStyle = `rgba(59, 130, 246, ${edge.weight * 0.5})`; // Blue
        } else if (edge.type === 'semantic') {
          ctx.strokeStyle = `rgba(34, 197, 94, ${edge.weight * 0.5})`; // Green
        } else {
          ctx.strokeStyle = `rgba(100, 100, 100, ${edge.weight * 0.5})`;
        }
        ctx.lineWidth = edge.weight * 2;
        ctx.stroke();
      });
    }

    // Draw nodes
    filteredNodes.forEach((node) => {
      if (!node.x || !node.y) return;

      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;
      const size = node.size || 15;

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, size * (isHovered ? 1.2 : 1), 0, Math.PI * 2);
      ctx.fillStyle = node.color || "#666";
      ctx.fill();

      if (isSelected || isHovered) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Node label
      if (showLabels || isHovered) {
        ctx.fillStyle = "#fff";
        ctx.font = `${isHovered ? "bold " : ""}12px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(node.label, node.x, node.y + size + 15);
      }
    });

    ctx.restore();
  }, [nodes, filteredEdges, selectedNode, hoveredNode, zoom, offset, showLabels, showEdges, showClusters, minEdgeWeight, nodeFilter, sourceFilter, searchQuery, clusters, maxNodes]);

  // Mouse event handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / zoom;
    const y = (e.clientY - rect.top - offset.y) / zoom;

    if (isDragging) {
      setOffset({
        x: offset.x + (e.clientX - dragStart.x),
        y: offset.y + (e.clientY - dragStart.y),
      });
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Check for node hover
    const hovered = nodes.find((node) => {
      if (!node.x || !node.y) return false;
      const dx = x - node.x;
      const dy = y - node.y;
      return Math.sqrt(dx * dx + dy * dy) < (node.size || 15);
    });

    setHoveredNode(hovered || null);
  }, [nodes, zoom, offset, isDragging, dragStart]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hoveredNode) {
      setSelectedNode(hoveredNode);
    } else {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  }, [hoveredNode]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.1, Math.min(5, z * delta)));
  }, []);

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setSelectedNode(null);
  };

  const [activeTab, setActiveTab] = useState<"graph" | "hierarchy">("graph");

  // Count edges by type
  const edgeTypeCounts = useMemo(() => {
    const counts = { 'co-occurrence': 0, 'semantic': 0, 'other': 0 };
    edges.forEach(e => {
      if (e.type === 'co-occurrence') counts['co-occurrence']++;
      else if (e.type === 'semantic') counts['semantic']++;
      else counts['other']++;
    });
    return counts;
  }, [edges]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <Network className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Knowledge Graph</h1>
            <p className="text-sm text-muted-foreground">
              Explore relationships between tags, files, and entities
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "graph" | "hierarchy")}>
            <TabsList>
              <TabsTrigger value="graph" className="gap-2">
                <Network className="h-4 w-4" />
                Graph View
              </TabsTrigger>
              <TabsTrigger value="hierarchy" className="gap-2">
                <FolderTree className="h-4 w-4" />
                Tag Hierarchy
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={exportMutation.isPending}>
                {exportMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('json')}>
                <FileJson className="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('csv')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {activeTab === "hierarchy" ? (
        <div className="flex-1 p-6 overflow-auto">
          <TagHierarchyManager />
        </div>
      ) : (
      <div className="flex-1 flex">
        {/* Sidebar */}
        <div className="w-80 border-r p-4 space-y-4 overflow-y-auto">
          {/* Search */}
          <div className="space-y-2">
            <Label>Search Nodes</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tags, files, entities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-2">
            <Label>Node Type</Label>
            <Select value={nodeFilter} onValueChange={(v: "all" | "tags" | "files" | "entities") => setNodeFilter(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="tags">Tags Only</SelectItem>
                <SelectItem value="files">Files Only</SelectItem>
                <SelectItem value="entities">Entities Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Relationship Type</Label>
            <Select value={relationshipTypeFilter} onValueChange={(v: "all" | "co-occurrence" | "semantic") => setRelationshipTypeFilter(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All Types ({edges.length})
                </SelectItem>
                <SelectItem value="co-occurrence">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    Co-occurrence ({edgeTypeCounts['co-occurrence']})
                  </div>
                </SelectItem>
                <SelectItem value="semantic">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    Semantic ({edgeTypeCounts['semantic']})
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Knowledge Source</Label>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="wikidata">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-500" />
                    Wikidata
                  </div>
                </SelectItem>
                <SelectItem value="dbpedia">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-green-500" />
                    DBpedia
                  </div>
                </SelectItem>
                <SelectItem value="schema.org">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-purple-500" />
                    Schema.org
                  </div>
                </SelectItem>
                <SelectItem value="llm">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-amber-500" />
                    AI Generated
                  </div>
                </SelectItem>
                <SelectItem value="manual">Manual Tags</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Display Options */}
          <div className="space-y-4 pt-4 border-t">
            <Label className="text-base font-semibold">Display Options</Label>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="show-labels">Show Labels</Label>
              <Switch
                id="show-labels"
                checked={showLabels}
                onCheckedChange={setShowLabels}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="show-edges">Show Connections</Label>
              <Switch
                id="show-edges"
                checked={showEdges}
                onCheckedChange={setShowEdges}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="show-clusters">Show Clusters</Label>
              <Switch
                id="show-clusters"
                checked={showClusters}
                onCheckedChange={setShowClusters}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Min Connection Strength</Label>
                <span className="text-sm text-muted-foreground">{Math.round(minEdgeWeight * 100)}%</span>
              </div>
              <Slider
                value={[minEdgeWeight]}
                onValueChange={([v]) => setMinEdgeWeight(v)}
                min={0}
                max={1}
                step={0.1}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Max Nodes (Performance)</Label>
                <span className="text-sm text-muted-foreground">{maxNodes}</span>
              </div>
              <Slider
                value={[maxNodes]}
                onValueChange={([v]) => setMaxNodes(v)}
                min={100}
                max={2000}
                step={100}
              />
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div className="space-y-3 pt-4 border-t">
              <Label className="text-base font-semibold">Graph Statistics</Label>
              <div className="grid grid-cols-2 gap-2">
                <Card className="p-3">
                  <div className="text-2xl font-bold">{stats.totalTags || 0}</div>
                  <div className="text-xs text-muted-foreground">Tags</div>
                </Card>
                <Card className="p-3">
                  <div className="text-2xl font-bold">{stats.totalFiles || 0}</div>
                  <div className="text-xs text-muted-foreground">Files</div>
                </Card>
                <Card className="p-3">
                  <div className="text-2xl font-bold">{filteredEdges.length}</div>
                  <div className="text-xs text-muted-foreground">Connections</div>
                </Card>
                <Card className="p-3">
                  <div className="text-2xl font-bold">{clusters.length}</div>
                  <div className="text-xs text-muted-foreground">Clusters</div>
                </Card>
              </div>
            </div>
          )}

          {/* Selected Node Details */}
          {selectedNode && (
            <div className="space-y-3 pt-4 border-t">
              <Label className="text-base font-semibold">Selected Node</Label>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    {selectedNode.type === "tag" && <Tag className="h-4 w-4" />}
                    {selectedNode.type === "file" && <FileText className="h-4 w-4" />}
                    {selectedNode.type === "entity" && <Link2 className="h-4 w-4" />}
                    <span className="font-medium">{selectedNode.label}</span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <Badge variant="outline" className="capitalize">{selectedNode.type}</Badge>
                    </div>
                    {selectedNode.cluster !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cluster:</span>
                        <Badge 
                          variant="outline"
                          style={{ borderColor: clusters[selectedNode.cluster]?.color }}
                        >
                          {clusters[selectedNode.cluster]?.label}
                        </Badge>
                      </div>
                    )}
                    {selectedNode.source && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Source:</span>
                        <Badge 
                          variant="outline"
                          style={{ borderColor: SOURCE_COLORS[selectedNode.source] }}
                        >
                          {selectedNode.source}
                        </Badge>
                      </div>
                    )}
                    {selectedNode.fileCount !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Files:</span>
                        <span>{selectedNode.fileCount}</span>
                      </div>
                    )}
                    {selectedNode.confidence !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Confidence:</span>
                        <span>{Math.round(selectedNode.confidence * 100)}%</span>
                      </div>
                    )}
                  </div>
                  <div className="pt-2">
                    <div className="text-xs text-muted-foreground mb-2">Connected to:</div>
                    <div className="flex flex-wrap gap-1">
                      {filteredEdges
                        .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                        .slice(0, 10)
                        .map((edge) => {
                          const connectedId = edge.source === selectedNode.id ? edge.target : edge.source;
                          const connectedNode = nodes.find((n) => n.id === connectedId);
                          return connectedNode ? (
                            <Badge
                              key={connectedId}
                              variant="secondary"
                              className="text-xs cursor-pointer"
                              onClick={() => setSelectedNode(connectedNode)}
                            >
                              {connectedNode.label}
                            </Badge>
                          ) : null;
                        })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Legend */}
          <div className="space-y-3 pt-4 border-t">
            <Label className="text-base font-semibold">Legend</Label>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground font-medium">Node Types</div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_TYPE_COLORS.tag }} />
                <Tag className="h-3 w-3" />
                <span>Tags</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_TYPE_COLORS.file }} />
                <FileText className="h-3 w-3" />
                <span>Files</span>
              </div>
              <div className="text-xs text-muted-foreground font-medium mt-3">Edge Types</div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-6 h-0.5 bg-blue-500" />
                <span>Co-occurrence</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-6 h-0.5 bg-green-500" />
                <span>Semantic</span>
              </div>
            </div>
          </div>
        </div>

        {/* Graph Canvas */}
        <div className="flex-1 relative" ref={containerRef}>
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-muted-foreground">Loading knowledge graph...</p>
              </div>
            </div>
          ) : nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-3 max-w-md">
                <Network className="h-12 w-12 mx-auto text-muted-foreground" />
                <h3 className="text-lg font-semibold">No Graph Data</h3>
                <p className="text-muted-foreground">
                  Add tags to your files and enable knowledge graph enrichment to see relationships here.
                </p>
              </div>
            </div>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                className="w-full h-full cursor-grab active:cursor-grabbing"
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
              />

              {/* Zoom Controls */}
              <div className="absolute bottom-4 right-4 flex flex-col gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => setZoom((z) => Math.min(5, z * 1.2))}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Zoom In</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => setZoom((z) => Math.max(0.1, z * 0.8))}
                      >
                        <ZoomOut className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Zoom Out</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="secondary" size="icon" onClick={resetView}>
                        <Maximize2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reset View</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Info Badge */}
              <div className="absolute top-4 left-4">
                <Badge variant="secondary" className="gap-2">
                  <Info className="h-3 w-3" />
                  {nodes.length} nodes • {filteredEdges.length} connections
                  {showClusters && ` • ${clusters.length} clusters`}
                </Badge>
              </div>
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
