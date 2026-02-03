/**
 * Knowledge Graph Visualization Page
 * Interactive network visualization of tag relationships and file connections
 * Features: Clustering with smart labels, search highlighting, mobile optimization,
 * cluster drill-down, file type indicators, navigation history
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  Download,
  Loader2,
  Info,
  FolderTree,
  FileJson,
  FileSpreadsheet,
  X,
  ChevronLeft,
  ChevronRight,
  Home,
  Image,
  Video,
  FileAudio,
  File,
  Undo2,
  Redo2,
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
  isHighlighted?: boolean;
  isConnectedToHighlighted?: boolean;
  fileType?: "image" | "video" | "audio" | "document" | "other";
  mimeType?: string;
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
  dominantTags: string[];
}

interface ViewState {
  zoom: number;
  offset: { x: number; y: number };
  focusedCluster: number | null;
  searchQuery: string;
  nodeFilter: "all" | "tags" | "files" | "entities";
}

const NODE_TYPE_COLORS: Record<string, string> = {
  tag: "#3B82F6",
  file: "#22C55E",
  entity: "#A855F7",
};

// File type colors for visual indicators
const FILE_TYPE_COLORS: Record<string, string> = {
  image: "#F59E0B",
  video: "#EF4444",
  audio: "#8B5CF6",
  document: "#22C55E",
  other: "#6B7280",
};

const FILE_TYPE_ICONS: Record<string, typeof Image> = {
  image: Image,
  video: Video,
  audio: FileAudio,
  document: FileText,
  other: File,
};

const CLUSTER_COLORS = [
  "#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16",
];

// Category keywords for smart cluster naming
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Healthcare": ["health", "medical", "hospital", "patient", "doctor", "nurse", "clinic", "medicine", "therapy", "treatment", "diagnosis", "care"],
  "Finance": ["finance", "money", "bank", "investment", "stock", "trading", "budget", "accounting", "tax", "loan", "credit", "payment"],
  "Technology": ["tech", "software", "computer", "digital", "data", "code", "programming", "app", "web", "cloud", "ai", "machine learning"],
  "Education": ["education", "school", "university", "learning", "student", "teacher", "course", "training", "academic", "study"],
  "Entertainment": ["entertainment", "movie", "music", "game", "video", "film", "show", "media", "streaming", "concert"],
  "Business": ["business", "company", "corporate", "management", "marketing", "sales", "strategy", "enterprise", "startup"],
  "Science": ["science", "research", "experiment", "laboratory", "biology", "chemistry", "physics", "scientific"],
  "Legal": ["legal", "law", "court", "attorney", "lawyer", "contract", "regulation", "compliance", "policy"],
  "Real Estate": ["real estate", "property", "housing", "building", "construction", "architecture", "home"],
  "Food & Beverage": ["food", "restaurant", "cooking", "recipe", "beverage", "drink", "nutrition", "diet"],
};

// Detect file type from label/extension
function detectFileType(label: string, mimeType?: string): "image" | "video" | "audio" | "document" | "other" {
  const lowerLabel = label.toLowerCase();
  
  if (mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text")) return "document";
  }
  
  // Check by extension
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(lowerLabel)) return "image";
  if (/\.(mp4|mov|avi|mkv|webm|flv|wmv)$/i.test(lowerLabel)) return "video";
  if (/\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(lowerLabel)) return "audio";
  if (/\.(pdf|doc|docx|txt|rtf|odt|xls|xlsx|ppt|pptx)$/i.test(lowerLabel)) return "document";
  
  return "other";
}

// Smart clustering algorithm with dominant tag detection
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
      // Find dominant tags for this cluster
      const tagLabels = clusterNodes
        .map(id => nodes.find(n => n.id === id))
        .filter(n => n && n.type === 'tag')
        .map(n => n!.label.toLowerCase());
      
      // Determine cluster category based on keywords
      let clusterLabel = `Cluster ${clusters.length + 1}`;
      let dominantTags: string[] = [];
      
      // Try to match category keywords
      for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        const matchCount = tagLabels.filter(label => 
          keywords.some(kw => label.includes(kw))
        ).length;
        
        if (matchCount >= 2 || (matchCount >= 1 && tagLabels.length <= 5)) {
          clusterLabel = category;
          dominantTags = tagLabels.filter(label => 
            keywords.some(kw => label.includes(kw))
          ).slice(0, 3);
          break;
        }
      }
      
      // If no category matched, use most frequent words
      if (clusterLabel.startsWith("Cluster")) {
        const wordFreq = new Map<string, number>();
        tagLabels.forEach(label => {
          const words = label.split(/[\s_-]+/).filter(w => w.length > 3);
          words.forEach(word => {
            wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
          });
        });
        
        const sortedWords = Array.from(wordFreq.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([word]) => word);
        
        if (sortedWords.length > 0) {
          // Capitalize first letter
          clusterLabel = sortedWords[0].charAt(0).toUpperCase() + sortedWords[0].slice(1);
          dominantTags = sortedWords;
        }
      }
      
      clusters.push({
        id: clusters.length,
        nodes: clusterNodes,
        centerX: 0,
        centerY: 0,
        color: CLUSTER_COLORS[clusters.length % CLUSTER_COLORS.length],
        label: clusterLabel,
        dominantTags,
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
  const [showFileTypeIndicators, setShowFileTypeIndicators] = useState(true);
  const [minEdgeWeight, setMinEdgeWeight] = useState(0.3);
  const [nodeFilter, setNodeFilter] = useState<"all" | "tags" | "files" | "entities">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [relationshipTypeFilter, setRelationshipTypeFilter] = useState<"all" | "co-occurrence" | "semantic">("all");
  const [maxNodes, setMaxNodes] = useState(500);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Cluster drill-down state
  const [focusedCluster, setFocusedCluster] = useState<number | null>(null);
  
  // Navigation history for undo/redo
  const [viewHistory, setViewHistory] = useState<ViewState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Touch state for mobile
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);
  
  // Error boundary state
  const [hasError, setHasError] = useState(false);

  // Save current view to history
  const saveToHistory = useCallback(() => {
    const currentState: ViewState = {
      zoom,
      offset: { ...offset },
      focusedCluster,
      searchQuery,
      nodeFilter,
    };
    
    // Remove any forward history when adding new state
    const newHistory = viewHistory.slice(0, historyIndex + 1);
    newHistory.push(currentState);
    
    // Limit history size
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    
    setViewHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [zoom, offset, focusedCluster, searchQuery, nodeFilter, viewHistory, historyIndex]);

  // Navigate back in history
  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = viewHistory[historyIndex - 1];
      setZoom(prevState.zoom);
      setOffset(prevState.offset);
      setFocusedCluster(prevState.focusedCluster);
      setSearchQuery(prevState.searchQuery);
      setNodeFilter(prevState.nodeFilter);
      setHistoryIndex(historyIndex - 1);
    }
  }, [historyIndex, viewHistory]);

  // Navigate forward in history
  const goForward = useCallback(() => {
    if (historyIndex < viewHistory.length - 1) {
      const nextState = viewHistory[historyIndex + 1];
      setZoom(nextState.zoom);
      setOffset(nextState.offset);
      setFocusedCluster(nextState.focusedCluster);
      setSearchQuery(nextState.searchQuery);
      setNodeFilter(nextState.nodeFilter);
      setHistoryIndex(historyIndex + 1);
    }
  }, [historyIndex, viewHistory]);

  // Detect mobile viewport and set mobile-optimized defaults
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Set mobile-optimized defaults on first load
      if (mobile && maxNodes === 500) {
        setMaxNodes(100); // Fewer nodes on mobile for better performance
        setShowLabels(false); // Hide labels by default on mobile to reduce clutter
        setShowClusters(true); // Show clusters to help organize the view
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [maxNodes]);

  // Fetch graph data
  const { data: graphData, isLoading, refetch, error } = trpc.knowledgeGraph.getGraphData.useQuery(
    { includeFiles: true, minSimilarity: minEdgeWeight },
    { 
      enabled: true,
      retry: 3,
      retryDelay: 1000,
    }
  );

  const { data: stats } = trpc.knowledgeGraph.getStats.useQuery();

  // Handle errors
  useEffect(() => {
    if (error) {
      setHasError(true);
      toast.error(`Failed to load graph: ${error.message}`);
    }
  }, [error]);

  // Export mutation
  const exportMutation = trpc.knowledgeGraph.exportGraphData.useMutation({
    onSuccess: (data) => {
      if (data.format === 'json' && data.data && data.filename) {
        const blob = new Blob([data.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Graph exported as JSON');
      } else if (data.nodesData && data.edgesData && data.nodesFilename && data.edgesFilename) {
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

  // Search highlighting - find matching nodes and their connections
  const highlightedNodeIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    
    const query = searchQuery.toLowerCase();
    const matchingIds = new Set<string>();
    
    nodes.forEach(node => {
      if (node.label.toLowerCase().includes(query)) {
        matchingIds.add(node.id);
      }
    });
    
    return matchingIds;
  }, [nodes, searchQuery]);

  const connectedToHighlightedIds = useMemo(() => {
    if (highlightedNodeIds.size === 0) return new Set<string>();
    
    const connectedIds = new Set<string>();
    edges.forEach(edge => {
      if (highlightedNodeIds.has(edge.source)) {
        connectedIds.add(edge.target);
      }
      if (highlightedNodeIds.has(edge.target)) {
        connectedIds.add(edge.source);
      }
    });
    
    // Remove the highlighted nodes themselves from connected set
    highlightedNodeIds.forEach(id => connectedIds.delete(id));
    
    return connectedIds;
  }, [edges, highlightedNodeIds]);

  // Initialize nodes from graph data
  useEffect(() => {
    if (!graphData) return;

    try {
      const newNodes: GraphNode[] = [];
      const newEdges: GraphEdge[] = [];
      const nodeMap = new Map<string, GraphNode>();

      graphData.nodes?.forEach((nodeData: any) => {
        const fileType = nodeData.type === 'file' ? detectFileType(nodeData.label, nodeData.metadata?.mimeType) : undefined;
        
        const graphNode: GraphNode = {
          id: nodeData.id,
          label: nodeData.label,
          type: nodeData.type as "tag" | "file" | "entity",
          source: "internal",
          size: nodeData.type === "tag" ? Math.min(20 + (nodeData.weight || 1) * 3, 40) : 15,
          color: nodeData.type === "tag" ? NODE_TYPE_COLORS.tag : 
                 (fileType ? FILE_TYPE_COLORS[fileType] : NODE_TYPE_COLORS.file),
          fileType,
          mimeType: nodeData.metadata?.mimeType,
        };
        newNodes.push(graphNode);
        nodeMap.set(graphNode.id, graphNode);
      });

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

      const newClusters = clusterNodes(newNodes, newEdges);
      
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
      setHasError(false);
    } catch (err) {
      console.error("Error processing graph data:", err);
      setHasError(true);
      toast.error("Failed to process graph data");
    }
  }, [graphData, showClusters]);

  // Filter edges by relationship type
  const filteredEdges = useMemo(() => {
    if (relationshipTypeFilter === 'all') return edges;
    return edges.filter(e => e.type === relationshipTypeFilter);
  }, [edges, relationshipTypeFilter]);

  // Filter nodes by focused cluster
  const visibleNodes = useMemo(() => {
    if (focusedCluster === null) return nodes;
    return nodes.filter(n => n.cluster === focusedCluster);
  }, [nodes, focusedCluster]);

  // Force-directed layout simulation
  useEffect(() => {
    if (visibleNodes.length === 0) return;

    let isRunning = true;
    // Mobile: use stronger repulsion for better spacing
    const repulsionStrength = isMobile ? 1200 : 500;

    const simulate = () => {
      if (!isRunning) return;
      
      const width = containerRef.current?.clientWidth || 800;
      const height = containerRef.current?.clientHeight || 600;

      setNodes((prevNodes) => {
        const newNodes = [...prevNodes];
        const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
        
        // Apply forces only to visible nodes
        for (let i = 0; i < newNodes.length; i++) {
          const node = newNodes[i];
          if (!node.x || !node.y || !visibleNodeIds.has(node.id)) continue;

          // Repulsion from other nodes - stronger on mobile for better spacing
          for (let j = i + 1; j < newNodes.length; j++) {
            const other = newNodes[j];
            if (!other.x || !other.y || !visibleNodeIds.has(other.id)) continue;

            const dx = node.x - other.x;
            const dy = node.y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = repulsionStrength / (dist * dist);

            node.vx = (node.vx || 0) + (dx / dist) * force;
            node.vy = (node.vy || 0) + (dy / dist) * force;
            other.vx = (other.vx || 0) - (dx / dist) * force;
            other.vy = (other.vy || 0) - (dy / dist) * force;
          }

          // Attraction along edges
          filteredEdges.forEach((edge) => {
            if (edge.source !== node.id && edge.target !== node.id) return;
            const otherId = edge.source === node.id ? edge.target : edge.source;
            const other = newNodes.find((n) => n.id === otherId);
            if (!other || !other.x || !other.y || !visibleNodeIds.has(other.id)) return;

            const dx = other.x - (node.x ?? 0);
            const dy = other.y - (node.y ?? 0);
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = dist * 0.01 * edge.weight;

            node.vx = (node.vx || 0) + (dx / dist) * force;
            node.vy = (node.vy || 0) + (dy / dist) * force;
          });

          // Center gravity
          node.vx = (node.vx || 0) + (width / 2 - (node.x ?? 0)) * 0.001;
          node.vy = (node.vy || 0) + (height / 2 - (node.y ?? 0)) * 0.001;

          // Apply velocity with damping
          node.x = (node.x ?? 0) + (node.vx || 0) * 0.1;
          node.y = (node.y ?? 0) + (node.vy || 0) * 0.1;
          node.vx = (node.vx || 0) * 0.9;
          node.vy = (node.vy || 0) * 0.9;

          // Boundary constraints
          node.x = Math.max(50, Math.min(width - 50, node.x ?? 0));
          node.y = Math.max(50, Math.min(height - 50, node.y ?? 0));
        }

        return newNodes;
      });

      animationRef.current = requestAnimationFrame(simulate);
    };

    animationRef.current = requestAnimationFrame(simulate);
    return () => {
      isRunning = false;
      cancelAnimationFrame(animationRef.current);
    };
  }, [visibleNodes.length, filteredEdges, focusedCluster, isMobile]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = containerRef.current?.clientWidth || 800;
    const height = containerRef.current?.clientHeight || 600;
    
    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    // Filter nodes
    let filteredNodes = visibleNodes.filter((node) => {
      if (nodeFilter !== "all" && node.type !== nodeFilter.slice(0, -1)) return false;
      if (sourceFilter !== "all" && node.source !== sourceFilter) return false;
      return true;
    });

    // Apply max nodes limit
    if (filteredNodes.length > maxNodes) {
      filteredNodes = filteredNodes
        .sort((a, b) => (b.size || 15) - (a.size || 15))
        .slice(0, maxNodes);
    }

    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

    // Draw cluster backgrounds
    if (showClusters && clusters.length > 0) {
      clusters.forEach(cluster => {
        // Skip clusters not in focus if we have a focused cluster
        if (focusedCluster !== null && cluster.id !== focusedCluster) return;
        
        const clusterNodes = filteredNodes.filter(n => n.cluster === cluster.id);
        if (clusterNodes.length < 2) return;
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        clusterNodes.forEach(node => {
          if (node.x && node.y) {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x);
            maxY = Math.max(maxY, node.y);
          }
        });
        
        // Mobile: larger padding and fonts for better visibility
        const padding = isMobile ? 60 : 40;
        const clusterLabelSize = isMobile ? 18 : 14;
        const clusterSubtitleSize = isMobile ? 14 : 11;
        
        ctx.beginPath();
        ctx.roundRect(minX - padding, minY - padding, maxX - minX + padding * 2, maxY - minY + padding * 2, 20);
        ctx.fillStyle = cluster.color + "20"; // Slightly more visible background
        ctx.fill();
        ctx.strokeStyle = cluster.color + "60"; // More visible border
        ctx.lineWidth = isMobile ? 3 : 2;
        ctx.stroke();
        
        // Draw smart cluster label - larger on mobile
        ctx.fillStyle = cluster.color;
        ctx.font = `bold ${clusterLabelSize}px sans-serif`;
        ctx.fillText(cluster.label, minX - padding + 10, minY - padding + (isMobile ? 24 : 20));
        
        // Draw dominant tags as subtitle - larger on mobile
        if (cluster.dominantTags.length > 0) {
          ctx.fillStyle = cluster.color + "90"; // Better contrast
          ctx.font = `${clusterSubtitleSize}px sans-serif`;
          const subtitleY = minY - padding + (isMobile ? 46 : 36);
          ctx.fillText(cluster.dominantTags.slice(0, 3).join(", "), minX - padding + 10, subtitleY);
        }
        
        // Update cluster center for click detection
        cluster.centerX = (minX + maxX) / 2;
        cluster.centerY = (minY + maxY) / 2;
      });
    }

    // Draw edges with highlighting
    if (showEdges) {
      filteredEdges.forEach((edge) => {
        if (!filteredNodeIds.has(edge.source) || !filteredNodeIds.has(edge.target)) return;
        if (edge.weight < minEdgeWeight) return;

        const source = nodes.find((n) => n.id === edge.source);
        const target = nodes.find((n) => n.id === edge.target);
        if (!source || !target || !source.x || !target.x || !source.y || !target.y) return;

        const isHighlightedEdge = searchQuery && (
          highlightedNodeIds.has(edge.source) || highlightedNodeIds.has(edge.target)
        );

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        
        if (searchQuery && !isHighlightedEdge) {
          // Dim non-highlighted edges when searching
          ctx.strokeStyle = `rgba(50, 50, 50, 0.2)`;
          ctx.lineWidth = 1;
        } else if (isHighlightedEdge) {
          // Highlight edges connected to search results
          ctx.strokeStyle = `rgba(255, 200, 0, ${0.6 + edge.weight * 0.4})`;
          ctx.lineWidth = edge.weight * 3;
        } else if (edge.type === 'co-occurrence') {
          ctx.strokeStyle = `rgba(59, 130, 246, ${edge.weight * 0.5})`;
          ctx.lineWidth = edge.weight * 2;
        } else if (edge.type === 'semantic') {
          ctx.strokeStyle = `rgba(34, 197, 94, ${edge.weight * 0.5})`;
          ctx.lineWidth = edge.weight * 2;
        } else {
          ctx.strokeStyle = `rgba(100, 100, 100, ${edge.weight * 0.5})`;
          ctx.lineWidth = edge.weight * 2;
        }
        ctx.stroke();
      });
    }

    // Draw nodes with highlighting and file type indicators
    // Mobile: use larger nodes for better touch targets
    const mobileNodeScale = isMobile ? 1.5 : 1;
    const mobileFontSize = isMobile ? 14 : 12;
    
    filteredNodes.forEach((node) => {
      if (!node.x || !node.y) return;

      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;
      const isHighlighted = highlightedNodeIds.has(node.id);
      const isConnectedToHighlighted = connectedToHighlightedIds.has(node.id);
      const baseSize = node.size || 15;
      const size = baseSize * mobileNodeScale;

      // Determine node opacity based on search
      let nodeOpacity = 1;
      if (searchQuery) {
        if (isHighlighted) {
          nodeOpacity = 1;
        } else if (isConnectedToHighlighted) {
          nodeOpacity = 0.7;
        } else {
          nodeOpacity = 0.15;
        }
      }

      // Draw glow for highlighted nodes
      if (isHighlighted) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, size * 1.8, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(node.x, node.y, size, node.x, node.y, size * 1.8);
        gradient.addColorStop(0, "rgba(255, 200, 0, 0.5)");
        gradient.addColorStop(1, "rgba(255, 200, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, size * (isHovered ? 1.2 : 1), 0, Math.PI * 2);
      
      if (isHighlighted) {
        ctx.fillStyle = "#FFD700"; // Gold for highlighted
      } else if (isConnectedToHighlighted) {
        ctx.fillStyle = "#FFA500"; // Orange for connected
      } else {
        // Apply opacity to node color
        const baseColor = node.color || "#666";
        ctx.fillStyle = nodeOpacity < 1 ? baseColor + Math.round(nodeOpacity * 255).toString(16).padStart(2, '0') : baseColor;
      }
      ctx.fill();

      if (isSelected || isHovered || isHighlighted) {
        ctx.strokeStyle = isHighlighted ? "#FFD700" : "#fff";
        ctx.lineWidth = isHighlighted ? 3 : 2;
        ctx.stroke();
      }

      // Draw file type indicator for file nodes
      if (showFileTypeIndicators && node.type === 'file' && node.fileType) {
        const indicatorSize = size * 0.5;
        const indicatorX = node.x + size * 0.7;
        const indicatorY = node.y - size * 0.7;
        
        // Draw indicator background
        ctx.beginPath();
        ctx.arc(indicatorX, indicatorY, indicatorSize, 0, Math.PI * 2);
        ctx.fillStyle = FILE_TYPE_COLORS[node.fileType];
        ctx.fill();
        ctx.strokeStyle = "#0a0a0a";
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Draw icon letter
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${indicatorSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const iconLetter = node.fileType === 'image' ? 'I' : 
                          node.fileType === 'video' ? 'V' : 
                          node.fileType === 'audio' ? 'A' : 
                          node.fileType === 'document' ? 'D' : 'F';
        ctx.fillText(iconLetter, indicatorX, indicatorY);
      }

      // Node label - larger font on mobile for better readability
      if (showLabels || isHovered || isHighlighted) {
        ctx.globalAlpha = nodeOpacity;
        ctx.fillStyle = isHighlighted ? "#FFD700" : "#fff";
        ctx.font = `${isHovered || isHighlighted ? "bold " : ""}${mobileFontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        // Truncate long labels on mobile
        const displayLabel = isMobile && node.label.length > 15 ? node.label.slice(0, 12) + '...' : node.label;
        ctx.fillText(displayLabel, node.x, node.y + size + 5);
        ctx.globalAlpha = 1;
      }
    });

    ctx.restore();
  }, [nodes, filteredEdges, selectedNode, hoveredNode, zoom, offset, showLabels, showEdges, showClusters, showFileTypeIndicators, minEdgeWeight, nodeFilter, sourceFilter, searchQuery, clusters, maxNodes, highlightedNodeIds, connectedToHighlightedIds, visibleNodes, focusedCluster, isMobile]);

  // Mouse event handlers with error handling
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    try {
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

      const hovered = visibleNodes.find((node) => {
        if (!node.x || !node.y) return false;
        const dx = x - node.x;
        const dy = y - node.y;
        return Math.sqrt(dx * dx + dy * dy) < (node.size || 15);
      });

      setHoveredNode(hovered || null);
    } catch (err) {
      console.error("Error in mouse move handler:", err);
    }
  }, [visibleNodes, zoom, offset, isDragging, dragStart]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - offset.x) / zoom;
      const y = (e.clientY - rect.top - offset.y) / zoom;

      if (hoveredNode) {
        setSelectedNode(hoveredNode);
        saveToHistory();
      } else {
        // Check if clicking on a cluster background (for drill-down)
        if (showClusters && focusedCluster === null) {
          const clickedCluster = clusters.find(cluster => {
            const clusterNodes = visibleNodes.filter(n => n.cluster === cluster.id);
            if (clusterNodes.length < 2) return false;
            
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            clusterNodes.forEach(node => {
              if (node.x && node.y) {
                minX = Math.min(minX, node.x);
                minY = Math.min(minY, node.y);
                maxX = Math.max(maxX, node.x);
                maxY = Math.max(maxY, node.y);
              }
            });
            
            const padding = 40;
            return x >= minX - padding && x <= maxX + padding && 
                   y >= minY - padding && y <= maxY + padding;
          });
          
          if (clickedCluster) {
            saveToHistory();
            setFocusedCluster(clickedCluster.id);
            setZoom(1.5);
            toast.success(`Focused on "${clickedCluster.label}" cluster`);
            return;
          }
        }
        
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    } catch (err) {
      console.error("Error in mouse down handler:", err);
    }
  }, [hoveredNode, zoom, offset, showClusters, focusedCluster, clusters, visibleNodes, saveToHistory]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.1, Math.min(5, z * delta)));
  }, []);

  // Touch event handlers for mobile with error handling
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    try {
      e.preventDefault();
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        setTouchStart({ x: touch.clientX, y: touch.clientY });
        setDragStart({ x: touch.clientX, y: touch.clientY });
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        setLastTouchDistance(Math.sqrt(dx * dx + dy * dy));
      }
    } catch (err) {
      console.error("Error in touch start handler:", err);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    try {
      e.preventDefault();
      
      if (e.touches.length === 1 && touchStart) {
        const touch = e.touches[0];
        setOffset({
          x: offset.x + (touch.clientX - dragStart.x),
          y: offset.y + (touch.clientY - dragStart.y),
        });
        setDragStart({ x: touch.clientX, y: touch.clientY });
      } else if (e.touches.length === 2 && lastTouchDistance) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const newDistance = Math.sqrt(dx * dx + dy * dy);
        const scale = newDistance / lastTouchDistance;
        setZoom((z) => Math.max(0.1, Math.min(5, z * scale)));
        setLastTouchDistance(newDistance);
      }
    } catch (err) {
      console.error("Error in touch move handler:", err);
    }
  }, [touchStart, dragStart, offset, lastTouchDistance]);

  const handleTouchEnd = useCallback(() => {
    setTouchStart(null);
    setLastTouchDistance(null);
  }, []);

  const resetView = useCallback(() => {
    saveToHistory();
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setSelectedNode(null);
    setFocusedCluster(null);
  }, [saveToHistory]);

  const exitClusterFocus = useCallback(() => {
    saveToHistory();
    setFocusedCluster(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [saveToHistory]);

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

  // Count file types
  const fileTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { image: 0, video: 0, audio: 0, document: 0, other: 0 };
    nodes.filter(n => n.type === 'file').forEach(n => {
      if (n.fileType) counts[n.fileType]++;
    });
    return counts;
  }, [nodes]);

  // Sidebar content component (reused for both desktop and mobile)
  const SidebarContent = () => (
    <div className="space-y-4">
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
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        {searchQuery && highlightedNodeIds.size > 0 && (
          <p className="text-xs text-muted-foreground">
            Found {highlightedNodeIds.size} matching nodes, {connectedToHighlightedIds.size} connected
          </p>
        )}
      </div>

      {/* Filters - 2 column grid on mobile */}
      <div className={`grid gap-2 ${isMobile ? 'grid-cols-2' : 'space-y-2 grid-cols-1'}`}>
        <div className="space-y-1">
          <Label className="text-xs">Node Type</Label>
          <Select value={nodeFilter} onValueChange={(v: "all" | "tags" | "files" | "entities") => setNodeFilter(v)}>
            <SelectTrigger className="h-9">
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

        <div className="space-y-1">
          <Label className="text-xs">Relationship</Label>
          <Select value={relationshipTypeFilter} onValueChange={(v: "all" | "co-occurrence" | "semantic") => setRelationshipTypeFilter(v)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({edges.length})</SelectItem>
              <SelectItem value="co-occurrence">Co-occur ({edgeTypeCounts['co-occurrence']})</SelectItem>
              <SelectItem value="semantic">Semantic ({edgeTypeCounts['semantic']})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Knowledge Source</Label>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="wikidata">Wikidata</SelectItem>
            <SelectItem value="dbpedia">DBpedia</SelectItem>
            <SelectItem value="schema.org">Schema.org</SelectItem>
            <SelectItem value="llm">AI Generated</SelectItem>
            <SelectItem value="manual">Manual Tags</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Display Options */}
      <div className="space-y-3 pt-3 border-t">
        <Label className="text-sm font-semibold">Display Options</Label>
        
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <Switch
              id="show-labels"
              checked={showLabels}
              onCheckedChange={setShowLabels}
            />
            <Label htmlFor="show-labels" className="text-xs">Labels</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="show-edges"
              checked={showEdges}
              onCheckedChange={setShowEdges}
            />
            <Label htmlFor="show-edges" className="text-xs">Edges</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="show-clusters"
              checked={showClusters}
              onCheckedChange={setShowClusters}
            />
            <Label htmlFor="show-clusters" className="text-xs">Clusters</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="show-file-types"
              checked={showFileTypeIndicators}
              onCheckedChange={setShowFileTypeIndicators}
            />
            <Label htmlFor="show-file-types" className="text-xs">File Types</Label>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Min Strength</Label>
            <span className="text-xs text-muted-foreground">{Math.round(minEdgeWeight * 100)}%</span>
          </div>
          <Slider
            value={[minEdgeWeight]}
            onValueChange={([v]) => setMinEdgeWeight(v)}
            min={0}
            max={1}
            step={0.1}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Max Nodes</Label>
            <span className="text-xs text-muted-foreground">{maxNodes}</span>
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

      {/* File Type Legend */}
      {showFileTypeIndicators && (
        <div className="space-y-2 pt-3 border-t">
          <Label className="text-sm font-semibold">File Types</Label>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {Object.entries(FILE_TYPE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: color }}
                />
                <span className="capitalize">{type}</span>
                <span className="text-muted-foreground">({fileTypeCounts[type] || 0})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats - compact grid */}
      {stats && (
        <div className="space-y-2 pt-3 border-t">
          <Label className="text-sm font-semibold">Statistics</Label>
          <div className="grid grid-cols-4 gap-1">
            <div className="text-center p-2 bg-muted rounded">
              <div className="text-lg font-bold">{stats.totalTags || 0}</div>
              <div className="text-[10px] text-muted-foreground">Tags</div>
            </div>
            <div className="text-center p-2 bg-muted rounded">
              <div className="text-lg font-bold">{stats.totalFiles || 0}</div>
              <div className="text-[10px] text-muted-foreground">Files</div>
            </div>
            <div className="text-center p-2 bg-muted rounded">
              <div className="text-lg font-bold">{filteredEdges.length}</div>
              <div className="text-[10px] text-muted-foreground">Edges</div>
            </div>
            <div className="text-center p-2 bg-muted rounded">
              <div className="text-lg font-bold">{clusters.length}</div>
              <div className="text-[10px] text-muted-foreground">Clusters</div>
            </div>
          </div>
        </div>
      )}

      {/* Selected Node Details */}
      {selectedNode && (
        <div className="space-y-2 pt-3 border-t">
          <Label className="text-sm font-semibold">Selected Node</Label>
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                {selectedNode.type === "tag" && <Tag className="h-4 w-4" />}
                {selectedNode.type === "file" && (
                  selectedNode.fileType ? 
                    (() => {
                      const IconComponent = FILE_TYPE_ICONS[selectedNode.fileType];
                      return <IconComponent className="h-4 w-4" style={{ color: FILE_TYPE_COLORS[selectedNode.fileType] }} />;
                    })() :
                    <FileText className="h-4 w-4" />
                )}
                {selectedNode.type === "entity" && <Link2 className="h-4 w-4" />}
                <span className="font-medium text-sm truncate">{selectedNode.label}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-xs capitalize">{selectedNode.type}</Badge>
                {selectedNode.fileType && (
                  <Badge 
                    variant="outline" 
                    className="text-xs capitalize"
                    style={{ borderColor: FILE_TYPE_COLORS[selectedNode.fileType] }}
                  >
                    {selectedNode.fileType}
                  </Badge>
                )}
                {selectedNode.cluster !== undefined && (
                  <Badge 
                    variant="outline"
                    className="text-xs"
                    style={{ borderColor: clusters[selectedNode.cluster]?.color }}
                  >
                    {clusters[selectedNode.cluster]?.label}
                  </Badge>
                )}
              </div>
              <div className="pt-1">
                <div className="text-xs text-muted-foreground mb-1">Connected to:</div>
                <div className="flex flex-wrap gap-1">
                  {filteredEdges
                    .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                    .slice(0, 6)
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
                          {connectedNode.label.length > 15 ? connectedNode.label.slice(0, 15) + '...' : connectedNode.label}
                        </Badge>
                      ) : null;
                    })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );

  // Error state
  if (hasError && !isLoading && nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md p-6">
          <Network className="h-12 w-12 mx-auto text-destructive" />
          <h3 className="text-lg font-semibold">Failed to Load Graph</h3>
          <p className="text-muted-foreground text-sm">
            There was an error loading the knowledge graph. Please try again.
          </p>
          <Button onClick={() => { setHasError(false); refetch(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-3 md:p-4 flex items-center justify-between bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 md:gap-3">
          <Network className="h-5 w-5 md:h-6 md:w-6 text-primary" />
          <div>
            <h1 className="text-lg md:text-xl font-bold">Knowledge Graph</h1>
            <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
              Explore relationships between tags, files, and entities
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          {/* Navigation History */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goBack}
                  disabled={historyIndex <= 0}
                  className="h-8 w-8"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Go Back</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goForward}
                  disabled={historyIndex >= viewHistory.length - 1}
                  className="h-8 w-8"
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Go Forward</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {!isMobile && (
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
          )}
          
          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={exportMutation.isPending}>
                {exportMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="hidden sm:inline ml-1">Export</span>
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
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Refresh</span>
          </Button>

          {/* Mobile sidebar toggle */}
          {isMobile && (
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Graph Controls</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <SidebarContent />
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      {activeTab === "hierarchy" ? (
        <div className="flex-1 p-6 overflow-auto">
          <TagHierarchyManager />
        </div>
      ) : (
      <div className="flex-1 flex">
        {/* Desktop Sidebar */}
        {!isMobile && (
          <div className="w-72 border-r p-4 space-y-4 overflow-y-auto">
            <SidebarContent />
          </div>
        )}

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
              <div className="text-center space-y-3 max-w-md p-4">
                <Network className="h-12 w-12 mx-auto text-muted-foreground" />
                <h3 className="text-lg font-semibold">No Graph Data</h3>
                <p className="text-muted-foreground text-sm">
                  Add tags to your files and enable knowledge graph enrichment to see relationships here.
                </p>
              </div>
            </div>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />

              {/* Cluster Focus Banner */}
              {focusedCluster !== null && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                  <div className="flex items-center gap-2 bg-background/95 backdrop-blur px-4 py-2 rounded-full border shadow-lg">
                    <Badge 
                      variant="outline" 
                      style={{ borderColor: clusters[focusedCluster]?.color, color: clusters[focusedCluster]?.color }}
                    >
                      {clusters[focusedCluster]?.label}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {clusters[focusedCluster]?.nodes.length} nodes
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={exitClusterFocus}
                      className="h-7 px-2"
                    >
                      <Home className="h-3 w-3 mr-1" />
                      Exit
                    </Button>
                  </div>
                </div>
              )}

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
                  {visibleNodes.length} nodes • {filteredEdges.length} connections
                  {showClusters && ` • ${clusters.length} clusters`}
                </Badge>
              </div>

              {/* Search results indicator */}
              {searchQuery && highlightedNodeIds.size > 0 && (
                <div className="absolute top-14 left-4">
                  <Badge variant="default" className="gap-2 bg-yellow-600">
                    <Search className="h-3 w-3" />
                    {highlightedNodeIds.size} matches
                  </Badge>
                </div>
              )}

              {/* Cluster hint (when clusters are shown but not focused) */}
              {showClusters && focusedCluster === null && clusters.length > 0 && (
                <div className="absolute bottom-4 left-4">
                  <Badge variant="outline" className="gap-2 text-xs">
                    <ChevronRight className="h-3 w-3" />
                    Click a cluster to drill down
                  </Badge>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
