import { useState } from "react";
import { useUploadManager, formatSpeed, formatEta } from "@/contexts/UploadManagerContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Video, 
  ChevronDown, 
  ChevronUp, 
  Pause, 
  Play,
  RefreshCw,
  Clock,
  Calendar,
  FileIcon,
  FolderOpen
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

export function GlobalUploadProgress() {
  const {
    uploads,
    activeUploads,
    isUploading,
    totalProgress,
    cancelUpload,
    pauseUpload,
    resumeUpload,
    removeUpload,
    clearCompleted,
    retryUpload,
    scheduleUpload,
    cancelSchedule,
    resumeInterruptedUpload,
    completedCount,
    uploadingCount,
    pendingCount,
    pausedCount,
    scheduledCount,
    retryingCount,
    interruptedCount,
  } = useUploadManager();

  // Fetch resumable upload sessions from server
  const { data: resumableSessions } = trpc.resumableUpload.listActiveSessions.useQuery(
    undefined,
    { refetchInterval: 5000 } // Poll every 5 seconds
  );

  const [, navigate] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleUploadId, setScheduleUploadId] = useState<string | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");

  // Filter resumable sessions to only active/paused ones
  const activeResumableSessions = (resumableSessions || []).filter(
    (s: any) => s.status === "active" || s.status === "paused" || s.status === "finalizing" || s.status === "error"
  );

  const resumableCount = activeResumableSessions.length;

  // Don't show if no uploads of either kind
  if (uploads.length === 0 && resumableCount === 0) {
    return null;
  }

  const hasActiveUploads = activeUploads.length > 0 || resumableCount > 0;
  const totalUploads = uploads.length + resumableCount;
  const finishedUploads = uploads.filter(u => u.status === 'completed' || u.status === 'error' || u.status === 'cancelled').length;

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatScheduledTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleString([], { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const openScheduleDialog = (uploadId: string) => {
    setScheduleUploadId(uploadId);
    // Default to 1 hour from now
    const defaultTime = new Date(Date.now() + 60 * 60 * 1000);
    setScheduleTime(defaultTime.toISOString().slice(0, 16));
    setScheduleDialogOpen(true);
  };

  const handleScheduleConfirm = () => {
    if (scheduleUploadId && scheduleTime) {
      const scheduledTimestamp = new Date(scheduleTime).getTime();
      if (scheduledTimestamp > Date.now()) {
        scheduleUpload(scheduleUploadId, scheduledTimestamp);
      }
    }
    setScheduleDialogOpen(false);
    setScheduleUploadId(null);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploading':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <X className="h-4 w-4 text-muted-foreground" />;
      case 'retrying':
        return <RefreshCw className="h-4 w-4 animate-spin text-orange-500" />;
      case 'scheduled':
        return <Calendar className="h-4 w-4 text-blue-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'interrupted':
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      default:
        return null;
    }
  };

  // Compute overall progress including resumable sessions
  const resumableActiveCount = activeResumableSessions.filter((s: any) => s.status === "active").length;
  const resumablePausedCount = activeResumableSessions.filter((s: any) => s.status === "paused").length;
  const allActiveCount = uploadingCount + resumableActiveCount;
  const allPausedCount = pausedCount + resumablePausedCount;

  // Combined progress
  let combinedProgress = totalProgress;
  if (resumableCount > 0 && uploads.length === 0) {
    // Only resumable sessions - calculate their average progress
    const totalResumableProgress = activeResumableSessions.reduce((acc: number, s: any) => {
      return acc + (s.totalChunks > 0 ? (s.uploadedChunks / s.totalChunks) * 100 : 0);
    }, 0);
    combinedProgress = totalResumableProgress / resumableCount;
  } else if (resumableCount > 0 && uploads.length > 0) {
    // Mix of both - weighted average
    const totalItems = uploads.length + resumableCount;
    const resumableAvg = activeResumableSessions.reduce((acc: number, s: any) => {
      return acc + (s.totalChunks > 0 ? (s.uploadedChunks / s.totalChunks) * 100 : 0);
    }, 0) / resumableCount;
    combinedProgress = (totalProgress * uploads.length + resumableAvg * resumableCount) / totalItems;
  }

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "relative gap-2 px-3",
              hasActiveUploads && "text-primary"
            )}
          >
            {isUploading || resumableActiveCount > 0 ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : retryingCount > 0 ? (
              <RefreshCw className="h-4 w-4 animate-spin text-orange-500" />
            ) : allPausedCount > 0 ? (
              <Pause className="h-4 w-4 text-yellow-500" />
            ) : scheduledCount > 0 ? (
              <Calendar className="h-4 w-4 text-blue-500" />
            ) : completedCount > 0 ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : resumableCount > 0 ? (
              <RefreshCw className="h-4 w-4 text-amber-500" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            
            {hasActiveUploads && (
              <span className="text-sm font-medium">
                {Math.round(combinedProgress)}%
              </span>
            )}
            
            {totalUploads > 0 && (
              <span className="text-xs text-muted-foreground">
                ({finishedUploads}/{totalUploads})
              </span>
            )}
            
            {/* Progress ring indicator */}
            {hasActiveUploads && (
              <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-muted overflow-hidden rounded-full">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${combinedProgress}%` }}
                />
              </div>
            )}
          </Button>
        </PopoverTrigger>
        
        <PopoverContent className="w-96 p-0" align="end">
          <div className="p-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span className="font-semibold">Uploads</span>
              {hasActiveUploads && (
                <span className="text-xs text-muted-foreground">
                  ({allActiveCount > 0 && `${allActiveCount} uploading`}
                  {pendingCount > 0 && `${allActiveCount > 0 ? ', ' : ''}${pendingCount} pending`}
                  {allPausedCount > 0 && `, ${allPausedCount} paused`}
                  {retryingCount > 0 && `, ${retryingCount} retrying`}
                  {scheduledCount > 0 && `, ${scheduledCount} scheduled`})
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {finishedUploads > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={clearCompleted}
                >
                  Clear finished
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          
          {isExpanded && (
            <div className="max-h-80 overflow-y-auto">
              {uploads.length === 0 && resumableCount === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No uploads
                </div>
              ) : (
                <div className="divide-y">
                  {/* Resumable upload sessions (large files) */}
                  {activeResumableSessions.map((session: any) => {
                    const progress = session.totalChunks > 0 
                      ? (session.uploadedChunks / session.totalChunks) * 100 
                      : 0;
                    return (
                      <div key={session.sessionToken} className="p-3">
                        <div className="flex items-start gap-3">
                          {session.thumbnailUrl ? (
                            <div className="w-8 h-8 rounded overflow-hidden bg-muted flex-shrink-0 mt-0.5">
                              <img 
                                src={session.thumbnailUrl} 
                                alt={session.filename}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : session.uploadType === 'video' ? (
                            <Video className="h-8 w-8 text-muted-foreground flex-shrink-0 mt-0.5" />
                          ) : (
                            <FileIcon className="h-8 w-8 text-muted-foreground flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{session.filename}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatFileSize(Number(session.fileSize))}
                                  <span className="ml-1 text-amber-500">(resumable)</span>
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                {session.status === "active" ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                ) : session.status === "finalizing" ? (
                                  <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                                ) : session.status === "error" ? (
                                  <AlertCircle className="h-4 w-4 text-red-500" />
                                ) : (
                                  <Pause className="h-4 w-4 text-yellow-500" />
                                )}
                              </div>
                            </div>
                            
                            {/* Progress bar */}
                            <div className="mt-2">
                              <Progress 
                                value={progress} 
                                className={cn(
                                  "h-1.5", 
                                  session.status === 'paused' && "[&>div]:bg-yellow-500",
                                  session.status === 'finalizing' && "[&>div]:bg-blue-500"
                                )} 
                              />
                              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                <span>
                                  {session.status === 'finalizing' 
                                    ? 'Assembling file...' 
                                    : `${session.uploadedChunks}/${session.totalChunks} chunks (${Math.round(progress)}%)`
                                  }
                                </span>
                                <span>
                                  {formatFileSize(Number(session.uploadedBytes))} / {formatFileSize(Number(session.fileSize))}
                                </span>
                              </div>
                            </div>

                            {/* Error message for failed uploads */}
                            {session.status === "error" && (
                              <div className="mt-1">
                                <p className="text-xs text-red-500">Upload failed. Go to Files to retry or cancel.</p>
                              </div>
                            )}

                            {/* Hint to go to Files page for management */}
                            {(session.status === "paused" || session.status === "error") && (
                              <button
                                className="mt-1 text-xs text-amber-500 hover:text-amber-600 flex items-center gap-1 cursor-pointer"
                                onClick={() => {
                                  navigate("/");
                                  setIsOpen(false);
                                }}
                              >
                                <FolderOpen className="h-3 w-3" />
                                Go to Files to resume this upload
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Regular uploads */}
                  {uploads.map((upload) => (
                    <div key={upload.id} className="p-3">
                      <div className="flex items-start gap-3">
                        {upload.uploadType === 'video' ? (
                          <Video className="h-8 w-8 text-muted-foreground flex-shrink-0 mt-0.5" />
                        ) : (
                          <FileIcon className="h-8 w-8 text-muted-foreground flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{upload.filename}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(upload.fileSize)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {getStatusIcon(upload.status)}
                              
                              {/* Pause button for uploading */}
                              {upload.status === 'uploading' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => pauseUpload(upload.id)}
                                  title="Pause upload"
                                >
                                  <Pause className="h-3 w-3" />
                                </Button>
                              )}
                              
                              {/* Resume button for paused */}
                              {upload.status === 'paused' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => resumeUpload(upload.id)}
                                  title="Resume upload"
                                >
                                  <Play className="h-3 w-3" />
                                </Button>
                              )}
                              
                              {/* Retry/Resume button for errors */}
                              {upload.status === 'error' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => retryUpload(upload.id)}
                                  title={upload.sessionId && upload.pausedAtChunk ? `Resume from ${Math.round((upload.pausedAtChunk / Math.ceil(upload.fileSize / (1 * 1024 * 1024))) * 100)}%` : "Retry upload"}
                                >
                                  <RefreshCw className="h-3 w-3" />
                                </Button>
                              )}
                              
                              {/* Schedule button for pending/paused/error */}
                              {(upload.status === 'pending' || upload.status === 'paused' || upload.status === 'error') && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => openScheduleDialog(upload.id)}
                                  title="Schedule upload"
                                >
                                  <Calendar className="h-3 w-3" />
                                </Button>
                              )}
                              
                              {/* Cancel schedule button */}
                              {upload.status === 'scheduled' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => cancelSchedule(upload.id)}
                                  title="Start now"
                                >
                                  <Play className="h-3 w-3" />
                                </Button>
                              )}
                              
                              {/* Cancel button for active uploads */}
                              {(upload.status === 'pending' || upload.status === 'uploading' || upload.status === 'paused' || upload.status === 'retrying' || upload.status === 'scheduled') && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => cancelUpload(upload.id)}
                                  title="Cancel upload"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                              
                              {/* Resume button for interrupted uploads - opens file picker */}
                              {upload.status === 'interrupted' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.accept = upload.mimeType || '*/*';
                                    input.onchange = (e) => {
                                      const file = (e.target as HTMLInputElement).files?.[0];
                                      if (file) {
                                        if (file.size !== upload.fileSize) {
                                          // Allow anyway but warn
                                          console.warn(`[Resume] File size mismatch: expected ${upload.fileSize}, got ${file.size}`);
                                        }
                                        resumeInterruptedUpload(upload.id, file);
                                      }
                                    };
                                    input.click();
                                  }}
                                  title="Re-select file to resume upload"
                                >
                                  <Play className="h-3 w-3" />
                                </Button>
                              )}
                              
                              {/* Cancel/remove button for interrupted */}
                              {upload.status === 'interrupted' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => removeUpload(upload.id)}
                                  title="Remove from list"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                              
                              {/* Remove button for finished uploads */}
                              {(upload.status === 'completed' || upload.status === 'error' || upload.status === 'cancelled') && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => removeUpload(upload.id)}
                                  title="Remove from list"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          {/* Progress bar for active uploads */}
                          {(upload.status === 'uploading' || upload.status === 'pending' || upload.status === 'paused') && (
                            <div className="mt-2">
                              <Progress 
                                value={upload.progress} 
                                className={cn("h-1.5", upload.status === 'paused' && "[&>div]:bg-yellow-500")} 
                              />
                              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                <span>
                                  {upload.status === 'pending' && 'Waiting...'}
                                  {upload.status === 'paused' && 'Paused'}
                                  {upload.status === 'uploading' && `${Math.round(upload.progress)}%`}
                                </span>
                                {upload.status === 'uploading' && upload.speed > 0 && (
                                  <span>{formatSpeed(upload.speed)} • ETA: {formatEta(upload.eta)}</span>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {/* Retry countdown */}
                          {upload.status === 'retrying' && (
                            <div className="mt-2">
                              <div className="flex items-center gap-2 text-xs text-orange-500">
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                <span>
                                  Retrying in {upload.retryCountdown}s... (Attempt {upload.retryCount}/3)
                                </span>
                              </div>
                              {upload.error && (
                                <p className="text-xs text-muted-foreground mt-1 truncate" title={upload.error}>
                                  {upload.error}
                                </p>
                              )}
                            </div>
                          )}
                          
                          {/* Scheduled time */}
                          {upload.status === 'scheduled' && upload.scheduledFor && (
                            <div className="mt-2">
                              <div className="flex items-center gap-2 text-xs text-blue-500">
                                <Calendar className="h-3 w-3" />
                                <span>Scheduled for {formatScheduledTime(upload.scheduledFor)}</span>
                              </div>
                            </div>
                          )}
                          
                          {/* Error message */}
                          {upload.status === 'error' && (
                            <div className="mt-1">
                              {upload.error && (
                                <p className="text-xs text-red-500 truncate" title={upload.error}>
                                  {upload.error}
                                </p>
                              )}
                              {upload.sessionId && upload.pausedAtChunk !== undefined && upload.pausedAtChunk > 0 && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {Math.round((upload.pausedAtChunk / Math.ceil(upload.fileSize / (1 * 1024 * 1024))) * 100)}% uploaded • Click retry to resume
                                </p>
                              )}
                            </div>
                          )}
                          
                          {/* Interrupted message with resume instructions */}
                          {upload.status === 'interrupted' && (
                            <div className="mt-2">
                              <Progress 
                                value={upload.progress} 
                                className="h-1.5 [&>div]:bg-amber-500" 
                              />
                              <div className="flex justify-between text-xs text-amber-500 mt-1">
                                <span>{Math.round(upload.progress)}% uploaded</span>
                                <span>{formatFileSize(upload.uploadedBytes)} / {formatFileSize(upload.fileSize)}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Upload interrupted. Tap ▶ to re-select the file and resume.
                              </p>
                            </div>
                          )}
                          
                          {/* Cancelled message */}
                          {upload.status === 'cancelled' && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Cancelled
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Summary footer when collapsed */}
          {!isExpanded && hasActiveUploads && (
            <div className="p-3 border-t">
              <Progress value={combinedProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {allActiveCount > 0 && `${allActiveCount} uploading`}
                {pendingCount > 0 && `${allActiveCount > 0 ? ', ' : ''}${pendingCount} pending`}
                {allPausedCount > 0 && `, ${allPausedCount} paused`}
                {retryingCount > 0 && `, ${retryingCount} retrying`}
                {scheduledCount > 0 && `, ${scheduledCount} scheduled`}
              </p>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Upload</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-time">Start upload at</Label>
              <Input
                id="schedule-time"
                type="datetime-local"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              The upload will automatically start at the scheduled time. This is useful for uploading large files during off-peak hours.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleScheduleConfirm}>
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
