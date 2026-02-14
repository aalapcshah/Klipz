import { trpc } from "@/lib/trpc";
import { useState, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Captions,
  Files,
  Loader2,
  Clock,
  Sparkles,
  AlertCircle,
  Search,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

export interface VideoCardDetailsHandle {
  handleFindMatches: () => void;
  isFindingMatches: boolean;
  canFindMatches: boolean;
  getMatchData: () => { fileMatches: any[] | undefined; fileSuggestions: any[] | undefined; matchesLoading: boolean; suggestionsLoading: boolean };
  expandedSection: "transcript" | "captions" | "matches" | null;
}

interface VideoCardDetailsProps {
  videoId: number;
  fileId: number | null;
  hasTranscript: boolean;
  videoRef?: HTMLVideoElement | null;
  onExpandedSectionChange?: (section: "transcript" | "captions" | "matches" | null) => void;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const VideoCardDetails = forwardRef<VideoCardDetailsHandle, VideoCardDetailsProps>(function VideoCardDetails({ videoId, fileId, hasTranscript, videoRef, onExpandedSectionChange }, ref) {
  const [expandedSection, setExpandedSection] = useState<"transcript" | "captions" | "matches" | null>(null);

  const utils = trpc.useUtils();

  // Fetch transcript data when expanded or for status badge
  // Poll every 3s when status is "processing" to detect completion
  const { data: transcript, isLoading: transcriptLoading } = trpc.videoTranscription.getTranscript.useQuery(
    { fileId: fileId! },
    { 
      enabled: !!fileId,
      refetchInterval: (query) => {
        const data = query.state.data as any;
        return data?.status === 'processing' ? 3000 : false;
      },
    }
  );

  // Fetch visual captions for status badge and when expanded
  // Poll every 3s when status is "processing" to detect completion
  const { data: captions, isLoading: captionsLoading } = trpc.videoVisualCaptions.getCaptions.useQuery(
    { fileId: fileId! },
    { 
      enabled: !!fileId,
      refetchInterval: (query) => {
        const data = query.state.data as any;
        return data?.status === 'processing' ? 3000 : false;
      },
    }
  );

  // Fetch file matches when expanded
  const { data: fileMatches, isLoading: matchesLoading } = trpc.videoVisualCaptions.getFileMatches.useQuery(
    { fileId: fileId! },
    { enabled: expandedSection === "matches" && !!fileId }
  );

  // Fetch transcript-based file suggestions when expanded
  const { data: fileSuggestions, isLoading: suggestionsLoading } = trpc.videoTranscription.getFileSuggestions.useQuery(
    { fileId: fileId! },
    { enabled: expandedSection === "matches" && !!fileId }
  );

  // Find Matches mutations
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

  const isFindingMatches = generateVisualMatchesMutation.isPending || generateTranscriptMatchesMutation.isPending;

  // Determine if Find Matches can be triggered
  const canFindMatches = !!fileId && !isFindingMatches && !!(transcript?.status || captions?.status);

  // Expose handleFindMatches via ref for parent components
  useImperativeHandle(ref, () => ({
    handleFindMatches,
    isFindingMatches,
    canFindMatches,
    getMatchData: () => ({ fileMatches, fileSuggestions, matchesLoading, suggestionsLoading }),
    expandedSection,
  }), [isFindingMatches, canFindMatches, fileMatches, fileSuggestions, matchesLoading, suggestionsLoading, expandedSection]);

  // Retry mutations for failed transcriptions/captions
  const retryTranscriptMutation = trpc.videoTranscription.transcribeVideo.useMutation({
    onSuccess: () => {
      if (fileId) {
        utils.videoTranscription.getTranscript.invalidate({ fileId });
      }
      toast.success("Transcription restarted successfully!");
    },
    onError: (err) => {
      toast.error(`Retry failed: ${err.message}`);
    },
  });

  const retryCaptionMutation = trpc.videoVisualCaptions.generateCaptions.useMutation({
    onSuccess: () => {
      if (fileId) {
        utils.videoVisualCaptions.getCaptions.invalidate({ fileId });
      }
      toast.success("Captioning restarted successfully!");
    },
    onError: (err) => {
      toast.error(`Retry failed: ${err.message}`);
    },
  });

  const handleRetryTranscript = () => {
    if (!fileId) return;
    retryTranscriptMutation.mutate({ fileId });
  };

  const handleRetryCaptions = () => {
    if (!fileId) return;
    retryCaptionMutation.mutate({ fileId });
  };

  const handleFindMatches = async () => {
    if (!fileId) {
      toast.error("This video doesn't have a linked file yet. Try clicking Annotate first.");
      return;
    }

    const hasCaptions = captions && captions.status === "completed";
    const hasTranscriptData = transcript && transcript.status === "completed";

    if (!hasCaptions && !hasTranscriptData) {
      toast.error("Generate captions or transcripts first before finding matches.");
      return;
    }

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
        toast.success("File matching complete! Check the Matched Files section.");
        setExpandedSection("matches");
        onExpandedSectionChange?.("matches");
      } else {
        toast.error("File matching failed. Please try again.");
      }
    } catch (error) {
      toast.error("Failed to find matches.");
    }
  };

  // Seek video to timestamp
  const seekToTimestamp = useCallback((seconds: number) => {
    if (videoRef) {
      videoRef.currentTime = seconds;
      videoRef.play().catch(() => {});
      toast.success(`Seeking to ${formatTimestamp(seconds)}`);
    } else {
      // Try to find the video element in the parent card
      const card = document.querySelector(`[data-video-id="${videoId}"]`);
      if (card) {
        const video = card.querySelector("video");
        if (video) {
          video.currentTime = seconds;
          video.play().catch(() => {});
          toast.success(`Seeking to ${formatTimestamp(seconds)}`);
          return;
        }
      }
      toast.info(`Timestamp: ${formatTimestamp(seconds)}`);
    }
  }, [videoRef, videoId]);

  // Toggle section: if status is "failed", also trigger retry
  const toggleSection = (section: "transcript" | "captions" | "matches") => {
    if (!fileId) {
      toast.error("This video doesn't have a linked file yet. Try clicking Annotate first.");
      return;
    }

    // If clicking on a failed transcript/caption section, trigger retry
    if (section === "transcript" && transcript?.status === "failed" && !retryTranscriptMutation.isPending) {
      handleRetryTranscript();
      // Also expand the section to show progress
      setExpandedSection("transcript");
      onExpandedSectionChange?.("transcript");
      return;
    }
    if (section === "captions" && captions?.status === "failed" && !retryCaptionMutation.isPending) {
      handleRetryCaptions();
      // Also expand the section to show progress
      setExpandedSection("captions");
      onExpandedSectionChange?.("captions");
      return;
    }

    const newSection = expandedSection === section ? null : section;
    setExpandedSection(newSection);
    onExpandedSectionChange?.(newSection);
  };

  if (!fileId) {
    return null;
  }

  // Determine statuses for badges
  const transcriptStatus = transcript?.status || null;
  const captionStatus = captions?.status || null;

  // Clickable timestamp component
  const TimestampButton = ({ seconds, className }: { seconds: number; className?: string }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        seekToTimestamp(seconds);
      }}
      className={`text-muted-foreground font-mono shrink-0 w-12 hover:text-primary hover:underline cursor-pointer transition-colors text-left ${className || ""}`}
      title={`Seek to ${formatTimestamp(seconds)}`}
    >
      {formatTimestamp(seconds)}
    </button>
  );

  // Helper to get button style based on status
  const getTranscriptButtonStyle = () => {
    if (expandedSection === "transcript") return "secondary" as const;
    if (transcriptStatus === "failed") return "destructive" as const;
    return "ghost" as const;
  };

  const getCaptionsButtonStyle = () => {
    if (expandedSection === "captions") return "secondary" as const;
    if (captionStatus === "failed") return "destructive" as const;
    return "ghost" as const;
  };

  return (
    <div className="space-y-1.5 pt-1.5 border-t border-border/50">
      {/* Section toggle buttons */}
      <div className="flex items-center gap-1 flex-wrap">
        <Button
          variant={getTranscriptButtonStyle()}
          size="sm"
          className={`h-6 px-2 text-[10px] gap-1 ${
            transcriptStatus === "failed" && expandedSection !== "transcript"
              ? "bg-red-500/10 text-red-600 border-red-500/30 hover:bg-red-500/20"
              : ""
          }`}
          onClick={() => toggleSection("transcript")}
          disabled={retryTranscriptMutation.isPending}
        >
          {retryTranscriptMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : transcriptStatus === "failed" ? (
            <RotateCcw className="h-3 w-3" />
          ) : (
            <FileText className="h-3 w-3" />
          )}
          {retryTranscriptMutation.isPending
            ? "Retrying..."
            : transcriptStatus === "failed"
            ? "Retry Transcript"
            : "Transcript"}
          {!retryTranscriptMutation.isPending && transcriptStatus !== "failed" && (
            expandedSection === "transcript" ? (
              <ChevronUp className="h-2.5 w-2.5" />
            ) : (
              <ChevronDown className="h-2.5 w-2.5" />
            )
          )}
        </Button>
        <Button
          variant={getCaptionsButtonStyle()}
          size="sm"
          className={`h-6 px-2 text-[10px] gap-1 ${
            captionStatus === "failed" && expandedSection !== "captions"
              ? "bg-red-500/10 text-red-600 border-red-500/30 hover:bg-red-500/20"
              : ""
          }`}
          onClick={() => toggleSection("captions")}
          disabled={retryCaptionMutation.isPending}
        >
          {retryCaptionMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : captionStatus === "failed" ? (
            <RotateCcw className="h-3 w-3" />
          ) : (
            <Captions className="h-3 w-3" />
          )}
          {retryCaptionMutation.isPending
            ? "Retrying..."
            : captionStatus === "failed"
            ? "Retry Captions"
            : "Captions"}
          {!retryCaptionMutation.isPending && captionStatus !== "failed" && (
            expandedSection === "captions" ? (
              <ChevronUp className="h-2.5 w-2.5" />
            ) : (
              <ChevronDown className="h-2.5 w-2.5" />
            )
          )}
        </Button>
        <Button
          variant={expandedSection === "matches" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 px-2 text-[10px] gap-1"
          onClick={() => toggleSection("matches")}
        >
          <Files className="h-3 w-3" />
          Matches
          {expandedSection === "matches" ? (
            <ChevronUp className="h-2.5 w-2.5" />
          ) : (
            <ChevronDown className="h-2.5 w-2.5" />
          )}
        </Button>
      </div>

      {/* Expanded content */}
      {expandedSection === "transcript" && (
        <div className="rounded-md bg-muted/30 p-2 max-h-48 overflow-y-auto">
          {transcriptLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading transcript...
            </div>
          ) : transcript && transcript.status === "completed" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Badge variant="outline" className="text-[10px] h-4 bg-green-500/10 text-green-600 border-green-300">
                  <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                  Transcribed
                </Badge>
                {transcript.language && (
                  <Badge variant="outline" className="text-[10px] h-4">
                    {transcript.language.toUpperCase()}
                  </Badge>
                )}
              </div>
              {transcript.segments && Array.isArray(transcript.segments) && (transcript.segments as Array<{ text: string; start: number; end: number }>).length > 0 ? (
                <div className="space-y-1">
                  {(transcript.segments as Array<{ text: string; start: number; end: number }>).map((seg, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <TimestampButton seconds={seg.start} />
                      <span className="text-foreground">{seg.text}</span>
                    </div>
                  ))}
                </div>
              ) : transcript.fullText ? (
                <p className="text-xs text-foreground whitespace-pre-wrap">{transcript.fullText}</p>
              ) : (
                <p className="text-xs text-muted-foreground italic">Transcript is empty</p>
              )}
            </div>
          ) : transcript && transcript.status === "processing" ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Transcription in progress...
            </div>
          ) : transcript && transcript.status === "failed" ? (
            <div className="space-y-1 py-2">
              <div className="flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{(transcript as any).errorMessage || "Transcription failed. Click the Transcript button above to retry."}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-2">
              No transcript available. Select this video and click "Transcribe All" to generate one.
            </div>
          )}
        </div>
      )}

      {expandedSection === "captions" && (
        <div className="rounded-md bg-muted/30 p-2 max-h-48 overflow-y-auto">
          {captionsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading captions...
            </div>
          ) : captions && captions.status === "completed" && captions.captions ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Badge variant="outline" className="text-[10px] h-4 bg-blue-500/10 text-blue-600 border-blue-300">
                  <Captions className="h-2.5 w-2.5 mr-0.5" />
                  {(captions.captions as any[]).length} Captions
                </Badge>
              </div>
              <div className="space-y-1.5">
                {(captions.captions as Array<{ timestamp: number; caption: string; entities: string[]; confidence: number }>).map((cap, i) => (
                  <div key={i} className="space-y-0.5">
                    <div className="flex gap-2 text-xs">
                      <TimestampButton seconds={cap.timestamp} className="flex items-center gap-0.5" />
                      <span className="text-foreground">{cap.caption}</span>
                    </div>
                    {cap.entities && cap.entities.length > 0 && (
                      <div className="flex gap-1 flex-wrap ml-14">
                        {cap.entities.slice(0, 5).map((entity, j) => (
                          <Badge key={j} variant="outline" className="text-[9px] h-3.5 px-1 bg-purple-500/10 text-purple-600 border-purple-300">
                            {entity}
                          </Badge>
                        ))}
                        {cap.entities.length > 5 && (
                          <span className="text-[9px] text-muted-foreground">+{cap.entities.length - 5} more</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : captions && captions.status === "processing" ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Captioning in progress...
            </div>
          ) : captions && captions.status === "failed" ? (
            <div className="space-y-1 py-2">
              <div className="flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{captions.errorMessage || "Visual captioning failed. Click the Captions button above to retry."}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-2">
              No visual captions available. Select this video and click "Caption All" to generate them.
            </div>
          )}
        </div>
      )}

      {expandedSection === "matches" && (
        <div className="rounded-md bg-muted/30 p-2 max-h-48 overflow-y-auto">
          {(matchesLoading || suggestionsLoading) ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading matched files...
            </div>
          ) : (
            <div className="space-y-2">
              {/* Visual caption file matches */}
              {fileMatches && fileMatches.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] h-4 bg-orange-500/10 text-orange-600 border-orange-300">
                      <Files className="h-2.5 w-2.5 mr-0.5" />
                      {fileMatches.length} Visual Matches
                    </Badge>
                  </div>
                  {fileMatches.map((match: any) => (
                    <div key={match.id} className="flex items-start gap-2 text-xs p-1.5 rounded bg-background/50 border border-border/30">
                      <TimestampButton seconds={match.timestamp} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium truncate">{match.suggestedFile?.filename || `File #${match.suggestedFileId}`}</span>
                          <Badge variant="outline" className="text-[9px] h-3.5 px-1 shrink-0">
                            {Math.round((match.relevanceScore || 0) * 100)}%
                          </Badge>
                        </div>
                        {match.matchReasoning && (
                          <p className="text-muted-foreground text-[10px] line-clamp-2 mt-0.5">{match.matchReasoning}</p>
                        )}
                        {match.matchedEntities && match.matchedEntities.length > 0 && (
                          <div className="flex gap-0.5 flex-wrap mt-0.5">
                            {(match.matchedEntities as string[]).slice(0, 3).map((entity, j) => (
                              <Badge key={j} variant="outline" className="text-[8px] h-3 px-0.5">
                                {entity}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Transcript-based file suggestions */}
              {fileSuggestions && fileSuggestions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] h-4 bg-teal-500/10 text-teal-600 border-teal-300">
                      <FileText className="h-2.5 w-2.5 mr-0.5" />
                      {fileSuggestions.length} Transcript Matches
                    </Badge>
                  </div>
                  {fileSuggestions.map((suggestion: any) => (
                    <div key={suggestion.id} className="flex items-start gap-2 text-xs p-1.5 rounded bg-background/50 border border-border/30">
                      <TimestampButton seconds={suggestion.startTime} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium truncate">{suggestion.suggestedFile?.filename || `File #${suggestion.suggestedFileId}`}</span>
                          <Badge variant="outline" className="text-[9px] h-3.5 px-1 shrink-0">
                            {Math.round((suggestion.relevanceScore || 0) * 100)}%
                          </Badge>
                        </div>
                        {suggestion.transcriptExcerpt && (
                          <p className="text-muted-foreground text-[10px] line-clamp-2 mt-0.5 italic">
                            "{suggestion.transcriptExcerpt}"
                          </p>
                        )}
                        {suggestion.matchedKeywords && suggestion.matchedKeywords.length > 0 && (
                          <div className="flex gap-0.5 flex-wrap mt-0.5">
                            {(suggestion.matchedKeywords as string[]).slice(0, 3).map((kw, j) => (
                              <Badge key={j} variant="outline" className="text-[8px] h-3 px-0.5">
                                {kw}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* No matches found */}
              {(!fileMatches || fileMatches.length === 0) && (!fileSuggestions || fileSuggestions.length === 0) && (
                <div className="text-xs text-muted-foreground py-2 space-y-1">
                  <p>No matched files found.</p>
                  <p>Click <strong>Find Matches</strong> to run AI matching against your uploaded files, or generate captions/transcripts first.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
