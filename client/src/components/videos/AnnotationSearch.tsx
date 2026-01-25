import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, X, Clock } from "lucide-react";

interface VoiceAnnotation {
  id: number;
  videoTimestamp: number;
  transcript: string | null;
  duration: number;
}

interface AnnotationSearchProps {
  annotations: VoiceAnnotation[];
  onJumpToTimestamp: (timestamp: number) => void;
  formatTime: (seconds: number) => string;
}

export function AnnotationSearch({ annotations, onJumpToTimestamp, formatTime }: AnnotationSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter annotations based on search query
  const searchResults = searchQuery.trim()
    ? annotations.filter(ann => 
        ann.transcript?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const handleClearSearch = () => {
    setSearchQuery("");
    setIsExpanded(false);
  };

  const handleResultClick = (timestamp: number) => {
    onJumpToTimestamp(timestamp);
    // Keep search open after jumping
  };

  return (
    <div className="space-y-2">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search annotation transcripts..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsExpanded(true);
          }}
          onFocus={() => setIsExpanded(true)}
          className="pl-10 pr-10"
        />
        {searchQuery && (
          <Button
            size="sm"
            variant="ghost"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
            onClick={handleClearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Search Results */}
      {isExpanded && searchQuery.trim() && (
        <Card className="p-3 max-h-64 overflow-y-auto">
          {searchResults.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsExpanded(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {searchResults.map((annotation) => (
                <button
                  key={annotation.id}
                  onClick={() => handleResultClick(annotation.videoTimestamp)}
                  className="w-full text-left p-2 rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-xs">
                          {formatTime(annotation.videoTimestamp)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {annotation.duration}s
                        </span>
                      </div>
                      <p className="text-sm line-clamp-2">
                        {highlightMatch(annotation.transcript || '', searchQuery)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-sm text-muted-foreground">
              No annotations found matching "{searchQuery}"
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// Helper function to highlight matching text
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <>
      {parts.map((part, index) => 
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={index} className="bg-yellow-200 dark:bg-yellow-900 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}
