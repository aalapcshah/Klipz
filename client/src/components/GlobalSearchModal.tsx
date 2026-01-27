import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, File, Video, Folder, Clock, ArrowRight, Command } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface GlobalSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchResult {
  id: number;
  type: "file" | "video" | "collection";
  title: string;
  description?: string;
  url?: string;
  thumbnailUrl?: string;
}

export function GlobalSearchModal({ open, onOpenChange }: GlobalSearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("synclips-recent-searches");
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  // Search files
  const { data: fileResults, isLoading: filesLoading } = trpc.files.search.useQuery(
    { query },
    { enabled: query.length >= 2 }
  );

  // Search videos
  const { data: videoResults, isLoading: videosLoading } = trpc.videos.list.useQuery(
    { search: query, pageSize: 5 },
    { enabled: query.length >= 2 }
  );

  // Combine results - fileResults is an array directly, videoResults has videos property
  const results: SearchResult[] = [
    ...(fileResults || []).slice(0, 5).map((f: any) => ({
      id: f.id,
      type: "file" as const,
      title: f.title || f.originalFilename || "Untitled",
      description: f.description || undefined,
      url: f.url,
      thumbnailUrl: f.url,
    })),
    ...(videoResults?.videos || []).map((v) => ({
      id: v.id,
      type: "video" as const,
      title: v.title || "Untitled Video",
      description: v.description || undefined,
      thumbnailUrl: v.thumbnailUrl || undefined,
    })),
  ];

  const isLoading = filesLoading || videosLoading;

  // Quick actions
  const quickActions = [
    { id: "upload", label: "Upload Files", icon: File, action: () => navigate("/files") },
    { id: "record", label: "Record Video", icon: Video, action: () => navigate("/videos") },
    { id: "collections", label: "View Collections", icon: Folder, action: () => navigate("/collections") },
  ];

  const saveRecentSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;
    const updated = [searchQuery, ...recentSearches.filter((s) => s !== searchQuery)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem("synclips-recent-searches", JSON.stringify(updated));
  }, [recentSearches]);

  const handleSelect = useCallback((result: SearchResult) => {
    saveRecentSearch(query);
    onOpenChange(false);
    if (result.type === "file") {
      navigate(`/files?fileId=${result.id}`);
    } else if (result.type === "video") {
      navigate(`/videos?videoId=${result.id}`);
    }
  }, [query, navigate, onOpenChange, saveRecentSearch]);

  const handleQuickAction = useCallback((action: () => void) => {
    onOpenChange(false);
    action();
  }, [onOpenChange]);

  const handleRecentSearch = useCallback((search: string) => {
    setQuery(search);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const totalItems = query.length >= 2 ? results.length : quickActions.length + recentSearches.length;
    
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, totalItems));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + totalItems) % Math.max(1, totalItems));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (query.length >= 2 && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      } else if (query.length < 2) {
        if (selectedIndex < quickActions.length) {
          handleQuickAction(quickActions[selectedIndex].action);
        } else {
          const recentIndex = selectedIndex - quickActions.length;
          if (recentSearches[recentIndex]) {
            handleRecentSearch(recentSearches[recentIndex]);
          }
        }
      }
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  }, [query, results, selectedIndex, quickActions, recentSearches, handleSelect, handleQuickAction, handleRecentSearch, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center border-b px-4 py-3">
          <Search className="h-5 w-5 text-muted-foreground mr-3" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search files, videos, collections..."
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
          />
          <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto p-2">
          {query.length >= 2 ? (
            <>
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-3" />
                  Searching...
                </div>
              ) : results.length > 0 ? (
                <div className="space-y-1">
                  {results.map((result, index) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleSelect(result)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                        selectedIndex === index
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50"
                      )}
                    >
                      {result.type === "file" ? (
                        <File className="h-5 w-5 text-blue-500 shrink-0" />
                      ) : (
                        <Video className="h-5 w-5 text-purple-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{result.title}</div>
                        {result.description && (
                          <div className="text-sm text-muted-foreground truncate">
                            {result.description}
                          </div>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No results found for "{query}"
                </div>
              )}
            </>
          ) : (
            <>
              {/* Quick Actions */}
              <div className="mb-4">
                <div className="text-xs font-medium text-muted-foreground px-3 py-1.5">
                  Quick Actions
                </div>
                <div className="space-y-1">
                  {quickActions.map((action, index) => (
                    <button
                      key={action.id}
                      onClick={() => handleQuickAction(action.action)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                        selectedIndex === index
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50"
                      )}
                    >
                      <action.icon className="h-5 w-5 text-muted-foreground" />
                      <span className="flex-1">{action.label}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground px-3 py-1.5">
                    Recent Searches
                  </div>
                  <div className="space-y-1">
                    {recentSearches.map((search, index) => (
                      <button
                        key={search}
                        onClick={() => handleRecentSearch(search)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                          selectedIndex === quickActions.length + index
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent/50"
                        )}
                      >
                        <Clock className="h-5 w-5 text-muted-foreground" />
                        <span className="flex-1">{search}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                ↑↓
              </kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                ↵
              </kbd>
              Select
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Command className="h-3 w-3" />
            <span>K to open</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GlobalSearchModal;
