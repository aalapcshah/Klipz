import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  VideoIcon,
  Loader2,
  Trash2,
  Play,
  Edit3,
  Download,
  Cloud,
  Mic,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { AnnotationEditor } from "./AnnotationEditor";
import { CloudExportDialog } from "./CloudExportDialog";
import { VideoPlayerWithAnnotations } from "../VideoPlayerWithAnnotations";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function VideoList() {
  const [editingVideoId, setEditingVideoId] = useState<number | null>(null);
  const [exportingVideoId, setExportingVideoId] = useState<number | null>(null);
  const [cloudExportVideo, setCloudExportVideo] = useState<{ id: number; title: string } | null>(null);
  const [annotatingVideo, setAnnotatingVideo] = useState<{ id: number; fileId: number; url: string; title: string } | null>(null);
  
  const { data: videos, isLoading, refetch } = trpc.videos.list.useQuery();
  const deleteMutation = trpc.videos.delete.useMutation();
  const exportMutation = trpc.videoExport.export.useMutation();

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

  const handleExport = async (videoId: number) => {
    setExportingVideoId(videoId);
    try {
      toast.info("Starting video export with annotations...");
      const result = await exportMutation.mutateAsync({ videoId });
      toast.success("Video exported successfully!");
      
      // Refresh video list to show updated export status
      refetch();
      
      // Open exported video in new tab
      if (result.url) {
        window.open(result.url, "_blank");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExportingVideoId(null);
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
    <>
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
              <h3 className="text-sm font-medium truncate">
                {video.title || video.filename}
              </h3>
              
              <div className="flex items-center gap-2 flex-wrap">
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

              {/* Show exported video link if available */}
              {video.exportStatus === "completed" && video.exportedUrl && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  asChild
                >
                  <a href={video.exportedUrl} target="_blank" rel="noopener noreferrer">
                    View Exported Video →
                  </a>
                </Button>
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
                onClick={() => setEditingVideoId(video.id)}
                title="Edit video details"
              >
                <Edit3 className="h-3 w-3" />
              </Button>
              {video.fileId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAnnotatingVideo({ id: video.id, fileId: video.fileId!, url: video.url, title: video.title || video.filename })}
                  title="Voice & Drawing Annotations"
                  className="relative"
                >
                  <div className="relative">
                    <Mic className="h-3 w-3" />
                    <PenLine className="h-2 w-2 absolute -bottom-0.5 -right-0.5 text-primary" />
                  </div>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport(video.id)}
                disabled={
                  exportingVideoId === video.id ||
                  video.exportStatus === "processing"
                }
                title="Export video with annotation overlays"
              >
                {exportingVideoId === video.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
              </Button>
              {video.exportStatus === "completed" && video.exportedUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCloudExportVideo({ id: video.id, title: video.title || "video" })}
                  title="Upload to cloud storage"
                >
                  <Cloud className="h-3 w-3" />
                </Button>
              )}
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

      {/* Annotation Editor Dialog */}
      <Dialog
        open={editingVideoId !== null}
        onOpenChange={(open) => !open && setEditingVideoId(null)}
      >
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Video & Annotations</DialogTitle>
          </DialogHeader>
          {editingVideoId && (
            <AnnotationEditor videoId={editingVideoId} />
          )}
        </DialogContent>
      </Dialog>

      {/* Cloud Export Dialog */}
      {cloudExportVideo && (
        <CloudExportDialog
          open={cloudExportVideo !== null}
          onOpenChange={(open) => !open && setCloudExportVideo(null)}
          videoId={cloudExportVideo.id}
          videoTitle={cloudExportVideo.title}
        />
      )}
      
      {/* Annotation Dialog */}
      {annotatingVideo && (
        <Dialog open={true} onOpenChange={() => setAnnotatingVideo(null)}>
          <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{annotatingVideo.title}</DialogTitle>
            </DialogHeader>
            <VideoPlayerWithAnnotations
              fileId={annotatingVideo.fileId}
              videoUrl={annotatingVideo.url}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
