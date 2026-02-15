import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Upload, 
  X, 
  Play, 
  Pause, 
  RefreshCw, 
  Clock, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileVideo,
  File,
  FolderOpen,
  Wifi,
  WifiOff,
  Timer,
  CalendarClock,
  Pin,
  PinOff,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
} from "lucide-react";
import { useResumableUpload, ResumableUploadSession, NetworkQuality } from "@/hooks/useResumableUpload";
import { UploadSpeedGraph, useAggregatedUploadSpeed } from "@/components/UploadSpeedGraph";
import { useUploadSettings } from "@/hooks/useUploadSettings";
import UploadSettings from "@/components/UploadSettings";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { extractVideoThumbnail } from "@/lib/videoThumbnail";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatEta(seconds: number): string {
  if (!seconds || !isFinite(seconds) || seconds < 0) return "--:--";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatScheduledTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = timestamp - now;
  if (diffMs <= 0) return "now";
  const diffMins = Math.ceil(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  const remainMins = diffMins % 60;
  return `${diffHours}h ${remainMins}m`;
}

function NetworkQualityBadge({ quality }: { quality: NetworkQuality }) {
  if (quality === 'unknown') return null;
  
  const config = {
    good: { color: 'text-green-500', bg: 'bg-green-500/10', label: 'Good', icon: Wifi },
    fair: { color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Fair', icon: Wifi },
    poor: { color: 'text-red-500', bg: 'bg-red-500/10', label: 'Poor', icon: WifiOff },
  }[quality];
  
  const Icon = config.icon;
  
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.color} ${config.bg}`}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </span>
  );
}

interface ResumableUploadsBannerProps {
  onUploadComplete?: () => void;
}

export function ResumableUploadsBanner({ onUploadComplete }: ResumableUploadsBannerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [resumingSessionToken, setResumingSessionToken] = useState<string | null>(null);
  const [showFileSelectDialog, setShowFileSelectDialog] = useState(false);
  const [pendingResumeSession, setPendingResumeSession] = useState<ResumableUploadSession | null>(null);
  const { settings: uploadSettings } = useUploadSettings();

  const {
    sessions,
    isLoading,
    liveSpeedMapRef,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    clearAllSessions,
    pauseAll,
    resumeAll,
    retryAllFailed,
    scheduleRetry,
    cancelScheduledRetry,
    activeCount,
    pausedCount,
    errorCount,
    resumableCount,
    networkQuality,
    speedLimit,
    concurrency,
    setSpeedLimit,
    setConcurrency,
    pinUpload,
    unpinUpload,
    reorderUploads,
  } = useResumableUpload({
    autoResume: true,
    chunkDelayMs: uploadSettings.chunkDelayMs,
    onComplete: (_session, result) => {
      onUploadComplete?.();
      // Auto-generate visual captions for uploaded videos
      if (result?.fileId) {
        autoCaptionMutation.mutate(
          { fileId: result.fileId },
          {
            onSuccess: (data) => {
              if (data.queued) {
                toast.info("Visual captions are being generated in the background", {
                  description: "You'll see them when you open the video.",
                  duration: 4000,
                });
              }
            },
            onError: () => {
              console.warn("Auto-caption failed for file", result.fileId);
            },
          }
        );
      }
      // Generate and save video thumbnail for video files
      if (result?.fileId && result?.url && _session.mimeType?.startsWith('video/')) {
        (async () => {
          try {
            const thumbnailDataUrl = await extractVideoThumbnail(result.url);
            if (thumbnailDataUrl) {
              saveThumbnailMutation.mutate(
                { fileId: result.fileId, thumbnailDataUrl },
                {
                  onSuccess: () => {
                    console.log('[Thumbnail] Saved thumbnail for file', result.fileId);
                  },
                  onError: (err) => {
                    console.warn('[Thumbnail] Failed to save thumbnail:', err);
                  },
                }
              );
            }
          } catch (err) {
            console.warn('[Thumbnail] Failed to extract thumbnail:', err);
          }
        })();
      }
    },
  });

  const autoCaptionMutation = trpc.videoVisualCaptions.autoCaptionVideo.useMutation();
  const saveThumbnailMutation = trpc.files.saveThumbnail.useMutation();

  // Filter to show only active/paused sessions
  const resumableSessions = sessions.filter(
    s => s.status === "active" || s.status === "paused" || s.status === "error" || s.status === "finalizing"
  );

  // Aggregated speed for the speed graph — uses liveSpeedMapRef as authoritative source
  const { totalSpeed, isActive: hasActiveUploads } = useAggregatedUploadSpeed(sessions, liveSpeedMapRef);

  // Don't show if no resumable sessions
  if (isLoading || resumableSessions.length === 0) {
    return null;
  }

  const handleResumeClick = (session: ResumableUploadSession) => {
    // Cancel any scheduled retry when manually resuming
    if (session.scheduledRetryAt) {
      cancelScheduledRetry(session.sessionToken);
    }
    if (session.file) {
      // File is still in memory, resume directly
      resumeUpload(session.sessionToken, session.file);
    } else {
      // File not in memory - show dialog explaining they need to re-select the file
      setPendingResumeSession(session);
      setShowFileSelectDialog(true);
    }
  };

  const handleOpenFilePicker = () => {
    if (pendingResumeSession) {
      setResumingSessionToken(pendingResumeSession.sessionToken);
      // Set accept attribute based on file type
      if (fileInputRef.current) {
        const mimeType = pendingResumeSession.mimeType;
        if (mimeType.startsWith("video/")) {
          fileInputRef.current.accept = "video/*";
        } else if (mimeType.startsWith("image/")) {
          fileInputRef.current.accept = "image/*";
        } else if (mimeType.startsWith("audio/")) {
          fileInputRef.current.accept = "audio/*";
        } else {
          fileInputRef.current.accept = mimeType || "*/*";
        }
      }
      setShowFileSelectDialog(false);
      // Small delay to ensure dialog closes before picker opens
      setTimeout(() => {
        fileInputRef.current?.click();
      }, 100);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && resumingSessionToken) {
      const session = sessions.find(s => s.sessionToken === resumingSessionToken);
      if (session) {
        if (file.size !== session.fileSize) {
          toast.error(`File size doesn't match. Expected ${formatBytes(session.fileSize)} but got ${formatBytes(file.size)}. Please select the correct file.`, {
            duration: 5000,
          });
        } else {
          resumeUpload(resumingSessionToken, file);
          toast.success("Upload resuming from where it left off!");
        }
      }
    }
    setResumingSessionToken(null);
    setPendingResumeSession(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div id="resumable-uploads-banner" className="mb-4">
      <Card className="border-amber-500/50 bg-amber-500/5">
        <div 
          className="flex items-center justify-between p-3 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-amber-500" />
            <span className="font-medium text-amber-500">
              {resumableSessions.length} Resumable Upload{resumableSessions.length !== 1 ? "s" : ""}
            </span>
            <span className="text-sm text-muted-foreground">
              (uploads can continue from where they left off)
            </span>
            {/* Global network quality badge */}
            {activeCount > 0 && <NetworkQualityBadge quality={networkQuality} />}
          </div>
          <Button variant="ghost" size="sm">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {isExpanded && (
          <div className="px-3 pb-3 space-y-2">
            {/* Bulk action buttons */}
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              {activeCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    pauseAll();
                  }}
                  className="text-amber-500 border-amber-500 hover:bg-amber-500/10"
                >
                  <Pause className="h-4 w-4 mr-1" />
                  Pause All ({activeCount})
                </Button>
              )}
              {pausedCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    // For Resume All, we need to check if files are in memory
                    const pausedSessions = sessions.filter(s => s.status === "paused");
                    const allHaveFiles = pausedSessions.every(s => s.file);
                    if (allHaveFiles) {
                      resumeAll();
                    } else {
                      toast.info("Some uploads need their files re-selected. Please resume them individually.", {
                        duration: 4000,
                      });
                    }
                  }}
                  className="text-green-500 border-green-500 hover:bg-green-500/10"
                >
                  <Play className="h-4 w-4 mr-1" />
                  Resume All ({pausedCount})
                </Button>
              )}
              {errorCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    retryAllFailed();
                  }}
                  className="text-red-500 border-red-500 hover:bg-red-500/10"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Retry All Failed ({errorCount})
                </Button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <UploadSettings
                  speedLimit={speedLimit}
                  concurrency={concurrency}
                  onSpeedLimitChange={setSpeedLimit}
                  onConcurrencyChange={setConcurrency}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearAllSessions();
                  }}
                  className="text-muted-foreground border-muted-foreground/50 hover:bg-muted"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              </div>
            </div>
            {resumableSessions.map((session) => (
              <div
                key={session.sessionToken}
                className="flex items-center gap-3 p-3 bg-background rounded-lg border"
              >
                {/* Priority pin indicator + move buttons */}
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                  {resumableSessions.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        const idx = resumableSessions.findIndex(s => s.sessionToken === session.sessionToken);
                        const globalIdx = sessions.findIndex(s => s.sessionToken === session.sessionToken);
                        if (idx > 0) reorderUploads(globalIdx, globalIdx - 1);
                      }}
                      disabled={resumableSessions.findIndex(s => s.sessionToken === session.sessionToken) === 0}
                      title="Move up"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-5 w-5 p-0 ${session.priority === 'high' ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (session.priority === 'high') {
                        unpinUpload(session.sessionToken);
                      } else {
                        pinUpload(session.sessionToken);
                      }
                    }}
                    title={session.priority === 'high' ? 'Unpin' : 'Pin to top'}
                  >
                    {session.priority === 'high' ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                  </Button>
                  {resumableSessions.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        const idx = resumableSessions.findIndex(s => s.sessionToken === session.sessionToken);
                        const globalIdx = sessions.findIndex(s => s.sessionToken === session.sessionToken);
                        if (idx < resumableSessions.length - 1) reorderUploads(globalIdx, globalIdx + 1);
                      }}
                      disabled={resumableSessions.findIndex(s => s.sessionToken === session.sessionToken) === resumableSessions.length - 1}
                      title="Move down"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {/* Thumbnail or file icon */}
                <div className="flex-shrink-0">
                  {session.thumbnailUrl ? (
                    <div className="w-14 h-10 rounded overflow-hidden bg-muted">
                      <img 
                        src={session.thumbnailUrl} 
                        alt={session.filename}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : session.uploadType === "video" ? (
                    <FileVideo className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <File className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>

                {/* File info and progress */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{session.filename}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(session.fileSize)}
                    </span>
                    {/* Per-session network quality badge when active */}
                    {session.status === "active" && session.networkQuality && (
                      <NetworkQualityBadge quality={session.networkQuality} />
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-1">
                    <Progress 
                      value={session.progress} 
                      className="h-2"
                    />
                  </div>

                  {/* Status info */}
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span>
                      {session.uploadedChunks}/{session.totalChunks} chunks
                    </span>
                    <span>
                      {formatBytes(session.uploadedBytes)} / {formatBytes(session.fileSize)}
                    </span>
                    {session.priority === 'high' && (
                      <span className="inline-flex items-center gap-0.5 text-amber-500">
                        <Pin className="h-2.5 w-2.5" />
                        Priority
                      </span>
                    )}
                    {session.status === "active" && (
                      <span className="inline-flex items-center gap-0.5 text-green-600">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        Verified
                      </span>
                    )}
                    {session.status === "active" && session.speed > 0 && (
                      <>
                        <span>{formatSpeed(session.speed)}</span>
                        <span>ETA: {formatEta(session.eta)}</span>
                      </>
                    )}
                    {session.status === "active" && session.error && (
                      <span className="flex items-center gap-1 text-amber-500">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        {session.error}
                      </span>
                    )}
                    {session.status === "paused" && session.error && (
                      <span className="flex items-center gap-1 text-amber-500">
                        <AlertCircle className="h-3 w-3" />
                        {session.error}
                      </span>
                    )}
                    {session.status === "paused" && !session.error && session.lastActivityAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Paused {formatTimeAgo(session.lastActivityAt)}
                      </span>
                    )}
                    {session.status === "finalizing" && (
                      <span className="flex items-center gap-1 text-blue-500">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Assembling and uploading to storage...
                      </span>
                    )}
                    {session.status === "error" && !session.scheduledRetryAt && (
                      <span className="flex items-center gap-1 text-red-500">
                        <AlertCircle className="h-3 w-3" />
                        {session.error || "Error"}
                      </span>
                    )}
                    {session.status === "error" && session.scheduledRetryAt && (
                      <span className="flex items-center gap-1 text-blue-500">
                        <CalendarClock className="h-3 w-3" />
                        Retry in {formatScheduledTime(session.scheduledRetryAt)}
                      </span>
                    )}
                  </div>

                  {/* Remote session indicator */}
                  {session.isRemoteSession && (
                    <div className="mt-1 text-xs text-blue-500 flex items-center gap-1">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Started on {session.deviceInfo || 'another device'} — select the same file to continue here
                    </div>
                  )}
                  {/* Hint when file needs re-selection */}
                  {!session.file && session.status === "paused" && !session.isRemoteSession && (
                    <div className="mt-1 text-xs text-amber-500 flex items-center gap-1">
                      <FolderOpen className="h-3 w-3" />
                      Tap resume to re-select file and continue
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1">
                  {session.status === "finalizing" ? (
                    <span className="text-xs text-blue-500 px-2">Finalizing...</span>
                  ) : session.status === "active" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        pauseUpload(session.sessionToken);
                      }}
                      title="Pause upload"
                    >
                      <Pause className="h-4 w-4" />
                    </Button>
                  ) : session.status === "error" ? (
                    <>
                      {/* Retry now button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResumeClick(session);
                        }}
                        className="text-amber-500 hover:text-amber-600"
                        title="Retry now"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      {/* Schedule retry dropdown */}
                      {!session.scheduledRetryAt ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-500 hover:text-blue-600"
                              title="Schedule retry"
                            >
                              <Timer className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => scheduleRetry(session.sessionToken, 5)}>
                              <Clock className="h-4 w-4 mr-2" />
                              Retry in 5 minutes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => scheduleRetry(session.sessionToken, 15)}>
                              <Clock className="h-4 w-4 mr-2" />
                              Retry in 15 minutes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => scheduleRetry(session.sessionToken, 30)}>
                              <Clock className="h-4 w-4 mr-2" />
                              Retry in 30 minutes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => scheduleRetry(session.sessionToken, 60)}>
                              <Clock className="h-4 w-4 mr-2" />
                              Retry in 1 hour
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelScheduledRetry(session.sessionToken);
                          }}
                          className="text-blue-500 hover:text-blue-600"
                          title="Cancel scheduled retry"
                        >
                          <CalendarClock className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResumeClick(session);
                      }}
                      className="text-green-500 hover:text-green-600"
                      title={session.file ? "Resume upload" : "Re-select file to resume"}
                    >
                      {session.file ? (
                        <Play className="h-4 w-4" />
                      ) : (
                        <FolderOpen className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      cancelUpload(session.sessionToken);
                    }}
                    className="text-red-500 hover:text-red-600"
                    title="Cancel upload"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Upload Speed Graph */}
            {(hasActiveUploads || totalSpeed > 0) && (
              <div className="mt-2">
                <UploadSpeedGraph
                  currentSpeed={totalSpeed}
                  isActive={hasActiveUploads}
                  label={resumableSessions.length === 1 ? resumableSessions[0]?.filename : `${resumableSessions.length} files`}
                />
              </div>
            )}

            {/* Hidden file input for resuming - no capture attribute so it opens file browser */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}
      </Card>

      {/* File re-selection dialog */}
      <Dialog open={showFileSelectDialog} onOpenChange={(open) => {
        if (!open) {
          setShowFileSelectDialog(false);
          setPendingResumeSession(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Re-select File to Resume Upload</DialogTitle>
            <DialogDescription>
              Since you closed the browser, we need you to select the same file again. 
              The upload will continue from where it left off — no data will be re-uploaded.
            </DialogDescription>
          </DialogHeader>
          
          {pendingResumeSession && (
            <div className="space-y-3 py-2">
              <div className="bg-muted rounded-lg p-3 space-y-2">
                {pendingResumeSession.thumbnailUrl && (
                  <div className="w-full max-w-[240px] mx-auto rounded overflow-hidden bg-black/20">
                    <img 
                      src={pendingResumeSession.thumbnailUrl} 
                      alt={pendingResumeSession.filename}
                      className="w-full h-auto object-contain"
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {!pendingResumeSession.thumbnailUrl && (
                    pendingResumeSession.uploadType === "video" ? (
                      <FileVideo className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <File className="h-5 w-5 text-muted-foreground" />
                    )
                  )}
                  <span className="font-medium text-sm truncate">{pendingResumeSession.filename}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Size: {formatBytes(pendingResumeSession.fileSize)} · 
                  Progress: {formatBytes(pendingResumeSession.uploadedBytes)} uploaded ({Math.round(pendingResumeSession.progress)}%)
                </div>
              </div>
              
              <p className="text-sm text-muted-foreground">
                Please select the exact same file: <strong>{pendingResumeSession.filename}</strong>
              </p>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowFileSelectDialog(false);
                setPendingResumeSession(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleOpenFilePicker}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Browse Files
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
