import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileImage,
  FileText,
  Video,
  File as FileIcon,
  Loader2,
  Trash2,
  Tag,
  Sparkles,
  CheckSquare,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FileGridWithBatchProps {
  onFileClick?: (fileId: number) => void;
}

export function FileGridWithBatch({ onFileClick }: FileGridWithBatchProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const { data: filesData, isLoading, refetch } = trpc.files.list.useQuery({ page: 1, pageSize: 100 });
  const files = filesData?.files || [];
  const { data: tags = [] } = trpc.tags.list.useQuery();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.files.delete.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
      toast.success("Files deleted successfully");
      setSelectedFiles(new Set());
    },
    onError: (error) => {
      toast.error(`Failed to delete files: ${error.message}`);
    },
  });

  const createTagMutation = trpc.tags.create.useMutation();
  const linkTagMutation = trpc.tags.linkToFile.useMutation();
  const enrichMutation = trpc.files.enrich.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
      toast.success("Files queued for enrichment");
    },
  });

  const toggleFileSelection = (fileId: number) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId);
    } else {
      newSelection.add(fileId);
    }
    setSelectedFiles(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f: any) => f.id)));
    }
  };

  const handleBatchDelete = async () => {
    for (const fileId of Array.from(selectedFiles)) {
      await deleteMutation.mutateAsync({ id: fileId });
    }
    setDeleteDialogOpen(false);
  };

  const handleBatchTag = async () => {
    if (!newTagName.trim()) {
      toast.error("Please enter a tag name");
      return;
    }

    try {
      // Create or get tag
      const tag = await createTagMutation.mutateAsync({ name: newTagName.trim(), source: "manual" });

      // Link to all selected files
      for (const fileId of Array.from(selectedFiles)) {
        await linkTagMutation.mutateAsync({ tagId: tag.id, fileId });
      }

      toast.success(`Tagged ${selectedFiles.size} files`);
      setTagDialogOpen(false);
      setNewTagName("");
      setSelectedFiles(new Set());
      utils.files.list.invalidate();
    } catch (error: any) {
      toast.error(`Failed to tag files: ${error.message}`);
    }
  };

  const handleBatchEnrich = async () => {
    for (const fileId of Array.from(selectedFiles)) {
      enrichMutation.mutate({ id: fileId });
    }
    setSelectedFiles(new Set());
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Batch Actions Toolbar */}
      {selectedFiles.size > 0 && (
        <Card className="p-4 bg-primary/10 border-primary">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="font-semibold">
                {selectedFiles.size} file{selectedFiles.size !== 1 ? "s" : ""} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedFiles(new Set())}
              >
                Clear selection
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchEnrich}
                disabled={enrichMutation.isPending}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Enrich All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTagDialogOpen(true)}
              >
                <Tag className="h-4 w-4 mr-2" />
                Tag All
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete All
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Select All Button */}
      {files.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSelectAll}
          >
            {selectedFiles.size === files.length ? (
              <>
                <CheckSquare className="h-4 w-4 mr-2" />
                Deselect All
              </>
            ) : (
              <>
                <Square className="h-4 w-4 mr-2" />
                Select All
              </>
            )}
          </Button>
        </div>
      )}

      {/* File Grid */}
      {files.length === 0 ? (
        <Card className="p-12 text-center">
          <FileIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No files yet</h3>
          <p className="text-muted-foreground">Upload your first file to get started</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map((file: any) => (
            <Card
              key={file.id}
              className={`p-4 transition-all ${
                selectedFiles.has(file.id)
                  ? "border-primary bg-primary/5"
                  : "hover:border-primary/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selectedFiles.has(file.id)}
                  onCheckedChange={() => toggleFileSelection(file.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => onFileClick?.(file.id)}
                >
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
                          {file.enrichmentStatus === "pending"
                            ? "Not Enriched"
                            : file.enrichmentStatus}
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
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedFiles.size} files?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected files
              and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tag Dialog */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tag {selectedFiles.size} files</DialogTitle>
            <DialogDescription>
              Add a tag to all selected files
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tag-name">Tag Name</Label>
              <Input
                id="tag-name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Enter tag name"
              />
            </div>
            {tags.length > 0 && (
              <div className="space-y-2">
                <Label>Or select existing tag:</Label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag: any) => (
                    <Button
                      key={tag.id}
                      variant="outline"
                      size="sm"
                      onClick={() => setNewTagName(tag.name)}
                    >
                      {tag.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBatchTag}>Add Tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
