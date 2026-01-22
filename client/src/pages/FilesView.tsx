import { useState, useEffect } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUploadDialog } from "@/components/files/FileUploadDialog";
import FileGridEnhanced from "@/components/files/FileGridEnhanced";
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
    return saved ? JSON.parse(saved) : false;
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
  const utils = trpc.useUtils();

  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem('advancedFilters', JSON.stringify(advancedFilters));
  }, [advancedFilters]);

  useEffect(() => {
    localStorage.setItem('advancedFiltersOpen', JSON.stringify(filtersOpen));
  }, [filtersOpen]);

  const handleFileClick = (fileId: number) => {
    setSelectedFileId(fileId);
  };

  return (
    <div className="flex h-full">
      {/* Advanced Filters Sidebar */}
      <div className="flex-shrink-0">
        <AdvancedFiltersPanel
          filters={advancedFilters}
          onFiltersChange={setAdvancedFilters}
          isOpen={filtersOpen}
          onToggle={() => setFiltersOpen(!filtersOpen)}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 space-y-6 overflow-y-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Files</h1>
              <p className="text-muted-foreground">
                Manage and enrich your media files with AI
              </p>
            </div>
            <div className="flex gap-2">
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

          <FileGridEnhanced 
            onFileClick={handleFileClick}
            selectedFileIds={selectedFileIds}
            onSelectionChange={setSelectedFileIds}
            advancedFilters={advancedFilters}
          />
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
