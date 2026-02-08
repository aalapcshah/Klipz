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
  Plus,
  Tag,
  Package,
  Share2,
  Captions,
  Shrink,
  ArrowDown,
  HardDrive,
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
import { getResolutionLabel, formatDuration } from "@/lib/videoUtils";
import { useLocation, useSearch } from "wouter";
import { AnnotationEditor } from "./AnnotationEditor";
import { CloudExportDialog } from "./CloudExportDialog";
import { VideoPlayerWithAnnotations } from "../VideoPlayerWithAnnotations";
import { VideoTagManager } from "./VideoTagManager";
import { ShareDialog } from "../ShareDialog";
import { VideoCompressionButton } from "../VideoCompressionButton";
import { VideoCardDetails } from "./VideoCardDetails";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

function formatBatchSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function estimateBatchSize(totalSize: number, quality: 'high' | 'medium' | 'low'): number {
  // Estimate based on target bitrate vs typical source bitrate
  const presetBitrates = { high: 2628, medium: 1596, low: 864 }; // video + audio kbps
  const targetKbps = presetBitrates[quality];
  const estimatedSourceKbps = Math.max(targetKbps * 1.5, 8000);
  const ratio = Math.min(0.95, targetKbps / estimatedSourceKbps);
  return Math.round(totalSize * ratio);
}

function estimateBatchSavings(quality: 'high' | 'medium' | 'low'): number {
  const presetBitrates = { high: 2628, medium: 1596, low: 864 };
  const targetKbps = presetBitrates[quality];
  const estimatedSourceKbps = Math.max(targetKbps * 1.5, 8000);
  const ratio = Math.min(0.95, targetKbps / estimatedSourceKbps);
  return Math.round((1 - ratio) * 100);
}

export function VideoList() {
  const [editingVideoId, setEditingVideoId] = useState<number | null>(null);
  const [exportingVideoId, setExportingVideoId] = useState<number | null>(null);
  const [cloudExportVideo, setCloudExportVideo] = useState<{ id: number; title: string } | null>(null);
  const [annotatingVideo, setAnnotatingVideo] = useState<{ id: number; fileId: number; url: string; title: string } | null>(null);
  const [selectedVideoIds, setSelectedVideoIds] = useState<number[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [tagFilterMode, setTagFilterMode] = useState<'AND' | 'OR'>('OR');
  const [playingVideoIds, setPlayingVideoIds] = useState<Set<number>>(new Set());
  const [shareVideo, setShareVideo] = useState<{ id: number; title: string } | null>(null);
  
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
  
  const { data: videosData, isLoading, refetch } = trpc.videos.list.useQuery({ 
    page, 
    pageSize, 
    sortBy, 
    search: debouncedSearch,
    tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    tagFilterMode: selectedTagIds.length > 1 ? tagFilterMode : undefined
  });
  const videos = videosData?.videos || [];
  const deleteMutation = trpc.videos.delete.useMutation();
  const batchDeleteMutation = trpc.videos.batchDelete.useMutation();
  const exportMutation = trpc.videoExport.export.useMutation();
  const batchExportMutation = trpc.videoExport.batchExport.useMutation();
  const batchExportWithAnnotationsMutation = trpc.videoExport.batchExportWithAnnotations.useMutation();
  const transcribeMutation = trpc.videoTranscription.transcribeVideo.useMutation();
  const linkVideoToFileMutation = trpc.videos.linkToFile.useMutation();
  const [transcribingVideos, setTranscribingVideos] = useState<Set<number>>(new Set());
  const [captioningVideos, setCaptioningVideos] = useState<Set<number>>(new Set());
  const generateCaptionsMutation = trpc.videoVisualCaptions.generateCaptions.useMutation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBatchCompressDialog, setShowBatchCompressDialog] = useState(false);
  const [batchCompressQuality, setBatchCompressQuality] = useState<'high' | 'medium' | 'low'>('medium');
  const [batchCompressing, setBatchCompressing] = useState(false);
  const batchCompressMutation = trpc.videoCompression.batchCompress.useMutation();
  
  // Tag management
  const { data: allTags = [] } = trpc.videoTags.list.useQuery();
  const createTagMutation = trpc.videoTags.create.useMutation();
  const assignTagMutation = trpc.videoTags.assignToVideo.useMutation();
  const removeTagMutation = trpc.videoTags.removeFromVideo.useMutation();
  const batchAssignTagMutation = trpc.videoTags.batchAssignToVideos.useMutation();
  const batchRemoveTagMutation = trpc.videoTags.batchRemoveFromVideos.useMutation();
  const [managingTagsForVideo, setManagingTagsForVideo] = useState<number | null>(null);
  const [showBatchTagDialog, setShowBatchTagDialog] = useState(false);
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

  const handleBatchExportWithAnnotations = async () => {
    if (selectedVideoIds.length === 0) {
      toast.error("Please select at least one video");
      return;
    }

    toast.info(`Processing ${selectedVideoIds.length} video(s) with annotations. This may take a few minutes...`);

    try {
      const result = await batchExportWithAnnotationsMutation.mutateAsync({
        videoIds: selectedVideoIds,
      });

      // Trigger download
      const link = document.createElement('a');
      link.href = result.url!;
      link.download = result.filename || 'exported-videos.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(
        `Exported ${result.processedCount} video(s) with annotations` +
        (result.failedCount ? ` (${result.failedCount} failed)` : '')
      );
      setSelectedVideoIds([]);
    } catch (error) {
      toast.error("Failed to export videos with annotations");
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

  const handleBatchCaptions = async () => {
    if (selectedVideoIds.length === 0) {
      toast.error("Please select at least one video");
      return;
    }

    const videosToCaption = videos.filter(v => selectedVideoIds.includes(v.id));
    const newCaptioning = new Set(captioningVideos);
    
    toast.info(`Starting visual captioning for ${videosToCaption.length} video(s)...`);

    let successCount = 0;
    let failCount = 0;

    for (const video of videosToCaption) {
      try {
        newCaptioning.add(video.id);
        setCaptioningVideos(new Set(newCaptioning));

        if (!video.fileId) {
          throw new Error('Video file ID not found');
        }
        await generateCaptionsMutation.mutateAsync({ fileId: video.fileId, intervalSeconds: 3 });
        
        newCaptioning.delete(video.id);
        setCaptioningVideos(new Set(newCaptioning));
        successCount++;
        
        toast.success(`Captioned: ${video.title}`);
      } catch (error: any) {
        newCaptioning.delete(video.id);
        setCaptioningVideos(new Set(newCaptioning));
        failCount++;
        toast.error(`Failed to caption ${video.title}: ${error.message}`);
      }
    }

    setSelectedVideoIds([]);
    toast.success(`Batch captioning complete: ${successCount} succeeded${failCount > 0 ? `, ${failCount} failed` : ''}`);
  };

  const handleBatchTranscribe = async () => {
    if (selectedVideoIds.length === 0) {
      toast.error("Please select at least one video");
      return;
    }

    // Get the file IDs for selected videos
    const videosToTranscribe = videos.filter(v => selectedVideoIds.includes(v.id));
    const newTranscribing = new Set(transcribingVideos);
    
    toast.info(`Starting transcription for ${videosToTranscribe.length} video(s)...`);

    // Transcribe videos sequentially
    for (const video of videosToTranscribe) {
      try {
        newTranscribing.add(video.id);
        setTranscribingVideos(new Set(newTranscribing));

        if (!video.fileId) {
          throw new Error('Video file ID not found');
        }
        await transcribeMutation.mutateAsync({ fileId: video.fileId });
        
        newTranscribing.delete(video.id);
        setTranscribingVideos(new Set(newTranscribing));
        
        toast.success(`Transcribed: ${video.title}`);
      } catch (error: any) {
        newTranscribing.delete(video.id);
        setTranscribingVideos(new Set(newTranscribing));
        toast.error(`Failed to transcribe ${video.title}: ${error.message}`);
      }
    }

    setSelectedVideoIds([]);
    refetch();
    toast.success("Batch transcription complete");
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

  // Using formatDuration from @/lib/videoUtils

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

        {/* Sort and Filter Controls */}
        {videos && videos.length > 0 && (
          <div className="flex items-center gap-4">
            {/* Sort Dropdown */}
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
            
            {/* Multi-Tag Filter */}
            {allTags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Filter by tags:</span>
                <div className="flex items-center gap-2">
                  {/* Tag selection badges */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {selectedTagIds.length === 0 ? (
                      <Badge variant="outline" className="text-xs">All videos</Badge>
                    ) : (
                      selectedTagIds.map((tagId) => {
                        const tag = allTags.find(t => t.id === tagId);
                        if (!tag) return null;
                        return (
                          <Badge
                            key={tagId}
                            style={{ backgroundColor: tag.color || '#3b82f6' }}
                            className="text-white flex items-center gap-1 pr-1 text-xs cursor-pointer"
                            onClick={() => {
                              setSelectedTagIds(prev => prev.filter(id => id !== tagId));
                              setPage(1);
                            }}
                          >
                            {tag.name}
                            <X className="h-3 w-3" />
                          </Badge>
                        );
                      })
                    )}
                  </div>
                  
                  {/* Add tag dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        <Plus className="h-3 w-3 mr-1" />
                        Add Tag
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Select Tags to Filter</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {allTags.map((tag) => {
                        const isSelected = selectedTagIds.includes(tag.id);
                        return (
                          <DropdownMenuItem
                            key={tag.id}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTagIds(prev => prev.filter(id => id !== tag.id));
                              } else {
                                setSelectedTagIds(prev => [...prev, tag.id]);
                              }
                              setPage(1);
                            }}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: tag.color || '#3b82f6' }}
                              />
                              <span className="flex-1">{tag.name}</span>
                              {isSelected && <span className="text-primary">✓</span>}
                            </div>
                          </DropdownMenuItem>
                        );
                      })}
                      {selectedTagIds.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedTagIds([]);
                              setPage(1);
                            }}
                            className="text-destructive"
                          >
                            Clear All Filters
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  
                  {/* AND/OR toggle (only show when 2+ tags selected) */}
                  {selectedTagIds.length > 1 && (
                    <Select value={tagFilterMode} onValueChange={(value: 'AND' | 'OR') => {
                      setTagFilterMode(value);
                      setPage(1);
                    }}>
                      <SelectTrigger className="w-[100px] h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OR">Any tag</SelectItem>
                        <SelectItem value="AND">All tags</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            )}
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
              className="h-2.5 w-2.5 md:h-3 md:w-3 scale-[0.6] md:scale-75 cursor-pointer"
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
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Export Videos</DropdownMenuLabel>
                <DropdownMenuItem 
                  onClick={handleBatchExportWithAnnotations}
                  disabled={batchExportWithAnnotationsMutation.isPending}
                >
                  {batchExportWithAnnotationsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Package className="h-4 w-4 mr-2" />
                  )}
                  Videos with Annotations (ZIP)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
              {/* Batch Tag Button */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={batchAssignTagMutation.isPending}
                  >
                    {batchAssignTagMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Tag className="h-4 w-4 mr-2" />
                    )}
                    Tag
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                  <DropdownMenuLabel>Add Tag to Selected</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {allTags.length === 0 ? (
                    <DropdownMenuItem disabled>
                      No tags available
                    </DropdownMenuItem>
                  ) : (
                    allTags.map((tag) => (
                      <DropdownMenuItem
                        key={tag.id}
                        onClick={async () => {
                          try {
                            await batchAssignTagMutation.mutateAsync({
                              videoIds: selectedVideoIds,
                              tagId: tag.id,
                            });
                            toast.success(`Added "${tag.name}" to ${selectedVideoIds.length} video(s)`);
                            refetch();
                          } catch (error) {
                            toast.error("Failed to add tag");
                          }
                        }}
                      >
                        <div
                          className="w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: tag.color || '#3b82f6' }}
                        />
                        {tag.name}
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Remove Tag from Selected</DropdownMenuLabel>
                  {allTags.length === 0 ? (
                    <DropdownMenuItem disabled>
                      No tags available
                    </DropdownMenuItem>
                  ) : (
                    allTags.map((tag) => (
                      <DropdownMenuItem
                        key={`remove-${tag.id}`}
                        onClick={async () => {
                          try {
                            await batchRemoveTagMutation.mutateAsync({
                              videoIds: selectedVideoIds,
                              tagId: tag.id,
                            });
                            toast.success(`Removed "${tag.name}" from ${selectedVideoIds.length} video(s)`);
                            refetch();
                          } catch (error) {
                            toast.error("Failed to remove tag");
                          }
                        }}
                        className="text-destructive"
                      >
                        <X className="h-3 w-3 mr-2" />
                        {tag.name}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                variant="default"
                onClick={handleBatchTranscribe}
                disabled={transcribeMutation.isPending || transcribingVideos.size > 0}
              >
                {transcribingVideos.size > 0 ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Mic className="h-4 w-4 mr-2" />
                )}
                Transcribe All
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={handleBatchCaptions}
                disabled={generateCaptionsMutation.isPending || captioningVideos.size > 0}
              >
                {captioningVideos.size > 0 ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Captions className="h-4 w-4 mr-2" />
                )}
                Caption All
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => setShowBatchCompressDialog(true)}
                disabled={batchCompressing}
              >
                {batchCompressing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Shrink className="h-4 w-4 mr-2" />
                )}
                Compress
              </Button>
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
          <Card key={video.id} className="relative p-4 space-y-3 group" data-video-id={video.id}>
            {/* Selection Checkbox */}
            <div className="absolute top-2 left-2 z-10">
              <input
                type="checkbox"
                checked={selectedVideoIds.includes(video.id)}
                onChange={() => handleToggleSelection(video.id)}
                className="h-2.5 w-2.5 md:h-3 md:w-3 cursor-pointer scale-[0.6] md:scale-75"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Video Thumbnail/Player - Click to play/pause */}
            <div 
              className="relative aspect-video bg-black rounded-lg overflow-hidden"
            >
              {/* Always show video element with native controls */}
              <video
                src={video.url}
                className="w-full h-full object-contain"
                controls
                preload="metadata"
                poster={(video as any).thumbnailUrl || undefined}
              />
              {/* Duration badge */}
              {video.duration > 0 && (
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded pointer-events-none">
                  {formatDuration(video.duration)}
                </div>
              )}
            </div>

            {/* Video Info */}
            <div className="space-y-2">
              {/* Title with draft badge */}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium truncate flex-1">
                  {video.title || video.filename}
                </h3>
                {video.exportStatus && (
                  <Badge
                    variant={
                      video.exportStatus === "completed"
                        ? "default"
                        : video.exportStatus === "processing"
                          ? "secondary"
                          : "outline"
                    }
                    className="text-xs shrink-0"
                  >
                    {video.exportStatus}
                  </Badge>
                )}
              </div>
              
              {/* Resolution, annotations, tags, and action buttons on same line */}
              <div className="flex items-center gap-1 flex-nowrap">
                {getResolutionLabel(video.width, video.height) && (
                  <Badge variant="outline" className="text-xs shrink-0 text-blue-600 border-blue-300">
                    {getResolutionLabel(video.width, video.height)}
                  </Badge>
                )}
                {(video.voiceAnnotationCount > 0 || video.visualAnnotationCount > 0) && (
                  <>
                    {video.voiceAnnotationCount > 0 && (
                      <Badge variant="outline" className="text-xs flex items-center gap-0.5 shrink-0">
                        <Mic className="h-3 w-3" />
                        {video.voiceAnnotationCount}
                      </Badge>
                    )}
                    {video.visualAnnotationCount > 0 && (
                      <Badge variant="outline" className="text-xs flex items-center gap-0.5 shrink-0">
                        <PenLine className="h-3 w-3" />
                        {video.visualAnnotationCount}
                      </Badge>
                    )}
                  </>
                )}
                <VideoTagManager videoId={video.id} onTagsChange={refetch} />
                <VideoCompressionButton fileId={video.fileId} />
                
                {/* Action buttons inline - removed Play button, added download/delete */}
                <div className="flex items-center gap-1 ml-auto shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                    onClick={async () => {
                      if (video.fileId) {
                        setAnnotatingVideo({ id: video.id, fileId: video.fileId, url: video.url, title: video.title || video.filename });
                      } else {
                        // Try to create a file record for this video
                        try {
                          toast.info("Setting up annotations for this video...");
                          const result = await linkVideoToFileMutation.mutateAsync({ videoId: video.id });
                          if (result.fileId) {
                            setAnnotatingVideo({ id: video.id, fileId: result.fileId, url: video.url, title: video.title || video.filename });
                            refetch();
                          }
                        } catch (error) {
                          toast.error("Failed to enable annotations. Please try again.");
                        }
                      }
                    }}
                    title="Annotate (Voice, Drawing, Text)"
                  >
                    <MessageSquare className="h-2.5 w-2.5 mr-0.5" />
                    Annotate
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5"
                        disabled={
                          exportingVideoId === video.id ||
                          video.exportStatus === "processing"
                        }
                        title="Export video with presets"
                      >
                        {exportingVideoId === video.id ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <>
                            <Download className="h-2.5 w-2.5" />
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
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5"
                      onClick={() => setCloudExportVideo({ id: video.id, title: video.title || "video" })}
                      title="Upload to cloud storage"
                    >
                      <Cloud className="h-2.5 w-2.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5"
                    onClick={() => setShareVideo({ id: video.id, title: video.title || video.filename })}
                    title="Share video"
                  >
                    <Share2 className="h-2.5 w-2.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(video.id)}
                    disabled={deleteMutation.isPending}
                    title="Delete video"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </Button>
                </div>
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

              {/* Transcript, Captions, and Matched Files */}
              <VideoCardDetails
                videoId={video.id}
                fileId={video.fileId}
                hasTranscript={!!video.transcript}
              />
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
              videoTitle={annotatingVideo.title}
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

      {/* Batch Compress Dialog */}
      <Dialog open={showBatchCompressDialog} onOpenChange={setShowBatchCompressDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shrink className="h-5 w-5" />
              Batch Compress {selectedVideoIds.length} Video{selectedVideoIds.length !== 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription>
              Compress selected videos using FFmpeg on the server. Audio is fully preserved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Total size info */}
            {(() => {
              const selectedVideos = videos.filter(v => selectedVideoIds.includes(v.id));
              const totalSize = selectedVideos.reduce((sum, v) => {
                const file = v as any;
                return sum + (file.fileSize || 0);
              }, 0);
              const videoCount = selectedVideos.filter(v => v.fileId).length;
              return (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    Size Estimate
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Videos to compress</span>
                      <span className="font-mono">{videoCount}</span>
                    </div>
                    {totalSize > 0 && (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Total current size</span>
                          <span className="font-mono">{formatBatchSize(totalSize)}</span>
                        </div>
                        <div className="flex items-center justify-center">
                          <ArrowDown className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Estimated after</span>
                          <span className="font-mono text-green-600">
                            ~{formatBatchSize(estimateBatchSize(totalSize, batchCompressQuality))}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Estimated savings</span>
                          <span className="font-mono text-green-600">
                            ~{estimateBatchSavings(batchCompressQuality)}%
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Quality selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Compression Quality</label>
              <Select
                value={batchCompressQuality}
                onValueChange={(v) => setBatchCompressQuality(v as 'high' | 'medium' | 'low')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High Quality (1080p)</SelectItem>
                  <SelectItem value="medium">Medium Quality (720p)</SelectItem>
                  <SelectItem value="low">Low Quality (480p)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              Videos will be compressed sequentially in the background. You can leave this page and check back later.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchCompressDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setBatchCompressing(true);
                setShowBatchCompressDialog(false);
                try {
                  // Get fileIds for selected videos
                  const fileIds = videos
                    .filter(v => selectedVideoIds.includes(v.id) && v.fileId)
                    .map(v => v.fileId!);
                  
                  if (fileIds.length === 0) {
                    toast.error('No valid video files found in selection');
                    setBatchCompressing(false);
                    return;
                  }

                  const result = await batchCompressMutation.mutateAsync({
                    fileIds,
                    quality: batchCompressQuality,
                  });

                  toast.success(
                    `Compression started for ${result.startedCount} of ${result.totalCount} video(s)`,
                    {
                      description: result.startedCount < result.totalCount
                        ? `${result.totalCount - result.startedCount} video(s) were skipped (already compressing or not eligible)`
                        : 'Videos are being compressed in the background with FFmpeg.',
                    }
                  );
                  setSelectedVideoIds([]);
                } catch (error: any) {
                  toast.error('Batch compression failed', { description: error.message });
                } finally {
                  setBatchCompressing(false);
                }
              }}
              disabled={batchCompressing}
              className="gap-1.5"
            >
              {batchCompressing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Shrink className="h-4 w-4" />
              )}
              Compress All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      {shareVideo && (
        <ShareDialog
          open={!!shareVideo}
          onOpenChange={(open) => !open && setShareVideo(null)}
          itemType="video"
          itemId={shareVideo.id}
          itemName={shareVideo.title}
        />
      )}
    </>
  );
}
