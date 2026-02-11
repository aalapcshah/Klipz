import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Folder,
  Plus,
  Loader2,
  Trash2,
  Edit,
  FileImage,
  FileText,
  Video,
  File as FileIcon,
  Share2,
  GripVertical,
} from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShareDialog } from "@/components/ShareDialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const COLORS = [
  "#10b981", // green
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#ec4899", // pink
];

function SortableFileCard({
  file,
  onRemove,
  getFileIcon,
}: {
  file: any;
  onRemove: () => void;
  getFileIcon: (mimeType: string) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <Card
      ref={setNodeRef}
      style={style as any}
      className={`p-3 ${isDragging ? "shadow-lg ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="text-primary mt-0.5">
            {getFileIcon(file.mimeType)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">
              {file.title || file.filename}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(file.addedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </Card>
  );
}

export function CollectionsManager() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<any>(null);
  const [viewingCollection, setViewingCollection] = useState<number | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [sharingCollection, setSharingCollection] = useState<any>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const { data: collections = [], isLoading } = trpc.collections.list.useQuery();
  const { data: collectionDetail } = trpc.collections.get.useQuery(
    { id: viewingCollection! },
    { enabled: viewingCollection !== null }
  );
  const utils = trpc.useUtils();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const createMutation = trpc.collections.create.useMutation({
    onSuccess: () => {
      utils.collections.list.invalidate();
      toast.success("Collection created");
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Failed to create collection: ${error.message}`);
    },
  });

  const updateMutation = trpc.collections.update.useMutation({
    onSuccess: () => {
      utils.collections.list.invalidate();
      toast.success("Collection updated");
      setEditDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = trpc.collections.delete.useMutation({
    onSuccess: () => {
      utils.collections.list.invalidate();
      toast.success("Collection deleted");
      setDeleteDialogOpen(false);
      setSelectedCollection(null);
      if (viewingCollection === selectedCollection?.id) {
        setViewingCollection(null);
      }
    },
  });

  const removeFileMutation = trpc.collections.removeFile.useMutation({
    onSuccess: () => {
      utils.collections.get.invalidate();
      toast.success("File removed from collection");
    },
  });

  const reorderMutation = trpc.collections.reorderFiles.useMutation({
    onSuccess: () => {
      utils.collections.get.invalidate();
    },
    onError: () => {
      toast.error("Failed to save file order");
      utils.collections.get.invalidate();
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setColor(COLORS[0]);
    setSelectedCollection(null);
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Please enter a collection name");
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      color,
    });
  };

  const handleEdit = () => {
    if (!name.trim()) {
      toast.error("Please enter a collection name");
      return;
    }

    updateMutation.mutate({
      id: selectedCollection.id,
      name: name.trim(),
      description: description.trim() || undefined,
      color,
    });
  };

  const openEditDialog = (collection: any) => {
    setSelectedCollection(collection);
    setName(collection.name);
    setDescription(collection.description || "");
    setColor(collection.color || COLORS[0]);
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (collection: any) => {
    setSelectedCollection(collection);
    setDeleteDialogOpen(true);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <FileImage className="h-4 w-4" />;
    if (mimeType.startsWith("video/")) return <Video className="h-4 w-4" />;
    if (mimeType.includes("pdf") || mimeType.includes("document"))
      return <FileText className="h-4 w-4" />;
    return <FileIcon className="h-4 w-4" />;
  };

  const fileIds = useMemo(
    () => collectionDetail?.files?.map((f: any) => f.id) || [],
    [collectionDetail?.files]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !collectionDetail?.files || !viewingCollection) return;

    const oldIndex = collectionDetail.files.findIndex((f: any) => f.id === active.id);
    const newIndex = collectionDetail.files.findIndex((f: any) => f.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedFiles = arrayMove(collectionDetail.files, oldIndex, newIndex);
    const newFileIds = reorderedFiles.map((f: any) => f.id);

    // Optimistic update
    utils.collections.get.setData({ id: viewingCollection }, (old: any) => {
      if (!old) return old;
      return { ...old, files: reorderedFiles };
    });

    // Persist to server
    reorderMutation.mutate({
      collectionId: viewingCollection,
      fileIds: newFileIds,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Collections</h2>
          <p className="text-muted-foreground mt-1">
            Organize your files into collections
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Collection
        </Button>
      </div>

      {collections.length === 0 ? (
        <Card className="p-12 text-center">
          <Folder className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No collections yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first collection to organize files
          </p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Collection
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((collection: any) => (
            <Card
              key={collection.id}
              className="p-4 hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => setViewingCollection(collection.id)}
            >
              <div className="flex items-start gap-3">
                <div
                  className="p-2 rounded"
                  style={{ backgroundColor: `${collection.color}20` }}
                >
                  <Folder
                    className="h-5 w-5"
                    style={{ color: collection.color || COLORS[0] }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{collection.name}</h3>
                  {collection.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {collection.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span>{collection.fileCount || 0} files</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSharingCollection(collection);
                    setShareDialogOpen(true);
                  }}
                >
                  <Share2 className="h-3 w-3 mr-1" />
                  Share
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditDialog(collection);
                  }}
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteDialog(collection);
                  }}
                  className="text-red-500 border-red-500/50 hover:bg-red-500/10 hover:text-red-500"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Collection Detail View with Drag-to-Reorder */}
      {viewingCollection && collectionDetail && (
        <Dialog open={true} onOpenChange={() => setViewingCollection(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Folder
                  className="h-5 w-5"
                  style={{ color: collectionDetail.color || COLORS[0] }}
                />
                {collectionDetail.name}
              </DialogTitle>
              {collectionDetail.description && (
                <DialogDescription>{collectionDetail.description}</DialogDescription>
              )}
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  {collectionDetail.files?.length || 0} files
                </h3>
                {collectionDetail.files && collectionDetail.files.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Drag to reorder
                  </p>
                )}
              </div>

              {!collectionDetail.files || collectionDetail.files.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No files in this collection yet
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={fileIds} strategy={verticalListSortingStrategy}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {collectionDetail.files.map((file: any) => (
                        <SortableFileCard
                          key={file.id}
                          file={file}
                          getFileIcon={getFileIcon}
                          onRemove={() =>
                            removeFileMutation.mutate({
                              collectionId: viewingCollection,
                              fileId: file.id,
                            })
                          }
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Collection Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Collection</DialogTitle>
            <DialogDescription>
              Create a new collection to organize your files
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Marketing Campaign 2024"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this collection..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-8 h-8 rounded border-2 ${
                      color === c ? "border-foreground" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Collection Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Collection</DialogTitle>
            <DialogDescription>Update collection details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description (optional)</Label>
              <Textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-8 h-8 rounded border-2 ${
                      color === c ? "border-foreground" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete collection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the collection but won't delete the files themselves.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate({ id: selectedCollection.id })}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share Dialog */}
      {sharingCollection && (
        <ShareDialog
          open={shareDialogOpen}
          onOpenChange={(open) => {
            setShareDialogOpen(open);
            if (!open) setSharingCollection(null);
          }}
          itemType="collection"
          itemId={sharingCollection.id}
          itemName={sharingCollection.name}
        />
      )}
    </div>
  );
}
