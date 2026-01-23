import { useState, useEffect } from "react";
import { Upload, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUploadDialog } from "@/components/files/FileUploadDialog";
import FileGridEnhanced from "@/components/files/FileGridEnhanced";
import { FileListView } from "@/components/files/FileListView";
import { VoiceSearchBar } from "@/components/VoiceSearchBar";
import { FileDetailDialog } from "@/components/files/FileDetailDialog";
import { BulkOperationsToolbar } from "@/components/files/BulkOperationsToolbar";
import { AdvancedFiltersPanel, type AdvancedFilters } from "@/components/files/AdvancedFiltersPanel";
import { trpc } from "@/lib/trpc";
import { StorageCleanupWizard } from "@/components/StorageCleanupWizard";
import { Trash2 } from "lucide-react";

export default function FilesView() {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [showCleanupWizard, setShowCleanupWizard] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);
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
  const utils = trpc.useUtils();
  const { data: filesData } = trpc.files.list.useQuery();
  const [searchResults, setSearchResults] = useState<any[] | null>(null);

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

  const handleFileClick = (fileId: number) => {
    setSelectedFileId(fileId);
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
        <div className="p-6 space-y-6 overflow-y-auto">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Files</h1>
                <p className="text-muted-foreground">
                  Manage and enrich your media files with AI
                </p>
              </div>
              <div className="flex gap-2">
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
                <Button variant="outline" onClick={() => setShowCleanupWizard(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clean Up Storage
                </Button>
                <Button onClick={() => setUploadDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Files
                </Button>
              </div>
            </div>
            
            {/* Voice Search Bar */}
            <VoiceSearchBar
              onSearch={(results) => setSearchResults(results)}
              placeholder="Search files with voice or text..."
            />
            
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

          {viewMode === 'grid' ? (
            <FileGridEnhanced 
              onFileClick={handleFileClick}
              selectedFileIds={selectedFileIds}
              onSelectionChange={setSelectedFileIds}
              advancedFilters={advancedFilters}
            />
          ) : (
            <FileListView
              files={searchResults || filesData || []}
              onFileClick={handleFileClick}
              selectedFileIds={selectedFileIds}
              onSelectionChange={setSelectedFileIds}
            />
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
