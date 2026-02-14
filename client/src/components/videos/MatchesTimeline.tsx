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

interface MatchesTimelineProps {
  videoUrl: string;
  fileMatches: any[] | undefined;
  fileSuggestions: any[] | undefined;
  matchesLoading: boolean;
  suggestionsLoading: boolean;
  onFindMatches: () => void;
  findMatchesPending: boolean;
}

/**
 * Captures frames from a video at specific timestamps.
 */
function useVideoFrameCapture(videoUrl: string) {
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frames, setFrames] = useState<Record<number, string>>({});
  const pendingCaptures = useRef<Set<number>>(new Set());

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

  const captureFrame = useCallback(
    (timestamp: number) => {
      const roundedTs = Math.round(timestamp * 10) / 10;
      if (frames[roundedTs] || pendingCaptures.current.has(roundedTs)) return;
      pendingCaptures.current.add(roundedTs);

      const video = captureVideoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      const handleSeeked = () => {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          setFrames((prev) => ({ ...prev, [roundedTs]: dataUrl }));
        }
        pendingCaptures.current.delete(roundedTs);
        video.removeEventListener("seeked", handleSeeked);
      };

      video.addEventListener("seeked", handleSeeked);
      video.currentTime = timestamp;
    },
    [frames]
  );

  return { frames, captureFrame };
}

export function MatchesTimeline({
  videoUrl,
  fileMatches,
  fileSuggestions,
  matchesLoading,
  suggestionsLoading,
  onFindMatches,
  findMatchesPending,
}: MatchesTimelineProps) {
  const { frames, captureFrame } = useVideoFrameCapture(videoUrl);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const MAX_VISIBLE_MATCHES = 2;

  const toggleRowExpand = useCallback((timestamp: number) => {
    setExpandedRows(prev => {
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

    // Add visual matches
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

    // Add transcript suggestions
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

  // Capture frames for all timepoints
  useEffect(() => {
    for (const row of timelineRows) {
      captureFrame(row.timestamp);
    }
  }, [timelineRows, captureFrame]);

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
          Generate captions or transcript first, then click "Find Matches" to discover
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
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/30 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">File Match Timeline</span>
          <Badge variant="secondary" className="text-xs">
            {timelineRows.length} timepoints
          </Badge>
        </div>
      </div>

      {/* Scrollable timeline */}
      <div className="overflow-y-auto flex-1 space-y-4 pr-2" style={{ maxHeight: '500px' }}>
        {timelineRows.map((row) => {
          const roundedTs = Math.round(row.timestamp * 10) / 10;
          const frameUrl = frames[roundedTs];
          const isExpanded = expandedRows.has(row.timestamp);
          const visibleMatches = isExpanded ? row.matches : row.matches.slice(0, MAX_VISIBLE_MATCHES);
          const hiddenCount = row.matches.length - MAX_VISIBLE_MATCHES;

          return (
            <div key={row.timestamp} className="flex items-start gap-3 pb-4 border-b border-border/10 last:border-0">
              {/* Timepoint Label */}
              <div className="flex flex-col items-center pt-1 shrink-0 w-[50px]">
                <span className="text-xs font-mono font-semibold text-primary">
                  {formatTimestamp(row.timestamp)}
                </span>
                <span className="text-[9px] text-muted-foreground mt-0.5">Timepoint</span>
              </div>

              {/* Video Frame */}
              <div className="relative shrink-0 w-[100px] h-[70px] rounded overflow-hidden bg-red-600/80 border border-red-500/50">
                {frameUrl ? (
                  <img
                    src={frameUrl}
                    alt={`Frame at ${formatTimestamp(row.timestamp)}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-white/70">
                    <Play className="h-5 w-5 mb-0.5" />
                    <span className="text-[9px]">Frame</span>
                  </div>
                )}
              </div>

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
                    +{hiddenCount} more match{hiddenCount > 1 ? 'es' : ''}
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
    </div>
  );
}

/**
 * Individual matched file card - styled to match the mockup with purple/magenta theme
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
      className="relative w-[160px] h-[120px] rounded-md overflow-hidden border-2 border-purple-500 bg-purple-900/80 flex flex-col items-center justify-center text-center p-2 cursor-pointer hover:border-purple-400 transition-colors"
      title={match.reasoning || match.file.description || match.file.filename}
    >
      {isImage ? (
        <>
          <img
            src={match.file.url}
            alt={match.file.filename}
            className="absolute inset-0 w-full h-full object-cover opacity-40"
            loading="lazy"
          />
          <div className="relative z-10 flex flex-col items-center justify-center h-full">
            <p className="text-white text-xs font-semibold leading-tight line-clamp-2 mb-1">
              {match.file.title || match.file.filename}
            </p>
            <p className="text-purple-200 text-[10px] leading-tight line-clamp-2">
              based on {score >= 70 ? "high" : score >= 40 ? "medium" : "low"} confidence metadata matching
            </p>
            {tags.length > 0 && (
              <div className="flex gap-1 flex-wrap justify-center mt-1">
                {tags.slice(0, 2).map((tag, i) => (
                  <span key={i} className="text-[9px] px-1 py-0 rounded bg-purple-500/50 text-purple-100">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          {/* Score badge */}
          <div className="absolute top-1 right-1 z-10">
            <Badge className="text-[10px] px-1 py-0 bg-purple-600/80 text-white border-purple-400/50">
              {score}%
            </Badge>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center justify-center h-full gap-1">
            <div className="text-purple-300">
              {getFileIcon(match.file.mimeType)}
            </div>
            <p className="text-white text-xs font-semibold leading-tight line-clamp-2">
              {match.file.title || match.file.filename}
            </p>
            <p className="text-purple-200 text-[10px] leading-tight line-clamp-2">
              based on {score >= 70 ? "high" : score >= 40 ? "medium" : "low"} confidence metadata matching
            </p>
            {tags.length > 0 && (
              <div className="flex gap-1 flex-wrap justify-center mt-0.5">
                {tags.slice(0, 2).map((tag, i) => (
                  <span key={i} className="text-[9px] px-1 py-0 rounded bg-purple-500/50 text-purple-100">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          {/* Score badge */}
          <div className="absolute top-1 right-1">
            <Badge className="text-[10px] px-1 py-0 bg-purple-600/80 text-white border-purple-400/50">
              {score}%
            </Badge>
          </div>
        </>
      )}
      {/* Match type indicator */}
      <div className="absolute top-1 left-1">
        {match.type === "visual" ? (
          <Sparkles className="h-3 w-3 text-purple-300 drop-shadow" />
        ) : (
          <FileText className="h-3 w-3 text-blue-300 drop-shadow" />
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
}: {
  videoId: number;
  fileId: number | null;
  videoUrl: string;
}) {
  const utils = trpc.useUtils();

  // Fetch file matches directly
  const { data: fileMatches, isLoading: matchesLoading } = trpc.videoVisualCaptions.getFileMatches.useQuery(
    { fileId: fileId! },
    { enabled: !!fileId }
  );

  // Fetch transcript-based file suggestions
  const { data: fileSuggestions, isLoading: suggestionsLoading } = trpc.videoTranscription.getFileSuggestions.useQuery(
    { fileId: fileId! },
    { enabled: !!fileId }
  );

  // Fetch transcript and captions status to know if we can find matches
  const { data: transcript } = trpc.videoTranscription.getTranscript.useQuery(
    { fileId: fileId! },
    { enabled: !!fileId }
  );
  const { data: captions } = trpc.videoVisualCaptions.getCaptions.useQuery(
    { fileId: fileId! },
    { enabled: !!fileId }
  );

  const [isFinding, setIsFinding] = useState(false);

  // Generate matches mutations
  const generateVisualMatchesMutation = trpc.videoVisualCaptions.generateFileMatches.useMutation({
    onSuccess: () => {
      if (fileId) {
        utils.videoVisualCaptions.getFileMatches.invalidate({ fileId });
      }
    },
  });

  const generateTranscriptMatchesMutation = trpc.videoTranscription.generateFileSuggestions.useMutation({
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
        promises.push(generateVisualMatchesMutation.mutateAsync({ fileId, minRelevanceScore: 0.3 }));
      }
      if (hasTranscriptData) {
        promises.push(generateTranscriptMatchesMutation.mutateAsync({ fileId, minRelevanceScore: 0.3 }));
      }
      const results = await Promise.allSettled(promises);
      const successCount = results.filter(r => r.status === "fulfilled").length;
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
    />
  );
}
