import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  File
} from "lucide-react";
import { useResumableUpload, ResumableUploadSession } from "@/hooks/useResumableUpload";
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

  const {
    sessions,
    isLoading,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    resumableCount,
  } = useResumableUpload({
    onComplete: () => {
      onUploadComplete?.();
    },
  });

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
      // Need user to re-select file
      setResumingSessionToken(session.sessionToken);
      fileInputRef.current?.click();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && resumingSessionToken) {
      const session = sessions.find(s => s.sessionToken === resumingSessionToken);
      if (session) {
        if (file.name !== session.filename || file.size !== session.fileSize) {
          toast.error(`Please select the original file: ${session.filename} (${formatBytes(session.fileSize)})`);
        } else {
          resumeUpload(resumingSessionToken, file);
        }
      }
    }
    setResumingSessionToken(null);
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
                    >
                      <Play className="h-4 w-4" />
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

            {/* Hidden file input for resuming */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
