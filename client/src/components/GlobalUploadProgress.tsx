import { useState } from "react";
import { useUploadManager } from "@/contexts/UploadManagerContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Upload, X, CheckCircle2, AlertCircle, Loader2, Video, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function GlobalUploadProgress() {
  const {
    uploads,
    activeUploads,
    isUploading,
    totalProgress,
    cancelUpload,
    removeUpload,
    clearCompleted,
    completedCount,
    uploadingCount,
    pendingCount,
  } = useUploadManager();

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

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

  return (
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
          {hasActiveUploads ? (
            <Loader2 className="h-4 w-4 animate-spin" />
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
                ({uploadingCount} uploading, {pendingCount} pending)
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
                      <Video className="h-8 w-8 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{upload.filename}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(upload.file.size)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {upload.status === 'uploading' && (
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            )}
                            {upload.status === 'completed' && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                            {upload.status === 'error' && (
                              <AlertCircle className="h-4 w-4 text-red-500" />
                            )}
                            {upload.status === 'cancelled' && (
                              <X className="h-4 w-4 text-muted-foreground" />
                            )}
                            
                            {/* Cancel button for active uploads */}
                            {(upload.status === 'pending' || upload.status === 'uploading') && (
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
                        {(upload.status === 'uploading' || upload.status === 'pending') && (
                          <div className="mt-2">
                            <Progress value={upload.progress} className="h-1.5" />
                            <p className="text-xs text-muted-foreground mt-1">
                              {upload.status === 'pending' ? 'Waiting...' : `${Math.round(upload.progress)}%`}
                            </p>
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
              {uploadingCount} uploading, {pendingCount} pending
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
