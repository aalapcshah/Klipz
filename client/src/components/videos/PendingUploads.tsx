import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  WifiOff,
  Wifi,
  Upload,
  Trash2,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  getPendingRecordings,
  getPendingCount,
  removeRecordingFromCache,
  updateRecordingStatus,
  clearAllPendingRecordings,
  isOnline,
  onConnectivityChange,
  type PendingRecording,
} from "@/lib/offlineRecordingCache";

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks

export function PendingUploads() {
  const [pendingCount, setPendingCount] = useState(0);
  const [recordings, setRecordings] = useState<PendingRecording[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [online, setOnline] = useState(isOnline());
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [autoRetrying, setAutoRetrying] = useState(false);

  // Chunked upload mutations
  const initUploadMutation = trpc.uploadChunk.initUpload.useMutation();
  const uploadChunkMutation = trpc.uploadChunk.uploadChunk.useMutation();
  const finalizeUploadMutation = trpc.uploadChunk.finalizeUpload.useMutation();

  const utils = trpc.useUtils();

  const refreshPending = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
      if (expanded || count > 0) {
        const recs = await getPendingRecordings();
        setRecordings(recs);
      }
    } catch {
      // IndexedDB not available
    }
  }, [expanded]);

  // Poll for pending recordings
  useEffect(() => {
    refreshPending();
    const interval = setInterval(refreshPending, 5000);
    return () => clearInterval(interval);
  }, [refreshPending]);

  // Listen for connectivity changes
  useEffect(() => {
    const cleanup = onConnectivityChange((isNowOnline) => {
      setOnline(isNowOnline);
      if (isNowOnline) {
        toast.success("Back online! You can now upload pending recordings.");
        refreshPending();
      } else {
        toast.warning("You're offline. Recordings will be saved locally.");
      }
    });
    return cleanup;
  }, [refreshPending]);

  // Auto-retry when coming back online
  useEffect(() => {
    if (online && pendingCount > 0 && !autoRetrying && !uploadingId) {
      handleAutoRetry();
    }
  }, [online, pendingCount]);

  const handleAutoRetry = async () => {
    if (autoRetrying || !online) return;
    setAutoRetrying(true);

    try {
      const pending = await getPendingRecordings();
      const retryable = pending.filter(
        (r) => r.status === "pending" || r.status === "failed"
      );

      for (const recording of retryable) {
        if (!isOnline()) break;
        await uploadSingleRecording(recording);
      }
    } finally {
      setAutoRetrying(false);
      refreshPending();
    }
  };

  const uploadSingleRecording = async (recording: PendingRecording) => {
    setUploadingId(recording.id);

    try {
      await updateRecordingStatus(recording.id, { status: "uploading" });
      await refreshPending();

      // Init chunked upload
      const { sessionId } = await initUploadMutation.mutateAsync({
        filename: recording.filename,
        mimeType: recording.blob.type || "video/webm",
        totalSize: recording.blob.size,
      });

      // Upload chunks
      const totalChunks = Math.ceil(recording.blob.size / CHUNK_SIZE);
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, recording.blob.size);
        const chunk = recording.blob.slice(start, end);

        const arrayBuffer = await chunk.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ""
          )
        );

        await uploadChunkMutation.mutateAsync({
          sessionId,
          chunkIndex: i,
          chunkData: base64,
          totalChunks,
        });
      }

      // Finalize upload
      const result = await finalizeUploadMutation.mutateAsync({
        sessionId,
      });

      if (result.url) {
        await removeRecordingFromCache(recording.id);
        toast.success(`Uploaded "${recording.filename}" successfully!`);
        utils.videos.list.invalidate();
      }
    } catch (error: any) {
      await updateRecordingStatus(recording.id, {
        status: "failed",
        retryCount: recording.retryCount + 1,
        lastRetryAt: Date.now(),
        errorMessage: error?.message || "Upload failed",
      });
      toast.error(`Failed to upload "${recording.filename}": ${error?.message || "Unknown error"}`);
    } finally {
      setUploadingId(null);
      await refreshPending();
    }
  };

  const handleRetryOne = async (recording: PendingRecording) => {
    if (!online) {
      toast.error("You're offline. Please wait for a network connection.");
      return;
    }
    await uploadSingleRecording(recording);
  };

  const handleDiscardOne = async (id: string) => {
    await removeRecordingFromCache(id);
    toast.success("Recording discarded");
    await refreshPending();
  };

  const handleDiscardAll = async () => {
    await clearAllPendingRecordings();
    toast.success("All pending recordings discarded");
    await refreshPending();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // Don't render if nothing pending
  if (pendingCount === 0 && online) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-medium cursor-pointer"
        >
          {!online ? (
            <WifiOff className="h-4 w-4 text-red-500" />
          ) : pendingCount > 0 ? (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          ) : (
            <Wifi className="h-4 w-4 text-green-500" />
          )}
          <span>
            {!online
              ? "Offline Mode"
              : pendingCount > 0
              ? `${pendingCount} Pending Upload${pendingCount !== 1 ? "s" : ""}`
              : "Online"}
          </span>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {pendingCount}
            </Badge>
          )}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>

        <div className="flex items-center gap-1.5">
          {pendingCount > 0 && online && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={handleAutoRetry}
              disabled={autoRetrying || !!uploadingId}
            >
              {autoRetrying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              Upload All
            </Button>
          )}
          {pendingCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1 text-destructive hover:text-destructive"
              onClick={handleDiscardAll}
              disabled={!!uploadingId}
            >
              <Trash2 className="h-3 w-3" />
              Discard All
            </Button>
          )}
        </div>
      </div>

      {/* Offline banner */}
      {!online && (
        <div className="rounded-md bg-yellow-500/10 border border-yellow-500/30 p-2 text-xs text-yellow-600">
          <p className="font-medium">You're currently offline</p>
          <p className="text-yellow-500/80 mt-0.5">
            Recordings will be saved locally and uploaded automatically when you're back online.
          </p>
        </div>
      )}

      {/* Expanded list */}
      {expanded && recordings.length > 0 && (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {recordings.map((rec) => (
            <div
              key={rec.id}
              className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border/30"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium truncate">{rec.filename}</span>
                  {rec.status === "uploading" && (
                    <Badge variant="outline" className="text-[9px] h-3.5 px-1 bg-blue-500/10 text-blue-600 border-blue-300 gap-0.5">
                      <Loader2 className="h-2 w-2 animate-spin" />
                      Uploading
                    </Badge>
                  )}
                  {rec.status === "failed" && (
                    <Badge variant="outline" className="text-[9px] h-3.5 px-1 bg-red-500/10 text-red-600 border-red-300 gap-0.5">
                      <AlertTriangle className="h-2 w-2" />
                      Failed
                    </Badge>
                  )}
                  {rec.status === "pending" && (
                    <Badge variant="outline" className="text-[9px] h-3.5 px-1 bg-yellow-500/10 text-yellow-600 border-yellow-300 gap-0.5">
                      <Clock className="h-2 w-2" />
                      Pending
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                  <span>{formatDuration(rec.duration)}</span>
                  <span>{formatSize(rec.blob.size)}</span>
                  <span>{formatTimeAgo(rec.createdAt)}</span>
                  {rec.retryCount > 0 && (
                    <span className="text-red-400">
                      {rec.retryCount} retries
                    </span>
                  )}
                </div>
                {rec.errorMessage && (
                  <p className="text-[9px] text-red-400 mt-0.5 truncate">
                    {rec.errorMessage}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => handleRetryOne(rec)}
                  disabled={rec.status === "uploading" || !online || !!uploadingId}
                  title="Retry upload"
                >
                  {rec.status === "uploading" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                  onClick={() => handleDiscardOne(rec.id)}
                  disabled={rec.status === "uploading"}
                  title="Discard recording"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Auto-retry progress */}
      {autoRetrying && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Auto-uploading pending recordings...
        </div>
      )}
    </div>
  );
}
