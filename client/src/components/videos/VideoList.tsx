import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
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
  MessageSquare,
  ChevronDown,
  Search,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { AnnotationEditor } from "./AnnotationEditor";
import { CloudExportDialog } from "./CloudExportDialog";
import { VideoPlayerWithAnnotations } from "../VideoPlayerWithAnnotations";
import { VideoTagManager } from "./VideoTagManager";
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
  const [selectedVideoIds, setSelectedVideoIds] = useState<number[]>([]);
  
  const searchParams = useSearch();
  const [, setLocation] = useLocation();
  
  // Initialize from URL params or localStorage
  const [page, setPage] = useState(() => {
    const urlPage = new URLSearchParams(searchParams).get('page');
    return urlPage ? parseInt(urlPage) : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const urlPageSize = new URLSearchParams(searchParams).get('pageSize');
    if (urlPageSize) return parseInt(urlPageSize);
    const saved = localStorage.getItem('videosPageSize');
    return saved ? parseInt(saved) : 50;
  });
  const [sortBy, setSortBy] = useState<'date' | 'annotations'>('date');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  
  // Update URL when page or pageSize changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('page', page.toString());
    params.set('pageSize', pageSize.toString());
    setLocation(`?${params.toString()}`, { replace: true });
  }, [page, pageSize]);
  
  useEffect(() => {
    localStorage.setItem('videosPageSize', pageSize.toString());
  }, [pageSize]);
  
  const { data: videosData, isLoading, refetch } = trpc.videos.list.useQuery({ page, pageSize, sortBy, search: debouncedSearch });
  const videos = videosData?.videos || [];
  const deleteMutation = trpc.videos.delete.useMutation();
  const batchDeleteMutation = trpc.videos.batchDelete.useMutation();
  const exportMutation = trpc.videoExport.export.useMutation();
  const batchExportMutation = trpc.videoExport.batchExport.useMutation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Tag management
  const { data: allTags = [] } = trpc.videoTags.list.useQuery();
  const createTagMutation = trpc.videoTags.create.useMutation();
  const assignTagMutation = trpc.videoTags.assignToVideo.useMutation();
  const removeTagMutation = trpc.videoTags.removeFromVideo.useMutation();
  const [managingTagsForVideo, setManagingTagsForVideo] = useState<number | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<number | null>(null);

  const handleToggleSelection = (videoId: number) => {
    setSelectedVideoIds(prev => 
      prev.includes(videoId) 
        ? prev.filter(id => id !== videoId)
        : [...prev, videoId]
    );
  };

  const handleSelectAll = () => {
    if (selectedVideoIds.length === videos?.length) {
      setSelectedVideoIds([]);
    } else {
      setSelectedVideoIds(videos?.map(v => v.id) || []);
    }
  };

  const handleBatchExport = async (format: 'csv' | 'json') => {
    if (selectedVideoIds.length === 0) {
      toast.error("Please select at least one video");
      return;
    }

    try {
      const result = await batchExportMutation.mutateAsync({
        videoIds: selectedVideoIds,
        format,
      });

      // Trigger download
      const link = document.createElement('a');
      link.href = result.url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Exported ${selectedVideoIds.length} video(s) as ${format.toUpperCase()}`);
      setSelectedVideoIds([]);
    } catch (error) {
      toast.error("Failed to export annotations");
    }
  };

  const handleBatchDelete = async () => {
    if (selectedVideoIds.length === 0) {
      toast.error("Please select at least one video");
      return;
    }

    try {
      await batchDeleteMutation.mutateAsync({ ids: selectedVideoIds });
      toast.success(`Deleted ${selectedVideoIds.length} video(s)`);
      setSelectedVideoIds([]);
      setShowDeleteConfirm(false);
      refetch();
    } catch (error) {
      toast.error("Failed to delete videos");
    }
  };

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

  const handleExport = async (videoId: number, preset: 'tutorial' | 'review' | 'clean' = 'review') => {
    setExportingVideoId(videoId);
    try {
      const presetLabels = {
        tutorial: 'Tutorial Mode (sequential with auto-pause)',
        review: 'Review Mode (all annotations visible)',
        clean: 'Clean Export (no annotations)',
      };
      toast.info(`Starting ${presetLabels[preset]} export...`);
      const result = await exportMutation.mutateAsync({ videoId, preset });
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
      {/* Search and Sort Controls */}
      <div className="mb-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search videos by title, description, or transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sort Controls */}
        {videos && videos.length > 0 && (
          <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by:</span>
          <Select value={sortBy} onValueChange={(value: 'date' | 'annotations') => setSortBy(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Date Added</SelectItem>
              <SelectItem value="annotations">Annotation Count</SelectItem>
            </SelectContent>
          </Select>
          </div>
        )}
      </div>

      {/* Batch Export Controls */}
      {videos && videos.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-4 p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedVideoIds.length === videos.length}
              onChange={handleSelectAll}
              className="h-2.5 w-2.5 md:h-3 md:w-3"
            />
            <span className="text-sm text-muted-foreground">
              {selectedVideoIds.length === 0 
                ? "Select videos to export annotations"
                : `${selectedVideoIds.length} video(s) selected`}
            </span>
          </div>
          {selectedVideoIds.length > 0 && (
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={batchExportMutation.isPending}
                  >
                    {batchExportMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Export
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleBatchExport('csv')}>
                  <Download className="h-4 w-4 mr-2" />
                  CSV Format
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBatchExport('json')}>
                  <Download className="h-4 w-4 mr-2" />
                  JSON Format
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={batchDeleteMutation.isPending}
            >
              {batchDeleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {videos.map((video) => (
          <Card key={video.id} className="relative p-4 space-y-3 group">
            {/* Selection Checkbox */}
            <div className="absolute top-2 left-2 z-10">
              <input
                type="checkbox"
                checked={selectedVideoIds.includes(video.id)}
                onChange={() => handleToggleSelection(video.id)}
                className="h-2.5 w-2.5 md:h-3 md:w-3 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

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
                {(video.voiceAnnotationCount > 0 || video.visualAnnotationCount > 0) && (
                  <>
                    {video.voiceAnnotationCount > 0 && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <Mic className="h-3 w-3" />
                        {video.voiceAnnotationCount}
                      </Badge>
                    )}
                    {video.visualAnnotationCount > 0 && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <PenLine className="h-3 w-3" />
                        {video.visualAnnotationCount}
                      </Badge>
                    )}
                  </>
                )}
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
                {video.voiceAnnotationCount > 0 && (
                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                    <Mic className="h-3 w-3" />
                    {video.voiceAnnotationCount}
                  </Badge>
                )}
                {video.visualAnnotationCount > 0 && (
                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                    <PenLine className="h-3 w-3" />
                    {video.visualAnnotationCount}
                  </Badge>
                )}
              </div>

              {video.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {video.description}
                </p>
              )}
              
              {/* Tag management */}
              <VideoTagManager videoId={video.id} onTagsChange={refetch} />

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
              {video.fileId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAnnotatingVideo({ id: video.id, fileId: video.fileId!, url: video.url, title: video.title || video.filename })}
                  title="Annotate (Voice, Drawing, Text)"
                  className="flex-1"
                >
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Annotate
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      exportingVideoId === video.id ||
                      video.exportStatus === "processing"
                    }
                    title="Export video with presets"
                  >
                    {exportingVideoId === video.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Download className="h-3 w-3 mr-1" />
                        <ChevronDown className="h-2 w-2" />
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Export Presets</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport(video.id, 'tutorial')}>
                    <div className="flex flex-col">
                      <span className="font-medium">Tutorial Mode</span>
                      <span className="text-xs text-muted-foreground">Sequential with auto-pause</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport(video.id, 'review')}>
                    <div className="flex flex-col">
                      <span className="font-medium">Review Mode</span>
                      <span className="text-xs text-muted-foreground">All annotations visible</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport(video.id, 'clean')}>
                    <div className="flex flex-col">
                      <span className="font-medium">Clean Export</span>
                      <span className="text-xs text-muted-foreground">No annotations</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

      {/* Pagination Controls */}
      {videosData?.pagination && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Showing {Math.min((videosData.pagination.page - 1) * videosData.pagination.pageSize + 1, videosData.pagination.totalCount)} - {Math.min(videosData.pagination.page * videosData.pagination.pageSize, videosData.pagination.totalCount)} of {videosData.pagination.totalCount} videos
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Items per page:</span>
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => {
                  setPageSize(parseInt(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Page</span>
              <input
                type="number"
                min="1"
                max={videosData.pagination.totalPages}
                value={page}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (value >= 1 && value <= videosData.pagination.totalPages) {
                    setPage(value);
                  }
                }}
                className="w-16 px-2 py-1 text-sm border rounded text-center"
              />
              <span className="text-sm text-muted-foreground">of {videosData.pagination.totalPages}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(videosData.pagination.totalPages, p + 1))}
              disabled={page === videosData.pagination.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

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

      {/* Batch Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete {selectedVideoIds.length} video(s)? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBatchDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
