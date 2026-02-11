import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Tag, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface BatchMetadataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFileIds: number[];
  onComplete: () => void;
}

export function BatchMetadataDialog({
  open,
  onOpenChange,
  selectedFileIds,
  onComplete,
}: BatchMetadataDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [updateTitle, setUpdateTitle] = useState(false);
  const [updateDescription, setUpdateDescription] = useState(false);
  const [addTagIds, setAddTagIds] = useState<number[]>([]);
  const [removeTagIds, setRemoveTagIds] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<"metadata" | "tags">("metadata");

  const utils = trpc.useUtils();
  const batchUpdateMutation = trpc.files.batchUpdate.useMutation();
  const addTagsMutation = trpc.bulkOperations.addTags.useMutation();
  const removeTagsMutation = trpc.bulkOperations.removeTags.useMutation();
  const { data: tags } = trpc.tags.list.useQuery();

  const hasChanges =
    (updateTitle && title.trim() !== "") ||
    (updateDescription && description.trim() !== "") ||
    addTagIds.length > 0 ||
    removeTagIds.length > 0;

  const handleApply = async () => {
    if (!hasChanges) {
      toast.error("No changes to apply");
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      let step = 0;
      const totalSteps =
        (updateTitle || updateDescription ? 1 : 0) +
        (addTagIds.length > 0 ? 1 : 0) +
        (removeTagIds.length > 0 ? 1 : 0);

      // Step 1: Update title/description
      if (updateTitle || updateDescription) {
        const updates: { fileIds: number[]; title?: string; description?: string } = {
          fileIds: selectedFileIds,
        };
        if (updateTitle && title.trim()) updates.title = title.trim();
        if (updateDescription && description.trim()) updates.description = description.trim();

        await batchUpdateMutation.mutateAsync(updates);
        step++;
        setProgress(Math.round((step / totalSteps) * 100));
      }

      // Step 2: Add tags
      if (addTagIds.length > 0) {
        await addTagsMutation.mutateAsync({
          fileIds: selectedFileIds,
          tagIds: addTagIds,
        });
        step++;
        setProgress(Math.round((step / totalSteps) * 100));
      }

      // Step 3: Remove tags
      if (removeTagIds.length > 0) {
        await removeTagsMutation.mutateAsync({
          fileIds: selectedFileIds,
          tagIds: removeTagIds,
        });
        step++;
        setProgress(Math.round((step / totalSteps) * 100));
      }

      setProgress(100);

      const changesSummary: string[] = [];
      if (updateTitle) changesSummary.push("title");
      if (updateDescription) changesSummary.push("description");
      if (addTagIds.length > 0) changesSummary.push(`${addTagIds.length} tag(s) added`);
      if (removeTagIds.length > 0) changesSummary.push(`${removeTagIds.length} tag(s) removed`);

      toast.success(
        `Updated ${selectedFileIds.length} file(s): ${changesSummary.join(", ")}`
      );

      await utils.files.list.invalidate();
      onComplete();
      handleClose();
    } catch (error) {
      toast.error("Failed to update metadata");
      console.error(error);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleClose = () => {
    setTitle("");
    setDescription("");
    setUpdateTitle(false);
    setUpdateDescription(false);
    setAddTagIds([]);
    setRemoveTagIds([]);
    setActiveTab("metadata");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Batch Edit Metadata
          </DialogTitle>
          <DialogDescription>
            Edit metadata for {selectedFileIds.length} selected file(s). Only checked
            fields will be updated.
          </DialogDescription>
        </DialogHeader>

        {/* Tab Switcher */}
        <div className="flex gap-1 border-b border-border pb-0">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "metadata"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("metadata")}
          >
            <Pencil className="h-3.5 w-3.5 inline mr-1.5" />
            Title & Description
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "tags"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("tags")}
          >
            <Tag className="h-3.5 w-3.5 inline mr-1.5" />
            Tags
          </button>
        </div>

        <div className="space-y-4 min-h-[200px]">
          {activeTab === "metadata" && (
            <>
              {/* Title Field */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="update-title"
                    checked={updateTitle}
                    onCheckedChange={(checked) => setUpdateTitle(!!checked)}
                  />
                  <Label htmlFor="update-title" className="font-medium cursor-pointer">
                    Update Title
                  </Label>
                </div>
                {updateTitle && (
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="New title for all selected files"
                    className="mt-1"
                  />
                )}
              </div>

              {/* Description Field */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="update-description"
                    checked={updateDescription}
                    onCheckedChange={(checked) => setUpdateDescription(!!checked)}
                  />
                  <Label htmlFor="update-description" className="font-medium cursor-pointer">
                    Update Description
                  </Label>
                </div>
                {updateDescription && (
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="New description for all selected files"
                    rows={3}
                    className="mt-1"
                  />
                )}
              </div>

              {!updateTitle && !updateDescription && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Check the fields you want to update
                </p>
              )}
            </>
          )}

          {activeTab === "tags" && (
            <>
              {/* Add Tags */}
              <div className="space-y-2">
                <Label className="font-medium text-green-500">Add Tags</Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {tags && tags.length > 0 ? (
                    tags.map((tag: any) => {
                      const isAdding = addTagIds.includes(tag.id);
                      const isRemoving = removeTagIds.includes(tag.id);
                      return (
                        <Button
                          key={`add-${tag.id}`}
                          variant={isAdding ? "default" : "outline"}
                          size="sm"
                          disabled={isRemoving}
                          className="h-7 text-xs"
                          onClick={() => {
                            if (isAdding) {
                              setAddTagIds(addTagIds.filter((id) => id !== tag.id));
                            } else {
                              setAddTagIds([...addTagIds, tag.id]);
                            }
                          }}
                        >
                          {isAdding && "+ "}
                          {tag.name}
                        </Button>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">No tags available</p>
                  )}
                </div>
              </div>

              {/* Remove Tags */}
              <div className="space-y-2">
                <Label className="font-medium text-red-500">Remove Tags</Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {tags && tags.length > 0 ? (
                    tags.map((tag: any) => {
                      const isAdding = addTagIds.includes(tag.id);
                      const isRemoving = removeTagIds.includes(tag.id);
                      return (
                        <Button
                          key={`remove-${tag.id}`}
                          variant={isRemoving ? "destructive" : "outline"}
                          size="sm"
                          disabled={isAdding}
                          className="h-7 text-xs"
                          onClick={() => {
                            if (isRemoving) {
                              setRemoveTagIds(removeTagIds.filter((id) => id !== tag.id));
                            } else {
                              setRemoveTagIds([...removeTagIds, tag.id]);
                            }
                          }}
                        >
                          {isRemoving && "- "}
                          {tag.name}
                        </Button>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">No tags available</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Progress */}
        {isProcessing && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground text-center">
              Applying changes... {progress}%
            </p>
          </div>
        )}

        {/* Summary */}
        {hasChanges && !isProcessing && (
          <div className="bg-muted/50 rounded-md p-3 text-sm">
            <p className="font-medium mb-1">Changes to apply:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
              {updateTitle && title.trim() && (
                <li>Set title to "{title.trim().substring(0, 40)}{title.trim().length > 40 ? "..." : ""}"</li>
              )}
              {updateDescription && description.trim() && (
                <li>Set description to "{description.trim().substring(0, 40)}{description.trim().length > 40 ? "..." : ""}"</li>
              )}
              {addTagIds.length > 0 && (
                <li>Add {addTagIds.length} tag(s)</li>
              )}
              {removeTagIds.length > 0 && (
                <li>Remove {removeTagIds.length} tag(s)</li>
              )}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={isProcessing || !hasChanges}>
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              `Apply to ${selectedFileIds.length} File(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
