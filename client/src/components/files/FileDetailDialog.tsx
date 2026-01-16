import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles,
  Loader2,
  Tag as TagIcon,
  X,
  Plus,
  Download,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

interface FileDetailDialogProps {
  fileId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FileDetailDialog({
  fileId,
  open,
  onOpenChange,
}: FileDetailDialogProps) {
  const [newTagName, setNewTagName] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);

  const { data: file, isLoading, refetch } = trpc.files.get.useQuery(
    { id: fileId! },
    { enabled: !!fileId }
  );

  const enrichMutation = trpc.files.enrich.useMutation();
  const updateMutation = trpc.files.update.useMutation();
  const createTagMutation = trpc.tags.create.useMutation();
  const linkTagMutation = trpc.tags.linkToFile.useMutation();
  const unlinkTagMutation = trpc.tags.unlinkFromFile.useMutation();

  const { data: allTags } = trpc.tags.list.useQuery();

  const handleEnrich = async () => {
    if (!fileId) return;

    try {
      await enrichMutation.mutateAsync({ id: fileId });
      toast.success("File enriched with AI!");
      refetch();
    } catch (error) {
      toast.error("Failed to enrich file");
    }
  };

  const handleAddTag = async () => {
    if (!fileId || !newTagName.trim()) return;

    try {
      const { id: tagId } = await createTagMutation.mutateAsync({
        name: newTagName.trim(),
        source: "manual",
      });

      await linkTagMutation.mutateAsync({ fileId, tagId });
      
      setNewTagName("");
      setIsAddingTag(false);
      toast.success("Tag added");
      refetch();
    } catch (error) {
      toast.error("Failed to add tag");
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    if (!fileId) return;

    try {
      await unlinkTagMutation.mutateAsync({ fileId, tagId });
      toast.success("Tag removed");
      refetch();
    } catch (error) {
      toast.error("Failed to remove tag");
    }
  };

  const handleLinkExistingTag = async (tagId: number) => {
    if (!fileId) return;

    try {
      await linkTagMutation.mutateAsync({ fileId, tagId });
      toast.success("Tag linked");
      refetch();
    } catch (error) {
      toast.error("Failed to link tag");
    }
  };

  if (!fileId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : file ? (
          <>
            <DialogHeader>
              <DialogTitle>{file.title || file.filename}</DialogTitle>
              <DialogDescription>
                {file.mimeType} • {(file.fileSize / 1024 / 1024).toFixed(2)} MB
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* File Preview */}
              {file.mimeType.startsWith("image/") && (
                <div className="rounded-lg overflow-hidden border border-border">
                  <img
                    src={file.url}
                    alt={file.title || file.filename}
                    className="w-full h-auto max-h-96 object-contain bg-muted"
                  />
                </div>
              )}

              {/* Basic Info */}
              <div className="space-y-3">
                <div>
                  <Label>Title</Label>
                  <Input
                    value={file.title || ""}
                    onChange={(e) => {
                      updateMutation.mutate({
                        id: fileId,
                        title: e.target.value,
                      });
                    }}
                    placeholder="Enter title"
                  />
                </div>

                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={file.description || ""}
                    onChange={(e) => {
                      updateMutation.mutate({
                        id: fileId,
                        description: e.target.value,
                      });
                    }}
                    placeholder="Enter description"
                    rows={3}
                  />
                </div>

                {file.voiceTranscript && (
                  <div>
                    <Label>Voice Transcript</Label>
                    <div className="p-3 bg-muted rounded-md text-sm">
                      {file.voiceTranscript}
                    </div>
                  </div>
                )}
              </div>

              {/* AI Enrichment */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">
                    AI Enrichment
                  </Label>
                  {file.enrichmentStatus === "pending" && (
                    <Button
                      onClick={handleEnrich}
                      disabled={enrichMutation.isPending}
                      size="sm"
                      className="bg-accent hover:bg-accent/90"
                    >
                      {enrichMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      Enrich with AI
                    </Button>
                  )}
                  {file.enrichmentStatus === "completed" && (
                    <Badge variant="secondary">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Enriched
                    </Badge>
                  )}
                  {file.enrichmentStatus === "processing" && (
                    <Badge variant="secondary">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Processing
                    </Badge>
                  )}
                </div>

                {file.aiAnalysis && (
                  <div className="p-4 bg-muted rounded-lg">
                    <Streamdown>{file.aiAnalysis}</Streamdown>
                  </div>
                )}

                {file.detectedObjects && file.detectedObjects.length > 0 && (
                  <div>
                    <Label className="text-sm">Detected Objects</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {file.detectedObjects.map((obj, idx) => (
                        <Badge key={idx} variant="outline">
                          {obj}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Tags */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Tags</Label>
                  <Button
                    onClick={() => setIsAddingTag(!isAddingTag)}
                    size="sm"
                    variant="outline"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Tag
                  </Button>
                </div>

                {isAddingTag && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Enter new tag name"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddTag();
                        }}
                      />
                      <Button onClick={handleAddTag} size="sm">
                        Add
                      </Button>
                      <Button
                        onClick={() => {
                          setIsAddingTag(false);
                          setNewTagName("");
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Cancel
                      </Button>
                    </div>

                    {/* Existing tags to link */}
                    {allTags && allTags.length > 0 && (
                      <div className="p-3 bg-muted rounded-md">
                        <p className="text-xs text-muted-foreground mb-2">
                          Or select from existing tags:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {allTags
                            .filter(
                              (t) => !file.tags.some((ft) => ft.id === t.id)
                            )
                            .map((tag) => (
                              <Badge
                                key={tag.id}
                                variant="outline"
                                className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                                onClick={() => handleLinkExistingTag(tag.id)}
                              >
                                {tag.name}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {file.tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={tag.source === "ai" ? "secondary" : "default"}
                      className="gap-2"
                    >
                      <TagIcon className="h-3 w-3" />
                      {tag.name}
                      {tag.source === "ai" && (
                        <Sparkles className="h-3 w-3" />
                      )}
                      <button
                        onClick={() => handleRemoveTag(tag.id)}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Knowledge Graph Connections */}
              {file.knowledgeEdges && file.knowledgeEdges.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-base font-semibold">
                    Related Files
                  </Label>
                  <div className="space-y-2">
                    {file.knowledgeEdges.map((edge) => (
                      <div
                        key={edge.id}
                        className="p-3 bg-muted rounded-md flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            File #{edge.sourceFileId === fileId ? edge.targetFileId : edge.sourceFileId}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {edge.relationshipType} • Strength: {edge.strength}%
                          </p>
                        </div>
                        {edge.sharedTags && edge.sharedTags.length > 0 && (
                          <div className="flex gap-1">
                            {edge.sharedTags.map((tag, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between pt-4 border-t">
                <Button variant="outline" asChild>
                  <a href={file.url} download target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </a>
                </Button>
                <Button onClick={() => onOpenChange(false)}>Close</Button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">File not found</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
