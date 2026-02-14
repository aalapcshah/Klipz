import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Eye,
  Sparkles,
  Loader2,
  Play,
  FileText,
  Image as ImageIcon,
  Video,
  File as FileIcon,
  ThumbsUp,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  Brain,
  Link2,
  BarChart3,
  Pencil,
  Check,
  Download,
  SlidersHorizontal,
  Move,
} from "lucide-react";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";
import { FileProcessingBanner, useAutoRetry } from "./FileProcessingBanner";
import { CollapsibleSection } from "./CollapsibleSection";

interface VisualCaptionsPanelProps {
  fileId: number;
  currentTime: number;
  onJumpToTimestamp?: (timestamp: number) => void;
}

interface Caption {
  timestamp: number;
  caption: string;
  entities: string[];
  confidence: number;
}

interface FileMatch {
  id: number;
  visualCaptionId: number;
  videoFileId: number;
  suggestedFileId: number;
  timestamp: number;
  captionText: string;
  matchedEntities: string[] | null;
  relevanceScore: number;
  matchReasoning: string | null;
  status: string;
  userFeedback: string | null;
  suggestedFile: {
    id: number;
    filename: string;
    title: string | null;
    description: string | null;
    mimeType: string;
    url: string;
    fileSize: number;
  };
}

export function VisualCaptionsPanel({
  fileId,
  currentTime,
  onJumpToTimestamp,
}: VisualCaptionsPanelProps) {
  const [generating, setGenerating] = useState(false);
  const [matchingFiles, setMatchingFiles] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [expandedCaption, setExpandedCaption] = useState<number | null>(null);
  const [showAllCaptions, setShowAllCaptions] = useState(false);
  const [editingCaption, setEditingCaption] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [minRelevance, setMinRelevance] = useState(30);
  const [showThresholdSlider, setShowThresholdSlider] = useState(false);
  const [draggingCaption, setDraggingCaption] = useState<number | null>(null);
  const [dragTimestamp, setDragTimestamp] = useState<number>(0);
  const captionListRef = useRef<HTMLDivElement>(null);
  const activeCaptionRef = useRef<HTMLDivElement>(null);

  // Fetch visual captions
  const {
    data: captionData,
    isLoading: captionsLoading,
    refetch: refetchCaptions,
  } = trpc.videoVisualCaptions.getCaptions.useQuery({ fileId });

  // Fetch file matches
  const {
    data: fileMatches,
    isLoading: matchesLoading,
    refetch: refetchMatches,
  } = trpc.videoVisualCaptions.getFileMatches.useQuery(
    { fileId, status: "active" },
    { enabled: !!captionData && captionData.status === "completed" }
  );

  // Generate captions mutation
  const generateCaptionsMutation =
    trpc.videoVisualCaptions.generateCaptions.useMutation({
      onSuccess: (data) => {
        toast.success(
          `Generated ${data.captionCount} visual captions`
        );
        setCaptionError(null);
        refetchCaptions();
        setGenerating(false);
      },
      onError: (error) => {
        setCaptionError(error.message);
        toast.error(error.message);
        setGenerating(false);
      },
    });

  // Auto-retry logic for caption generation failures
  const handleRetryCaptions = useCallback(() => {
    setGenerating(true);
    setCaptionError(null);
    generateCaptionsMutation.mutate({ fileId, intervalSeconds: 5 });
  }, [fileId, generateCaptionsMutation]);

  const captionAutoRetry = useAutoRetry({
    errorMessage: captionError,
    onRetry: handleRetryCaptions,
    maxRetries: 3,
    retryDelaySeconds: 30,
  });

  // Generate file matches mutation
  const generateMatchesMutation =
    trpc.videoVisualCaptions.generateFileMatches.useMutation({
      onSuccess: (data) => {
        toast.success(`Found ${data.count} relevant file matches`);
        refetchMatches();
        setMatchingFiles(false);
      },
      onError: (error) => {
        toast.error(`File matching failed: ${error.message}`);
        setMatchingFiles(false);
      },
    });

  // Update match status mutation
  const updateMatchMutation =
    trpc.videoVisualCaptions.updateMatchStatus.useMutation({
      onSuccess: () => {
        refetchMatches();
      },
    });

  // Update timestamp mutation
  const updateTimestampMutation =
    trpc.videoVisualCaptions.updateTimestamp.useMutation({
      onSuccess: () => {
        toast.success("Timestamp adjusted");
        refetchCaptions();
        setDraggingCaption(null);
      },
      onError: (error: any) => {
        toast.error(`Failed to adjust timestamp: ${error.message}`);
        setDraggingCaption(null);
      },
    });

  // Edit caption mutation
  const editCaptionMutation =
    trpc.videoVisualCaptions.editCaption.useMutation({
      onSuccess: () => {
        toast.success("Caption updated");
        refetchCaptions();
        setEditingCaption(null);
        setEditText("");
      },
      onError: (error) => {
        toast.error(`Failed to update caption: ${error.message}`);
      },
    });

  // Export subtitles query (lazy)
  const exportSRT = trpc.videoVisualCaptions.exportSubtitles.useQuery(
    { fileId, format: "srt" },
    { enabled: false }
  );
  const exportVTT = trpc.videoVisualCaptions.exportSubtitles.useQuery(
    { fileId, format: "vtt" },
    { enabled: false }
  );

  const captions: Caption[] = useMemo(() => {
    if (!captionData?.captions) return [];
    return (captionData.captions as Caption[]).sort(
      (a, b) => a.timestamp - b.timestamp
    );
  }, [captionData]);

  // Find the active caption based on current video time
  const activeCaptionIndex = useMemo(() => {
    if (captions.length === 0) return -1;
    let closest = 0;
    let minDiff = Math.abs(captions[0].timestamp - currentTime);
    for (let i = 1; i < captions.length; i++) {
      const diff = Math.abs(captions[i].timestamp - currentTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
    }
    // Only show as active if within reasonable range
    if (minDiff > 10) return -1;
    return closest;
  }, [captions, currentTime]);

  // Get file matches for the active caption's timestamp
  const activeFileMatches = useMemo(() => {
    if (!fileMatches || activeCaptionIndex < 0) return [];
    const activeTimestamp = captions[activeCaptionIndex]?.timestamp;
    if (activeTimestamp === undefined) return [];

    // Find matches within ±5 seconds of the active caption
    return (fileMatches as FileMatch[]).filter(
      (m) => Math.abs(m.timestamp - activeTimestamp) <= 5
    );
  }, [fileMatches, activeCaptionIndex, captions]);

  // Group file matches by timestamp for the full timeline view
  const matchesByTimestamp = useMemo(() => {
    if (!fileMatches) return new Map<number, FileMatch[]>();
    const map = new Map<number, FileMatch[]>();
    for (const match of fileMatches as FileMatch[]) {
      // Round to nearest caption timestamp
      const closestCaption = captions.reduce(
        (prev, curr) =>
          Math.abs(curr.timestamp - match.timestamp) <
          Math.abs(prev.timestamp - match.timestamp)
            ? curr
            : prev,
        captions[0]
      );
      const key = closestCaption?.timestamp ?? match.timestamp;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(match);
    }
    return map;
  }, [fileMatches, captions]);

  // Auto-scroll to active caption within the caption list container only
  // (not the whole page, which would drag the user's view)
  useEffect(() => {
    if (activeCaptionRef.current && captionListRef.current && !showAllCaptions) {
      const container = captionListRef.current;
      const element = activeCaptionRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      
      // Only scroll if the element is outside the visible area of the container
      if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }, [activeCaptionIndex, showAllCaptions]);

  const handleGenerateCaptions = () => {
    setGenerating(true);
    generateCaptionsMutation.mutate({ fileId, intervalSeconds: 5 });
  };

  const handleGenerateMatches = () => {
    setMatchingFiles(true);
    generateMatchesMutation.mutate({ fileId, minRelevanceScore: minRelevance / 100 });
  };

  const handleStartEdit = (idx: number, text: string) => {
    setEditingCaption(idx);
    setEditText(text);
  };

  const handleSaveEdit = (timestamp: number) => {
    if (!editText.trim()) return;
    editCaptionMutation.mutate({ fileId, timestamp, newCaption: editText.trim() });
  };

  const handleExport = async (format: "srt" | "vtt") => {
    try {
      const query = format === "srt" ? exportSRT : exportVTT;
      const result = await query.refetch();
      if (result.data) {
        const blob = new Blob([result.data.content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.data.filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Downloaded ${result.data.filename}`);
      }
    } catch {
      toast.error("Export failed");
    }
  };

  const handleStartTimestampEdit = (idx: number, timestamp: number) => {
    setDraggingCaption(idx);
    setDragTimestamp(timestamp);
  };

  const handleSaveTimestamp = (originalTimestamp: number) => {
    if (dragTimestamp === originalTimestamp) {
      setDraggingCaption(null);
      return;
    }
    updateTimestampMutation.mutate({
      fileId,
      originalTimestamp,
      newTimestamp: Math.max(0, dragTimestamp),
    });
  };

  const handleAcceptMatch = (matchId: number) => {
    triggerHaptic("medium");
    updateMatchMutation.mutate({
      matchId,
      status: "accepted",
      feedback: "helpful",
    });
    toast.success("Match accepted");
  };

  const handleDismissMatch = (matchId: number) => {
    triggerHaptic("light");
    updateMatchMutation.mutate({
      matchId,
      status: "dismissed",
      feedback: "not_helpful",
    });
    toast.info("Match dismissed");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.startsWith("image/"))
      return <ImageIcon className="h-4 w-4" />;
    if (mimeType?.startsWith("video/")) return <Video className="h-4 w-4" />;
    if (mimeType?.includes("pdf") || mimeType?.includes("document"))
      return <FileText className="h-4 w-4" />;
    return <FileIcon className="h-4 w-4" />;
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return "text-green-400";
    if (score >= 0.5) return "text-yellow-400";
    return "text-orange-400";
  };

  const getRelevanceBg = (score: number) => {
    if (score >= 0.8) return "bg-green-500/10 border-green-500/30";
    if (score >= 0.5) return "bg-blue-500/10 border-blue-500/30";
    return "bg-orange-500/10 border-orange-500/30";
  };

  // Initial state: no captions yet
  if (!captionData && !captionsLoading) {
    return (
      <div className="space-y-3">
        <FileProcessingBanner fileId={fileId} onReady={() => refetchCaptions()} />
        <Card className="p-4 sm:p-6 max-w-full overflow-x-hidden">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <Eye className="h-10 w-10 sm:h-12 sm:w-12 text-primary" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-2">
                Visual Descriptions & File Matching
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-4">
                Analyze the video visually using AI to generate descriptive
                summaries at regular intervals. The system will extract entities and
                match them against your uploaded files with relevance scores.
              </p>
              <p className="text-xs text-muted-foreground/70 mb-4">
                Ideal for videos without audio, screen recordings, presentations,
                and visual content.
              </p>
            </div>
            <Button
              onClick={handleGenerateCaptions}
              disabled={generating}
              className="w-full sm:w-auto min-h-[44px]"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing Video...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Generate Visual Descriptions
                </>
              )}
            </Button>
            {captionError && (
              <div className="text-sm text-red-400 mt-2">
                <p>{captionError}</p>
                {captionAutoRetry.isAutoRetrying && (
                  <p className="flex items-center justify-center gap-2 mt-2 text-amber-400">
                    <Clock className="h-4 w-4" />
                    Auto-retrying in {captionAutoRetry.countdown}s
                    (attempt {captionAutoRetry.retryCount + 1}/{captionAutoRetry.maxRetries})
                  </p>
                )}
                {!captionAutoRetry.isAutoRetrying && !captionAutoRetry.canAutoRetry && captionAutoRetry.retryCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={handleRetryCaptions}
                    disabled={generating}
                  >
                    Retry Manually
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // Loading state
  if (captionsLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  // Processing state
  if (captionData?.status === "processing") {
    return (
      <Card className="p-6">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">
            Analyzing video frames... This may take a moment.
          </p>
        </div>
      </Card>
    );
  }

  // Failed state
  if (captionData?.status === "failed") {
    return (
      <div className="space-y-3">
        <FileProcessingBanner fileId={fileId} onReady={() => refetchCaptions()} />
        <Card className="p-6">
          <div className="text-center space-y-4">
            <p className="text-sm text-destructive">
              {captionData.errorMessage}
            </p>
            {captionAutoRetry.isAutoRetrying && (
              <p className="flex items-center justify-center gap-2 text-amber-400 text-sm">
                <Clock className="h-4 w-4" />
                Auto-retrying in {captionAutoRetry.countdown}s
                (attempt {captionAutoRetry.retryCount + 1}/{captionAutoRetry.maxRetries})
              </p>
            )}
            <Button onClick={handleRetryCaptions} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Retrying...
                </>
              ) : (
                "Retry"
              )}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Captions completed - show the main UI
  const visibleCaptions = showAllCaptions
    ? captions
    : activeCaptionIndex >= 0
      ? captions.slice(
          Math.max(0, activeCaptionIndex - 1),
          activeCaptionIndex + 2
        )
      : captions.slice(0, 3);

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      {/* Visual Descriptions - Collapsible */}
      <CollapsibleSection
        title={`Visual Descriptions (${captions.length})`}
        icon={<Eye className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />}
        defaultOpen={true}
        bare
        headerActions={
          <div className="flex flex-wrap gap-2">
            {captionData?.status === "completed" &&
              (!fileMatches || (fileMatches as FileMatch[]).length === 0) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateMatches}
                  disabled={matchingFiles}
                >
                  {matchingFiles ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Matching...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-1" />
                      Match Files
                    </>
                  )}
                </Button>
              )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("srt")}
              title="Download SRT subtitles"
            >
              <Download className="h-4 w-4 mr-1" />
              SRT
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("vtt")}
              title="Download VTT subtitles"
            >
              <Download className="h-4 w-4 mr-1" />
              VTT
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateCaptions}
              disabled={generating}
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Regenerating...
                </>
              ) : (
                "Regenerate"
              )}
            </Button>
          </div>
        }
      >
        <p className="text-xs sm:text-sm text-muted-foreground mb-3">
          AI-generated visual summaries with file matching
        </p>

      {/* Active Caption Display - Large prominent display */}
      {activeCaptionIndex >= 0 && (
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {formatTime(captions[activeCaptionIndex].timestamp)}
              </Badge>
              <Badge
                variant="outline"
                className={`text-xs ${getConfidenceColor(captions[activeCaptionIndex].confidence)}`}
              >
                {Math.round(captions[activeCaptionIndex].confidence * 100)}%
                confident
              </Badge>
            </div>
            <div className="flex items-start gap-2">
              <p className="text-sm font-medium flex-1">
                {captions[activeCaptionIndex].caption}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={() => handleStartEdit(activeCaptionIndex, captions[activeCaptionIndex].caption)}
                title="Edit caption"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
            {captions[activeCaptionIndex].entities.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {captions[activeCaptionIndex].entities.map((entity, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    className="text-xs bg-accent/10"
                  >
                    {entity}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Active File Matches for Current Timepoint */}
      {activeFileMatches.length > 0 && (
        <Card className="p-4 border-accent/30">
          <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-accent" />
            Relevant Files at{" "}
            {formatTime(captions[activeCaptionIndex]?.timestamp || 0)}
            <Badge variant="secondary" className="text-xs">
              {activeFileMatches.length}
            </Badge>
          </h4>
          <div className="space-y-2">
            {activeFileMatches.map((match) => (
              <div
                key={match.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${getRelevanceBg(match.relevanceScore)}`}
              >
                {/* File thumbnail */}
                <div className="flex-shrink-0">
                  {match.suggestedFile.url &&
                  (match.suggestedFile.mimeType?.startsWith("image/") ||
                    match.suggestedFile.mimeType?.startsWith("video/")) ? (
                    <img
                      src={match.suggestedFile.url}
                      alt={match.suggestedFile.filename}
                      className="w-12 h-12 object-cover rounded border border-border"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-muted rounded border border-border flex items-center justify-center">
                      {getFileIcon(match.suggestedFile.mimeType)}
                    </div>
                  )}
                </div>

                {/* Match info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <h5 className="text-sm font-medium truncate">
                      {match.suggestedFile.title ||
                        match.suggestedFile.filename}
                    </h5>
                    <Badge
                      variant="secondary"
                      className={`text-xs flex-shrink-0 ${getConfidenceColor(match.relevanceScore)}`}
                    >
                      <BarChart3 className="h-3 w-3 mr-1" />
                      {Math.round(match.relevanceScore * 100)}%
                    </Badge>
                  </div>
                  {match.matchReasoning && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {match.matchReasoning}
                    </p>
                  )}
                  {match.matchedEntities && match.matchedEntities.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {match.matchedEntities.slice(0, 4).map((entity, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className="text-xs"
                        >
                          {entity}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex-shrink-0 flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleAcceptMatch(match.id)}
                    title="Helpful"
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDismissMatch(match.id)}
                    title="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Confidence Threshold */}
      {fileMatches && (fileMatches as FileMatch[]).length > 0 && (
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowThresholdSlider(!showThresholdSlider)}
            className="text-xs"
          >
            <SlidersHorizontal className="h-3 w-3 mr-1" />
            Min Relevance: {minRelevance}%
          </Button>
          {showThresholdSlider && (
            <div className="flex items-center gap-3 px-2">
              <span className="text-xs text-muted-foreground">0%</span>
              <Slider
                value={[minRelevance]}
                onValueChange={(v) => setMinRelevance(v[0])}
                min={0}
                max={100}
                step={5}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">100%</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateMatches}
                disabled={matchingFiles}
              >
                Apply
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Caption Timeline */}
      <div ref={captionListRef}>
        <CollapsibleSection
          title="Caption Timeline"
          icon={<Brain className="h-4 w-4" />}
          defaultOpen={true}
          bare
          headerActions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllCaptions(!showAllCaptions)}
            >
              {showAllCaptions ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Show All
                </>
              )}
            </Button>
          }
        >

        <div className="space-y-2">
          {visibleCaptions.map((caption, idx) => {
            const realIdx = showAllCaptions
              ? idx
              : activeCaptionIndex >= 0
                ? Math.max(0, activeCaptionIndex - 1) + idx
                : idx;
            const isActive = realIdx === activeCaptionIndex;
            const captionMatches = matchesByTimestamp.get(caption.timestamp) || [];

            return (
              <div
                key={realIdx}
                ref={isActive ? activeCaptionRef : undefined}
                className={`rounded-lg border p-3 transition-all cursor-pointer ${
                  isActive
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/50 hover:border-border"
                }`}
                onClick={() => {
                  onJumpToTimestamp?.(caption.timestamp);
                  setExpandedCaption(
                    expandedCaption === realIdx ? null : realIdx
                  );
                }}
              >
                <div className="flex items-start gap-2">
                  {draggingCaption === realIdx ? (
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Move className="h-3 w-3 text-primary" />
                      <input
                        type="number"
                        value={Number(dragTimestamp.toFixed(1))}
                        onChange={(e) => setDragTimestamp(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-16 text-xs bg-background border border-primary rounded px-1 py-0.5 text-center"
                        step={0.5}
                        min={0}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveTimestamp(caption.timestamp);
                          if (e.key === "Escape") setDraggingCaption(null);
                          if (e.key === "ArrowUp") { e.preventDefault(); setDragTimestamp(prev => prev + 0.5); }
                          if (e.key === "ArrowDown") { e.preventDefault(); setDragTimestamp(prev => Math.max(0, prev - 0.5)); }
                        }}
                      />
                      <span className="text-xs text-muted-foreground">s</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => { e.stopPropagation(); handleSaveTimestamp(caption.timestamp); }}
                        disabled={updateTimestampMutation.isPending}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => { e.stopPropagation(); setDraggingCaption(null); }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs flex-shrink-0 group/ts"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToTimestamp?.(caption.timestamp);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleStartTimestampEdit(realIdx, caption.timestamp);
                      }}
                      title="Click to jump, double-click to adjust time"
                    >
                      <Play className="h-3 w-3 mr-1" />
                      {formatTime(caption.timestamp)}
                      <Move className="h-2.5 w-2.5 ml-1 opacity-0 group-hover/ts:opacity-50 transition-opacity" />
                    </Button>
                  )}
                  {editingCaption === realIdx ? (
                    <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="flex-1 text-xs bg-background border border-border rounded px-2 py-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(caption.timestamp);
                          if (e.key === "Escape") { setEditingCaption(null); setEditText(""); }
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); handleSaveEdit(caption.timestamp); }}
                        disabled={editCaptionMutation.isPending}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); setEditingCaption(null); setEditText(""); }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center gap-1 group/caption">
                      <p
                        className={`text-xs flex-1 ${isActive ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        {caption.caption}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover/caption:opacity-100 transition-opacity flex-shrink-0"
                        onClick={(e) => { e.stopPropagation(); handleStartEdit(realIdx, caption.caption); }}
                        title="Edit caption"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {captionMatches.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="text-xs flex-shrink-0"
                    >
                      <Link2 className="h-3 w-3 mr-1" />
                      {captionMatches.length}
                    </Badge>
                  )}
                </div>

                {/* Expanded: show entities and file matches */}
                {expandedCaption === realIdx && (
                  <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
                    {caption.entities.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {caption.entities.map((entity, eIdx) => (
                          <Badge
                            key={eIdx}
                            variant="outline"
                            className="text-xs"
                          >
                            {entity}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {captionMatches.length > 0 && (
                      <div className="space-y-1">
                        {captionMatches.map((match) => (
                          <div
                            key={match.id}
                            className="flex items-center gap-2 text-xs p-2 rounded bg-muted/50"
                          >
                            {getFileIcon(match.suggestedFile.mimeType)}
                            <span className="truncate flex-1">
                              {match.suggestedFile.title ||
                                match.suggestedFile.filename}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-xs ${getConfidenceColor(match.relevanceScore)}`}
                            >
                              {Math.round(match.relevanceScore * 100)}%
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </CollapsibleSection>
      </div>

      </CollapsibleSection>

      {/* Generate file matches CTA if captions exist but no matches */}
      {captionData?.status === "completed" &&
        fileMatches &&
        (fileMatches as FileMatch[]).length > 0 && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateMatches}
              disabled={matchingFiles}
            >
              {matchingFiles ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Re-matching...
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4 mr-1" />
                  Re-match Files
                </>
              )}
            </Button>
          </div>
        )}
    </div>
  );
}
