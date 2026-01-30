import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoIcon, Clock, MessageSquare, PenLine, Play, ChevronDown, ChevronUp } from "lucide-react";
import { formatDuration } from "@/lib/videoUtils";
import { useState } from "react";
import { VideoPlayerWithAnnotations } from "@/components/VideoPlayerWithAnnotations";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function RecentlyRecorded() {
  const { data: recentVideos, isLoading } = trpc.videos.recentlyRecorded.useQuery();
  const [selectedVideo, setSelectedVideo] = useState<{
    id: number;
    fileId: number;
    url: string;
    title: string;
  } | null>(null);
  const [expanded, setExpanded] = useState(() => {
    // On mobile, default to collapsed; on desktop, default to expanded
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const saved = typeof window !== 'undefined' ? localStorage.getItem('recentlyRecordedExpanded') : null;
    return saved !== null ? JSON.parse(saved) : !isMobile;
  });

  const toggleExpanded = () => {
    const newValue = !expanded;
    setExpanded(newValue);
    localStorage.setItem('recentlyRecordedExpanded', JSON.stringify(newValue));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Recently Recorded</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!recentVideos || recentVideos.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-4">
        <button
          className="flex items-center justify-between w-full text-left"
          onClick={toggleExpanded}
        >
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Recently Recorded</h2>
            <Badge variant="secondary" className="text-xs">
              Last 7 days
            </Badge>
            <span className="text-xs text-muted-foreground">
              ({recentVideos?.length || 0})
            </span>
          </div>
          <div className="md:hidden">
            {expanded ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </button>
        <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 transition-all duration-300 ${!expanded ? 'hidden md:grid' : ''}`}>
          {recentVideos.map((video) => (
            <Card
              key={video.id}
              className="group relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
              onClick={() => {
                if (video.fileId) {
                  setSelectedVideo({
                    id: video.id,
                    fileId: video.fileId,
                    url: video.url,
                    title: video.title || video.filename || `Video ${video.id}`,
                  });
                }
              }}
            >
              {/* Thumbnail/Video Preview */}
              <div className="aspect-video relative bg-muted">
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title || "Video thumbnail"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <VideoIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                
                {/* Play overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                    <Play className="h-5 w-5 text-black ml-0.5" />
                  </div>
                </div>

                {/* Duration badge */}
                {video.duration && (
                  <Badge
                    variant="secondary"
                    className="absolute bottom-1 right-1 text-[10px] px-1 py-0 bg-black/70 text-white"
                  >
                    {formatDuration(video.duration)}
                  </Badge>
                )}
              </div>

              {/* Video info */}
              <div className="p-2 space-y-1">
                <p className="text-xs font-medium line-clamp-1">
                  {video.title || video.filename || `Video ${video.id}`}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {video.totalAnnotationCount > 0 && (
                    <span className="flex items-center gap-0.5">
                      <MessageSquare className="h-3 w-3" />
                      {video.voiceAnnotationCount}
                      <PenLine className="h-3 w-3 ml-1" />
                      {video.visualAnnotationCount}
                    </span>
                  )}
                  <span>
                    {new Date(video.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Annotation Dialog */}
      {selectedVideo && (
        <Dialog open={!!selectedVideo} onOpenChange={(open) => !open && setSelectedVideo(null)}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedVideo.title}</DialogTitle>
            </DialogHeader>
            <VideoPlayerWithAnnotations
              fileId={selectedVideo.fileId}
              videoUrl={selectedVideo.url}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
