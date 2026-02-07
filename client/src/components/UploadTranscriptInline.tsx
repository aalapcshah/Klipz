import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles,
  FileIcon,
  Image as ImageIcon,
  Video,
} from "lucide-react";
import { TranscriptWithTimestamps } from "./TranscriptWithTimestamps";

interface UploadTranscriptInlineProps {
  fileId: number;
}

export function UploadTranscriptInline({ fileId }: UploadTranscriptInlineProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { data: transcript, isLoading: transcriptLoading } =
    trpc.videoTranscription.getTranscript.useQuery(
      { fileId },
      {
        refetchInterval: (query) => {
          const data = query.state.data;
          if (!data) return 3000;
          if (data.status === "processing") return 3000;
          return false;
        },
      }
    );

  const { data: suggestions, isLoading: suggestionsLoading } =
    trpc.videoTranscription.getFileSuggestions.useQuery(
      { fileId, status: "active" },
      {
        enabled: !!transcript && transcript.status === "completed",
        refetchInterval: (query) => {
          const data = query.state.data;
          if (!data || data.length === 0) return 5000;
          return false;
        },
      }
    );

  // Collect all matched keywords from suggestions for highlighting
  const highlightKeywords = useMemo(() => {
    if (!suggestions) return [];
    const keywords = new Set<string>();
    suggestions.forEach((s: any) => {
      if (s.matchedKeywords && Array.isArray(s.matchedKeywords)) {
        s.matchedKeywords.forEach((kw: string) => keywords.add(kw));
      }
    });
    return Array.from(keywords);
  }, [suggestions]);

  const getFileIcon = (mimeType?: string | null) => {
    if (mimeType?.startsWith("image/")) return <ImageIcon className="h-3 w-3" />;
    if (mimeType?.startsWith("video/")) return <Video className="h-3 w-3" />;
    if (mimeType?.includes("pdf") || mimeType?.includes("document"))
      return <FileText className="h-3 w-3" />;
    return <FileIcon className="h-3 w-3" />;
  };

  // Loading initial data
  if (transcriptLoading) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Checking for speech transcript...</span>
      </div>
    );
  }

  // Transcript is processing
  if (transcript && transcript.status === "processing") {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-amber-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Transcribing speech...</span>
      </div>
    );
  }

  // No transcript yet or failed
  if (!transcript || transcript.status === "failed") {
    return null;
  }

  const segments = (transcript.segments as Array<{ text: string; start: number; end: number }>) || [];
  const fullText = transcript.fullText || "";
  const hasSuggestions = suggestions && suggestions.length > 0;

  return (
    <div className="mt-3 space-y-2">
      {/* Transcript with timestamps and keyword highlighting */}
      <TranscriptWithTimestamps
        segments={segments}
        fullText={fullText}
        language={transcript.language}
        highlightKeywords={highlightKeywords}
        compact={true}
        maxVisibleSegments={3}
      />

      {/* File Suggestions Section */}
      {suggestionsLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Finding matching files...</span>
        </div>
      )}

      {hasSuggestions && (
        <div className="rounded-md bg-primary/5 p-2.5">
          <button
            className="flex items-center gap-1.5 w-full text-left"
            onClick={() => setShowSuggestions(!showSuggestions)}
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">
              {suggestions.length} Matched File{suggestions.length !== 1 ? "s" : ""}
            </span>
            {showSuggestions ? (
              <ChevronUp className="h-3 w-3 text-primary ml-auto" />
            ) : (
              <ChevronDown className="h-3 w-3 text-primary ml-auto" />
            )}
          </button>

          {showSuggestions && (
            <div className="mt-2 space-y-1.5">
              {suggestions.map((suggestion: any) => (
                <div
                  key={suggestion.id}
                  className="flex items-center gap-2 text-xs bg-background/50 rounded px-2 py-1.5"
                >
                  <div className="flex-shrink-0 text-muted-foreground">
                    {getFileIcon(suggestion.suggestedFile?.mimeType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">
                      {suggestion.suggestedFile?.filename || "Unknown file"}
                    </p>
                    {suggestion.transcriptExcerpt && (
                      <p className="truncate text-muted-foreground text-[10px]">
                        "{suggestion.transcriptExcerpt}"
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      {suggestion.matchType}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round((suggestion.relevanceScore || 0) * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
