import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/useMediaQuery";
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
  Trash2,
  History,
  GitCompare,
  Share2,
} from "lucide-react";
import { FileVersionHistory } from "./FileVersionHistory";
import { VideoPlayerWithAnnotations } from "../VideoPlayerWithAnnotations";
import { QualityImprovementPanel } from "../QualityImprovementPanel";
import { ShareDialog } from "../ShareDialog";
import { SmartTagSuggestions } from "../SmartTagSuggestions";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

interface FileDetailDialogProps {
  fileId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DeletedFile {
  id: number;
  title: string | null;
  filename: string;
  description: string | null;
  mimeType: string;
  fileSize: number;
  fileKey: string;
  url: string;
}

export function FileDetailDialog({
  fileId,
  open,
  onOpenChange,
}: FileDetailDialogProps) {
  const [newTagName, setNewTagName] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<any[]>([]);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const deletedFileRef = useRef<DeletedFile | null>(null);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMobile = useIsMobile();

  const { data: file, isLoading, refetch } = trpc.files.get.useQuery(
    { id: fileId! },
    { enabled: !!fileId }
  );

  const enrichMutation = trpc.files.enrich.useMutation();
  const updateMutation = trpc.files.update.useMutation();
  const createTagMutation = trpc.tags.create.useMutation();
  const linkTagMutation = trpc.tags.linkToFile.useMutation();
  const unlinkTagMutation = trpc.tags.unlinkFromFile.useMutation();
  const deleteMutation = trpc.files.delete.useMutation();
  const createFileMutation = trpc.files.create.useMutation();
  const suggestTagsMutation = trpc.tags.suggestTags.useMutation();
  const utils = trpc.useUtils();

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

  const handleSuggestTags = async () => {
    if (!fileId) return;

    try {
      const suggestions = await suggestTagsMutation.mutateAsync({ fileId });
      
      // Show suggestions in a toast with actions
      if (suggestions && suggestions.length > 0) {
        toast.success(`Found ${suggestions.length} tag suggestions! Check below the Add Tag button.`);
        // Store suggestions in state to display them
        setTagSuggestions(suggestions);
      } else {
        toast.info("No tag suggestions found for this file.");
      }
    } catch (error) {
      toast.error("Failed to generate tag suggestions");
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

  const handleUndo = async () => {
    if (!deletedFileRef.current) return;

    // Clear the timeout
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    const fileToRestore = deletedFileRef.current;
    deletedFileRef.current = null;

    try {
      await createFileMutation.mutateAsync({
        title: fileToRestore.title || "",
        filename: fileToRestore.filename,
        description: fileToRestore.description || "",
        mimeType: fileToRestore.mimeType,
        fileSize: fileToRestore.fileSize,
        fileKey: fileToRestore.fileKey,
        url: fileToRestore.url,
      });
      toast.success("File restored");
      utils.files.list.invalidate();
    } catch (error: any) {
      toast.error(`Failed to restore file: ${error.message}`);
    }
  };

  const handleDelete = async () => {
    if (!file || !fileId) return;

    // Store file data for undo
    deletedFileRef.current = {
      id: file.id,
      title: file.title,
      filename: file.filename,
      description: file.description,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      fileKey: file.fileKey,
      url: file.url,
    };

    try {
      await deleteMutation.mutateAsync({ id: fileId });
      onOpenChange(false);
      toast.success("File deleted", {
        action: {
          label: "Undo",
          onClick: handleUndo,
        },
        duration: 10000,
      });
      utils.files.list.invalidate();

      // Set timeout to clear deleted file after 10 seconds
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
      undoTimeoutRef.current = setTimeout(() => {
        deletedFileRef.current = null;
        undoTimeoutRef.current = null;
      }, 10000);
    } catch (error) {
      toast.error("Failed to delete file");
    }
  };

  if (!fileId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col ${isMobile ? 'w-full h-full max-w-full max-h-full rounded-none' : ''}`}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : file ? (
          <>
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="text-base font-semibold break-words pr-8">{file.title || file.filename}</DialogTitle>
              <DialogDescription className="text-sm">
                {file.mimeType} • {(file.fileSize / 1024 / 1024).toFixed(2)} MB
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2">

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
              
              {file.mimeType.startsWith("video/") && (
                <VideoPlayerWithAnnotations fileId={file.id} videoUrl={file.url} />
              )}

              {/* File Metadata */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-sm mb-3">File Information</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Filename:</span>
                    <p className="font-medium truncate">{file.filename}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Size:</span>
                    <p className="font-medium">{(file.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Type:</span>
                    <p className="font-medium">{file.mimeType}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Enrichment:</span>
                    <p className="font-medium capitalize">{file.enrichmentStatus}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>
                    <p className="font-medium">{new Date(file.createdAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Modified:</span>
                    <p className="font-medium">{new Date(file.updatedAt).toLocaleString()}</p>
                  </div>
                  {file.enrichedAt && (
                    <div>
                      <span className="text-muted-foreground">Enriched:</span>
                      <p className="font-medium">{new Date(file.enrichedAt).toLocaleString()}</p>
                    </div>
                  )}
                </div>
                
                {/* Extracted Keywords */}
                {file.extractedKeywords && file.extractedKeywords.length > 0 && (
                  <div className="col-span-2 mt-2">
                    <span className="text-muted-foreground text-sm">Keywords from file:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {file.extractedKeywords.map((keyword: string, idx: number) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

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

                {/* Metadata Comparison View */}
                {file.enrichmentStatus === "completed" && (file.extractedMetadata || file.description || file.title) && (
                  <div className="border border-border rounded-lg p-4 space-y-3">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <GitCompare className="h-4 w-4" />
                      Metadata Comparison
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {/* Original Metadata Column */}
                      <div className="space-y-2">
                        <h4 className="font-medium text-muted-foreground">Original Metadata</h4>
                        {file.description && (
                          <div className="bg-accent/10 rounded p-2">
                            <Label className="text-xs">Description</Label>
                            <p className="text-xs mt-1">{file.description}</p>
                          </div>
                        )}
                        {file.extractedKeywords && file.extractedKeywords.length > 0 && (
                          <div className="bg-accent/10 rounded p-2">
                            <Label className="text-xs">Keywords</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {file.extractedKeywords.map((keyword: string, idx: number) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {keyword}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {(() => {
                          try {
                            const metadata = file.extractedMetadata ? JSON.parse(file.extractedMetadata) : null;
                            if (metadata?.Make) {
                              return (
                                <div className="bg-accent/10 rounded p-2">
                                  <Label className="text-xs">Camera</Label>
                                  <p className="text-xs mt-1">{metadata.Make} {metadata.Model || ''}</p>
                                </div>
                              );
                            }
                          } catch (e) {
                            // Invalid JSON, skip
                          }
                          return null;
                        })()}
                      </div>
                      
                      {/* AI-Enriched Column */}
                      <div className="space-y-2">
                        <h4 className="font-medium text-primary">AI-Enriched</h4>
                        {file.aiAnalysis && (
                          <div className="bg-primary/10 rounded p-2">
                            <Label className="text-xs">AI Analysis</Label>
                            <p className="text-xs mt-1 line-clamp-4">{file.aiAnalysis}</p>
                          </div>
                        )}
                        {file.detectedObjects && file.detectedObjects.length > 0 && (
                          <div className="bg-primary/10 rounded p-2">
                            <Label className="text-xs">Detected Objects</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {file.detectedObjects.slice(0, 5).map((obj, idx) => (
                                <Badge key={idx} variant="default" className="text-xs">
                                  {obj}
                                </Badge>
                              ))}
                              {file.detectedObjects.length > 5 && (
                                <Badge variant="outline" className="text-xs">
                                  +{file.detectedObjects.length - 5} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                        {file.ocrText && (
                          <div className="bg-primary/10 rounded p-2">
                            <Label className="text-xs">Extracted Text (OCR)</Label>
                            <p className="text-xs mt-1 line-clamp-3">{file.ocrText}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      💡 Left shows original file metadata, right shows AI-enriched data
                    </p>
                  </div>
                )}

                {file.aiAnalysis && (
                  <div className="p-4 bg-muted rounded-lg">
                    <Label className="text-xs mb-2 block text-muted-foreground">Full AI Analysis</Label>
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

                    {/* Smart tag suggestions */}
                    {!isAddingTag && fileId && (
                      <>
                        <Button
                          onClick={handleSuggestTags}
                          size="sm"
                          variant="outline"
                          disabled={suggestTagsMutation.isPending}
                          className="w-full"
                        >
                          {suggestTagsMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-1" />
                              Suggest Tags with AI
                            </>
                          )}
                        </Button>
                        
                        {tagSuggestions.length > 0 && (
                          <div className="p-3 bg-accent/10 border border-accent rounded-md">
                            <p className="text-xs font-medium mb-2 flex items-center gap-1">
                              <Sparkles className="h-3 w-3" />
                              AI Suggested Tags:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {tagSuggestions.map((suggestion: any, idx: number) => (
                                <Badge
                                  key={idx}
                                  variant="outline"
                                  className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
                                  onClick={async () => {
                                    try {
                                      const { id: tagId } = await createTagMutation.mutateAsync({
                                        name: suggestion.tagName,
                                        source: "ai",
                                      });
                                      await linkTagMutation.mutateAsync({ fileId, tagId });
                                      toast.success(`Tag "${suggestion.tagName}" added`);
                                      refetch();
                                      // Remove from suggestions
                                      setTagSuggestions(prev => prev.filter((_, i) => i !== idx));
                                    } catch (error) {
                                      toast.error("Failed to add tag");
                                    }
                                  }}
                                  title={`${suggestion.reason} (Confidence: ${suggestion.confidence}%)`}
                                >
                                  {suggestion.tagName}
                                  <span className="ml-1 text-xs opacity-70">({suggestion.confidence}%)</span>
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

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

                {/* Smart Tag Suggestions from Knowledge Graphs */}
                <SmartTagSuggestions
                  existingTags={file.tags?.map((t) => t.name) || []}
                  context={file.description || file.title || file.filename}
                    onAddTag={async (tagName) => {
                      try {
                        const { id: tagId } = await createTagMutation.mutateAsync({
                          name: tagName,
                          source: "ai",
                        });
                        await linkTagMutation.mutateAsync({ fileId: fileId!, tagId });
                        toast.success(`Tag "${tagName}" added from knowledge graph`);
                        refetch();
                      } catch (error) {
                        toast.error("Failed to add tag");
                      }
                    }}
                  className="mt-4"
                />
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
                <div className="flex gap-2">
                  <Button variant="outline" asChild>
                    <a href={file.url} download target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShareDialogOpen(true)}
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete
                  </Button>
                </div>
                <Button onClick={() => onOpenChange(false)}>Close</Button>
              </div>

              {/* Share Dialog */}
              <ShareDialog
                open={shareDialogOpen}
                onOpenChange={setShareDialogOpen}
                itemType="file"
                itemId={fileId!}
                itemName={file.title || file.filename}
              />

              {/* Quality Improvement Panel - Moved to bottom */}
              {file.mimeType.startsWith("image/") && (
                <div className="mt-6">
                  <QualityImprovementPanel fileId={file.id} currentScore={file.qualityScore} />
                </div>
              )}
              
              {/* Version History Section */}
              <div className="mt-8 border-t pt-6">
                <FileVersionHistory 
                  fileId={fileId!} 
                  onVersionRestored={() => {
                    refetch();
                  }}
                />
              </div>
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
