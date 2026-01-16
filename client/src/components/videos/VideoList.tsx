import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  VideoIcon,
  Loader2,
  Trash2,
  Play,
} from "lucide-react";
import { toast } from "sonner";

export function VideoList() {
  const { data: videos, isLoading, refetch } = trpc.videos.list.useQuery();
  const deleteMutation = trpc.videos.delete.useMutation();

  const handleDelete = async (videoId: number) => {
    if (!confirm("Are you sure you want to delete this video?")) return;

    try {
      await deleteMutation.mutateAsync({ id: videoId });
      toast.success("Video deleted");
      refetch();
    } catch (error) {
      toast.error("Failed to delete video");
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!videos || videos.length === 0) {
    return (
      <div className="text-center py-12">
        <VideoIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-medium mb-2">No videos yet</h3>
        <p className="text-muted-foreground">
          Record your first video to get started
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {videos.map((video) => (
        <Card key={video.id} className="p-4 space-y-3 group">
          {/* Video Thumbnail/Player */}
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            <video
              src={video.url}
              className="w-full h-full object-contain"
              preload="metadata"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button size="icon" variant="secondary" asChild>
                <a href={video.url} target="_blank" rel="noopener noreferrer">
                  <Play className="h-6 w-6" />
                </a>
              </Button>
            </div>
          </div>

          {/* Video Info */}
          <div className="space-y-2">
            <h3 className="font-medium truncate">
              {video.title || video.filename}
            </h3>
            
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {formatDuration(video.duration)}
              </Badge>
              {video.exportStatus && (
                <Badge
                  variant={
                    video.exportStatus === "completed"
                      ? "default"
                      : video.exportStatus === "processing"
                        ? "secondary"
                        : "outline"
                  }
                  className="text-xs"
                >
                  {video.exportStatus}
                </Badge>
              )}
            </div>

            {video.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {video.description}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="outline" size="sm" className="flex-1" asChild>
              <a href={video.url} target="_blank" rel="noopener noreferrer">
                <Play className="h-3 w-3 mr-1" />
                Play
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDelete(video.id)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
