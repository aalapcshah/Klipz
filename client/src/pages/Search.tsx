import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search as SearchIcon,
  X,
  FileImage,
  FileText,
  Video,
  File as FileIcon,
  Loader2,
  Filter,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Search() {
  const [query, setQuery] = useState("");
  const [fileType, setFileType] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [enrichmentStatus, setEnrichmentStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data: tags = [] } = trpc.tags.list.useQuery();
  const { data: searchResults, isLoading, refetch } = trpc.files.advancedSearch.useQuery(
    {
      query: query || undefined,
      fileType: fileType || undefined,
      tagIds: selectedTags.length > 0 ? selectedTags : undefined,
      enrichmentStatus: enrichmentStatus && enrichmentStatus !== "" ? (enrichmentStatus as "pending" | "processing" | "completed" | "failed") : undefined,
      dateFrom: dateFrom ? new Date(dateFrom).getTime() : undefined,
      dateTo: dateTo ? new Date(dateTo).getTime() : undefined,
      limit: pageSize,
      offset: page * pageSize,
    },
    {
      enabled: false, // Manual trigger
    }
  );

  const handleSearch = () => {
    setPage(0);
    refetch();
  };

  const handleReset = () => {
    setQuery("");
    setFileType("");
    setSelectedTags([]);
    setEnrichmentStatus("");
    setDateFrom("");
    setDateTo("");
    setPage(0);
  };

  const toggleTag = (tagId: number) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <FileImage className="h-5 w-5" />;
    if (mimeType.startsWith("video/")) return <Video className="h-5 w-5" />;
    if (mimeType.includes("pdf") || mimeType.includes("document"))
      return <FileText className="h-5 w-5" />;
    return <FileIcon className="h-5 w-5" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const totalPages = searchResults ? Math.ceil(searchResults.total / pageSize) : 0;

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Advanced Search</h1>
        <p className="text-muted-foreground">
          Search across all your files with powerful filters
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <Card className="p-6 h-fit">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </h2>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <X className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>

          <div className="space-y-6">
            {/* File Type Filter */}
            <div className="space-y-2">
              <Label>File Type</Label>
              <Select value={fileType} onValueChange={setFileType}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">All types</SelectItem>
                  <SelectItem value="image">Images</SelectItem>
                  <SelectItem value="video">Videos</SelectItem>
                  <SelectItem value="application/pdf">PDFs</SelectItem>
                  <SelectItem value="application">Documents</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Enrichment Status Filter */}
            <div className="space-y-2">
              <Label>Enrichment Status</Label>
              <Select value={enrichmentStatus} onValueChange={setEnrichmentStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Range Filter */}
            <div className="space-y-2">
              <Label>Date Range</Label>
              <div className="space-y-2">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="From"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="To"
                />
              </div>
            </div>

            {/* Tags Filter */}
            {tags.length > 0 && (
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {tags.map((tag: any) => (
                    <div key={tag.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`tag-${tag.id}`}
                        checked={selectedTags.includes(tag.id)}
                        onCheckedChange={() => toggleTag(tag.id)}
                      />
                      <label
                        htmlFor={`tag-${tag.id}`}
                        className="text-sm cursor-pointer"
                      >
                        {tag.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Search Results */}
        <div className="lg:col-span-3 space-y-6">
          {/* Search Bar */}
          <Card className="p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Search files by title, description, or content..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SearchIcon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </Card>

          {/* Results Count */}
          {searchResults && (
            <div className="text-sm text-muted-foreground">
              Found {searchResults.total} file{searchResults.total !== 1 ? "s" : ""}
            </div>
          )}

          {/* Results Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : searchResults && searchResults.files.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {searchResults.files.map((file: any) => (
                  <Card key={file.id} className="p-4 hover:border-primary transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="text-primary">{getFileIcon(file.mimeType)}</div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{file.title || "Untitled"}</h3>
                        {file.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {file.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <span>{formatFileSize(file.fileSize)}</span>
                          <span>•</span>
                          <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span
                            className={
                              file.enrichmentStatus === "completed"
                                ? "text-green-500"
                                : file.enrichmentStatus === "failed"
                                ? "text-red-500"
                                : "text-yellow-500"
                            }
                          >
                            {file.enrichmentStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          ) : searchResults ? (
            <Card className="p-12 text-center">
              <SearchIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No results found</h3>
              <p className="text-muted-foreground">
                Try adjusting your filters or search query
              </p>
            </Card>
          ) : (
            <Card className="p-12 text-center">
              <SearchIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Start searching</h3>
              <p className="text-muted-foreground">
                Enter a search query or apply filters to find files
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
