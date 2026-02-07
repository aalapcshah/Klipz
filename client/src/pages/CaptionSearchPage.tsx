import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Video,
  Clock,
  FileText,
  Loader2,
  Captions,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

interface CaptionSearchResult {
  fileId: number;
  filename: string;
  title: string | null;
  url: string;
  mimeType: string;
  timestamp: number;
  caption: string;
  entities: string[];
  confidence: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-primary/30 text-primary-foreground rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export default function CaptionSearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const { data: results, isLoading } = trpc.videoVisualCaptions.searchCaptions.useQuery(
    { query: submittedQuery },
    { enabled: submittedQuery.length > 0 }
  );

  const { data: allCaptions } = trpc.videoVisualCaptions.getAllCaptions.useQuery();

  // Group results by video
  const groupedResults = useMemo(() => {
    if (!results) return [];
    const groups = new Map<
      number,
      { fileId: number; filename: string; title: string | null; url: string; results: CaptionSearchResult[] }
    >();
    for (const r of results) {
      if (!groups.has(r.fileId)) {
        groups.set(r.fileId, {
          fileId: r.fileId,
          filename: r.filename,
          title: r.title,
          url: r.url,
          results: [],
        });
      }
      groups.get(r.fileId)!.results.push(r);
    }
    return Array.from(groups.values()).sort(
      (a, b) => b.results.length - a.results.length
    );
  }, [results]);

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }
    setSubmittedQuery(searchQuery.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Captions className="h-8 w-8 text-primary" />
          Caption Search
        </h1>
        <p className="text-muted-foreground mt-1">
          Search across all AI-generated visual captions to find specific moments in your videos
        </p>
      </div>

      {/* Stats */}
      {allCaptions && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Video className="h-4 w-4" />
            {allCaptions.length} videos with captions
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            {allCaptions.reduce((sum, c) => sum + (c.totalFramesAnalyzed || 0), 0)} total captions
          </span>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search captions (e.g., 'IRS website', 'health savings', 'chart')"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-10"
          />
        </div>
        <Button onClick={handleSearch} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Search"
          )}
        </Button>
      </div>

      {/* Results */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Searching captions...</span>
        </div>
      )}

      {submittedQuery && !isLoading && results && results.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">No captions found for "{submittedQuery}"</p>
          <p className="text-sm mt-1">Try different keywords or generate captions for more videos</p>
        </div>
      )}

      {submittedQuery && !isLoading && results && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Found {results.length} caption{results.length !== 1 ? "s" : ""} across{" "}
            {groupedResults.length} video{groupedResults.length !== 1 ? "s" : ""}
          </p>

          {groupedResults.map((group) => (
            <Card key={group.fileId} className="p-4 space-y-3">
              {/* Video header */}
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-primary" />
                <span className="font-semibold">
                  {group.title || group.filename}
                </span>
                <Badge variant="secondary" className="ml-auto">
                  {group.results.length} match{group.results.length !== 1 ? "es" : ""}
                </Badge>
              </div>

              {/* Caption matches */}
              <div className="space-y-2 ml-7">
                {group.results.map((result, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                    onClick={() => {
                      // Navigate to video at this timestamp
                      toast.info(
                        `Opening video at ${formatTime(result.timestamp)}`,
                        { description: "Feature coming soon" }
                      );
                    }}
                  >
                    <div className="flex items-center gap-1 text-xs text-primary font-mono bg-primary/10 px-2 py-1 rounded shrink-0">
                      <Clock className="h-3 w-3" />
                      {formatTime(result.timestamp)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed">
                        {highlightMatch(result.caption, submittedQuery)}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {result.entities.slice(0, 5).map((entity, eIdx) => (
                          <Badge
                            key={eIdx}
                            variant="outline"
                            className="text-xs"
                          >
                            {entity}
                          </Badge>
                        ))}
                        {result.entities.length > 5 && (
                          <Badge variant="outline" className="text-xs opacity-60">
                            +{result.entities.length - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state when no search yet */}
      {!submittedQuery && !isLoading && (
        <div className="text-center py-16 text-muted-foreground">
          <Captions className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Search your video captions</p>
          <p className="text-sm mt-1 max-w-md mx-auto">
            Find specific moments across all your videos by searching through AI-generated visual captions.
            Try searching for objects, text, actions, or topics seen in your videos.
          </p>
        </div>
      )}
    </div>
  );
}
