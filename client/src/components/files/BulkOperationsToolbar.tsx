import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  Tag,
  FolderPlus,
  X,
  Download,
  Loader2,
  Archive,
} from "lucide-react";
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
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface BulkOperationsToolbarProps {
  selectedFileIds: number[];
  onClearSelection: () => void;
  onOperationComplete: () => void;
}

export function BulkOperationsToolbar({
  selectedFileIds,
  onClearSelection,
  onOperationComplete,
}: BulkOperationsToolbarProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [showCollectionDialog, setShowCollectionDialog] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const utils = trpc.useUtils();
  const deleteFilesMutation = trpc.bulkOperations.deleteFiles.useMutation();
  const addTagsMutation = trpc.bulkOperations.addTags.useMutation();
  const addToCollectionMutation = trpc.bulkOperations.addToCollection.useMutation();
  const { data: allFiles } = trpc.files.list.useQuery();

  const { data: tags } = trpc.tags.list.useQuery();
  const { data: collections } = trpc.collections.list.useQuery();

  const handleBulkDelete = async () => {
    setIsProcessing(true);
    setProgress(0);

    try {
      // Simulate progress for better UX
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

      // Download and add files to ZIP
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        try {
          const response = await fetch(file.url);
          const blob = await response.blob();
          zip.file(file.filename, blob);

          // Update progress
          const progressPercent = Math.round(((i + 1) / selectedFiles.length) * 90);
          setProgress(progressPercent);
        } catch (error) {
          console.error(`Failed to download ${file.filename}:`, error);
          toast.error(`Failed to download ${file.filename}`);
        }
      }

      setProgress(95);
      toast.info("Creating ZIP file...");

      // Generate ZIP
      const zipBlob = await zip.generateAsync({ type: "blob" });
      setProgress(100);

      // Download ZIP
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

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-card border border-border rounded-lg shadow-lg p-4 flex items-center gap-4">
          <div className="text-sm font-medium">
            {selectedFileIds.length} file(s) selected
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
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isProcessing}
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
            <DialogTitle>Add Tags to Files</DialogTitle>
            <DialogDescription>
              Select tags to add to {selectedFileIds.length} file(s)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Tags</label>
              <div className="flex flex-wrap gap-2">
                {tags?.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => {
                      setSelectedTagIds((prev) =>
                        prev.includes(tag.id)
                          ? prev.filter((id) => id !== tag.id)
                          : [...prev, tag.id]
                      );
                    }}
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      selectedTagIds.includes(tag.id)
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
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
                "Add Tags"
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
              Select a collection to add {selectedFileIds.length} file(s)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Collection</label>
              <Select
                value={selectedCollectionId}
                onValueChange={setSelectedCollectionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a collection" />
                </SelectTrigger>
                <SelectContent>
                  {collections?.map((collection) => (
                    <SelectItem key={collection.id} value={collection.id.toString()}>
                      {collection.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
    </>
  );
}
