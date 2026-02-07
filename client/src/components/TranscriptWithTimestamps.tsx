import { useState, useMemo, useCallback, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  MessageSquareText,
  Play,
  Search,
  X,
  Download,
  FileText,
  Subtitles,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  /** Video title for export filename */
  videoTitle?: string;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format seconds into SRT timestamp format: HH:MM:SS,mmm
 */
function formatSrtTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
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

/**
 * Generate SRT subtitle content from segments
 */
function generateSrt(segments: Segment[]): string {
  return segments
    .map((seg, i) => {
      const index = i + 1;
      const start = formatSrtTimestamp(seg.start);
      const end = formatSrtTimestamp(seg.end);
      return `${index}\n${start} --> ${end}\n${seg.text.trim()}\n`;
    })
    .join("\n");
}

/**
 * Generate plain text transcript with timestamps
 */
function generatePlainText(segments: Segment[], language?: string | null): string {
  const header = `Transcript${language ? ` (${language.toUpperCase()})` : ""}\n${"=".repeat(40)}\n\n`;
  const body = segments
    .map((seg) => `[${formatTimestamp(seg.start)} - ${formatTimestamp(seg.end)}] ${seg.text.trim()}`)
    .join("\n\n");
  return header + body;
}

/**
 * Trigger a file download in the browser
 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TranscriptWithTimestamps({
  segments,
  fullText,
  language,
  highlightKeywords = [],
  onJumpToTimestamp,
  compact = false,
  maxVisibleSegments = 3,
  videoTitle,
}: TranscriptWithTimestampsProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Combine highlight keywords with search query
  const allHighlightKeywords = useMemo(() => {
    const kws = [...highlightKeywords];
    if (searchQuery.trim()) {
      kws.push(searchQuery.trim());
    }
    return kws;
  }, [highlightKeywords, searchQuery]);

  // Filter segments by search query
  const filteredSegments = useMemo(() => {
    if (!segments || segments.length === 0) return [];
    if (!searchQuery.trim()) return segments;

    const query = searchQuery.trim().toLowerCase();
    return segments.filter((seg) =>
      seg.text.toLowerCase().includes(query)
    );
  }, [segments, searchQuery]);

  // Determine visible segments based on compact mode and expansion
  const visibleSegments = useMemo(() => {
    const source = searchQuery.trim() ? filteredSegments : segments;
    if (!source || source.length === 0) return [];
    if (expanded || !compact) return source;
    return source.slice(0, maxVisibleSegments);
  }, [filteredSegments, segments, searchQuery, expanded, compact, maxVisibleSegments]);

  const totalSegments = searchQuery.trim() ? filteredSegments.length : (segments?.length || 0);
  const hasMore = compact && totalSegments > maxVisibleSegments;

  // Search result count
  const searchResultCount = searchQuery.trim() ? filteredSegments.length : null;

  const handleTimestampClick = useCallback(
    (timestamp: number, index: number) => {
      setActiveSegmentIndex(index);
      onJumpToTimestamp?.(timestamp);
    },
    [onJumpToTimestamp]
  );

  const handleExportSrt = useCallback(() => {
    if (!segments || segments.length === 0) return;
    const srt = generateSrt(segments);
    const filename = `${videoTitle || "transcript"}.srt`;
    downloadFile(srt, filename, "text/srt");
  }, [segments, videoTitle]);

  const handleExportText = useCallback(() => {
    if (!segments || segments.length === 0) return;
    const text = generatePlainText(segments, language);
    const filename = `${videoTitle || "transcript"}.txt`;
    downloadFile(text, filename, "text/plain");
  }, [segments, language, videoTitle]);

  const handleExportSearchResults = useCallback(() => {
    if (!filteredSegments || filteredSegments.length === 0) return;
    const header = `Search Results for "${searchQuery}"\n${"=".repeat(40)}\n${filteredSegments.length} matching segment(s)\n\n`;
    const body = filteredSegments
      .map((seg) => `[${formatTimestamp(seg.start)} - ${formatTimestamp(seg.end)}] ${seg.text.trim()}`)
      .join("\n\n");
    const filename = `transcript-search-${searchQuery.replace(/[^a-zA-Z0-9]/g, "_")}.txt`;
    downloadFile(header + body, filename, "text/plain");
  }, [filteredSegments, searchQuery]);

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
          {highlightText(displayText, allHighlightKeywords)}
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
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <MessageSquareText className={compact ? "h-3.5 w-3.5 text-primary" : "h-4 w-4 text-primary"} />
        <span className={compact ? "text-xs font-medium text-primary" : "text-sm font-medium text-primary"}>
          Speech Transcript
        </span>
        {language && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
            {language.toUpperCase()}
          </Badge>
        )}

        {/* Action buttons on the right */}
        <div className="flex items-center gap-1 ml-auto">
          {/* Search toggle */}
          {!compact && (
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 w-6 p-0 ${showSearch ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => {
                setShowSearch(!showSearch);
                if (showSearch) {
                  setSearchQuery("");
                }
              }}
              title="Search transcript"
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Export dropdown */}
          {!compact && segments.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground"
                  title="Export transcript"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleExportSrt}>
                  <Subtitles className="h-4 w-4 mr-2" />
                  Export as SRT
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportText}>
                  <FileText className="h-4 w-4 mr-2" />
                  Export as Text
                </DropdownMenuItem>
                {searchQuery.trim() && filteredSegments.length > 0 && (
                  <DropdownMenuItem onClick={handleExportSearchResults}>
                    <Search className="h-4 w-4 mr-2" />
                    Export search results
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Segment count */}
          <span className={compact ? "text-[10px] text-muted-foreground" : "text-xs text-muted-foreground"}>
            {searchResultCount !== null
              ? `${searchResultCount}/${segments.length}`
              : `${segments.length}`}{" "}
            segment{segments.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && !compact && (
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transcript..."
            className="h-8 pl-8 pr-8 text-xs"
            autoFocus
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 p-0"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          {searchQuery.trim() && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              {filteredSegments.length === 0
                ? `No results for "${searchQuery}"`
                : `Found "${searchQuery}" in ${filteredSegments.length} segment${filteredSegments.length !== 1 ? "s" : ""}`}
            </div>
          )}
        </div>
      )}

      {/* Segments */}
      <div className={compact ? "space-y-1.5" : "space-y-2"}>
        {visibleSegments.map((segment, index) => {
          const isActive = activeSegmentIndex === index;

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
                onClick={() => handleTimestampClick(segment.start, index)}
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
                {highlightText(segment.text.trim(), allHighlightKeywords)}
              </p>
            </div>
          );
        })}
      </div>

      {/* No search results message */}
      {searchQuery.trim() && filteredSegments.length === 0 && (
        <div className="text-center py-4 text-xs text-muted-foreground">
          No segments match &ldquo;{searchQuery}&rdquo;
        </div>
      )}

      {/* Show more/less toggle */}
      {hasMore && !searchQuery.trim() && (
        <Button
          variant="ghost"
          size="sm"
          className={`${compact ? "h-5 px-1 mt-1 text-[10px]" : "h-6 px-2 mt-1 text-xs"} text-primary hover:text-primary`}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-0.5" />
              Show less ({totalSegments - maxVisibleSegments} hidden)
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-0.5" />
              Show all {totalSegments} segments
            </>
          )}
        </Button>
      )}
    </div>
  );
}
