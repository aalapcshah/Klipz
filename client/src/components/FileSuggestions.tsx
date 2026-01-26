import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Image as ImageIcon,
  Video,
  File as FileIcon,
  Clock,
  ThumbsUp,
  ThumbsDown,
  X,
  Check,
  Sparkles,
  Loader2,
  Play,
} from "lucide-react";
import { toast } from "sonner";

interface FileSuggestionsProps {
  fileId: number;
  onJumpToTimestamp?: (timestamp: number) => void;
}

export function FileSuggestions({ fileId, onJumpToTimestamp }: FileSuggestionsProps) {
  const [transcribing, setTranscribing] = useState(false);
  const [generating, setGenerating] = useState(false);

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

  const handleTranscribe = () => {
    setTranscribing(true);
    transcribeMutation.mutate({ fileId });
  };

  const handleGenerateSuggestions = () => {
    setGenerating(true);
    generateSuggestionsMutation.mutate({ fileId, minRelevanceScore: 0.5 });
  };

  const handleDismiss = (suggestionId: number) => {
    updateStatusMutation.mutate({
      suggestionId,
      status: "dismissed",
      feedback: "not_helpful",
    });
    toast.info("Suggestion dismissed");
  };

  const handleAccept = (suggestionId: number) => {
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

  // Show initial setup if no transcript
  if (!transcript) {
    return (
      <Card className="p-6">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Sparkles className="h-12 w-12 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Intelligent File Suggestions</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Transcribe your video to get AI-powered file recommendations based on what you're
              saying. The system will analyze your speech and suggest relevant files from your
              library at specific timestamps.
            </p>
          </div>
          <Button
            onClick={handleTranscribe}
            disabled={transcribing}
            className="w-full sm:w-auto"
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
    return (
      <Card className="p-6">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Sparkles className="h-12 w-12 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Generate File Suggestions</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Your video has been transcribed. Now analyze the transcript to find relevant files
              from your library that match what you're discussing.
            </p>
          </div>
          <Button
            onClick={handleGenerateSuggestions}
            disabled={generating}
            className="w-full sm:w-auto"
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
      </Card>
    );
  }

  // Show suggestions list
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Suggested Files ({suggestions?.length || 0})
          </h3>
          <p className="text-sm text-muted-foreground">
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
        <div className="space-y-3">
          {suggestions?.map((suggestion) => (
            <Card key={suggestion.id} className="p-4 hover:border-primary/50 transition-colors">
              <div className="flex items-start gap-4">
                {/* File Thumbnail/Icon */}
                <div className="flex-shrink-0">
                  {suggestion.suggestedFile?.url &&
                  (suggestion.suggestedFile.mimeType?.startsWith("image/") ||
                    suggestion.suggestedFile.mimeType?.startsWith("video/")) ? (
                    <img
                      src={suggestion.suggestedFile.url}
                      alt={suggestion.suggestedFile.filename}
                      className="w-16 h-16 object-cover rounded border border-border"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-muted rounded border border-border flex items-center justify-center">
                      {getFileIcon(suggestion.suggestedFile?.mimeType || "")}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2">
                  {/* File Info */}
                  <div>
                    <h4 className="font-medium text-sm truncate">
                      {suggestion.suggestedFile?.title || suggestion.suggestedFile?.filename}
                    </h4>
                    {suggestion.suggestedFile?.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {suggestion.suggestedFile.description}
                      </p>
                    )}
                  </div>

                  {/* Timestamp and Transcript Excerpt */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
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
                    <p className="text-xs text-muted-foreground italic line-clamp-2">
                      "{suggestion.transcriptExcerpt}"
                    </p>
                    {suggestion.matchedKeywords && suggestion.matchedKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {suggestion.matchedKeywords.slice(0, 3).map((keyword, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex-shrink-0 flex gap-1">
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
          ))}
        </div>
      )}
    </div>
  );
}
