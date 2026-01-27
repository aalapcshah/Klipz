import { useState } from "react";
import { useUploadManager, formatSpeed, formatEta } from "@/contexts/UploadManagerContext";
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
  FileIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    completedCount,
    uploadingCount,
    pendingCount,
    pausedCount,
    scheduledCount,
    retryingCount,
  } = useUploadManager();

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleUploadId, setScheduleUploadId] = useState<string | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");

  // Don't show if no uploads
  if (uploads.length === 0) {
    return null;
  }

  const hasActiveUploads = activeUploads.length > 0;
  const totalUploads = uploads.length;
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
      default:
        return null;
    }
  };

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
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : retryingCount > 0 ? (
              <RefreshCw className="h-4 w-4 animate-spin text-orange-500" />
            ) : pausedCount > 0 ? (
              <Pause className="h-4 w-4 text-yellow-500" />
            ) : scheduledCount > 0 ? (
              <Calendar className="h-4 w-4 text-blue-500" />
            ) : completedCount > 0 ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            
            {hasActiveUploads && (
              <span className="text-sm font-medium">
                {Math.round(totalProgress)}%
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
                  style={{ width: `${totalProgress}%` }}
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
                  ({uploadingCount > 0 && `${uploadingCount} uploading`}
                  {pendingCount > 0 && `${uploadingCount > 0 ? ', ' : ''}${pendingCount} pending`}
                  {pausedCount > 0 && `, ${pausedCount} paused`}
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
              {uploads.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No uploads
                </div>
              ) : (
                <div className="divide-y">
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
                              
                              {/* Retry button for errors */}
                              {upload.status === 'error' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => retryUpload(upload.id)}
                                  title="Retry upload"
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
                          {upload.status === 'error' && upload.error && (
                            <p className="text-xs text-red-500 mt-1 truncate" title={upload.error}>
                              {upload.error}
                            </p>
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
              <Progress value={totalProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {uploadingCount > 0 && `${uploadingCount} uploading`}
                {pendingCount > 0 && `${uploadingCount > 0 ? ', ' : ''}${pendingCount} pending`}
                {pausedCount > 0 && `, ${pausedCount} paused`}
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
