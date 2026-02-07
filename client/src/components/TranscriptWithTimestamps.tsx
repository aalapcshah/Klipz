import { useState, useMemo, useCallback, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  MessageSquareText,
  Play,
} from "lucide-react";

interface Segment {
  text: string;
  start: number;
  end: number;
}

interface TranscriptWithTimestampsProps {
  segments: Segment[];
  fullText: string;
  language?: string | null;
  /** Keywords to highlight in the transcript text */
  highlightKeywords?: string[];
  /** Callback when a timestamp is clicked — receives the time in seconds */
  onJumpToTimestamp?: (timestamp: number) => void;
  /** Compact mode for inline display (upload card) vs full mode (video detail) */
  compact?: boolean;
  /** Max segments to show before "show more" in compact mode */
  maxVisibleSegments?: number;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Highlights keywords in text by wrapping them in styled spans.
 * Returns an array of React nodes.
 */
function highlightText(
  text: string,
  keywords: string[]
): React.ReactNode[] {
  if (!keywords || keywords.length === 0) {
    return [text];
  }

  // Escape regex special characters and build pattern
  const escaped = keywords
    .filter((k) => k.length > 0)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (escaped.length === 0) return [text];

  // Build a regex that matches any keyword (case-insensitive, whole-ish match)
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

export function TranscriptWithTimestamps({
  segments,
  fullText,
  language,
  highlightKeywords = [],
  onJumpToTimestamp,
  compact = false,
  maxVisibleSegments = 3,
}: TranscriptWithTimestampsProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);

  const visibleSegments = useMemo(() => {
    if (!segments || segments.length === 0) return [];
    if (expanded || !compact) return segments;
    return segments.slice(0, maxVisibleSegments);
  }, [segments, expanded, compact, maxVisibleSegments]);

  const hasMore = compact && segments && segments.length > maxVisibleSegments;

  const handleTimestampClick = useCallback(
    (timestamp: number, index: number) => {
      setActiveSegmentIndex(index);
      onJumpToTimestamp?.(timestamp);
    },
    [onJumpToTimestamp]
  );

  // If no segments, fall back to plain text display
  if (!segments || segments.length === 0) {
    if (!fullText) return null;

    const displayText = compact && fullText.length > 200 && !expanded
      ? fullText.slice(0, 200) + "..."
      : fullText;

    return (
      <div className={compact ? "rounded-md bg-muted/50 p-2.5" : "space-y-2"}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <MessageSquareText className={compact ? "h-3.5 w-3.5 text-primary" : "h-4 w-4 text-primary"} />
          <span className={compact ? "text-xs font-medium text-primary" : "text-sm font-medium text-primary"}>
            Speech Transcript
          </span>
          {language && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              {language.toUpperCase()}
            </Badge>
          )}
        </div>
        <p className={compact ? "text-xs text-muted-foreground leading-relaxed" : "text-sm text-muted-foreground leading-relaxed"}>
          {highlightText(displayText, highlightKeywords)}
        </p>
        {compact && fullText.length > 200 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1 mt-1 text-[10px] text-primary hover:text-primary"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-0.5" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-0.5" />
                Show more
              </>
            )}
          </Button>
        )}
      </div>
    );
  }

  // Segments with timestamps
  return (
    <div className={compact ? "rounded-md bg-muted/50 p-2.5" : "space-y-2"}>
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <MessageSquareText className={compact ? "h-3.5 w-3.5 text-primary" : "h-4 w-4 text-primary"} />
        <span className={compact ? "text-xs font-medium text-primary" : "text-sm font-medium text-primary"}>
          Speech Transcript
        </span>
        {language && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
            {language.toUpperCase()}
          </Badge>
        )}
        <span className={compact ? "text-[10px] text-muted-foreground ml-auto" : "text-xs text-muted-foreground ml-auto"}>
          {segments.length} segment{segments.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Segments */}
      <div className={compact ? "space-y-1.5" : "space-y-2"}>
        {visibleSegments.map((segment, index) => {
          const isActive = activeSegmentIndex === index;
          const actualIndex = compact && !expanded ? index : index;

          return (
            <div
              key={`${segment.start}-${index}`}
              className={`flex gap-2 group ${
                isActive
                  ? "bg-primary/10 rounded-md -mx-1 px-1 py-0.5"
                  : "py-0.5"
              }`}
            >
              {/* Timestamp button */}
              <button
                onClick={() => handleTimestampClick(segment.start, actualIndex)}
                className={`flex-shrink-0 flex items-center gap-0.5 font-mono transition-colors ${
                  compact ? "text-[10px]" : "text-xs"
                } ${
                  onJumpToTimestamp
                    ? "text-primary/70 hover:text-primary cursor-pointer"
                    : "text-muted-foreground cursor-default"
                } ${isActive ? "text-primary font-semibold" : ""}`}
                disabled={!onJumpToTimestamp}
                title={onJumpToTimestamp ? `Jump to ${formatTimestamp(segment.start)}` : undefined}
              >
                {onJumpToTimestamp && (
                  <Play className={`${compact ? "h-2.5 w-2.5" : "h-3 w-3"} opacity-0 group-hover:opacity-100 transition-opacity`} />
                )}
                <span className={compact ? "w-8" : "w-10"}>
                  {formatTimestamp(segment.start)}
                </span>
              </button>

              {/* Segment text with keyword highlighting */}
              <p className={`flex-1 leading-relaxed ${
                compact
                  ? "text-xs text-muted-foreground"
                  : "text-sm text-foreground/80"
              }`}>
                {highlightText(segment.text.trim(), highlightKeywords)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Show more/less toggle */}
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className={`${compact ? "h-5 px-1 mt-1 text-[10px]" : "h-6 px-2 mt-1 text-xs"} text-primary hover:text-primary`}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-0.5" />
              Show less ({segments.length - maxVisibleSegments} hidden)
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-0.5" />
              Show all {segments.length} segments
            </>
          )}
        </Button>
      )}
    </div>
  );
}
