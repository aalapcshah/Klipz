import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Check, X, Clock } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

interface VideoChaptersProps {
  fileId: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

export function VideoChapters({ fileId, currentTime, onSeek }: VideoChaptersProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newChapter, setNewChapter] = useState({ name: "", description: "", timestamp: 0 });
  const [editChapter, setEditChapter] = useState({ name: "", description: "", timestamp: 0 });

  const { data: chapters = [], refetch } = trpc.videoChapters.getChapters.useQuery({ fileId });
  const createMutation = trpc.videoChapters.createChapter.useMutation();
  const updateMutation = trpc.videoChapters.updateChapter.useMutation();
  const deleteMutation = trpc.videoChapters.deleteChapter.useMutation();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleAddChapter = async () => {
    if (!newChapter.name.trim()) {
      toast.error("Chapter name is required");
      return;
    }

    try {
      await createMutation.mutateAsync({
        fileId,
        name: newChapter.name,
        description: newChapter.description || undefined,
        timestamp: newChapter.timestamp,
      });
      
      triggerHaptic("success");
      toast.success("Chapter added");
      setNewChapter({ name: "", description: "", timestamp: 0 });
      setIsAdding(false);
      refetch();
    } catch (error) {
      toast.error("Failed to add chapter");
    }
  };

  const handleUpdateChapter = async (id: number) => {
    try {
      await updateMutation.mutateAsync({
        id,
        name: editChapter.name,
        description: editChapter.description || undefined,
        timestamp: editChapter.timestamp,
      });
      
      triggerHaptic("success");
      toast.success("Chapter updated");
      setEditingId(null);
      refetch();
    } catch (error) {
      toast.error("Failed to update chapter");
    }
  };

  const handleDeleteChapter = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      triggerHaptic("success");
      toast.success("Chapter deleted");
      refetch();
    } catch (error) {
      toast.error("Failed to delete chapter");
    }
  };

  const startEdit = (chapter: typeof chapters[0]) => {
    setEditingId(chapter.id);
    setEditChapter({
      name: chapter.name,
      description: chapter.description || "",
      timestamp: chapter.timestamp,
    });
  };

  return (
    <Card className="p-4 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Chapters</h3>
        <Button
          size="sm"
          onClick={() => {
            setNewChapter({ ...newChapter, timestamp: currentTime });
            setIsAdding(true);
            triggerHaptic("light");
          }}
          className="h-9 md:h-8"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Chapter
        </Button>
      </div>

      {/* Add Chapter Form */}
      {isAdding && (
        <Card className="p-4 mb-4 bg-accent/10 max-w-full">
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Chapter Name</label>
              <Input
                value={newChapter.name}
                onChange={(e) => setNewChapter({ ...newChapter, name: e.target.value })}
                placeholder="e.g., Introduction"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description (Optional)</label>
              <Textarea
                value={newChapter.description}
                onChange={(e) => setNewChapter({ ...newChapter, description: e.target.value })}
                placeholder="Brief description of this chapter"
                className="mt-1 min-h-[60px]"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Timestamp</label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  value={newChapter.timestamp}
                  onChange={(e) => setNewChapter({ ...newChapter, timestamp: parseFloat(e.target.value) })}
                  placeholder="0.0"
                  step="0.1"
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground">seconds</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setNewChapter({ ...newChapter, timestamp: currentTime })}
                  className="h-9"
                >
                  <Clock className="w-4 h-4 mr-1" />
                  Current
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddChapter} size="sm" className="flex-1 h-10 md:h-9">
                <Check className="w-4 h-4 mr-1" />
                Save
              </Button>
              <Button
                onClick={() => {
                  setIsAdding(false);
                  setNewChapter({ name: "", description: "", timestamp: 0 });
                  triggerHaptic("light");
                }}
                size="sm"
                variant="outline"
                className="flex-1 h-10 md:h-9"
              >
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Chapters List */}
      <div className="space-y-2 max-w-full">
        {chapters.length === 0 && !isAdding && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No chapters yet. Add your first chapter to organize your video.
          </p>
        )}

        {chapters.map((chapter) => (
          <Card
            key={chapter.id}
            className={`p-3 cursor-pointer transition-colors hover:bg-accent/50 max-w-full overflow-hidden ${
              editingId === chapter.id ? "bg-accent/20" : ""
            }`}
          >
            {editingId === chapter.id ? (
              <div className="space-y-3">
                <Input
                  value={editChapter.name}
                  onChange={(e) => setEditChapter({ ...editChapter, name: e.target.value })}
                  placeholder="Chapter name"
                />
                <Textarea
                  value={editChapter.description}
                  onChange={(e) => setEditChapter({ ...editChapter, description: e.target.value })}
                  placeholder="Description"
                  className="min-h-[60px]"
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={editChapter.timestamp}
                    onChange={(e) => setEditChapter({ ...editChapter, timestamp: parseFloat(e.target.value) })}
                    step="0.1"
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">seconds</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleUpdateChapter(chapter.id)}
                    size="sm"
                    className="flex-1 h-10 md:h-9"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingId(null);
                      triggerHaptic("light");
                    }}
                    size="sm"
                    variant="outline"
                    className="flex-1 h-10 md:h-9"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => {
                  onSeek(chapter.timestamp);
                  triggerHaptic("light");
                }}
                className="max-w-full"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{chapter.name}</h4>
                    <p className="text-sm text-muted-foreground">{formatTime(chapter.timestamp)}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(chapter);
                        triggerHaptic("light");
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChapter(chapter.id);
                      }}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {chapter.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{chapter.description}</p>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </Card>
  );
}
