import { useState, useRef } from "react";
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
  Folder,
  FolderPlus,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FileGridEnhancedProps {
  onFileClick?: (fileId: number) => void;
}

interface DeletedFile {
  id: number;
  title: string;
  filename: string;
  description: string;
  mimeType: string;
  fileSize: number;
  fileKey: string;
  url: string;
  enrichmentStatus: string;
  userId: number;
}

export function FileGridEnhanced({ onFileClick }: FileGridEnhancedProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [filterCollectionId, setFilterCollectionId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<string>("");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [draggedFileId, setDraggedFileId] = useState<number | null>(null);
  const [dragOverCollectionId, setDragOverCollectionId] = useState<number | null>(null);
  const deletedFilesRef = useRef<DeletedFile[]>([]);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: filesData, isLoading } = trpc.files.list.useQuery(
    filterCollectionId ? { collectionId: filterCollectionId } : undefined
  );
  const { data: tags = [] } = trpc.tags.list.useQuery();
  const { data: collections = [] } = trpc.collections.list.useQuery();
  const utils = trpc.useUtils();

  const createFileMutation = trpc.files.create.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
    },
  });

  const deleteMutation = trpc.files.delete.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
    },
  });

  const linkTagMutation = trpc.tags.linkToFile.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
      toast.success("Tag added to files");
      setSelectedFiles(new Set());
      setTagDialogOpen(false);
    },
  });

  const enrichMutation = trpc.files.enrich.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
      toast.success("Enrichment started");
      setSelectedFiles(new Set());
    },
  });

  const addToCollectionMutation = trpc.collections.addFile.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
      utils.collections.list.invalidate();
      toast.success("Added to collection");
    },
  });

  const bulkAddToCollectionMutation = trpc.collections.addFile.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
      utils.collections.list.invalidate();
    },
  });

  const files = filesData || [];

  const toggleFile = (fileId: number) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const toggleAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f: any) => f.id)));
    }
  };

  const handleUndo = async () => {
    if (deletedFilesRef.current.length === 0) return;

    // Clear the timeout
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    // Restore all deleted files
    const filesToRestore = [...deletedFilesRef.current];
    deletedFilesRef.current = [];

    try {
      for (const file of filesToRestore) {
        await createFileMutation.mutateAsync({
          title: file.title,
          filename: file.filename,
          description: file.description,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          fileKey: file.fileKey,
          url: file.url,
        });
      }
      toast.success(`Restored ${filesToRestore.length} file(s)`);
    } catch (error: any) {
      toast.error(`Failed to restore files: ${error.message}`);
    }
  };

  const handleBatchDelete = () => {
    // Store deleted files for undo
    const filesToDelete = files.filter((f: any) => selectedFiles.has(f.id));
    deletedFilesRef.current = filesToDelete.map((f: any) => ({
      id: f.id,
      title: f.title,
      filename: f.filename,
      description: f.description,
      mimeType: f.mimeType,
      fileSize: f.fileSize,
      fileKey: f.fileKey,
      url: f.url,
      enrichmentStatus: f.enrichmentStatus,
      userId: f.userId,
    }));

    // Delete files
    selectedFiles.forEach((fileId) => {
      deleteMutation.mutate({ id: fileId });
    });

    setDeleteDialogOpen(false);
    setSelectedFiles(new Set());

    // Show undo toast
    toast.success(`Deleted ${filesToDelete.length} file(s)`, {
      action: {
        label: "Undo",
        onClick: handleUndo,
      },
      duration: 10000, // 10 seconds to undo
    });

    // Set timeout to clear deleted files after 10 seconds
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }
    undoTimeoutRef.current = setTimeout(() => {
      deletedFilesRef.current = [];
      undoTimeoutRef.current = null;
    }, 10000);
  };

  const handleBatchTag = () => {
    if (!selectedTagId) {
      toast.error("Please select a tag");
      return;
    }

    selectedFiles.forEach((fileId) => {
      linkTagMutation.mutate({
        fileId,
        tagId: parseInt(selectedTagId),
      });
    });
  };

  const handleBatchEnrich = () => {
    selectedFiles.forEach((fileId) => {
      enrichMutation.mutate({ id: fileId });
    });
  };

  const handleBatchAddToCollection = () => {
    if (!selectedCollectionId) {
      toast.error("Please select a collection");
      return;
    }

    const collectionId = parseInt(selectedCollectionId);
    let completed = 0;
    const total = selectedFiles.size;

    selectedFiles.forEach((fileId) => {
      bulkAddToCollectionMutation.mutate(
        { collectionId, fileId },
        {
          onSettled: () => {
            completed++;
            if (completed === total) {
              toast.success(`Added ${total} files to collection`);
              setSelectedFiles(new Set());
              setCollectionDialogOpen(false);
            }
          },
        }
      );
    });
  };

  const handleDragStart = (e: React.DragEvent, fileId: number) => {
    setDraggedFileId(fileId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedFileId(null);
    setDragOverCollectionId(null);
  };

  const handleDragOver = (e: React.DragEvent, collectionId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCollectionId(collectionId);
  };

  const handleDragLeave = () => {
    setDragOverCollectionId(null);
  };

  const handleDrop = (e: React.DragEvent, collectionId: number) => {
    e.preventDefault();
    if (draggedFileId) {
      addToCollectionMutation.mutate({
        collectionId,
        fileId: draggedFileId,
      });
    }
    setDraggedFileId(null);
    setDragOverCollectionId(null);
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

  const getFileCollections = (fileId: number) => {
    return collections.filter((col: any) =>
      col.files?.some((f: any) => f.id === fileId)
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Main Content */}
      <div className="flex-1 space-y-4">
        {/* Collection Filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Filter by Collection:</label>
          <Select
            value={filterCollectionId?.toString() || "all"}
            onValueChange={(value) => {
              if (value === "all") setFilterCollectionId(null);
              else if (value === "none") setFilterCollectionId(-1);
              else setFilterCollectionId(parseInt(value));
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Collections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Collections</SelectItem>
              <SelectItem value="none">No Collection</SelectItem>
              {collections?.map((collection: any) => (
                <SelectItem key={collection.id} value={collection.id.toString()}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: collection.color || "#6366f1" }}
                    />
                    {collection.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filterCollectionId !== null && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterCollectionId(null)}
            >
              Clear Filter
            </Button>
          )}
        </div>

        {/* Batch Actions Toolbar */}
        {selectedFiles.size > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {selectedFiles.size} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTagDialogOpen(true)}
                  disabled={linkTagMutation.isPending}
                >
                  {linkTagMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Tag className="h-4 w-4 mr-2" />
                  )}
                  Add Tag
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCollectionDialogOpen(true)}
                  disabled={bulkAddToCollectionMutation.isPending}
                >
                  {bulkAddToCollectionMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FolderPlus className="h-4 w-4 mr-2" />
                  )}
                  Add to Collection
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleBatchEnrich}
                  disabled={enrichMutation.isPending}
                >
                  {enrichMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Enrich
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedFiles(new Set())}>
                Clear Selection
              </Button>
            </div>
          </Card>
        )}

        {/* Select All */}
        {files.length > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedFiles.size === files.length && files.length > 0}
              onCheckedChange={toggleAll}
            />
            <span className="text-sm text-muted-foreground">Select All</span>
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
            {files.map((file: any) => {
              const fileCollections = getFileCollections(file.id);
              return (
                <Card
                  key={file.id}
                  className={`p-4 hover:border-primary/50 transition-colors cursor-pointer ${
                    draggedFileId === file.id ? "opacity-50" : ""
                  }`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, file.id)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedFiles.has(file.id)}
                      onCheckedChange={() => toggleFile(file.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div
                      className="flex-1 min-w-0"
                      onClick={() => onFileClick?.(file.id)}
                    >
                      <div className="flex items-start gap-2">
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
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(file.fileSize)}</span>
                        <span>•</span>
                        <span
                          className={
                            file.enrichmentStatus === "enriched"
                              ? "text-green-500"
                              : "text-yellow-500"
                          }
                        >
                          {file.enrichmentStatus === "enriched"
                            ? "Enriched"
                            : "Not Enriched"}
                        </span>
                      </div>

                      {fileCollections.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {fileCollections.map((collection: any) => (
                            <div
                              key={collection.id}
                              className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs"
                            >
                              <Folder
                                className="h-3 w-3"
                                style={{ color: collection.color || "#6366f1" }}
                              />
                              <span>{collection.name}</span>
                            </div>
                          ))}
                        </div>
                      )}

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
              );
            })}
          </div>
        )}
      </div>

      {/* Collections Sidebar (visible during drag) */}
      {draggedFileId && (
        <div className="w-64 space-y-2">
          <h3 className="font-semibold text-sm text-muted-foreground">
            Drop into collection
          </h3>
          {collections.map((collection: any) => (
            <div
              key={collection.id}
              className={`p-3 border-2 border-dashed rounded transition-colors ${
                dragOverCollectionId === collection.id
                  ? "border-primary bg-primary/10"
                  : "border-border"
              }`}
              onDragOver={(e) => handleDragOver(e, collection.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, collection.id)}
            >
              <div className="flex items-center gap-2">
                <Folder
                  className="h-4 w-4"
                  style={{ color: collection.color || "#10b981" }}
                />
                <span className="text-sm font-medium truncate">{collection.name}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedFiles.size} files?</AlertDialogTitle>
            <AlertDialogDescription>
              You can undo this action within 10 seconds after deletion.
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
            <DialogTitle>Add Tag to {selectedFiles.size} Files</DialogTitle>
            <DialogDescription>
              Select a tag to add to all selected files
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedTagId} onValueChange={setSelectedTagId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a tag" />
              </SelectTrigger>
              <SelectContent>
                {tags.map((tag: any) => (
                  <SelectItem key={tag.id} value={tag.id.toString()}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBatchTag}>Add Tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Collection Dialog */}
      <Dialog open={collectionDialogOpen} onOpenChange={setCollectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {selectedFiles.size} Files to Collection</DialogTitle>
            <DialogDescription>
              Select a collection to add all selected files
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
                {collections.map((collection: any) => (
                  <SelectItem key={collection.id} value={collection.id.toString()}>
                    <div className="flex items-center gap-2">
                      <Folder
                        className="h-4 w-4"
                        style={{ color: collection.color || "#10b981" }}
                      />
                      {collection.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCollectionDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleBatchAddToCollection}>Add to Collection</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
