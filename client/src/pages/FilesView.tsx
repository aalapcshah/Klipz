import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Upload, LayoutGrid, List, FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadDialog } from "@/components/files/FileUploadDialog";
import FileGridEnhanced from "@/components/files/FileGridEnhanced";
import { FileListView } from "@/components/files/FileListView";
import { VoiceSearchBar } from "@/components/VoiceSearchBar";
import { FileDetailDialog } from "@/components/files/FileDetailDialog";
import { BulkOperationsToolbar } from "@/components/files/BulkOperationsToolbar";
import { FilesEmptyState } from "@/components/files/FilesEmptyState";
import { AdvancedFiltersPanel, type AdvancedFilters } from "@/components/files/AdvancedFiltersPanel";
import { trpc } from "@/lib/trpc";
import { StorageCleanupWizard } from "@/components/StorageCleanupWizard";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function FilesView() {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [showCleanupWizard, setShowCleanupWizard] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(() => {
    const saved = localStorage.getItem('advancedFiltersOpen');
    // On mobile, default to closed; on desktop, use saved preference
    const isMobile = window.innerWidth < 768;
    return isMobile ? false : (saved ? JSON.parse(saved) : false);
  });
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(() => {
    const saved = localStorage.getItem('advancedFilters');
    return saved ? JSON.parse(saved) : {
      dateFrom: '',
      dateTo: '',
      fileSizeMin: 0,
      fileSizeMax: 100,
      enrichmentStatus: [],
      qualityScore: [],
    };
  });
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('filesViewMode');
    return (saved as 'grid' | 'list') || 'grid';
  });
  const searchParams = useSearch();
  const [, setLocation] = useLocation();
  
  // Initialize from URL params or localStorage
  const [page, setPage] = useState(() => {
    const urlPage = new URLSearchParams(searchParams).get('page');
    return urlPage ? parseInt(urlPage) : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const urlPageSize = new URLSearchParams(searchParams).get('pageSize');
    if (urlPageSize) return parseInt(urlPageSize);
    const saved = localStorage.getItem('filesPageSize');
    return saved ? parseInt(saved) : 50;
  });
  
  // Update URL when page or pageSize changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('page', page.toString());
    params.set('pageSize', pageSize.toString());
    setLocation(`?${params.toString()}`, { replace: true });
  }, [page, pageSize]);
  const utils = trpc.useUtils();
  const { data: filesData } = trpc.files.list.useQuery({ page, pageSize });
  const { data: recentlyViewed } = trpc.recentlyViewed.list.useQuery({ limit: 10 });
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  
  // Persist page size preference
  useEffect(() => {
    localStorage.setItem('filesPageSize', pageSize.toString());
  }, [pageSize]);

  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem('advancedFilters', JSON.stringify(advancedFilters));
  }, [advancedFilters]);

  useEffect(() => {
    localStorage.setItem('advancedFiltersOpen', JSON.stringify(filtersOpen));
  }, [filtersOpen]);

  useEffect(() => {
    localStorage.setItem('filesViewMode', viewMode);
  }, [viewMode]);

  const trackViewMutation = trpc.recentlyViewed.trackView.useMutation();

  // Pull-to-refresh handlers
  const pullThreshold = 80;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer && scrollContainer.scrollTop === 0) {
      setTouchStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || scrollContainer.scrollTop > 0) {
      setTouchStartY(null);
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const distance = currentY - touchStartY;
    
    if (distance > 0) {
      e.preventDefault();
      setPullDistance(Math.min(distance, pullThreshold * 1.5));
      setIsPulling(distance > pullThreshold);
    }
  };

  const handleTouchEnd = async () => {
    if (isPulling && pullDistance > pullThreshold) {
      // Trigger refresh
      await utils.files.list.invalidate();
      await utils.recentlyViewed.list.invalidate();
      toast.success('Files refreshed');
    }
    
    setTouchStartY(null);
    setPullDistance(0);
    setIsPulling(false);
  };

  const handleFileClick = (fileId: number) => {
    setSelectedFileId(fileId);
    // Track file view in background
    trackViewMutation.mutate({ fileId });
  };

  return (
    <div className="flex h-full">
      {/* Advanced Filters Sidebar - Hidden on mobile by default */}
      <AdvancedFiltersPanel
        filters={advancedFilters}
        onFiltersChange={setAdvancedFilters}
        isOpen={filtersOpen}
        onToggle={() => setFiltersOpen(!filtersOpen)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div 
          ref={scrollContainerRef}
          className="p-4 md:p-6 space-y-4 overflow-y-auto overflow-x-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            transform: `translateY(${pullDistance * 0.5}px)`,
            transition: pullDistance === 0 ? 'transform 0.3s ease' : 'none',
          }}
        >
          {/* Pull-to-refresh indicator */}
          {pullDistance > 0 && (
            <div 
              className="flex items-center justify-center py-2 text-sm text-muted-foreground"
              style={{
                opacity: Math.min(pullDistance / pullThreshold, 1),
              }}
            >
              {isPulling ? '↓ Release to refresh' : '↓ Pull to refresh'}
            </div>
          )}
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold">Files</h1>
                <p className="text-sm text-muted-foreground">
                  Manage and enrich your media files with AI
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* View Toggle */}
                <div className="flex border rounded-md">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    className="rounded-r-none"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="rounded-l-none"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
                {/* Show Filters Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFiltersOpen(!filtersOpen)}
                >
                  {filtersOpen ? 'Hide Filters' : 'Show Filters'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowCleanupWizard(true)}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Clean Up Storage</span>
                  <span className="sm:hidden">Clean Up</span>
                </Button>
                <Button id="upload-files-button" size="sm" onClick={() => setUploadDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Upload Files</span>
                  <span className="sm:hidden">Upload</span>
                </Button>
              </div>
            </div>
            
            {/* Voice Search Bar */}
            <div id="search-bar">
              <VoiceSearchBar
                onSearch={(results) => setSearchResults(results)}
                placeholder="Search files with voice or text..."
              />
            </div>
            
            {searchResults && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm">
                  Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchResults(null)}
                >
                  Clear Search
                </Button>
              </div>
            )}
          </div>

          {/* Recently Viewed Files */}
          {recentlyViewed && recentlyViewed.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Recently Viewed</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {recentlyViewed.map(({ file, viewedAt }) => (
                  <div
                    key={file.id}
                    className="group cursor-pointer rounded-lg border border-border hover:border-primary transition-colors"
                    onClick={() => handleFileClick(file.id)}
                  >
                    <div className="aspect-video bg-muted rounded-t-lg overflow-hidden">
                      {file.url && (file.mimeType?.startsWith('image/') || file.mimeType?.startsWith('video/')) ? (
                        <img
                          src={file.url}
                          alt={file.filename}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FileIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-sm font-medium truncate">{file.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(viewedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selection Controls */}
          {filesData?.files && filesData.files.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const currentPageIds = filesData.files.map(f => f.id);
                  setSelectedFileIds(currentPageIds);
                }}
              >
                Select All on This Page ({filesData.files.length})
              </Button>
              {selectedFileIds.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedFileIds([])}
                >
                  Clear Selection
                </Button>
              )}
            </div>
          )}

          {/* Empty State */}
          {!searchResults && filesData?.files && filesData.files.length === 0 ? (
            <FilesEmptyState onUploadClick={() => setUploadDialogOpen(true)} />
          ) : (
            viewMode === 'grid' ? (
              <FileGridEnhanced 
                onFileClick={handleFileClick}
                selectedFileIds={selectedFileIds}
                onSelectionChange={setSelectedFileIds}
                advancedFilters={advancedFilters}
              />
            ) : (
              <FileListView
                files={searchResults || filesData?.files || []}
                onFileClick={handleFileClick}
                selectedFileIds={selectedFileIds}
                onSelectionChange={setSelectedFileIds}
              />
            )
          )}
          
          {/* Pagination Controls */}
          {!searchResults && filesData?.pagination && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Showing {Math.min((filesData.pagination.page - 1) * filesData.pagination.pageSize + 1, filesData.pagination.totalCount)} - {Math.min(filesData.pagination.page * filesData.pagination.pageSize, filesData.pagination.totalCount)} of {filesData.pagination.totalCount} files
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Items per page:</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(value) => {
                      setPageSize(parseInt(value));
                      setPage(1); // Reset to first page
                    }}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Page</span>
                <input
                  type="number"
                  min="1"
                  max={filesData.pagination.totalPages}
                  value={page}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (value >= 1 && value <= filesData.pagination.totalPages) {
                      setPage(value);
                    }
                  }}
                  className="w-16 px-2 py-1 text-sm border rounded text-center"
                />
                <span className="text-sm text-muted-foreground">of {filesData.pagination.totalPages}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(filesData.pagination.totalPages, p + 1))}
                disabled={page === filesData.pagination.totalPages}
              >
                Next
              </Button>
              </div>
            </div>
          )}
        </div>

        <FileUploadDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          onUploadComplete={() => {
            utils.files.list.invalidate();
          }}
        />

        <FileDetailDialog
          fileId={selectedFileId}
          open={selectedFileId !== null}
          onOpenChange={(open) => !open && setSelectedFileId(null)}
        />

        <BulkOperationsToolbar
          selectedFileIds={selectedFileIds}
          onClearSelection={() => setSelectedFileIds([])}
          onOperationComplete={() => {
            utils.files.list.invalidate();
          }}
          onSelectAll={(ids) => setSelectedFileIds(ids)}
          totalCount={filesData?.pagination.totalCount}
        />

        <StorageCleanupWizard
          open={showCleanupWizard}
          onOpenChange={setShowCleanupWizard}
          onComplete={() => {
            utils.files.list.invalidate();
          }}
        />
      </div>
    </div>
  );
}
