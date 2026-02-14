import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
}

interface MatchesTimelineProps {
  videoUrl: string;
  fileMatches: any[] | undefined;
  fileSuggestions: any[] | undefined;
  matchesLoading: boolean;
  suggestionsLoading: boolean;
  onFindMatches: () => void;
  findMatchesPending: boolean;
  onSeekTo?: (timestamp: number) => void;
}

/**
 * Captures frames from a video at specific timestamps using an offscreen video element.
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
      // Process next in queue
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

export function MatchesTimeline({
  videoUrl,
  fileMatches,
  fileSuggestions,
  matchesLoading,
  suggestionsLoading,
  onFindMatches,
  findMatchesPending,
  onSeekTo,
}: MatchesTimelineProps) {
  const { frames, captureFrame } = useVideoFrameCapture(videoUrl);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const MAX_VISIBLE_MATCHES = 2;

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

  // Group matches by timepoint (rounded to nearest 5 seconds for grouping)
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
          });
        }
      }
    }

    return Array.from(fileMap.values()).sort((a, b) => b.bestScore - a.bestScore);
  }, [timelineRows]);

  // Capture frames for all timepoints
  useEffect(() => {
    for (const row of timelineRows) {
      captureFrame(row.timestamp);
    }
  }, [timelineRows, captureFrame]);

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

      {/* Content area */}
      {viewMode === "timeline" ? (
        <TimelineView
          timelineRows={timelineRows}
          frames={frames}
          expandedRows={expandedRows}
          toggleRowExpand={toggleRowExpand}
          maxVisibleMatches={MAX_VISIBLE_MATCHES}
          onSeek={handleSeek}
        />
      ) : (
        <GridView
          uniqueFiles={uniqueFiles}
          onSeek={handleSeek}
        />
      )}
    </div>
  );
}

/**
 * Timeline View - rows with Timepoint → Video Frame → Matched Files
 */
function TimelineView({
  timelineRows,
  frames,
  expandedRows,
  toggleRowExpand,
  maxVisibleMatches,
  onSeek,
}: {
  timelineRows: TimelineRow[];
  frames: Record<number, string>;
  expandedRows: Set<number>;
  toggleRowExpand: (ts: number) => void;
  maxVisibleMatches: number;
  onSeek: (ts: number) => void;
}) {
  return (
    <div className="overflow-y-auto flex-1 space-y-3 pr-1" style={{ maxHeight: "500px" }}>
      {timelineRows.map((row) => {
        const roundedTs = Math.round(row.timestamp * 10) / 10;
        const frameUrl = frames[roundedTs];
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
            {/* Timepoint Label - clickable to seek */}
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

            {/* Video Frame - clickable to seek */}
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
              {/* Seek overlay */}
              <div className="absolute inset-0 bg-purple-500/0 group-hover/frame:bg-purple-500/20 flex items-center justify-center transition-colors">
                <Play className="h-5 w-5 text-white opacity-0 group-hover/frame:opacity-80 transition-opacity drop-shadow" />
              </div>
            </button>

            {/* Matched File Cards */}
            <div className="flex-1 min-w-0">
              <div className="flex gap-2 flex-wrap items-start">
                {visibleMatches.map((match, idx) => (
                  <MatchedFileCard key={`${match.file.id}-${idx}`} match={match} />
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
 * Grid View - all unique matched files in a card grid (like Files/Videos pages)
 */
function GridView({
  uniqueFiles,
  onSeek,
}: {
  uniqueFiles: UniqueMatchedFile[];
  onSeek: (ts: number) => void;
}) {
  return (
    <div className="overflow-y-auto flex-1 pr-1" style={{ maxHeight: "500px" }}>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        {uniqueFiles.map((entry) => (
          <GridFileCard key={entry.file.id} entry={entry} onSeek={onSeek} />
        ))}
      </div>
    </div>
  );
}

/**
 * Grid file card - shows file thumbnail, metadata, confidence, and timepoints
 */
function GridFileCard({
  entry,
  onSeek,
}: {
  entry: UniqueMatchedFile;
  onSeek: (ts: number) => void;
}) {
  const isImage = entry.file.mimeType?.startsWith("image/");
  const score = Math.round(entry.bestScore * 100);
  const tags = [...entry.allEntities, ...entry.allKeywords];
  const uniqueTags = Array.from(new Set(tags)).slice(0, 4);

  return (
    <div className="rounded-lg border border-border/40 bg-card/50 overflow-hidden hover:border-purple-400/50 transition-colors group/card">
      {/* Thumbnail / Preview */}
      <div className="relative aspect-[4/3] bg-muted/30 overflow-hidden">
        {isImage ? (
          <img
            src={entry.file.url}
            alt={entry.file.filename}
            className="w-full h-full object-cover"
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

        {/* Timepoints - clickable to seek */}
        <div className="flex gap-1 flex-wrap">
          {entry.timepoints.slice(0, 5).map((ts) => (
            <button
              key={ts}
              onClick={() => onSeek(ts)}
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

        {/* View file link */}
        <a
          href={entry.file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          View file
        </a>
      </div>
    </div>
  );
}

/**
 * Individual matched file card for timeline view - compact purple/magenta theme
 */
function MatchedFileCard({
  match,
}: {
  match: TimelineRow["matches"][0];
}) {
  const isImage = match.file.mimeType?.startsWith("image/");
  const tags = match.entities || match.keywords || [];
  const score = Math.round(match.relevanceScore * 100);

  return (
    <div
      className="relative w-[150px] h-[110px] rounded-md overflow-hidden border border-purple-500/60 bg-purple-900/60 flex flex-col items-center justify-center text-center p-2 cursor-pointer hover:border-purple-400 transition-colors"
      title={match.reasoning || match.file.description || match.file.filename}
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
 * Self-contained wrapper that fetches match data via tRPC hooks.
 * Use this in VideoList where we can't rely on refs for data.
 */
export function MatchesTimelineWithData({
  videoId,
  fileId,
  videoUrl,
  onSeekTo,
}: {
  videoId: number;
  fileId: number | null;
  videoUrl: string;
  onSeekTo?: (timestamp: number) => void;
}) {
  const utils = trpc.useUtils();

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
        promises.push(
          generateVisualMatchesMutation.mutateAsync({
            fileId,
            minRelevanceScore: 0.3,
          })
        );
      }
      if (hasTranscriptData) {
        promises.push(
          generateTranscriptMatchesMutation.mutateAsync({
            fileId,
            minRelevanceScore: 0.3,
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

  return (
    <MatchesTimeline
      videoUrl={videoUrl}
      fileMatches={fileMatches}
      fileSuggestions={fileSuggestions}
      matchesLoading={matchesLoading}
      suggestionsLoading={suggestionsLoading}
      onFindMatches={handleFindMatches}
      findMatchesPending={isFinding}
      onSeekTo={onSeekTo}
    />
  );
}
