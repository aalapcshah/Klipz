import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useRoute, useLocation } from "wouter";
import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Play,
  Pause,
  Clock,
  FileText,
  Captions,
  Files,
  Loader2,
  Edit3,
  Check,
  X,
  Tag,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Search,
  Download,
  Share2,
  Trash2,
  MessageSquare,
  Video,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { getResolutionLabel, formatDuration } from "@/lib/videoUtils";
import { VideoTagManager } from "@/components/videos/VideoTagManager";
import { AnnotationEditor } from "@/components/videos/AnnotationEditor";
import { ShareDialog } from "@/components/ShareDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoDetail() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/videos/:id");
  const videoId = params?.id ? parseInt(params.id) : null;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [activeTab, setActiveTab] = useState("transcript");
  const [shareVideo, setShareVideo] = useState<{ id: number; title: string } | null>(null);

  // Fetch video data
  const { data: videoData, isLoading, refetch } = trpc.videos.get.useQuery(
    { id: videoId! },
    { enabled: !!videoId && isAuthenticated }
  );

  // Fetch transcript
  const { data: transcript, isLoading: transcriptLoading } = trpc.videoTranscription.getTranscript.useQuery(
    { fileId: videoData?.fileId! },
    {
      enabled: !!videoData?.fileId,
      refetchInterval: (query) => {
        const data = query.state.data as any;
        return data?.status === "processing" ? 3000 : false;
      },
    }
  );

  // Fetch captions
  const { data: captions, isLoading: captionsLoading } = trpc.videoVisualCaptions.getCaptions.useQuery(
    { fileId: videoData?.fileId! },
    {
      enabled: !!videoData?.fileId,
      refetchInterval: (query) => {
        const data = query.state.data as any;
        return data?.status === "processing" ? 3000 : false;
      },
    }
  );

  // Fetch file matches
  const { data: fileMatches, isLoading: matchesLoading } = trpc.videoVisualCaptions.getFileMatches.useQuery(
    { fileId: videoData?.fileId! },
    { enabled: !!videoData?.fileId }
  );

  // Fetch file suggestions
  const { data: fileSuggestions, isLoading: suggestionsLoading } = trpc.videoTranscription.getFileSuggestions.useQuery(
    { fileId: videoData?.fileId! },
    { enabled: !!videoData?.fileId }
  );

  // Mutations
  const utils = trpc.useUtils();
  const updateMutation = trpc.videos.update.useMutation({
    onSuccess: () => {
      toast.success("Video updated");
      setIsEditing(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.videos.delete.useMutation({
    onSuccess: () => {
      toast.success("Video deleted");
      navigate("/videos");
    },
    onError: (err) => toast.error(err.message),
  });

  const retryTranscriptMutation = trpc.videoTranscription.transcribeVideo.useMutation({
    onSuccess: () => {
      if (videoData?.fileId) {
        utils.videoTranscription.getTranscript.invalidate({ fileId: videoData.fileId });
      }
      toast.success("Transcription restarted");
    },
    onError: (err) => toast.error(`Transcription failed: ${err.message}`),
  });

  const retryCaptionMutation = trpc.videoVisualCaptions.generateCaptions.useMutation({
    onSuccess: () => {
      if (videoData?.fileId) {
        utils.videoVisualCaptions.getCaptions.invalidate({ fileId: videoData.fileId });
      }
      toast.success("Captioning restarted");
    },
    onError: (err) => toast.error(`Captioning failed: ${err.message}`),
  });

  const generateVisualMatchesMutation = trpc.videoVisualCaptions.generateFileMatches.useMutation({
    onSuccess: () => {
      if (videoData?.fileId) {
        utils.videoVisualCaptions.getFileMatches.invalidate({ fileId: videoData.fileId });
      }
      toast.success("Visual matches generated");
    },
  });

  const generateTranscriptMatchesMutation = trpc.videoTranscription.generateFileSuggestions.useMutation({
    onSuccess: () => {
      if (videoData?.fileId) {
        utils.videoTranscription.getFileSuggestions.invalidate({ fileId: videoData.fileId });
      }
      toast.success("Transcript matches generated");
    },
  });

  // Seek video to timestamp
  const seekTo = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    }
  }, []);

  // Start editing
  const startEditing = useCallback(() => {
    if (videoData) {
      setEditTitle(videoData.title || videoData.filename);
      setEditDescription(videoData.description || "");
      setIsEditing(true);
    }
  }, [videoData]);

  // Save edits
  const saveEdits = useCallback(() => {
    if (videoId) {
      updateMutation.mutate({
        id: videoId,
        title: editTitle,
        description: editDescription,
      });
    }
  }, [videoId, editTitle, editDescription, updateMutation]);

  // Find matches
  const handleFindMatches = useCallback(() => {
    if (!videoData?.fileId) return;
    const hasCaptions = captions?.status === "completed";
    const hasTranscript = transcript?.status === "completed";

    if (hasCaptions) {
      generateVisualMatchesMutation.mutate({ fileId: videoData.fileId });
    }
    if (hasTranscript) {
      generateTranscriptMatchesMutation.mutate({ fileId: videoData.fileId });
    }
    if (!hasCaptions && !hasTranscript) {
      toast.error("Generate captions or transcript first");
    }
  }, [videoData, captions, transcript, generateVisualMatchesMutation, generateTranscriptMatchesMutation]);

  // Auth check
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Please log in to view this video.</p>
        <Button onClick={() => window.location.href = getLoginUrl()}>Log In</Button>
      </div>
    );
  }

  if (!videoId || !match) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Video not found.</p>
        <Button variant="outline" onClick={() => navigate("/videos")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Videos
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!videoData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Video not found or you don't have access.</p>
        <Button variant="outline" onClick={() => navigate("/videos")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Videos
        </Button>
      </div>
    );
  }

  const transcriptStatus = transcript?.status;
  const captionStatus = captions?.status;
  const hasAnyMatches = (fileMatches && fileMatches.length > 0) || (fileSuggestions && fileSuggestions.length > 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex items-center gap-4 h-14">
          <Button variant="ghost" size="sm" onClick={() => navigate("/videos")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Videos</span>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-medium truncate">
              {videoData.title || videoData.filename}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setShareVideo({ id: videoData.id, title: videoData.title || videoData.filename })}>
              <Share2 className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={videoData.url} download={videoData.filename}>Download Original</a>
                </DropdownMenuItem>
                {videoData.exportedUrl && (
                  <DropdownMenuItem asChild>
                    <a href={videoData.exportedUrl} download>Download Exported</a>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm("Delete this video permanently?")) {
                  deleteMutation.mutate({ id: videoData.id });
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content - Side by Side */}
      <div className="container py-4 md:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Column: Video Player + Metadata */}
          <div className="lg:col-span-3 space-y-4">
            {/* Video Player */}
            <div className="rounded-lg overflow-hidden bg-black aspect-video relative">
              <video
                ref={videoRef}
                src={videoData.url}
                controls
                className="w-full h-full object-contain"
                playsInline
                onError={(e) => {
                  const video = e.currentTarget;
                  // Check if the format is unsupported (common with WebM on iOS Safari)
                  if (video.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ||
                      video.error?.code === MediaError.MEDIA_ERR_DECODE) {
                    const container = video.parentElement;
                    if (container && !container.querySelector('.video-error-overlay')) {
                      const overlay = document.createElement('div');
                      overlay.className = 'video-error-overlay absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white p-4 text-center z-10';
                      overlay.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mb-3 opacity-50"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                        <p class="text-sm font-medium mb-1">Video format not supported</p>
                        <p class="text-xs text-gray-400 mb-3">This video was recorded in WebM format which may not play on this device.</p>
                        <a href="${videoData.url}" download="${videoData.filename}" class="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors">Download to play externally</a>
                      `;
                      container.appendChild(overlay);
                    }
                  }
                }}
              />
            </div>

            {/* Video Info */}
            <Card className="p-4 space-y-3">
              {isEditing ? (
                <div className="space-y-3">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Video title"
                    className="text-lg font-semibold"
                  />
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Add a description..."
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdits} disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                      <X className="h-4 w-4 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-xl font-semibold truncate">
                        {videoData.title || videoData.filename}
                      </h2>
                      {videoData.description && (
                        <p className="text-sm text-muted-foreground mt-1">{videoData.description}</p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={startEditing}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Metadata Badges */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(videoData.duration)}
                </Badge>
                {(videoData.width || videoData.height) && (
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                    {getResolutionLabel(videoData.width, videoData.height)}
                  </Badge>
                )}
                <Badge variant={videoData.exportStatus === "completed" ? "default" : "secondary"}>
                  {videoData.exportStatus}
                </Badge>
                {transcriptStatus === "completed" && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Transcribed
                  </Badge>
                )}
                {transcriptStatus === "processing" && (
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Transcribing
                  </Badge>
                )}
                {transcriptStatus === "failed" && (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1 cursor-pointer" onClick={() => {
                    if (videoData.fileId) retryTranscriptMutation.mutate({ fileId: videoData.fileId });
                  }}>
                    <AlertCircle className="h-3 w-3" /> Transcript Failed
                    <RotateCcw className="h-3 w-3 ml-1" />
                  </Badge>
                )}
                {captionStatus === "completed" && (
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Captioned
                  </Badge>
                )}
                {captionStatus === "processing" && (
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Captioning
                  </Badge>
                )}
                {captionStatus === "failed" && (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1 cursor-pointer" onClick={() => {
                    if (videoData.fileId) retryCaptionMutation.mutate({ fileId: videoData.fileId });
                  }}>
                    <AlertCircle className="h-3 w-3" /> Caption Failed
                    <RotateCcw className="h-3 w-3 ml-1" />
                  </Badge>
                )}
              </div>

              {/* Tags */}
              <div className="pt-1">
                <VideoTagManager videoId={videoData.id} onTagsChange={refetch} />
              </div>
            </Card>

            {/* Annotations Section - Below Video on Desktop */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Annotations</h3>
                <Badge variant="secondary" className="text-xs">{videoData.annotations?.length || 0}</Badge>
              </div>
              <AnnotationEditor videoId={videoData.id} />
            </Card>
          </div>

          {/* Right Column: Transcript, Captions, Matches */}
          <div className="lg:col-span-2 space-y-4">
            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              {!transcriptStatus && videoData.fileId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => retryTranscriptMutation.mutate({ fileId: videoData.fileId! })}
                  disabled={retryTranscriptMutation.isPending}
                >
                  {retryTranscriptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
                  Transcribe
                </Button>
              )}
              {!captionStatus && videoData.fileId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => retryCaptionMutation.mutate({ fileId: videoData.fileId! })}
                  disabled={retryCaptionMutation.isPending}
                >
                  {retryCaptionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Captions className="h-4 w-4 mr-1" />}
                  Caption
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleFindMatches}
                disabled={generateVisualMatchesMutation.isPending || generateTranscriptMatchesMutation.isPending}
              >
                {(generateVisualMatchesMutation.isPending || generateTranscriptMatchesMutation.isPending) ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Search className="h-4 w-4 mr-1" />
                )}
                Find Matches
              </Button>
            </div>

            {/* Tabbed Content */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="transcript" className="gap-1 text-xs sm:text-sm">
                  <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span>Transcript</span>
                </TabsTrigger>
                <TabsTrigger value="captions" className="gap-1 text-xs sm:text-sm">
                  <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Visual Desc.</span>
                  <span className="sm:hidden">Visual</span>
                </TabsTrigger>
                <TabsTrigger value="matches" className="gap-1 text-xs sm:text-sm">
                  <Files className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span>Matches</span>
                </TabsTrigger>
              </TabsList>

              {/* Transcript Tab */}
              <TabsContent value="transcript" className="mt-3">
                <Card className="p-4 max-h-[60vh] overflow-y-auto">
                  {transcriptLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : !transcript || transcript.status === "pending" ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No transcript yet.</p>
                      {videoData.fileId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3"
                          onClick={() => retryTranscriptMutation.mutate({ fileId: videoData.fileId! })}
                          disabled={retryTranscriptMutation.isPending}
                        >
                          {retryTranscriptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                          Generate Transcript
                        </Button>
                      )}
                    </div>
                  ) : transcript.status === "processing" ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Transcribing...</span>
                    </div>
                  ) : transcript.status === "failed" ? (
                    <div className="text-center py-8">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-400 opacity-70" />
                      <p className="text-sm text-red-400">Transcription failed.</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => {
                          if (videoData.fileId) retryTranscriptMutation.mutate({ fileId: videoData.fileId });
                        }}
                        disabled={retryTranscriptMutation.isPending}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" /> Retry
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {transcript.segments && transcript.segments.length > 0 ? (
                        transcript.segments.map((seg: any, i: number) => (
                          <div
                            key={i}
                            className="flex gap-3 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer transition-colors group"
                            onClick={() => seekTo(seg.startTime)}
                          >
                            <span className="text-xs text-muted-foreground font-mono whitespace-nowrap pt-0.5 group-hover:text-primary transition-colors">
                              {formatTimestamp(seg.startTime)}
                            </span>
                            <span className="text-sm leading-relaxed">{seg.text}</span>
                          </div>
                        ))
                      ) : transcript.fullText ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{transcript.fullText}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Transcript is empty.</p>
                      )}
                    </div>
                  )}
                </Card>
              </TabsContent>

              {/* Visual Descriptions Tab */}
              <TabsContent value="captions" className="mt-3">
                <Card className="p-4 max-h-[60vh] overflow-y-auto">
                  {captionsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : !captions || captions.status === "pending" ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No visual descriptions yet.</p>
                      {videoData.fileId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3"
                          onClick={() => retryCaptionMutation.mutate({ fileId: videoData.fileId! })}
                          disabled={retryCaptionMutation.isPending}
                        >
                          {retryCaptionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                          Generate Visual Descriptions
                        </Button>
                      )}
                    </div>
                  ) : captions.status === "processing" ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Analyzing video...</span>
                    </div>
                  ) : captions.status === "failed" ? (
                    <div className="text-center py-8">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-400 opacity-70" />
                      <p className="text-sm text-red-400">Visual analysis failed.</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => {
                          if (videoData.fileId) retryCaptionMutation.mutate({ fileId: videoData.fileId });
                        }}
                        disabled={retryCaptionMutation.isPending}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" /> Retry
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {captions.captions && captions.captions.length > 0 ? (
                        captions.captions.map((cap: any, i: number) => (
                          <div
                            key={i}
                            className="py-2 px-3 rounded border border-border/50 hover:bg-muted/50 cursor-pointer transition-colors group"
                            onClick={() => seekTo(cap.timestamp)}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-muted-foreground font-mono group-hover:text-primary transition-colors">
                                {formatTimestamp(cap.timestamp)}
                              </span>
                              {cap.entities && cap.entities.length > 0 && (
                                <div className="flex gap-1 flex-wrap">
                                  {cap.entities.map((entity: string, j: number) => (
                                    <Badge key={j} variant="secondary" className="text-[10px] px-1.5 py-0">
                                      {entity}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            <p className="text-sm leading-relaxed">{cap.caption}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No captions available.</p>
                      )}
                    </div>
                  )}
                </Card>
              </TabsContent>

              {/* Matches Tab */}
              <TabsContent value="matches" className="mt-3">
                <Card className="p-4 max-h-[60vh] overflow-y-auto">
                  {(matchesLoading || suggestionsLoading) ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : !hasAnyMatches ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Files className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No matched files yet.</p>
                      <p className="text-xs mt-1">Generate captions or transcript first, then click "Find Matches".</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={handleFindMatches}
                        disabled={generateVisualMatchesMutation.isPending || generateTranscriptMatchesMutation.isPending}
                      >
                        <Search className="h-4 w-4 mr-1" /> Find Matches
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Visual Matches */}
                      {fileMatches && fileMatches.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            <Sparkles className="h-3 w-3 inline mr-1" />
                            Visual Matches ({fileMatches.length})
                          </h4>
                          <div className="space-y-2">
                            {fileMatches.map((match: any, i: number) => (
                              <div
                                key={i}
                                className="py-2 px-3 rounded border border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                                onClick={() => seekTo(match.timestamp || 0)}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium truncate">{match.filename || match.fileKey}</span>
                                  {match.relevanceScore != null && (
                                    <Badge variant="secondary" className="text-xs ml-2 shrink-0">
                                      {Math.round(match.relevanceScore * 100)}%
                                    </Badge>
                                  )}
                                </div>
                                {match.matchReason && (
                                  <p className="text-xs text-muted-foreground">{match.matchReason}</p>
                                )}
                                {match.timestamp != null && (
                                  <span className="text-xs text-muted-foreground font-mono">
                                    @ {formatTimestamp(match.timestamp)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Transcript Suggestions */}
                      {fileSuggestions && fileSuggestions.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            <FileText className="h-3 w-3 inline mr-1" />
                            Transcript Matches ({fileSuggestions.length})
                          </h4>
                          <div className="space-y-2">
                            {fileSuggestions.map((sug: any, i: number) => (
                              <div
                                key={i}
                                className="py-2 px-3 rounded border border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                                onClick={() => seekTo(sug.videoTimestamp || 0)}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium truncate">{sug.filename || sug.fileKey}</span>
                                  {sug.relevanceScore != null && (
                                    <Badge variant="secondary" className="text-xs ml-2 shrink-0">
                                      {Math.round(sug.relevanceScore * 100)}%
                                    </Badge>
                                  )}
                                </div>
                                {sug.description && (
                                  <p className="text-xs text-muted-foreground">{sug.description}</p>
                                )}
                                {sug.transcriptExcerpt && (
                                  <p className="text-xs text-muted-foreground italic mt-1">"{sug.transcriptExcerpt}"</p>
                                )}
                                {sug.videoTimestamp != null && (
                                  <span className="text-xs text-muted-foreground font-mono">
                                    @ {formatTimestamp(sug.videoTimestamp)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              </TabsContent>
            </Tabs>

            {/* Video Info Card */}
            <Card className="p-4 text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Filename</span>
                <span className="font-mono truncate ml-4 max-w-[200px]">{videoData.filename}</span>
              </div>
              <div className="flex justify-between">
                <span>Created</span>
                <span>{new Date(videoData.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Updated</span>
                <span>{new Date(videoData.updatedAt).toLocaleDateString()}</span>
              </div>
              {videoData.fileId && (
                <div className="flex justify-between">
                  <span>File ID</span>
                  <span className="font-mono">{videoData.fileId}</span>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

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
    </div>
  );
}
