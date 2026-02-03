import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Upload, LayoutGrid, List, FileIcon, Camera, ChevronDown, ChevronUp } from "lucide-react";
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
import { UsageOverviewCompact } from "@/components/UsageOverviewCompact";
import { CameraCapture } from "@/components/CameraCapture";
import { FilesFAB } from "@/components/FloatingActionButton";
import { PullToRefresh } from "@/components/PullToRefresh";
import { GestureTutorial } from "@/components/GestureTutorial";
import { VoiceCommands, useFileCommands } from "@/components/VoiceCommands";
import { OfflineIndicator, OfflineBanner } from "@/components/OfflineIndicator";
import { useOffline } from "@/hooks/useOffline";
import { Trash2 } from "lucide-react";
import { ResumableUploadsBanner } from "@/components/ResumableUploadsBanner";
import { toast } from "sonner";

export default function FilesView() {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [showCleanupWizard, setShowCleanupWizard] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
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
  const [recentlyViewedExpanded, setRecentlyViewedExpanded] = useState(() => {
    // On mobile, default to collapsed; on desktop, default to expanded
    const isMobile = window.innerWidth < 768;
    const saved = localStorage.getItem('recentlyViewedExpanded');
    return saved !== null ? JSON.parse(saved) : !isMobile;
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

  // Voice commands for hands-free control
  const fileCommands = useFileCommands({
    onTakePhoto: () => setCameraDialogOpen(true),
    onUpload: () => setUploadDialogOpen(true),
    onSearch: (query) => {
      const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
      if (searchInput) {
        searchInput.value = query;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    onSelectAll: () => {
      if (filesData?.files) {
        setSelectedFileIds(filesData.files.map((f: any) => f.id));
      }
    },
    onClearSelection: () => setSelectedFileIds([]),
  });

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
            {/* Resumable Uploads Banner */}
            <ResumableUploadsBanner onUploadComplete={() => utils.files.list.invalidate()} />
            
            {/* Header Row */}
            <div className="flex flex-col gap-3">
              {/* Title and Actions Row */}
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold">Files</h1>
                  <p className="text-sm text-muted-foreground">
                    Manage and enrich your media files with AI
                  </p>
                </div>
                {/* Action Buttons - all in one row */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Usage Overview - compact inline */}
                  <UsageOverviewCompact />
                  <Button variant="outline" size="sm" onClick={() => setShowCleanupWizard(true)}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">Clean Up</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setCameraDialogOpen(true)}
                    title="Take Photo"
                  >
                    <Camera className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">Capture</span>
                  </Button>
                  <Button id="upload-files-button" size="sm" onClick={() => setUploadDialogOpen(true)}>
                    <Upload className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">Upload</span>
                  </Button>
                  {/* Voice Commands Button */}
                  <VoiceCommands
                    commands={fileCommands}
                    onSearchCommand={(query) => {
                      const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
                      if (searchInput) {
                        searchInput.value = query;
                        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                        searchInput.focus();
                      }
                    }}
                  />
                  {/* Offline Indicator */}
                  <OfflineIndicator showDetails />
                </div>
              </div>
              
              {/* Search and Filters Row */}
              <div className="flex flex-col sm:flex-row gap-2">
                {/* View Toggle */}
                <div className="flex border rounded-md shrink-0">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    className="rounded-r-none h-9"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="rounded-l-none h-9"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
                {/* Show Filters + Clear + Quick Filter Presets - ALL on same line on mobile */}
                <div className="flex items-center gap-1 flex-nowrap overflow-x-auto">
                  {/* Filters dropdown with Clear option */}
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value === 'toggle') {
                        setFiltersOpen(!filtersOpen);
                      } else if (value === 'clear') {
                        setAdvancedFilters({
                          dateFrom: '',
                          dateTo: '',
                          fileSizeMin: 0,
                          fileSizeMax: 100,
                          enrichmentStatus: [],
                          qualityScore: [],
                        });
                        toast.success('Filters cleared');
                      }
                    }}
                  >
                    <SelectTrigger className="shrink-0 h-6 text-[10px] px-2 md:h-8 md:text-xs md:px-3 w-auto min-w-[60px] md:min-w-[80px]">
                      <span>⚙️ {filtersOpen ? 'Hide' : 'Filter'}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="toggle">{filtersOpen ? '🔼 Hide Filters' : '🔽 Show Filters'}</SelectItem>
                      <SelectItem value="clear">🔄 Clear All Filters</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Quick filter preset buttons with active state */}
                  <Button
                    variant={advancedFilters.dateFrom ? 'default' : 'outline'}
                    size="sm"
                    className={`shrink-0 h-6 text-[10px] px-2 md:h-7 md:text-xs md:px-3 ${advancedFilters.dateFrom ? 'bg-primary text-primary-foreground' : ''}`}
                    onClick={() => {
                      if (advancedFilters.dateFrom) {
                        // Toggle off if already active
                        setAdvancedFilters(prev => ({ ...prev, dateFrom: '', dateTo: '' }));
                        toast.success('Recent filter removed');
                      } else {
                        setAdvancedFilters(prev => ({
                          ...prev,
                          dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                          dateTo: '',
                        }));
                        setFiltersOpen(true);
                        toast.success('Showing files from last 7 days');
                      }
                    }}
                  >
                    📅 Recent
                  </Button>
                  <Button
                    variant={advancedFilters.fileSizeMin > 0 ? 'default' : 'outline'}
                    size="sm"
                    className={`shrink-0 h-6 text-[10px] px-2 md:h-7 md:text-xs md:px-3 ${advancedFilters.fileSizeMin > 0 ? 'bg-primary text-primary-foreground' : ''}`}
                    onClick={() => {
                      if (advancedFilters.fileSizeMin > 0) {
                        // Toggle off if already active
                        setAdvancedFilters(prev => ({ ...prev, fileSizeMin: 0, fileSizeMax: 100 }));
                        toast.success('Large files filter removed');
                      } else {
                        setAdvancedFilters(prev => ({
                          ...prev,
                          fileSizeMin: 10,
                          fileSizeMax: 100,
                        }));
                        setFiltersOpen(true);
                        toast.success('Showing files larger than 10MB');
                      }
                    }}
                  >
                    📦 Large
                  </Button>
                  <Button
                    variant={advancedFilters.qualityScore.length > 0 ? 'default' : 'outline'}
                    size="sm"
                    className={`shrink-0 h-6 text-[10px] px-2 md:h-7 md:text-xs md:px-3 ${advancedFilters.qualityScore.length > 0 ? 'bg-primary text-primary-foreground' : ''}`}
                    onClick={() => {
                      if (advancedFilters.qualityScore.length > 0) {
                        // Toggle off if already active
                        setAdvancedFilters(prev => ({ ...prev, qualityScore: [] }));
                        toast.success('Enrich filter removed');
                      } else {
                        setAdvancedFilters(prev => ({
                          ...prev,
                          qualityScore: ['0-20', '20-40'],
                        }));
                        setFiltersOpen(true);
                        toast.success('Showing files that need enrichment');
                      }
                    }}
                  >
                    ✨ Enrich
                  </Button>
                </div>
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

          {/* Selection Controls */}
          {filesData?.files && filesData.files.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2 md:h-8 md:text-sm md:px-3"
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

          {/* Recently Viewed Files - At Bottom (Collapsible on Mobile) */}
          {recentlyViewed && recentlyViewed.length > 0 && (
            <div className="space-y-3 mt-8 pt-6 border-t">
              <button
                className="flex items-center justify-between w-full text-left"
                onClick={() => {
                  const newValue = !recentlyViewedExpanded;
                  setRecentlyViewedExpanded(newValue);
                  localStorage.setItem('recentlyViewedExpanded', JSON.stringify(newValue));
                }}
              >
                <h2 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
                  Recently Viewed
                  <span className="text-xs font-normal bg-muted px-2 py-0.5 rounded-full">
                    {recentlyViewed.length}
                  </span>
                </h2>
                <div className="md:hidden">
                  {recentlyViewedExpanded ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </button>
              <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 max-w-full overflow-hidden transition-all duration-300 ${!recentlyViewedExpanded ? 'hidden md:grid' : ''}`}>
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
                          <FileIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium truncate">{file.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(viewedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
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

        <CameraCapture
          open={cameraDialogOpen}
          onOpenChange={setCameraDialogOpen}
          onCaptureComplete={() => {
            utils.files.list.invalidate();
          }}
        />

        {/* Floating Action Button for Mobile */}
        <FilesFAB
          onCameraClick={() => setCameraDialogOpen(true)}
          onUploadClick={() => setUploadDialogOpen(true)}
          onSearchClick={() => {
            // Scroll to search bar and focus
            const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
            if (searchInput) {
              searchInput.scrollIntoView({ behavior: 'smooth' });
              searchInput.focus();
            }
          }}
        />

        {/* Gesture Tutorial for First-Time Mobile Users */}
        <GestureTutorial onComplete={() => {}} />
      </div>
    </div>
  );
}
