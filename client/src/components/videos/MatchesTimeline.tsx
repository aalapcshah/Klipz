import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Files,
  Sparkles,
  FileText,
  Search,
  Loader2,
  Image as ImageIcon,
  FileVideo,
  FileAudio,
  File as FileIcon,
  Play,
  Clock,
  LayoutGrid,
  List,
  Eye,
  ExternalLink,
  ArrowUpDown,
  Filter,
  X,
  Camera,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Trash2,
  Settings,
  ToggleLeft,
  ToggleRight,
  Bell,
  BellOff,
} from "lucide-react";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getFileIcon(mimeType?: string | null) {
  if (!mimeType) return <FileIcon className="h-6 w-6" />;
  if (mimeType.startsWith("image/")) return <ImageIcon className="h-6 w-6" />;
  if (mimeType.startsWith("video/")) return <FileVideo className="h-6 w-6" />;
  if (mimeType.startsWith("audio/")) return <FileAudio className="h-6 w-6" />;
  return <FileIcon className="h-6 w-6" />;
}

function getSmallFileIcon(mimeType?: string | null) {
  if (!mimeType) return <FileIcon className="h-4 w-4" />;
  if (mimeType.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (mimeType.startsWith("video/")) return <FileVideo className="h-4 w-4" />;
  if (mimeType.startsWith("audio/")) return <FileAudio className="h-4 w-4" />;
  return <FileIcon className="h-4 w-4" />;
}

interface TimelineRow {
  timestamp: number;
  captionText?: string;
  transcriptExcerpt?: string;
  matches: Array<{
    type: "visual" | "transcript";
    file: {
      id: number;
      filename: string;
      title: string | null;
      description: string | null;
      mimeType: string | null;
      url: string;
    };
    relevanceScore: number;
    reasoning?: string | null;
    entities?: string[] | null;
    keywords?: string[] | null;
  }>;
}

/** Deduplicated file entry for grid view */
interface UniqueMatchedFile {
  file: TimelineRow["matches"][0]["file"];
  bestScore: number;
  matchCount: number;
  timepoints: number[];
  types: Set<string>;
  allEntities: string[];
  allKeywords: string[];
  reasoning?: string | null;
  allReasonings: string[];
}

interface MatchesTimelineProps {
  videoUrl: string;
  fileId: number | null;
  videoTitle?: string;
  fileMatches: any[] | undefined;
  fileSuggestions: any[] | undefined;
  matchesLoading: boolean;
  suggestionsLoading: boolean;
  onFindMatches: () => void;
  findMatchesPending: boolean;
  onSeekTo?: (timestamp: number) => void;
  onRematch?: () => void;
  rematchPending?: boolean;
  matchSettings?: {
    minConfidenceThreshold: number;
    autoMatchOnTranscription: boolean;
    autoMatchOnCaptioning: boolean;
    notifyOnMatchComplete: boolean;
  };
  onUpdateSettings?: (settings: Partial<{
    minConfidenceThreshold: number;
    autoMatchOnTranscription: boolean;
    autoMatchOnCaptioning: boolean;
    notifyOnMatchComplete: boolean;
  }>) => void;
}

/**
 * Captures frames from a video at specific timestamps using an offscreen video element.
 * Used as fallback when server-side thumbnails are not available.
 */
function useVideoFrameCapture(videoUrl: string) {
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frames, setFrames] = useState<Record<number, string>>({});
  const pendingCaptures = useRef<Set<number>>(new Set());
  const captureQueue = useRef<number[]>([]);
  const isProcessing = useRef(false);

  useEffect(() => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.src = videoUrl;
    captureVideoRef.current = video;

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    canvasRef.current = canvas;

    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [videoUrl]);

  const processQueue = useCallback(() => {
    if (isProcessing.current || captureQueue.current.length === 0) return;
    isProcessing.current = true;

    const timestamp = captureQueue.current.shift()!;
    const roundedTs = Math.round(timestamp * 10) / 10;
    const video = captureVideoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      isProcessing.current = false;
      return;
    }

    const handleSeeked = () => {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        setFrames((prev) => ({ ...prev, [roundedTs]: dataUrl }));
      }
      pendingCaptures.current.delete(roundedTs);
      video.removeEventListener("seeked", handleSeeked);
      isProcessing.current = false;
      setTimeout(() => processQueue(), 50);
    };

    video.addEventListener("seeked", handleSeeked);
    video.currentTime = timestamp;
  }, []);

  const captureFrame = useCallback(
    (timestamp: number) => {
      const roundedTs = Math.round(timestamp * 10) / 10;
      if (frames[roundedTs] || pendingCaptures.current.has(roundedTs)) return;
      pendingCaptures.current.add(roundedTs);
      captureQueue.current.push(timestamp);
      processQueue();
    },
    [frames, processQueue]
  );

  return { frames, captureFrame };
}

type ViewMode = "timeline" | "grid";
type SortMode = "confidence" | "matches" | "name";
type MatchTypeFilter = "all" | "visual" | "transcript";

export function MatchesTimeline({
  videoUrl,
  fileId,
  videoTitle,
  fileMatches,
  fileSuggestions,
  matchesLoading,
  suggestionsLoading,
  onFindMatches,
  findMatchesPending,
  onSeekTo,
  onRematch,
  rematchPending,
  matchSettings,
  onUpdateSettings,
}: MatchesTimelineProps) {
  const { frames, captureFrame } = useVideoFrameCapture(videoUrl);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [previewFile, setPreviewFile] = useState<UniqueMatchedFile | null>(null);
  // Grid filter/sort state
  const [sortMode, setSortMode] = useState<SortMode>("confidence");
  const [matchTypeFilter, setMatchTypeFilter] = useState<MatchTypeFilter>("all");
  const [minConfidence, setMinConfidence] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const MAX_VISIBLE_MATCHES = 2;

  // Server-side thumbnails
  const { data: serverThumbnails, isLoading: thumbnailsLoading } =
    trpc.videoVisualCaptions.getTimelineThumbnails.useQuery(
      { fileId: fileId! },
      { enabled: !!fileId }
    );

  const generateThumbnailsMutation =
    trpc.videoVisualCaptions.generateTimelineThumbnails.useMutation({
      onSuccess: (data) => {
        toast.success(`Generated ${data.generated} of ${data.total} frame thumbnails`);
      },
      onError: () => {
        toast.error("Failed to generate thumbnails");
      },
    });

  // Build a map of timestamp -> server thumbnail URL
  const serverThumbnailMap = useMemo(() => {
    const map: Record<number, string> = {};
    if (serverThumbnails) {
      for (const t of serverThumbnails) {
        // Round to nearest 0.1 for matching
        const key = Math.round(t.timestamp * 10) / 10;
        map[key] = t.thumbnailUrl;
      }
    }
    return map;
  }, [serverThumbnails]);

  const hasServerThumbnails = serverThumbnails && serverThumbnails.length > 0;

  const toggleRowExpand = useCallback((timestamp: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(timestamp)) next.delete(timestamp);
      else next.add(timestamp);
      return next;
    });
  }, []);

  const hasAnyMatches =
    (fileMatches && fileMatches.length > 0) ||
    (fileSuggestions && fileSuggestions.length > 0);

  // Group matches by timepoint
  const timelineRows = useMemo(() => {
    const timeMap = new Map<number, TimelineRow>();

    if (fileMatches) {
      for (const match of fileMatches) {
        const groupKey = Math.round(match.timestamp / 5) * 5;
        if (!timeMap.has(groupKey)) {
          timeMap.set(groupKey, {
            timestamp: groupKey,
            captionText: match.captionText,
            matches: [],
          });
        }
        const row = timeMap.get(groupKey)!;
        if (!row.captionText && match.captionText) {
          row.captionText = match.captionText;
        }
        row.matches.push({
          type: "visual",
          file: match.suggestedFile,
          relevanceScore: match.relevanceScore,
          reasoning: match.matchReasoning,
          entities: match.matchedEntities,
        });
      }
    }

    if (fileSuggestions) {
      for (const sug of fileSuggestions) {
        const groupKey = Math.round(sug.startTime / 5) * 5;
        if (!timeMap.has(groupKey)) {
          timeMap.set(groupKey, {
            timestamp: groupKey,
            transcriptExcerpt: sug.transcriptExcerpt,
            matches: [],
          });
        }
        const row = timeMap.get(groupKey)!;
        if (!row.transcriptExcerpt && sug.transcriptExcerpt) {
          row.transcriptExcerpt = sug.transcriptExcerpt;
        }
        row.matches.push({
          type: "transcript",
          file: sug.suggestedFile,
          relevanceScore: sug.relevanceScore,
          keywords: sug.matchedKeywords,
        });
      }
    }

    return Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [fileMatches, fileSuggestions]);

  // Deduplicated files for grid view
  const uniqueFiles = useMemo(() => {
    const fileMap = new Map<number, UniqueMatchedFile>();

    for (const row of timelineRows) {
      for (const match of row.matches) {
        const existing = fileMap.get(match.file.id);
        if (existing) {
          existing.matchCount++;
          if (match.relevanceScore > existing.bestScore) {
            existing.bestScore = match.relevanceScore;
            existing.reasoning = match.reasoning;
          }
          if (!existing.timepoints.includes(row.timestamp)) {
            existing.timepoints.push(row.timestamp);
          }
          existing.types.add(match.type);
          if (match.entities) {
            for (const e of match.entities) {
              if (!existing.allEntities.includes(e)) existing.allEntities.push(e);
            }
          }
          if (match.keywords) {
            for (const k of match.keywords) {
              if (!existing.allKeywords.includes(k)) existing.allKeywords.push(k);
            }
          }
          if (match.reasoning && !existing.allReasonings.includes(match.reasoning)) {
            existing.allReasonings.push(match.reasoning);
          }
        } else {
          fileMap.set(match.file.id, {
            file: match.file,
            bestScore: match.relevanceScore,
            matchCount: 1,
            timepoints: [row.timestamp],
            types: new Set([match.type]),
            allEntities: match.entities ? [...match.entities] : [],
            allKeywords: match.keywords ? [...match.keywords] : [],
            reasoning: match.reasoning,
            allReasonings: match.reasoning ? [match.reasoning] : [],
          });
        }
      }
    }

    return Array.from(fileMap.values()).sort((a, b) => b.bestScore - a.bestScore);
  }, [timelineRows]);

  // Filtered and sorted files for grid view
  const filteredFiles = useMemo(() => {
    let result = [...uniqueFiles];

    // Filter by match type
    if (matchTypeFilter !== "all") {
      result = result.filter((f) => f.types.has(matchTypeFilter));
    }

    // Filter by minimum confidence
    if (minConfidence > 0) {
      result = result.filter((f) => f.bestScore * 100 >= minConfidence);
    }

    // Sort
    switch (sortMode) {
      case "confidence":
        result.sort((a, b) => b.bestScore - a.bestScore);
        break;
      case "matches":
        result.sort((a, b) => b.matchCount - a.matchCount);
        break;
      case "name":
        result.sort((a, b) =>
          (a.file.title || a.file.filename).localeCompare(
            b.file.title || b.file.filename
          )
        );
        break;
    }

    return result;
  }, [uniqueFiles, matchTypeFilter, minConfidence, sortMode]);

  // Capture frames for all timepoints (fallback when no server thumbnails)
  useEffect(() => {
    if (!hasServerThumbnails) {
      for (const row of timelineRows) {
        captureFrame(row.timestamp);
      }
    }
  }, [timelineRows, captureFrame, hasServerThumbnails]);

  const handleSeek = useCallback(
    (timestamp: number) => {
      if (onSeekTo) {
        onSeekTo(timestamp);
      }
    },
    [onSeekTo]
  );

  const totalMatchCount = useMemo(() => {
    return timelineRows.reduce((sum, row) => sum + row.matches.length, 0);
  }, [timelineRows]);

  // Export as CSV
  const handleExportCSV = useCallback(() => {
    const rows: string[] = [
      ["Timepoint", "Timestamp (s)", "Match Type", "File Name", "File Title", "Confidence (%)", "Entities/Keywords", "Reasoning"].join(","),
    ];
    for (const row of timelineRows) {
      for (const match of row.matches) {
        const tags = match.entities || match.keywords || [];
        rows.push(
          [
            formatTimestamp(row.timestamp),
            row.timestamp.toFixed(1),
            match.type,
            `"${match.file.filename.replace(/"/g, '""')}"`,
            `"${(match.file.title || "").replace(/"/g, '""')}"`,
            Math.round(match.relevanceScore * 100).toString(),
            `"${tags.join("; ")}"`,
            `"${(match.reasoning || "").replace(/"/g, '""')}"`,
          ].join(",")
        );
      }
    }
    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `match-report-${videoTitle || "video"}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV report downloaded");
  }, [timelineRows, videoTitle]);

  // Export as formatted text report
  const handleExportReport = useCallback(() => {
    const lines: string[] = [
      `# File Match Report`,
      `Video: ${videoTitle || "Unknown"}`,
      `Generated: ${new Date().toLocaleString()}`,
      `Total Timepoints: ${timelineRows.length}`,
      `Total Matches: ${totalMatchCount}`,
      `Unique Files: ${uniqueFiles.length}`,
      "",
      "---",
      "",
    ];

    // Summary by file
    lines.push("## Matched Files Summary");
    lines.push("");
    for (const uf of uniqueFiles) {
      const score = Math.round(uf.bestScore * 100);
      const types = Array.from(uf.types).join(", ");
      lines.push(`### ${uf.file.title || uf.file.filename}`);
      lines.push(`- Confidence: ${score}%`);
      lines.push(`- Match Count: ${uf.matchCount}x`);
      lines.push(`- Match Types: ${types}`);
      lines.push(`- Timepoints: ${uf.timepoints.map(formatTimestamp).join(", ")}`);
      if (uf.allEntities.length > 0) lines.push(`- Entities: ${uf.allEntities.join(", ")}`);
      if (uf.allKeywords.length > 0) lines.push(`- Keywords: ${uf.allKeywords.join(", ")}`);
      if (uf.allReasonings.length > 0) {
        lines.push(`- Reasoning: ${uf.allReasonings[0]}`);
      }
      lines.push("");
    }

    // Timeline detail
    lines.push("## Timeline Detail");
    lines.push("");
    for (const row of timelineRows) {
      lines.push(`### ${formatTimestamp(row.timestamp)}`);
      if (row.captionText) lines.push(`Caption: ${row.captionText}`);
      if (row.transcriptExcerpt) lines.push(`Transcript: ${row.transcriptExcerpt}`);
      for (const match of row.matches) {
        const score = Math.round(match.relevanceScore * 100);
        lines.push(`- [${match.type}] ${match.file.title || match.file.filename} (${score}%)`);
        if (match.reasoning) lines.push(`  Reasoning: ${match.reasoning}`);
      }
      lines.push("");
    }

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `match-report-${videoTitle || "video"}-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  }, [timelineRows, uniqueFiles, totalMatchCount, videoTitle]);

  const [showRematchConfirm, setShowRematchConfirm] = useState(false);

  // Get the frame URL for a timestamp - prefer server thumbnails, fallback to client capture
  const getFrameUrl = useCallback(
    (timestamp: number): string | undefined => {
      const roundedTs = Math.round(timestamp * 10) / 10;
      // Try server thumbnail first (check nearby timestamps within 3 seconds)
      if (hasServerThumbnails) {
        if (serverThumbnailMap[roundedTs]) return serverThumbnailMap[roundedTs];
        // Try to find closest server thumbnail within 3 seconds
        for (const key of Object.keys(serverThumbnailMap)) {
          if (Math.abs(Number(key) - roundedTs) <= 3) {
            return serverThumbnailMap[Number(key)];
          }
        }
      }
      // Fallback to client-side capture
      return frames[roundedTs];
    },
    [hasServerThumbnails, serverThumbnailMap, frames]
  );

  if (matchesLoading || suggestionsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAnyMatches) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Files className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm font-medium mb-1">No matched files yet</p>
        <p className="text-xs mb-4 max-w-xs text-center">
          Generate captions or transcript first, then click &quot;Find Matches&quot; to discover
          related files at each timepoint.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={onFindMatches}
          disabled={findMatchesPending}
        >
          {findMatchesPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Search className="h-4 w-4 mr-1" />
          )}
          Find Matches
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between pb-3 border-b border-border/30 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">Matched Files</span>
          <Badge variant="secondary" className="text-xs">
            {uniqueFiles.length} files
          </Badge>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {totalMatchCount} matches
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {/* Settings popover */}
          {onUpdateSettings && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1"
                  title="Match settings"
                >
                  <Settings className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-4" align="end">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Settings className="h-3.5 w-3.5" />
                      Match Settings
                    </h4>
                  </div>

                  {/* Confidence Threshold */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Min Confidence</Label>
                      <span className="text-xs font-mono text-muted-foreground">
                        {Math.round((matchSettings?.minConfidenceThreshold ?? 0.3) * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[matchSettings?.minConfidenceThreshold ?? 0.3]}
                      min={0}
                      max={1}
                      step={0.05}
                      onValueChange={([val]) => onUpdateSettings({ minConfidenceThreshold: val })}
                      className="w-full"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Matches below this threshold will be filtered out during matching.
                    </p>
                  </div>

                  {/* Auto-match toggles */}
                  <div className="space-y-3 pt-2 border-t border-border/30">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-xs">Auto-match on Transcription</Label>
                        <p className="text-[10px] text-muted-foreground">Run matching after transcription completes</p>
                      </div>
                      <Switch
                        checked={matchSettings?.autoMatchOnTranscription ?? true}
                        onCheckedChange={(checked) => onUpdateSettings({ autoMatchOnTranscription: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-xs">Auto-match on Captioning</Label>
                        <p className="text-[10px] text-muted-foreground">Run matching after captioning completes</p>
                      </div>
                      <Switch
                        checked={matchSettings?.autoMatchOnCaptioning ?? true}
                        onCheckedChange={(checked) => onUpdateSettings({ autoMatchOnCaptioning: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-xs flex items-center gap-1">
                          {matchSettings?.notifyOnMatchComplete !== false ? (
                            <Bell className="h-3 w-3" />
                          ) : (
                            <BellOff className="h-3 w-3" />
                          )}
                          Notifications
                        </Label>
                        <p className="text-[10px] text-muted-foreground">Notify when matching completes</p>
                      </div>
                      <Switch
                        checked={matchSettings?.notifyOnMatchComplete ?? true}
                        onCheckedChange={(checked) => onUpdateSettings({ notifyOnMatchComplete: checked })}
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Export dropdown */}
          <div className="relative group/export">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              title="Export match report"
            >
              <Download className="h-3 w-3" />
              Export
              <ChevronDown className="h-2.5 w-2.5" />
            </Button>
            <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg py-1 z-50 hidden group-hover/export:block min-w-[140px]">
              <button
                onClick={handleExportCSV}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 cursor-pointer flex items-center gap-2"
              >
                <FileText className="h-3 w-3" />
                Export as CSV
              </button>
              <button
                onClick={handleExportReport}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 cursor-pointer flex items-center gap-2"
              >
                <Files className="h-3 w-3" />
                Export as Report
              </button>
            </div>
          </div>

          {/* Re-match button */}
          {onRematch && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 text-orange-400 hover:text-orange-300"
              onClick={() => setShowRematchConfirm(true)}
              disabled={rematchPending}
              title="Clear existing matches and re-run matching"
            >
              {rematchPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Re-match
            </Button>
          )}

          {/* Generate thumbnails button */}
          {!hasServerThumbnails && fileId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={() => generateThumbnailsMutation.mutate({ fileId })}
              disabled={generateThumbnailsMutation.isPending}
              title="Generate server-side frame thumbnails (higher quality)"
            >
              {generateThumbnailsMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Camera className="h-3 w-3" />
              )}
              Frames
            </Button>
          )}
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5">
            <button
              onClick={() => setViewMode("timeline")}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === "timeline"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Timeline View"
            >
              <List className="h-3 w-3" />
              <span>Timeline</span>
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === "grid"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Grid View"
            >
              <LayoutGrid className="h-3 w-3" />
              <span>Grid</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content area */}
      {viewMode === "timeline" ? (
        <TimelineView
          timelineRows={timelineRows}
          getFrameUrl={getFrameUrl}
          expandedRows={expandedRows}
          toggleRowExpand={toggleRowExpand}
          maxVisibleMatches={MAX_VISIBLE_MATCHES}
          onSeek={handleSeek}
          onFileClick={(match) => {
            const entry = uniqueFiles.find((f) => f.file.id === match.file.id);
            if (entry) setPreviewFile(entry);
          }}
        />
      ) : (
        <GridView
          uniqueFiles={filteredFiles}
          totalCount={uniqueFiles.length}
          onSeek={handleSeek}
          onFileClick={setPreviewFile}
          sortMode={sortMode}
          setSortMode={setSortMode}
          matchTypeFilter={matchTypeFilter}
          setMatchTypeFilter={setMatchTypeFilter}
          minConfidence={minConfidence}
          setMinConfidence={setMinConfidence}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
        />
      )}

      {/* File Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onSeek={handleSeek}
      />

      {/* Re-match Confirmation Dialog */}
      <Dialog open={showRematchConfirm} onOpenChange={setShowRematchConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-4 w-4 text-orange-400" />
              Re-match Files
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-muted-foreground">
              This will clear all existing matches ({totalMatchCount} matches across {uniqueFiles.length} files) and re-run the matching process from scratch.
            </p>
            <p className="text-sm text-muted-foreground">
              This is useful after uploading new files to your library or if you want to refresh the results.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRematchConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="default"
                className="bg-orange-600 hover:bg-orange-700 text-white"
                onClick={() => {
                  setShowRematchConfirm(false);
                  if (onRematch) onRematch();
                }}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear & Re-match
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Timeline View - rows with Timepoint → Video Frame → Matched Files
 */
function TimelineView({
  timelineRows,
  getFrameUrl,
  expandedRows,
  toggleRowExpand,
  maxVisibleMatches,
  onSeek,
  onFileClick,
}: {
  timelineRows: TimelineRow[];
  getFrameUrl: (ts: number) => string | undefined;
  expandedRows: Set<number>;
  toggleRowExpand: (ts: number) => void;
  maxVisibleMatches: number;
  onSeek: (ts: number) => void;
  onFileClick: (match: TimelineRow["matches"][0]) => void;
}) {
  return (
    <div className="overflow-y-auto flex-1 space-y-3 pr-1" style={{ maxHeight: "500px" }}>
      {timelineRows.map((row) => {
        const frameUrl = getFrameUrl(row.timestamp);
        const isExpanded = expandedRows.has(row.timestamp);
        const visibleMatches = isExpanded
          ? row.matches
          : row.matches.slice(0, maxVisibleMatches);
        const hiddenCount = row.matches.length - maxVisibleMatches;

        return (
          <div
            key={row.timestamp}
            className="flex items-start gap-3 pb-3 border-b border-border/10 last:border-0"
          >
            {/* Timepoint Label */}
            <button
              onClick={() => onSeek(row.timestamp)}
              className="flex flex-col items-center pt-1 shrink-0 w-[50px] cursor-pointer group/seek hover:scale-105 transition-transform"
              title={`Seek to ${formatTimestamp(row.timestamp)}`}
            >
              <span className="text-xs font-mono font-semibold text-primary group-hover/seek:text-purple-400 transition-colors">
                {formatTimestamp(row.timestamp)}
              </span>
              <Clock className="h-3 w-3 text-muted-foreground group-hover/seek:text-purple-400 mt-0.5 transition-colors" />
            </button>

            {/* Video Frame */}
            <button
              onClick={() => onSeek(row.timestamp)}
              className="relative shrink-0 w-[100px] h-[66px] rounded overflow-hidden border border-border/30 cursor-pointer hover:border-purple-400 transition-colors group/frame"
              title={`Seek to ${formatTimestamp(row.timestamp)}`}
            >
              {frameUrl ? (
                <img
                  src={frameUrl}
                  alt={`Frame at ${formatTimestamp(row.timestamp)}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-muted/50 text-muted-foreground">
                  <Play className="h-4 w-4 mb-0.5" />
                  <span className="text-[8px]">Frame</span>
                </div>
              )}
              <div className="absolute inset-0 bg-purple-500/0 group-hover/frame:bg-purple-500/20 flex items-center justify-center transition-colors">
                <Play className="h-5 w-5 text-white opacity-0 group-hover/frame:opacity-80 transition-opacity drop-shadow" />
              </div>
            </button>

            {/* Matched File Cards */}
            <div className="flex-1 min-w-0">
              <div className="flex gap-2 flex-wrap items-start">
                {visibleMatches.map((match, idx) => (
                  <MatchedFileCard
                    key={`${match.file.id}-${idx}`}
                    match={match}
                    onClick={() => onFileClick(match)}
                  />
                ))}
              </div>
              {hiddenCount > 0 && !isExpanded && (
                <button
                  onClick={() => toggleRowExpand(row.timestamp)}
                  className="text-[10px] text-purple-400 hover:text-purple-300 mt-1 cursor-pointer"
                >
                  +{hiddenCount} more match{hiddenCount > 1 ? "es" : ""}
                </button>
              )}
              {isExpanded && hiddenCount > 0 && (
                <button
                  onClick={() => toggleRowExpand(row.timestamp)}
                  className="text-[10px] text-purple-400 hover:text-purple-300 mt-1 cursor-pointer"
                >
                  Show less
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Grid View - all unique matched files in a card grid with filter/sort controls
 */
function GridView({
  uniqueFiles,
  totalCount,
  onSeek,
  onFileClick,
  sortMode,
  setSortMode,
  matchTypeFilter,
  setMatchTypeFilter,
  minConfidence,
  setMinConfidence,
  showFilters,
  setShowFilters,
}: {
  uniqueFiles: UniqueMatchedFile[];
  totalCount: number;
  onSeek: (ts: number) => void;
  onFileClick: (file: UniqueMatchedFile) => void;
  sortMode: SortMode;
  setSortMode: (mode: SortMode) => void;
  matchTypeFilter: MatchTypeFilter;
  setMatchTypeFilter: (filter: MatchTypeFilter) => void;
  minConfidence: number;
  setMinConfidence: (val: number) => void;
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
}) {
  return (
    <div className="flex flex-col flex-1">
      {/* Filter/Sort Controls */}
      <div className="flex items-center gap-2 mb-2 shrink-0 flex-wrap">
        {/* Sort dropdown */}
        <div className="flex items-center gap-1">
          <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="text-xs bg-muted/50 border border-border/40 rounded px-1.5 py-0.5 text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-400"
          >
            <option value="confidence">Confidence</option>
            <option value="matches">Match Count</option>
            <option value="name">Name</option>
          </select>
        </div>

        {/* Match type filter */}
        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <select
            value={matchTypeFilter}
            onChange={(e) => setMatchTypeFilter(e.target.value as MatchTypeFilter)}
            className="text-xs bg-muted/50 border border-border/40 rounded px-1.5 py-0.5 text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-400"
          >
            <option value="all">All Types</option>
            <option value="visual">Visual Only</option>
            <option value="transcript">Transcript Only</option>
          </select>
        </div>

        {/* Confidence threshold toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
            minConfidence > 0
              ? "border-purple-400/50 bg-purple-500/20 text-purple-300"
              : "border-border/40 bg-muted/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          {minConfidence > 0 ? `≥${minConfidence}%` : "Min %"}
          {showFilters ? (
            <ChevronUp className="h-2.5 w-2.5" />
          ) : (
            <ChevronDown className="h-2.5 w-2.5" />
          )}
        </button>

        {/* Clear filters */}
        {(matchTypeFilter !== "all" || minConfidence > 0) && (
          <button
            onClick={() => {
              setMatchTypeFilter("all");
              setMinConfidence(0);
              setSortMode("confidence");
            }}
            className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-2.5 w-2.5" />
            Clear
          </button>
        )}

        {/* Result count */}
        <span className="text-[10px] text-muted-foreground ml-auto">
          {uniqueFiles.length === totalCount
            ? `${totalCount} files`
            : `${uniqueFiles.length} of ${totalCount}`}
        </span>
      </div>

      {/* Confidence slider */}
      {showFilters && (
        <div className="flex items-center gap-3 mb-3 px-1 shrink-0">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            Min confidence:
          </span>
          <Slider
            value={[minConfidence]}
            onValueChange={([val]) => setMinConfidence(val)}
            min={0}
            max={100}
            step={5}
            className="flex-1"
          />
          <span className="text-xs font-mono text-foreground w-8 text-right">
            {minConfidence}%
          </span>
        </div>
      )}

      {/* Grid */}
      <div className="overflow-y-auto flex-1 pr-1" style={{ maxHeight: showFilters ? "430px" : "460px" }}>
        {uniqueFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Filter className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">No files match the current filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {uniqueFiles.map((entry) => (
              <GridFileCard
                key={entry.file.id}
                entry={entry}
                onSeek={onSeek}
                onClick={() => onFileClick(entry)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Grid file card
 */
function GridFileCard({
  entry,
  onSeek,
  onClick,
}: {
  entry: UniqueMatchedFile;
  onSeek: (ts: number) => void;
  onClick: () => void;
}) {
  const isImage = entry.file.mimeType?.startsWith("image/");
  const score = Math.round(entry.bestScore * 100);
  const tags = [...entry.allEntities, ...entry.allKeywords];
  const uniqueTags = Array.from(new Set(tags)).slice(0, 4);

  return (
    <div
      className="rounded-lg border border-border/40 bg-card/50 overflow-hidden hover:border-purple-400/50 transition-colors group/card cursor-pointer"
      onClick={onClick}
    >
      {/* Thumbnail / Preview */}
      <div className="relative aspect-[4/3] bg-muted/30 overflow-hidden">
        {isImage ? (
          <img
            src={entry.file.url}
            alt={entry.file.filename}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-1">
            {getFileIcon(entry.file.mimeType)}
            <span className="text-[10px]">{entry.file.mimeType?.split("/")[1]?.toUpperCase() || "FILE"}</span>
          </div>
        )}
        {/* Score badge */}
        <div className="absolute top-1.5 right-1.5">
          <Badge
            className={`text-[10px] px-1.5 py-0 border ${
              score >= 70
                ? "bg-green-600/90 text-white border-green-400/50"
                : score >= 40
                ? "bg-yellow-600/90 text-white border-yellow-400/50"
                : "bg-red-600/90 text-white border-red-400/50"
            }`}
          >
            {score}%
          </Badge>
        </div>
        {/* Match type indicators */}
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          {entry.types.has("visual") && (
            <div className="bg-purple-600/80 rounded-full p-0.5" title="Visual match">
              <Eye className="h-2.5 w-2.5 text-white" />
            </div>
          )}
          {entry.types.has("transcript") && (
            <div className="bg-blue-600/80 rounded-full p-0.5" title="Transcript match">
              <FileText className="h-2.5 w-2.5 text-white" />
            </div>
          )}
        </div>
        {/* Match count */}
        {entry.matchCount > 1 && (
          <div className="absolute bottom-1.5 right-1.5">
            <Badge variant="secondary" className="text-[9px] px-1 py-0">
              {entry.matchCount}x matched
            </Badge>
          </div>
        )}
      </div>

      {/* File info */}
      <div className="p-2 space-y-1.5">
        <p className="text-xs font-medium leading-tight line-clamp-2">
          {entry.file.title || entry.file.filename}
        </p>

        {/* Tags */}
        {uniqueTags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {uniqueTags.map((tag, i) => (
              <span
                key={i}
                className="text-[9px] px-1 py-0 rounded bg-purple-500/20 text-purple-300 border border-purple-500/20"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Timepoints */}
        <div className="flex gap-1 flex-wrap">
          {entry.timepoints.slice(0, 5).map((ts) => (
            <button
              key={ts}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(ts);
              }}
              className="text-[9px] font-mono px-1 py-0 rounded bg-muted/50 text-muted-foreground hover:bg-purple-500/30 hover:text-purple-300 cursor-pointer transition-colors"
              title={`Seek to ${formatTimestamp(ts)}`}
            >
              {formatTimestamp(ts)}
            </button>
          ))}
          {entry.timepoints.length > 5 && (
            <span className="text-[9px] text-muted-foreground">
              +{entry.timepoints.length - 5}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Individual matched file card for timeline view
 */
function MatchedFileCard({
  match,
  onClick,
}: {
  match: TimelineRow["matches"][0];
  onClick: () => void;
}) {
  const isImage = match.file.mimeType?.startsWith("image/");
  const tags = match.entities || match.keywords || [];
  const score = Math.round(match.relevanceScore * 100);

  return (
    <div
      className="relative w-[150px] h-[110px] rounded-md overflow-hidden border border-purple-500/60 bg-purple-900/60 flex flex-col items-center justify-center text-center p-2 cursor-pointer hover:border-purple-400 transition-colors"
      title={match.reasoning || match.file.description || match.file.filename}
      onClick={onClick}
    >
      {isImage ? (
        <>
          <img
            src={match.file.url}
            alt={match.file.filename}
            className="absolute inset-0 w-full h-full object-cover opacity-30"
            loading="lazy"
          />
          <div className="relative z-10 flex flex-col items-center justify-center h-full">
            <p className="text-white text-[11px] font-semibold leading-tight line-clamp-2 mb-0.5">
              {match.file.title || match.file.filename}
            </p>
            <p className="text-purple-200 text-[9px] leading-tight line-clamp-1">
              {score >= 70 ? "high" : score >= 40 ? "medium" : "low"} confidence
            </p>
            {tags.length > 0 && (
              <div className="flex gap-0.5 flex-wrap justify-center mt-0.5">
                {tags.slice(0, 2).map((tag, i) => (
                  <span
                    key={i}
                    className="text-[8px] px-1 py-0 rounded bg-purple-500/50 text-purple-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="absolute top-1 right-1 z-10">
            <Badge className="text-[9px] px-1 py-0 bg-purple-600/80 text-white border-purple-400/50">
              {score}%
            </Badge>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center justify-center h-full gap-0.5">
            <div className="text-purple-300">
              {getSmallFileIcon(match.file.mimeType)}
            </div>
            <p className="text-white text-[11px] font-semibold leading-tight line-clamp-2">
              {match.file.title || match.file.filename}
            </p>
            <p className="text-purple-200 text-[9px] leading-tight line-clamp-1">
              {score >= 70 ? "high" : score >= 40 ? "medium" : "low"} confidence
            </p>
            {tags.length > 0 && (
              <div className="flex gap-0.5 flex-wrap justify-center mt-0.5">
                {tags.slice(0, 2).map((tag, i) => (
                  <span
                    key={i}
                    className="text-[8px] px-1 py-0 rounded bg-purple-500/50 text-purple-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="absolute top-1 right-1">
            <Badge className="text-[9px] px-1 py-0 bg-purple-600/80 text-white border-purple-400/50">
              {score}%
            </Badge>
          </div>
        </>
      )}
      {/* Match type indicator */}
      <div className="absolute top-1 left-1">
        {match.type === "visual" ? (
          <Sparkles className="h-2.5 w-2.5 text-purple-300 drop-shadow" />
        ) : (
          <FileText className="h-2.5 w-2.5 text-blue-300 drop-shadow" />
        )}
      </div>
    </div>
  );
}

/**
 * File Preview Modal - shows full file details, match reasoning, and timepoints
 */
function FilePreviewModal({
  file,
  onClose,
  onSeek,
}: {
  file: UniqueMatchedFile | null;
  onClose: () => void;
  onSeek: (ts: number) => void;
}) {
  if (!file) return null;

  const isImage = file.file.mimeType?.startsWith("image/");
  const isVideo = file.file.mimeType?.startsWith("video/");
  const isAudio = file.file.mimeType?.startsWith("audio/");
  const score = Math.round(file.bestScore * 100);
  const tags = [...file.allEntities, ...file.allKeywords];
  const uniqueTags = Array.from(new Set(tags));

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {getSmallFileIcon(file.file.mimeType)}
            <span className="truncate">{file.file.title || file.file.filename}</span>
            <Badge
              className={`text-xs px-2 py-0 ml-auto shrink-0 ${
                score >= 70
                  ? "bg-green-600/90 text-white"
                  : score >= 40
                  ? "bg-yellow-600/90 text-white"
                  : "bg-red-600/90 text-white"
              }`}
            >
              {score}% match
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* File Preview */}
          <div className="rounded-lg overflow-hidden border border-border/40 bg-muted/20">
            {isImage ? (
              <img
                src={file.file.url}
                alt={file.file.filename}
                className="w-full max-h-[300px] object-contain"
              />
            ) : isVideo ? (
              <video
                src={file.file.url}
                controls
                className="w-full max-h-[300px]"
              />
            ) : isAudio ? (
              <div className="p-6 flex flex-col items-center gap-3">
                <FileAudio className="h-12 w-12 text-muted-foreground" />
                <audio src={file.file.url} controls className="w-full" />
              </div>
            ) : (
              <div className="p-8 flex flex-col items-center gap-2 text-muted-foreground">
                {getFileIcon(file.file.mimeType)}
                <p className="text-sm">{file.file.mimeType || "Unknown type"}</p>
              </div>
            )}
          </div>

          {/* File Details */}
          <div className="space-y-3">
            {/* Filename */}
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Filename</p>
              <p className="text-sm">{file.file.filename}</p>
            </div>

            {/* Description */}
            {file.file.description && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Description</p>
                <p className="text-sm">{file.file.description}</p>
              </div>
            )}

            {/* Match Stats */}
            <div className="flex gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Confidence</p>
                <p className="text-sm font-semibold">{score}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Match Count</p>
                <p className="text-sm font-semibold">{file.matchCount}x</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Match Types</p>
                <div className="flex gap-1">
                  {file.types.has("visual") && (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <Eye className="h-2.5 w-2.5" />
                      Visual
                    </Badge>
                  )}
                  {file.types.has("transcript") && (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <FileText className="h-2.5 w-2.5" />
                      Transcript
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Match Reasoning */}
            {file.allReasonings.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Match Reasoning</p>
                <div className="space-y-1.5">
                  {file.allReasonings.slice(0, 3).map((reason, i) => (
                    <p
                      key={i}
                      className="text-xs bg-muted/30 rounded-md p-2 border border-border/20 leading-relaxed"
                    >
                      {reason}
                    </p>
                  ))}
                  {file.allReasonings.length > 3 && (
                    <p className="text-[10px] text-muted-foreground">
                      +{file.allReasonings.length - 3} more reasoning{file.allReasonings.length - 3 > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Tags / Entities */}
            {uniqueTags.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Matched Entities & Keywords</p>
                <div className="flex gap-1.5 flex-wrap">
                  {uniqueTags.map((tag, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="text-[10px] bg-purple-500/10 border-purple-500/30 text-purple-300"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Timepoints */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Appears at {file.timepoints.length} timepoint{file.timepoints.length > 1 ? "s" : ""}
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {file.timepoints.map((ts) => (
                  <button
                    key={ts}
                    onClick={() => {
                      onSeek(ts);
                      onClose();
                    }}
                    className="flex items-center gap-1 text-xs font-mono px-2 py-1 rounded-md bg-muted/50 text-foreground hover:bg-purple-500/30 hover:text-purple-300 cursor-pointer transition-colors border border-border/30"
                    title={`Seek to ${formatTimestamp(ts)}`}
                  >
                    <Play className="h-2.5 w-2.5" />
                    {formatTimestamp(ts)}
                  </button>
                ))}
              </div>
            </div>

            {/* View file link */}
            <a
              href={file.file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open original file
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Self-contained wrapper that fetches match data via tRPC hooks.
 */
export function MatchesTimelineWithData({
  videoId,
  fileId,
  videoUrl,
  videoTitle,
  onSeekTo,
}: {
  videoId: number;
  fileId: number | null;
  videoUrl: string;
  videoTitle?: string;
  onSeekTo?: (timestamp: number) => void;
}) {
  const utils = trpc.useUtils();

  // Fetch user's match settings
  const { data: matchSettings } =
    trpc.videoVisualCaptions.getMatchSettings.useQuery();

  const updateSettingsMutation =
    trpc.videoVisualCaptions.updateMatchSettings.useMutation({
      onSuccess: () => {
        utils.videoVisualCaptions.getMatchSettings.invalidate();
        toast.success("Settings updated");
      },
      onError: () => {
        toast.error("Failed to update settings");
      },
    });

  const handleUpdateSettings = (settings: Partial<{
    minConfidenceThreshold: number;
    autoMatchOnTranscription: boolean;
    autoMatchOnCaptioning: boolean;
    notifyOnMatchComplete: boolean;
  }>) => {
    updateSettingsMutation.mutate(settings);
  };

  const { data: fileMatches, isLoading: matchesLoading } =
    trpc.videoVisualCaptions.getFileMatches.useQuery(
      { fileId: fileId! },
      { enabled: !!fileId }
    );

  const { data: fileSuggestions, isLoading: suggestionsLoading } =
    trpc.videoTranscription.getFileSuggestions.useQuery(
      { fileId: fileId! },
      { enabled: !!fileId }
    );

  const { data: transcript } = trpc.videoTranscription.getTranscript.useQuery(
    { fileId: fileId! },
    { enabled: !!fileId }
  );
  const { data: captions } = trpc.videoVisualCaptions.getCaptions.useQuery(
    { fileId: fileId! },
    { enabled: !!fileId }
  );

  const [isFinding, setIsFinding] = useState(false);
  const [isRematching, setIsRematching] = useState(false);

  const rematchMutation = trpc.videoVisualCaptions.rematch.useMutation({
    onSuccess: () => {
      if (fileId) {
        utils.videoVisualCaptions.getFileMatches.invalidate({ fileId });
        utils.videoTranscription.getFileSuggestions.invalidate({ fileId });
      }
      toast.success("Matches cleared. Re-matching in progress...");
      // Poll for new results after a delay
      setTimeout(() => {
        if (fileId) {
          utils.videoVisualCaptions.getFileMatches.invalidate({ fileId });
          utils.videoTranscription.getFileSuggestions.invalidate({ fileId });
        }
      }, 10000);
    },
    onError: () => {
      toast.error("Failed to re-match. Please try again.");
    },
  });

  const handleRematch = async () => {
    if (!fileId) return;
    setIsRematching(true);
    try {
      const threshold = matchSettings?.minConfidenceThreshold ?? 0.3;
      await rematchMutation.mutateAsync({ fileId, minRelevanceScore: threshold });
    } finally {
      setIsRematching(false);
    }
  };

  const generateVisualMatchesMutation =
    trpc.videoVisualCaptions.generateFileMatches.useMutation({
      onSuccess: () => {
        if (fileId) {
          utils.videoVisualCaptions.getFileMatches.invalidate({ fileId });
        }
      },
    });

  const generateTranscriptMatchesMutation =
    trpc.videoTranscription.generateFileSuggestions.useMutation({
      onSuccess: () => {
        if (fileId) {
          utils.videoTranscription.getFileSuggestions.invalidate({ fileId });
        }
      },
    });

  const handleFindMatches = async () => {
    if (!fileId) return;
    const hasCaptions = captions && captions.status === "completed";
    const hasTranscriptData = transcript && transcript.status === "completed";

    if (!hasCaptions && !hasTranscriptData) {
      toast.error("Generate captions or transcripts first before finding matches.");
      return;
    }

    setIsFinding(true);
    try {
      const promises: Promise<any>[] = [];
      if (hasCaptions) {
        const threshold = matchSettings?.minConfidenceThreshold ?? 0.3;
        promises.push(
          generateVisualMatchesMutation.mutateAsync({
            fileId,
            minRelevanceScore: threshold,
          })
        );
      }
      if (hasTranscriptData) {
        const threshold = matchSettings?.minConfidenceThreshold ?? 0.3;
        promises.push(
          generateTranscriptMatchesMutation.mutateAsync({
            fileId,
            minRelevanceScore: threshold,
          })
        );
      }
      const results = await Promise.allSettled(promises);
      const successCount = results.filter((r) => r.status === "fulfilled").length;
      if (successCount > 0) {
        toast.success("File matching complete!");
      } else {
        toast.error("File matching failed. Please try again.");
      }
    } catch {
      toast.error("Failed to find matches.");
    } finally {
      setIsFinding(false);
    }
  };

  // Normalize match settings for the component
  const normalizedSettings = matchSettings
    ? {
        minConfidenceThreshold: matchSettings.minConfidenceThreshold ?? 0.3,
        autoMatchOnTranscription: matchSettings.autoMatchOnTranscription ?? true,
        autoMatchOnCaptioning: matchSettings.autoMatchOnCaptioning ?? true,
        notifyOnMatchComplete: matchSettings.notifyOnMatchComplete ?? true,
      }
    : undefined;

  return (
    <MatchesTimeline
      videoUrl={videoUrl}
      fileId={fileId}
      videoTitle={videoTitle}
      fileMatches={fileMatches}
      fileSuggestions={fileSuggestions}
      matchesLoading={matchesLoading}
      suggestionsLoading={suggestionsLoading}
      onFindMatches={handleFindMatches}
      findMatchesPending={isFinding}
      onSeekTo={onSeekTo}
      onRematch={handleRematch}
      rematchPending={isRematching}
      matchSettings={normalizedSettings}
      onUpdateSettings={handleUpdateSettings}
    />
  );
}
