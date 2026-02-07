import { useState, useMemo, Fragment } from "react";
import { triggerHaptic } from "@/lib/haptics";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Image as ImageIcon,
  Video,
  File as FileIcon,
  ThumbsUp,
  X,
  Check,
  Sparkles,
  Loader2,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { TranscriptWithTimestamps } from "./TranscriptWithTimestamps";

interface FileSuggestionsProps {
  fileId: number;
  onJumpToTimestamp?: (timestamp: number) => void;
}

/**
 * Highlights keywords in text by wrapping them in styled spans.
 */
function highlightExcerpt(
  text: string,
  keywords: string[]
): React.ReactNode[] {
  if (!keywords || keywords.length === 0) return [text];

  const escaped = keywords
    .filter((k) => k.length > 0)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (escaped.length === 0) return [text];

  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);

  return parts.map((part, i) => {
    const isMatch = escaped.some(
      (kw) => part.toLowerCase() === kw.toLowerCase()
    );
    if (isMatch) {
      return (
        <mark
          key={i}
          className="bg-primary/20 text-primary font-medium rounded-sm px-0.5"
        >
          {part}
        </mark>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function FileSuggestions({ fileId, onJumpToTimestamp }: FileSuggestionsProps) {
  const [transcribing, setTranscribing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [swipeStart, setSwipeStart] = useState<{ x: number; id: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<{ id: number; offset: number } | null>(null);

  const { data: transcript, refetch: refetchTranscript } =
    trpc.videoTranscription.getTranscript.useQuery({ fileId });

  const {
    data: suggestions,
    isLoading: suggestionsLoading,
    refetch: refetchSuggestions,
  } = trpc.videoTranscription.getFileSuggestions.useQuery(
    { fileId, status: "active" },
    { enabled: !!transcript }
  );

  const transcribeMutation = trpc.videoTranscription.transcribeVideo.useMutation({
    onSuccess: () => {
      toast.success("Video transcribed successfully");
      refetchTranscript();
      setTranscribing(false);
    },
    onError: (error) => {
      toast.error(`Transcription failed: ${error.message}`);
      setTranscribing(false);
    },
  });

  const generateSuggestionsMutation =
    trpc.videoTranscription.generateFileSuggestions.useMutation({
      onSuccess: (data) => {
        toast.success(`Generated ${data.count} file suggestions`);
        refetchSuggestions();
        setGenerating(false);
      },
      onError: (error) => {
        toast.error(`Failed to generate suggestions: ${error.message}`);
        setGenerating(false);
      },
    });

  const updateStatusMutation =
    trpc.videoTranscription.updateSuggestionStatus.useMutation({
      onSuccess: () => {
        refetchSuggestions();
      },
    });

  // Collect all matched keywords from suggestions for highlighting
  const highlightKeywords = useMemo(() => {
    if (!suggestions) return [];
    const keywords = new Set<string>();
    suggestions.forEach((s) => {
      if (s.matchedKeywords && Array.isArray(s.matchedKeywords)) {
        (s.matchedKeywords as string[]).forEach((kw: string) => keywords.add(kw));
      }
    });
    return Array.from(keywords);
  }, [suggestions]);

  const handleTranscribe = () => {
    setTranscribing(true);
    transcribeMutation.mutate({ fileId });
  };

  const handleGenerateSuggestions = () => {
    setGenerating(true);
    generateSuggestionsMutation.mutate({ fileId, minRelevanceScore: 0.5 });
  };

  const handleDismiss = (suggestionId: number) => {
    triggerHaptic('light');
    updateStatusMutation.mutate({
      suggestionId,
      status: "dismissed",
      feedback: "not_helpful",
    });
    toast.info("Suggestion dismissed");
  };

  const handleAccept = (suggestionId: number) => {
    triggerHaptic('medium');
    updateStatusMutation.mutate({
      suggestionId,
      status: "accepted",
      feedback: "helpful",
    });
    toast.success("Suggestion accepted");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, "0")}`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
    if (mimeType?.startsWith("video/")) return <Video className="h-4 w-4" />;
    if (mimeType?.includes("pdf") || mimeType?.includes("document"))
      return <FileText className="h-4 w-4" />;
    return <FileIcon className="h-4 w-4" />;
  };

  const getMatchTypeColor = (matchType: string) => {
    switch (matchType) {
      case "keyword":
        return "bg-blue-500/10 text-blue-500";
      case "semantic":
        return "bg-purple-500/10 text-purple-500";
      case "entity":
        return "bg-green-500/10 text-green-500";
      case "topic":
        return "bg-orange-500/10 text-orange-500";
      default:
        return "bg-gray-500/10 text-gray-500";
    }
  };

  const handleTouchStart = (e: React.TouchEvent, suggestionId: number) => {
    const touch = e.touches[0];
    setSwipeStart({ x: touch.clientX, id: suggestionId });
  };

  const handleTouchMove = (e: React.TouchEvent, suggestionId: number) => {
    if (!swipeStart || swipeStart.id !== suggestionId) return;
    const touch = e.touches[0];
    const offset = touch.clientX - swipeStart.x;
    setSwipeOffset({ id: suggestionId, offset });
  };

  const handleTouchEnd = (suggestionId: number) => {
    if (!swipeOffset || swipeOffset.id !== suggestionId) {
      setSwipeStart(null);
      setSwipeOffset(null);
      return;
    }

    if (swipeOffset.offset < -100) {
      triggerHaptic('light');
      handleDismiss(suggestionId);
    } else if (swipeOffset.offset > 100) {
      triggerHaptic('medium');
      handleAccept(suggestionId);
    }

    setSwipeStart(null);
    setSwipeOffset(null);
  };

  // Show initial setup if no transcript
  if (!transcript) {
    return (
      <Card className="p-4 sm:p-6 max-w-full overflow-x-hidden">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Sparkles className="h-10 w-10 sm:h-12 sm:w-12 text-primary" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-semibold mb-2">Intelligent File Suggestions</h3>
            <p className="text-xs sm:text-sm text-muted-foreground mb-4">
              Transcribe your video to get AI-powered file recommendations based on what you're
              saying. The system will analyze your speech and suggest relevant files from your
              library at specific timestamps.
            </p>
          </div>
          <Button
            onClick={handleTranscribe}
            disabled={transcribing}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {transcribing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Transcribing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Start Transcription
              </>
            )}
          </Button>
        </div>
      </Card>
    );
  }

  // Show generate button if transcript exists but no suggestions
  if (transcript && (!suggestions || suggestions.length === 0) && !suggestionsLoading) {
    const segments = (transcript.segments as Array<{ text: string; start: number; end: number }>) || [];
    return (
      <Card className="p-4 sm:p-6 max-w-full overflow-x-hidden">
        <div className="space-y-4">
          {/* Show transcript with timestamps */}
          <TranscriptWithTimestamps
            segments={segments}
            fullText={transcript.fullText || ""}
            language={transcript.language}
            highlightKeywords={[]}
            onJumpToTimestamp={onJumpToTimestamp}
            compact={false}
          />

          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Analyze the transcript to find relevant files from your library.
            </p>
            <Button
              onClick={handleGenerateSuggestions}
              disabled={generating}
              className="w-full sm:w-auto min-h-[44px]"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Suggestions
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // Show suggestions list with transcript
  const segments = (transcript.segments as Array<{ text: string; start: number; end: number }>) || [];

  return (
    <div className="space-y-3 sm:space-y-4 max-w-full overflow-x-hidden">
      {/* Full Transcript with timestamps and keyword highlighting */}
      <Card className="p-3 sm:p-4 max-w-full overflow-x-hidden">
        <div className="flex items-center justify-between mb-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setShowTranscript(!showTranscript)}
          >
            {showTranscript ? "Hide Transcript" : "Show Full Transcript"}
          </Button>
        </div>
        {showTranscript && (
          <TranscriptWithTimestamps
            segments={segments}
            fullText={transcript.fullText || ""}
            language={transcript.language}
            highlightKeywords={highlightKeywords}
            onJumpToTimestamp={onJumpToTimestamp}
            compact={false}
          />
        )}
      </Card>

      {/* Suggestions header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Suggested Files ({suggestions?.length || 0})
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Files relevant to your video content at specific timestamps
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerateSuggestions}
          disabled={generating}
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Regenerating...
            </>
          ) : (
            "Regenerate"
          )}
        </Button>
      </div>

      {suggestionsLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {suggestions?.map((suggestion) => {
            const currentSwipe = swipeOffset?.id === suggestion.id ? swipeOffset.offset : 0;
            const isSwipingLeft = currentSwipe < -20;
            const isSwipingRight = currentSwipe > 20;
            const matchedKws = (suggestion.matchedKeywords as string[]) || [];

            return (
              <Card
                key={suggestion.id}
                className="p-3 sm:p-4 hover:border-primary/50 transition-all max-w-full overflow-hidden relative"
                style={{
                  transform: `translateX(${currentSwipe}px)`,
                  transition: swipeStart ? 'none' : 'transform 0.3s ease-out',
                }}
                onTouchStart={(e) => handleTouchStart(e, suggestion.id)}
                onTouchMove={(e) => handleTouchMove(e, suggestion.id)}
                onTouchEnd={() => handleTouchEnd(suggestion.id)}
              >
                {/* Swipe action indicators */}
                {isSwipingLeft && (
                  <div className="absolute right-0 top-0 bottom-0 w-20 bg-destructive/20 flex items-center justify-center">
                    <X className="h-6 w-6 text-destructive" />
                  </div>
                )}
                {isSwipingRight && (
                  <div className="absolute left-0 top-0 bottom-0 w-20 bg-green-500/20 flex items-center justify-center">
                    <Check className="h-6 w-6 text-green-500" />
                  </div>
                )}
                <div className="flex items-start gap-2 sm:gap-4">
                  {/* File Thumbnail/Icon */}
                  <div className="flex-shrink-0">
                    {suggestion.suggestedFile?.url &&
                    (suggestion.suggestedFile.mimeType?.startsWith("image/") ||
                      suggestion.suggestedFile.mimeType?.startsWith("video/")) ? (
                      <img
                        src={suggestion.suggestedFile.url}
                        alt={suggestion.suggestedFile.filename}
                        className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded border border-border"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-muted rounded border border-border flex items-center justify-center">
                        {getFileIcon(suggestion.suggestedFile?.mimeType || "")}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1 sm:space-y-2">
                    {/* File Info */}
                    <div>
                      <h4 className="font-medium text-xs sm:text-sm truncate">
                        {suggestion.suggestedFile?.title || suggestion.suggestedFile?.filename}
                      </h4>
                      {suggestion.suggestedFile?.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {suggestion.suggestedFile.description}
                        </p>
                      )}
                    </div>

                    {/* Timestamp and Transcript Excerpt with keyword highlighting */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 sm:h-6 px-2 text-xs min-h-[32px] sm:min-h-[24px]"
                          onClick={() => onJumpToTimestamp?.(suggestion.startTime)}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          {formatTime(suggestion.startTime)}
                        </Button>
                        <Badge variant="secondary" className={`text-xs ${getMatchTypeColor(suggestion.matchType)}`}>
                          {suggestion.matchType}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(suggestion.relevanceScore * 100)}% match
                        </span>
                      </div>
                      {suggestion.transcriptExcerpt && (
                        <p className="text-xs text-muted-foreground italic line-clamp-2">
                          &ldquo;{highlightExcerpt(suggestion.transcriptExcerpt, matchedKws)}&rdquo;
                        </p>
                      )}
                      {matchedKws.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {matchedKws.slice(0, 5).map((keyword, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs bg-primary/5 border-primary/20">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions - Hidden on mobile (use swipe), visible on desktop */}
                  <div className="hidden sm:flex flex-shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleAccept(suggestion.id)}
                      title="Helpful"
                    >
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDismiss(suggestion.id)}
                      title="Dismiss"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
