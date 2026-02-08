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
  FolderOpen
} from "lucide-react";
import { useResumableUpload, ResumableUploadSession } from "@/hooks/useResumableUpload";
import { useUploadSettings } from "@/hooks/useUploadSettings";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

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
    pauseUpload,
    resumeUpload,
    cancelUpload,
    pauseAll,
    resumeAll,
    retryAllFailed,
    activeCount,
    pausedCount,
    errorCount,
    resumableCount,
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
    },
  });

  const autoCaptionMutation = trpc.videoVisualCaptions.autoCaptionVideo.useMutation();

  // Filter to show only active/paused sessions
  const resumableSessions = sessions.filter(
    s => s.status === "active" || s.status === "paused" || s.status === "error"
  );

  // Don't show if no resumable sessions
  if (isLoading || resumableSessions.length === 0) {
    return null;
  }

  const handleResumeClick = (session: ResumableUploadSession) => {
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
        if (file.name !== session.filename || file.size !== session.fileSize) {
          toast.error(`File doesn't match. Please select: ${session.filename} (${formatBytes(session.fileSize)})`, {
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
            </div>
            {resumableSessions.map((session) => (
              <div
                key={session.sessionToken}
                className="flex items-center gap-3 p-3 bg-background rounded-lg border"
              >
                {/* File icon */}
                <div className="flex-shrink-0">
                  {session.uploadType === "video" ? (
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
                  </div>

                  {/* Progress bar */}
                  <div className="mt-1">
                    <Progress 
                      value={session.progress} 
                      className="h-2"
                    />
                  </div>

                  {/* Status info */}
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>
                      {session.uploadedChunks}/{session.totalChunks} chunks
                    </span>
                    <span>
                      {formatBytes(session.uploadedBytes)} / {formatBytes(session.fileSize)}
                    </span>
                    {session.status === "active" && session.speed > 0 && (
                      <>
                        <span>{formatSpeed(session.speed)}</span>
                        <span>ETA: {formatEta(session.eta)}</span>
                      </>
                    )}
                    {session.status === "paused" && session.lastActivityAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Paused {formatTimeAgo(session.lastActivityAt)}
                      </span>
                    )}
                    {session.status === "error" && (
                      <span className="flex items-center gap-1 text-red-500">
                        <AlertCircle className="h-3 w-3" />
                        {session.error || "Error"}
                      </span>
                    )}
                  </div>

                  {/* Hint when file needs re-selection */}
                  {!session.file && session.status === "paused" && (
                    <div className="mt-1 text-xs text-amber-500 flex items-center gap-1">
                      <FolderOpen className="h-3 w-3" />
                      Tap resume to re-select file and continue
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1">
                  {session.status === "active" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        pauseUpload(session.sessionToken);
                      }}
                    >
                      <Pause className="h-4 w-4" />
                    </Button>
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
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

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
              <div className="bg-muted rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2">
                  {pendingResumeSession.uploadType === "video" ? (
                    <FileVideo className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <File className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm truncate">{pendingResumeSession.filename}</span>
                </div>
                <div className="text-xs text-muted-foreground pl-7">
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
