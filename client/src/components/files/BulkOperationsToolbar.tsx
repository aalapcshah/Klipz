import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  Tag,
  FolderPlus,
  X,
  Download,
  Loader2,
  Archive,
  Sparkles,
  Video,
  MoreHorizontal,
} from "lucide-react";
import { BatchCompressionDialog } from "@/components/BatchCompressionDialog";
import { BatchEnrichmentProgressDialog } from "@/components/files/BatchEnrichmentProgressDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface BulkOperationsToolbarProps {
  selectedFileIds: number[];
  onClearSelection: () => void;
  onOperationComplete: () => void;
  onSelectAll?: (ids: number[]) => void;
  totalCount?: number;
}

export function BulkOperationsToolbar({
  selectedFileIds,
  onClearSelection,
  onOperationComplete,
  onSelectAll,
  totalCount,
}: BulkOperationsToolbarProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [showRemoveTagDialog, setShowRemoveTagDialog] = useState(false);
  const [showCollectionDialog, setShowCollectionDialog] = useState(false);
  const [showCompressionDialog, setShowCompressionDialog] = useState(false);
  const [showEnrichmentDialog, setShowEnrichmentDialog] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [removeTagIds, setRemoveTagIds] = useState<number[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const utils = trpc.useUtils();
  const deleteFilesMutation = trpc.bulkOperations.deleteFiles.useMutation();
  const addTagsMutation = trpc.bulkOperations.addTags.useMutation();
  const removeTagsMutation = trpc.bulkOperations.removeTags.useMutation();
  const addToCollectionMutation = trpc.bulkOperations.addToCollection.useMutation();
  const reEnrichMutation = trpc.bulkOperations.reEnrichFiles.useMutation();
  const { data: allFilesData } = trpc.files.list.useQuery({ page: 1, pageSize: 1000 });
  const allFiles = allFilesData?.files || [];
  const { data: allFileIds } = trpc.files.getAllIds.useQuery();

  const { data: tags } = trpc.tags.list.useQuery();
  const { data: collections } = trpc.collections.list.useQuery();

  const handleBulkDelete = async () => {
    setIsProcessing(true);
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 100);

      await deleteFilesMutation.mutateAsync({
        fileIds: selectedFileIds,
      });

      clearInterval(progressInterval);
      setProgress(100);

      toast.success(`Successfully deleted ${selectedFileIds.length} file(s)`);
      await utils.files.list.invalidate();
      onOperationComplete();
      onClearSelection();
      setShowDeleteDialog(false);
    } catch (error) {
      toast.error("Failed to delete files");
      console.error(error);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleBulkAddTags = async () => {
    if (selectedTagIds.length === 0) {
      toast.error("Please select at least one tag");
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 100);

      const result = await addTagsMutation.mutateAsync({
        fileIds: selectedFileIds,
        tagIds: selectedTagIds,
      });

      clearInterval(progressInterval);
      setProgress(100);

      toast.success(
        `Added ${result.tagsApplied} tag(s) to ${result.filesTagged} file(s)`
      );
      await utils.files.list.invalidate();
      onOperationComplete();
      setShowTagDialog(false);
      setSelectedTagIds([]);
    } catch (error) {
      toast.error("Failed to add tags");
      console.error(error);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleBulkRemoveTags = async () => {
    if (removeTagIds.length === 0) {
      toast.error("Please select at least one tag to remove");
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 100);

      const result = await removeTagsMutation.mutateAsync({
        fileIds: selectedFileIds,
        tagIds: removeTagIds,
      });

      clearInterval(progressInterval);
      setProgress(100);

      toast.success(
        `Removed ${result.tagsRemoved} tag(s) from ${result.filesUntagged} file(s)`
      );
      await utils.files.list.invalidate();
      onOperationComplete();
      setShowRemoveTagDialog(false);
      setRemoveTagIds([]);
    } catch (error) {
      toast.error("Failed to remove tags");
      console.error(error);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleBulkExportZip = async () => {
    if (!allFiles) {
      toast.error("File list not loaded");
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      const selectedFiles = allFiles.filter((f: any) =>
        selectedFileIds.includes(f.id)
      );

      toast.info(`Preparing ${selectedFiles.length} file(s) for export...`);

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        try {
          const response = await fetch(file.url);
          const blob = await response.blob();
          zip.file(file.filename, blob);

          const progressPercent = Math.round(((i + 1) / selectedFiles.length) * 90);
          setProgress(progressPercent);
        } catch (error) {
          console.error(`Failed to download ${file.filename}:`, error);
          toast.error(`Failed to download ${file.filename}`);
        }
      }

      setProgress(95);
      toast.info("Creating ZIP file...");

      const zipBlob = await zip.generateAsync({ type: "blob" });
      setProgress(100);

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `metaclips-export-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Successfully exported ${selectedFiles.length} file(s) as ZIP`);
      onClearSelection();
    } catch (error) {
      toast.error("Failed to create ZIP export");
      console.error(error);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleBulkReEnrich = () => {
    // Open the progress dialog which handles the enrichment
    setShowEnrichmentDialog(true);
  };

  const handleEnrichmentComplete = () => {
    onOperationComplete();
    onClearSelection();
  };

  const handleBulkAddToCollection = async () => {
    if (!selectedCollectionId) {
      toast.error("Please select a collection");
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 100);

      const result = await addToCollectionMutation.mutateAsync({
        fileIds: selectedFileIds,
        collectionId: parseInt(selectedCollectionId),
      });

      clearInterval(progressInterval);
      setProgress(100);

      toast.success(`Added ${result.filesAdded} file(s) to collection`);
      await utils.files.list.invalidate();
      await utils.collections.list.invalidate();
      onOperationComplete();
      setShowCollectionDialog(false);
      setSelectedCollectionId("");
    } catch (error) {
      toast.error("Failed to add files to collection");
      console.error(error);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  if (selectedFileIds.length === 0) return null;

  // Mobile: Compact bottom bar with dropdown menu
  if (isMobile) {
    return (
      <>
        <div className="fixed bottom-4 left-2 right-2 z-50">
          <div className="bg-card border border-border rounded-lg shadow-lg p-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{selectedFileIds.length} selected</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                className="h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>

            <div className="flex items-center gap-1">
              {/* Primary action: Enrich with AI */}
              <Button
                variant="default"
                size="sm"
                onClick={handleBulkReEnrich}
                disabled={isProcessing}
                className="h-7 px-2 text-xs"
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Enrich
              </Button>

              {/* Delete button - always visible next to Enrich */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                disabled={isProcessing}
                className="h-7 px-2 text-xs text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete
              </Button>

              {/* Secondary actions in dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 w-7 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => setShowTagDialog(true)}>
                    <Tag className="h-3 w-3 mr-2" />
                    Add Tags
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowRemoveTagDialog(true)}>
                    <X className="h-3 w-3 mr-2" />
                    Remove Tags
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowCollectionDialog(true)}>
                    <FolderPlus className="h-3 w-3 mr-2" />
                    Add to Collection
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleBulkExportZip}>
                    <Archive className="h-3 w-3 mr-2" />
                    Export ZIP
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowCompressionDialog(true)}>
                    <Video className="h-3 w-3 mr-2" />
                    Compress
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Dialogs */}
        {renderDialogs()}
      </>
    );
  }

  // Desktop: Full toolbar
  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-card border border-border rounded-lg shadow-lg p-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">
              {selectedFileIds.length} file(s) selected
            </div>
            {onSelectAll && allFileIds && totalCount && selectedFileIds.length < totalCount && (
              <Button
                variant="link"
                size="sm"
                onClick={() => onSelectAll(allFileIds)}
                className="h-auto p-0 text-xs text-primary hover:underline"
              >
                Select all {totalCount} files across all pages
              </Button>
            )}
          </div>

          <div className="h-6 w-px bg-border" />

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTagDialog(true)}
              disabled={isProcessing}
            >
              <Tag className="w-4 h-4 mr-2" />
              Add Tags
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRemoveTagDialog(true)}
              disabled={isProcessing}
            >
              <X className="w-4 h-4 mr-2" />
              Remove Tags
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCollectionDialog(true)}
              disabled={isProcessing}
            >
              <FolderPlus className="w-4 h-4 mr-2" />
              Add to Collection
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkExportZip}
              disabled={isProcessing}
            >
              <Archive className="w-4 h-4 mr-2" />
              Export ZIP
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handleBulkReEnrich}
              disabled={isProcessing}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Enrich with AI
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCompressionDialog(true)}
              disabled={isProcessing}
            >
              <Video className="w-4 h-4 mr-2" />
              Compress
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isProcessing}
              className="text-red-500 border-red-500/50 hover:bg-red-500/10 hover:text-red-500"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>

            <div className="h-6 w-px bg-border" />

            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              disabled={isProcessing}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {renderDialogs()}
    </>
  );

  function renderDialogs() {
    return (
      <>
        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Files</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {selectedFileIds.length} file(s)?
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>

            {isProcessing && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-sm text-muted-foreground text-center">
                  Deleting files... {progress}%
                </p>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Tags Dialog */}
        <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Tags</DialogTitle>
              <DialogDescription>
                Select tags to add to {selectedFileIds.length} file(s)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto">
                {tags?.map((tag: any) => (
                  <Button
                    key={tag.id}
                    variant={selectedTagIds.includes(tag.id) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (selectedTagIds.includes(tag.id)) {
                        setSelectedTagIds(selectedTagIds.filter((id) => id !== tag.id));
                      } else {
                        setSelectedTagIds([...selectedTagIds, tag.id]);
                      }
                    }}
                  >
                    {tag.name}
                  </Button>
                ))}
              </div>

              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-muted-foreground text-center">
                    Adding tags... {progress}%
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowTagDialog(false);
                  setSelectedTagIds([]);
                }}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button onClick={handleBulkAddTags} disabled={isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  `Add ${selectedTagIds.length} Tag(s)`
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove Tags Dialog */}
        <Dialog open={showRemoveTagDialog} onOpenChange={setShowRemoveTagDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Tags</DialogTitle>
              <DialogDescription>
                Select tags to remove from {selectedFileIds.length} file(s)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto">
                {tags?.map((tag: any) => (
                  <Button
                    key={tag.id}
                    variant={removeTagIds.includes(tag.id) ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (removeTagIds.includes(tag.id)) {
                        setRemoveTagIds(removeTagIds.filter((id) => id !== tag.id));
                      } else {
                        setRemoveTagIds([...removeTagIds, tag.id]);
                      }
                    }}
                  >
                    {tag.name}
                  </Button>
                ))}
              </div>

              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-muted-foreground text-center">
                    Removing tags... {progress}%
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowRemoveTagDialog(false);
                  setRemoveTagIds([]);
                }}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkRemoveTags}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Removing...
                  </>
                ) : (
                  `Remove ${removeTagIds.length} Tag(s)`
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add to Collection Dialog */}
        <Dialog open={showCollectionDialog} onOpenChange={setShowCollectionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to Collection</DialogTitle>
              <DialogDescription>
                Select a collection to add {selectedFileIds.length} file(s) to
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Select
                value={selectedCollectionId}
                onValueChange={setSelectedCollectionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a collection" />
                </SelectTrigger>
                <SelectContent>
                  {collections?.map((collection: any) => (
                    <SelectItem key={collection.id} value={collection.id.toString()}>
                      {collection.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-muted-foreground text-center">
                    Adding to collection... {progress}%
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCollectionDialog(false);
                  setSelectedCollectionId("");
                }}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button onClick={handleBulkAddToCollection} disabled={isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add to Collection"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Batch Compression Dialog */}
        <BatchCompressionDialog
          open={showCompressionDialog}
          onOpenChange={setShowCompressionDialog}
          selectedFiles={allFiles.filter((f: any) => selectedFileIds.includes(f.id)).map((f: any) => ({
            id: f.id,
            filename: f.filename,
            url: f.url,
            fileSize: f.fileSize,
            mimeType: f.mimeType,
          }))}
          onComplete={() => {
            onOperationComplete();
            onClearSelection();
          }}
        />

        {/* Batch Enrichment Progress Dialog */}
        <BatchEnrichmentProgressDialog
          open={showEnrichmentDialog}
          onOpenChange={setShowEnrichmentDialog}
          fileIds={selectedFileIds}
          onComplete={handleEnrichmentComplete}
        />
      </>
    );
  }
}
