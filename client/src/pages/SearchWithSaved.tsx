import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Loader2, FileImage, FileText, Video, File as FileIcon, Save, Bookmark, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function SearchWithSaved() {
  const [query, setQuery] = useState("");
  const [fileType, setFileType] = useState<string>("");
  const [enrichmentStatus, setEnrichmentStatus] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");

  const { data: searchData, isLoading } = trpc.files.advancedSearch.useQuery({
    query: query || undefined,
    fileType: fileType || undefined,
    enrichmentStatus: enrichmentStatus as any,
    tagIds: selectedTags.length > 0 ? selectedTags : undefined,
    dateFrom: dateFrom ? new Date(dateFrom).getTime() : undefined,
    dateTo: dateTo ? new Date(dateTo).getTime() : undefined,
  });

  const { data: tags = [] } = trpc.tags.list.useQuery();
  const { data: collections = [] } = trpc.collections.list.useQuery();
  const { data: savedSearches = [] } = trpc.savedSearches.list.useQuery();
  const utils = trpc.useUtils();

  const saveSearchMutation = trpc.savedSearches.create.useMutation({
    onSuccess: () => {
      utils.savedSearches.list.invalidate();
      toast.success("Search saved successfully");
      setSaveDialogOpen(false);
      setSearchName("");
    },
    onError: (error) => {
      toast.error(`Failed to save search: ${error.message}`);
    },
  });

  const deleteSearchMutation = trpc.savedSearches.delete.useMutation({
    onSuccess: () => {
      utils.savedSearches.list.invalidate();
      toast.success("Search deleted");
    },
  });

  const handleSaveSearch = () => {
    if (!searchName.trim()) {
      toast.error("Please enter a name for this search");
      return;
    }

    saveSearchMutation.mutate({
      name: searchName.trim(),
      query: query || undefined,
      fileType: fileType || undefined,
      enrichmentStatus: enrichmentStatus as any,
      tagIds: selectedTags.length > 0 ? selectedTags : undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
  };

  const loadSavedSearch = (search: any) => {
    setQuery(search.query || "");
    setFileType(search.fileType || "");
    setEnrichmentStatus(search.enrichmentStatus || "");
    setSelectedTags(search.tagIds || []);
    setDateFrom(search.dateFrom ? new Date(search.dateFrom).toISOString().split("T")[0] : "");
    setDateTo(search.dateTo ? new Date(search.dateTo).toISOString().split("T")[0] : "");
    toast.success(`Loaded search: ${search.name}`);
  };

  const resetFilters = () => {
    setQuery("");
    setFileType("");
    setEnrichmentStatus("");
    setSelectedTags([]);
    setSelectedCollectionId("");
    setDateFrom("");
    setDateTo("");
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

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Advanced Search</h1>
          <p className="text-muted-foreground mt-2">
            Search across all files with powerful filters
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedSearches.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Bookmark className="h-4 w-4 mr-2" />
                  Saved Searches ({savedSearches.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {savedSearches.map((search: any) => (
                  <div
                    key={search.id}
                    className="flex items-center justify-between px-2 py-1 hover:bg-accent rounded"
                  >
                    <button
                      onClick={() => loadSavedSearch(search)}
                      className="flex-1 text-left text-sm"
                    >
                      {search.name}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSearchMutation.mutate({ id: search.id });
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button onClick={() => setSaveDialogOpen(true)} variant="outline">
            <Save className="h-4 w-4 mr-2" />
            Save Current Search
          </Button>
        </div>
      </div>

      {/* Quick-apply Saved Searches */}
      {savedSearches.length > 0 && (
        <div className="mb-6">
          <Label className="text-sm text-muted-foreground mb-2 block">Quick Apply</Label>
          <div className="flex flex-wrap gap-2">
            {savedSearches.slice(0, 5).map((search: any) => (
              <Button
                key={search.id}
                variant="secondary"
                size="sm"
                onClick={() => loadSavedSearch(search)}
                className="text-xs"
              >
                <Bookmark className="h-3 w-3 mr-1" />
                {search.name}
              </Button>
            ))}
            {savedSearches.length > 5 && (
              <span className="text-xs text-muted-foreground self-center">
                +{savedSearches.length - 5} more in dropdown
              </span>
            )}
          </div>
        </div>
      )}

      {/* Active Filters Indicator */}
      {(query || fileType || enrichmentStatus || selectedTags.length > 0 || dateFrom || dateTo) && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {query && (
            <Button variant="outline" size="sm" onClick={() => setQuery("")} className="h-7 text-xs">
              Query: "{query.substring(0, 20)}{query.length > 20 ? '...' : ''}" ×
            </Button>
          )}
          {fileType && (
            <Button variant="outline" size="sm" onClick={() => setFileType("")} className="h-7 text-xs">
              Type: {fileType} ×
            </Button>
          )}
          {enrichmentStatus && (
            <Button variant="outline" size="sm" onClick={() => setEnrichmentStatus("")} className="h-7 text-xs">
              Status: {enrichmentStatus} ×
            </Button>
          )}
          {selectedTags.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setSelectedTags([])} className="h-7 text-xs">
              {selectedTags.length} tag(s) ×
            </Button>
          )}
          {(dateFrom || dateTo) && (
            <Button variant="outline" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }} className="h-7 text-xs">
              Date range ×
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 text-xs ml-auto">
            Clear all
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <Card className="p-6 h-fit">
          <h2 className="font-semibold mb-4">Filters</h2>

          <div className="space-y-4">
            {/* Search Query */}
            <div className="space-y-2">
              <Label htmlFor="query">Search Query</Label>
              <Input
                id="query"
                placeholder="Search files..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {/* File Type */}
            <div className="space-y-2">
              <Label htmlFor="fileType">File Type</Label>
              <Select value={fileType} onValueChange={setFileType}>
                <SelectTrigger id="fileType">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">All types</SelectItem>
                  <SelectItem value="image">Images</SelectItem>
                  <SelectItem value="video">Videos</SelectItem>
                  <SelectItem value="pdf">PDFs</SelectItem>
                  <SelectItem value="document">Documents</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Enrichment Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Enrichment Status</Label>
              <Select value={enrichmentStatus} onValueChange={setEnrichmentStatus}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Collections */}
            {collections.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="collection">Collection</Label>
                <Select value={selectedCollectionId} onValueChange={setSelectedCollectionId}>
                  <SelectTrigger id="collection">
                    <SelectValue placeholder="All collections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">All collections</SelectItem>
                    {collections.map((collection: any) => (
                      <SelectItem key={collection.id} value={collection.id.toString()}>
                        {collection.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Tags */}
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

            {/* Date Range */}
            <div className="space-y-2">
              <Label htmlFor="dateFrom">Date From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateTo">Date To</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <Button onClick={resetFilters} variant="outline" className="w-full">
              Reset Filters
            </Button>
          </div>
        </Card>

        {/* Results */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {isLoading ? "Searching..." : `${searchData?.total || 0} results`}
            </h2>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !searchData || searchData.files.length === 0 ? (
            <Card className="p-12 text-center">
              <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No results found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search filters
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {searchData.files.map((file: any) => (
                <Card key={file.id} className="p-4 hover:border-primary/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="text-primary">{getFileIcon(file.mimeType)}</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">
                        {file.title || file.filename}
                      </h3>
                      {file.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {file.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(file.fileSize)}</span>
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
                      {file.tags && file.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {file.tags.map((tag: any) => (
                            <span
                              key={tag.id}
                              className="px-2 py-1 bg-primary/20 text-primary text-xs rounded"
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Save Search Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Search</DialogTitle>
            <DialogDescription>
              Give this search a name so you can quickly access it later
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="search-name">Search Name</Label>
              <Input
                id="search-name"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="e.g., Recent Images"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSearch} disabled={saveSearchMutation.isPending}>
              {saveSearchMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Search"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
