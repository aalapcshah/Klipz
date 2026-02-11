import { useUploadManager, formatSpeed, formatEta } from "@/contexts/UploadManagerContext";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Pause,
  Play,
  ChevronDown,
  ChevronUp,
  FileIcon,
  Video,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * InlineUploadProgress - Shows a compact upload progress indicator
 * directly in the Files page when uploads are in progress.
 * Complements the nav bar GlobalUploadProgress and ResumableUploadsBanner.
 */
export function InlineUploadProgress() {
  const {
    uploads,
    activeUploads,
    isUploading,
    totalProgress,
    cancelUpload,
    pauseUpload,
    resumeUpload,
    retryUpload,
    uploadingCount,
    pendingCount,
    pausedCount,
    completedCount,
  } = useUploadManager();

  const [expanded, setExpanded] = useState(false);

  // Only show uploads that are relevant (not cancelled, not old completed ones)
  const visibleUploads = uploads.filter(
    (u) =>
      u.status === "uploading" ||
      u.status === "pending" ||
      u.status === "paused" ||
      u.status === "retrying" ||
      u.status === "error" ||
      (u.status === "completed" && Date.now() - u.createdAt < 60_000) // Show completed for 60s
  );

  if (visibleUploads.length === 0) return null;

  const activeCount = uploadingCount + pendingCount;
  const totalFiles = visibleUploads.length;
  const doneCount = visibleUploads.filter((u) => u.status === "completed").length;
  const errorCount = visibleUploads.filter((u) => u.status === "error").length;

  // Summary line
  let summaryText = "";
  if (activeCount > 0) {
    summaryText = `Uploading ${doneCount + 1} of ${totalFiles} file${totalFiles !== 1 ? "s" : ""}`;
  } else if (pausedCount > 0) {
    summaryText = `${pausedCount} upload${pausedCount !== 1 ? "s" : ""} paused`;
  } else if (errorCount > 0) {
    summaryText = `${errorCount} upload${errorCount !== 1 ? "s" : ""} failed`;
  } else if (doneCount > 0) {
    summaryText = `${doneCount} file${doneCount !== 1 ? "s" : ""} uploaded`;
  }

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* Summary bar */}
      <div
        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Icon */}
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
        ) : errorCount > 0 ? (
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
        ) : doneCount === totalFiles ? (
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
        ) : (
          <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        {/* Summary text */}
        <span className="text-sm font-medium flex-1 truncate">{summaryText}</span>

        {/* Overall progress */}
        {activeCount > 0 && (
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {Math.round(totalProgress)}%
          </span>
        )}

        {/* Expand/collapse */}
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0">
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Overall progress bar */}
      {activeCount > 0 && !expanded && (
        <Progress value={totalProgress} className="h-1 rounded-none" />
      )}

      {/* Expanded file list */}
      {expanded && (
        <div className="border-t divide-y max-h-60 overflow-y-auto">
          {visibleUploads.map((upload) => (
            <div key={upload.id} className="flex items-center gap-2.5 px-3 py-2">
              {/* File type icon */}
              {upload.mimeType.startsWith("video/") ? (
                <Video className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              )}

              {/* File info + progress */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm truncate">{upload.filename}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatFileSize(upload.fileSize)}
                  </span>
                </div>

                {/* Progress bar for active uploads */}
                {(upload.status === "uploading" || upload.status === "paused" || upload.status === "retrying") && (
                  <div className="mt-1">
                    <Progress value={upload.progress} className="h-1.5" />
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      <span>{Math.round(upload.progress)}%</span>
                      <span>{formatFileSize(upload.uploadedBytes)} / {formatFileSize(upload.fileSize)}</span>
                      {upload.status === "uploading" && upload.speed > 0 && (
                        <>
                          <span>{formatSpeed(upload.speed)}</span>
                          <span>ETA: {formatEta(upload.eta)}</span>
                        </>
                      )}
                      {upload.status === "paused" && (
                        <span className="text-yellow-500">Paused</span>
                      )}
                      {upload.status === "retrying" && (
                        <span className="text-orange-500">
                          Retrying{upload.retryCountdown ? ` in ${upload.retryCountdown}s` : "..."}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Status for completed/error */}
                {upload.status === "completed" && (
                  <span className="text-xs text-green-500 flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="h-3 w-3" /> Uploaded
                  </span>
                )}
                {upload.status === "error" && (
                  <span className="text-xs text-red-500 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="h-3 w-3" /> {upload.error || "Failed"}
                  </span>
                )}
                {upload.status === "pending" && (
                  <span className="text-xs text-muted-foreground mt-0.5">Queued</span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-0.5 shrink-0">
                {upload.status === "uploading" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      pauseUpload(upload.id);
                    }}
                    title="Pause"
                  >
                    <Pause className="h-3.5 w-3.5" />
                  </Button>
                )}
                {upload.status === "paused" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-green-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      resumeUpload(upload.id);
                    }}
                    title="Resume"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                )}
                {upload.status === "error" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-orange-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      retryUpload(upload.id);
                    }}
                    title="Retry"
                  >
                    <Loader2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                {(upload.status === "uploading" ||
                  upload.status === "paused" ||
                  upload.status === "pending" ||
                  upload.status === "error") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      cancelUpload(upload.id);
                    }}
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
