import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, X, Tag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface VideoTagManagerProps {
  videoId: number;
  onTagsChange?: () => void;
}

export function VideoTagManager({ videoId, onTagsChange }: VideoTagManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  
  const { data: allTags = [] } = trpc.videoTags.list.useQuery();
  const { data: videoTags = [] } = trpc.videoTags.getVideoTags.useQuery({ videoId });
  
  const createTagMutation = trpc.videoTags.create.useMutation();
  const assignTagMutation = trpc.videoTags.assignToVideo.useMutation();
  const removeTagMutation = trpc.videoTags.removeFromVideo.useMutation();
  
  const utils = trpc.useUtils();
  
  const videoTagIds = new Set(videoTags.map(t => t.id));
  const availableTags = allTags.filter(t => !videoTagIds.has(t.id));
  
  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast.error("Tag name cannot be empty");
      return;
    }
    
    try {
      const result = await createTagMutation.mutateAsync({ name: newTagName.trim() });
      await assignTagMutation.mutateAsync({ videoId, tagId: result.id });
      
      setNewTagName("");
      utils.videoTags.list.invalidate();
      utils.videoTags.getVideoTags.invalidate({ videoId });
      onTagsChange?.();
      toast.success("Tag created and assigned");
    } catch (error: any) {
      toast.error(error.message || "Failed to create tag");
    }
  };
  
  const handleAssignTag = async (tagId: number) => {
    try {
      await assignTagMutation.mutateAsync({ videoId, tagId });
      utils.videoTags.getVideoTags.invalidate({ videoId });
      onTagsChange?.();
      toast.success("Tag assigned");
    } catch (error: any) {
      toast.error(error.message || "Failed to assign tag");
    }
  };
  
  const handleRemoveTag = async (tagId: number) => {
    try {
      await removeTagMutation.mutateAsync({ videoId, tagId });
      utils.videoTags.getVideoTags.invalidate({ videoId });
      onTagsChange?.();
      toast.success("Tag removed");
    } catch (error: any) {
      toast.error(error.message || "Failed to remove tag");
    }
  };
  
  return (
    <div className="flex items-center gap-1 shrink-0">
      {/* Display assigned tags */}
      {videoTags.map((tag) => (
        <Badge
          key={tag.id}
          style={{ backgroundColor: tag.color || '#3b82f6' }}
          className="text-white flex items-center gap-1 pr-1 text-[10px] md:text-xs"
        >
          {tag.name}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveTag(tag.id);
            }}
            className="hover:bg-white/20 rounded-full p-0.5"
          >
            <X className="h-2.5 w-2.5 md:h-3 md:w-3" />
          </button>
        </Badge>
      ))}
      
      {/* Add tag button */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <Plus className="h-3 w-3 mr-1" />
            Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-3">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Manage Tags
            </h4>
            
            {/* Create new tag */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Create New Tag</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Tag name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateTag();
                    }
                  }}
                  className="h-8 text-sm"
                />
                <Button
                  size="sm"
                  onClick={handleCreateTag}
                  disabled={!newTagName.trim() || createTagMutation.isPending}
                  className="h-8"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            {/* Assign existing tags */}
            {availableTags.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Assign Existing Tags</label>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map((tag) => (
                    <Badge
                      key={tag.id}
                      style={{ backgroundColor: tag.color || '#3b82f6' }}
                      className="text-white cursor-pointer hover:opacity-80"
                      onClick={() => handleAssignTag(tag.id)}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {availableTags.length === 0 && videoTags.length === 0 && (
              <p className="text-xs text-muted-foreground">No tags yet. Create your first tag above!</p>
            )}
            
            {availableTags.length === 0 && videoTags.length > 0 && (
              <p className="text-xs text-muted-foreground">All tags assigned to this video.</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
