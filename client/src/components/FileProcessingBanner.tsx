import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, CheckCircle2, RefreshCw, Image, HardDrive, Upload, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

interface FileProcessingBannerProps {
  fileId: number;
  onReady?: () => void;
  /** If true, show retry assembly and generate thumbnail actions */
  showActions?: boolean;
}

/** Human-readable labels for assembly phases */
const PHASE_LABELS: Record<string, string> = {
  idle: "Waiting to start",
  downloading: "Downloading chunks",
  uploading: "Uploading to storage",
  generating_thumbnail: "Generating thumbnail",
  complete: "Complete",
  failed: "Failed",
};

/** Format elapsed time as "Xm Ys" */
function formatElapsed(startedAtMs: number | null): string {
  if (!startedAtMs) return "";
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Shows a processing indicator when a file hasn't been fully assembled
 * to S3 after a chunked upload. The file is still accessible via streaming
 * URL, but assembly to S3 enables faster access and thumbnails.
 * 
 * Displays real-time progress: phase, chunk count, percentage, and elapsed time.
 * Also provides "Retry Assembly" and "Generate Thumbnail" actions.
 */
export function FileProcessingBanner({ fileId, onReady, showActions = true }: FileProcessingBannerProps) {
  const [wasStreaming, setWasStreaming] = useState(false);
  const [elapsedTick, setElapsedTick] = useState(0);

  const { data, isLoading, refetch } = trpc.files.checkFileReady.useQuery(
    { fileId },
    {
      refetchInterval: (query) => {
        const result = query.state.data;
        if (!result || result.assembled) return false;
        // Poll more frequently when assembly is in progress
        if (result.assembling) return 5000; // 5s during active assembly
        return 20000; // 20s when idle/waiting
      },
      staleTime: 3000,
    }
  );

  // Tick every second to update elapsed time display
  useEffect(() => {
    if (!data?.assembling) return;
    const timer = setInterval(() => setElapsedTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [data?.assembling]);

  const retryAssembly = trpc.files.retryAssembly.useMutation({
    onSuccess: (result) => {
      toast.success("Assembly Triggered", { description: result.message });
      setTimeout(() => refetch(), 3000);
    },
    onError: (error) => {
      toast.error("Assembly Failed", { description: error.message });
    },
  });

  const generateThumbnail = trpc.files.generateThumbnail.useMutation({
    onSuccess: () => {
      toast.success("Thumbnail Generated", { description: "Video thumbnail has been created successfully." });
      refetch();
    },
    onError: (error) => {
      toast.error("Thumbnail Generation Failed", { description: error.message });
    },
  });

  useEffect(() => {
    if (data?.status === "streaming") {
      setWasStreaming(true);
    }
    if (data?.assembled && wasStreaming && onReady) {
      onReady();
    }
  }, [data, wasStreaming, onReady]);

  // Compute elapsed time string (re-computed on each tick)
  const elapsed = useMemo(() => {
    void elapsedTick; // dependency for re-computation
    return formatElapsed(data?.assemblyStartedAt ?? null);
  }, [data?.assemblyStartedAt, elapsedTick]);

  if (isLoading) return null;

  // File is accessible via streaming but not yet assembled to S3
  if (data && !data.assembled && data.status === "streaming") {
    const isAssembling = data.assembling;
    const sizeMB = data.fileSizeMB;
    const phase = data.assemblyPhase ?? "idle";
    const progress = data.assemblyProgress ?? 0;
    const totalChunks = data.assemblyTotalChunks ?? 0;
    const progressPct = data.assemblyProgressPct ?? 0;

    // Choose icon based on phase
    const PhaseIcon = phase === "uploading" ? Upload
      : phase === "generating_thumbnail" ? Sparkles
      : isAssembling ? Loader2
      : HardDrive;

    return (
      <Alert className="border-amber-500/30 bg-amber-500/10 mb-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <PhaseIcon className={`h-5 w-5 text-amber-500 flex-shrink-0 ${isAssembling ? "animate-spin" : ""}`} />
            <AlertDescription className="text-amber-200 flex-1">
              {isAssembling ? (
                <>
                  <span className="font-medium">
                    {PHASE_LABELS[phase] || "Processing"}{sizeMB ? ` (${sizeMB}MB)` : ""}
                  </span>
                  {phase === "downloading" && totalChunks > 0 && (
                    <span className="text-amber-300/80">
                      {" "}— {progress}/{totalChunks} chunks ({progressPct}%)
                    </span>
                  )}
                  {phase === "uploading" && (
                    <span className="text-amber-300/80"> — Uploading assembled file to permanent storage</span>
                  )}
                  {phase === "generating_thumbnail" && (
                    <span className="text-amber-300/80"> — Almost done!</span>
                  )}
                  {elapsed && (
                    <span className="text-amber-300/60 text-xs ml-2">({elapsed} elapsed)</span>
                  )}
                </>
              ) : (
                <>
                  <span className="font-medium">File needs assembly{sizeMB ? ` (${sizeMB}MB)` : ""}.</span>{" "}
                  {phase === "failed" ? (
                    <span className="text-red-300">Previous assembly attempt failed. Click "Retry Assembly" to try again.</span>
                  ) : (
                    <span>Your file is accessible but hasn't been assembled to permanent storage yet. Click "Retry Assembly" to start.</span>
                  )}
                </>
              )}
            </AlertDescription>
          </div>

          {/* Progress bar during downloading phase */}
          {isAssembling && phase === "downloading" && totalChunks > 0 && (
            <div className="ml-8 mr-4">
              <Progress value={progressPct} className="h-1.5 bg-amber-500/20" />
            </div>
          )}

          {/* Indeterminate progress for uploading/thumbnail phases */}
          {isAssembling && (phase === "uploading" || phase === "generating_thumbnail") && (
            <div className="ml-8 mr-4">
              <div className="h-1.5 bg-amber-500/20 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500/60 rounded-full animate-pulse" style={{ width: "100%" }} />
              </div>
            </div>
          )}

          {showActions && (
            <div className="flex items-center gap-2 ml-8">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                onClick={() => retryAssembly.mutate({ fileId })}
                disabled={retryAssembly.isPending || isAssembling}
              >
                {retryAssembly.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                {isAssembling ? "Assembly Running..." : "Retry Assembly"}
              </Button>
              {!data.hasThumbnail && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                  onClick={() => generateThumbnail.mutate({ fileId })}
                  disabled={generateThumbnail.isPending}
                >
                  {generateThumbnail.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Image className="h-3 w-3 mr-1" />
                  )}
                  Generate Thumbnail
                </Button>
              )}
            </div>
          )}
        </div>
      </Alert>
    );
  }

  // File just became assembled after being in streaming state
  if (data?.assembled && wasStreaming) {
    return (
      <Alert className="border-emerald-500/30 bg-emerald-500/10 mb-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
          <AlertDescription className="text-emerald-200">
            <span className="font-medium">File optimization complete!</span>{" "}
            Your file has been fully assembled for optimal performance.
          </AlertDescription>
        </div>
      </Alert>
    );
  }

  // File is ready and assembled — show nothing unless it's missing a thumbnail
  if (data?.assembled && !data.hasThumbnail && showActions) {
    return (
      <div className="flex items-center gap-2 mb-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => generateThumbnail.mutate({ fileId })}
          disabled={generateThumbnail.isPending}
        >
          {generateThumbnail.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Image className="h-3 w-3 mr-1" />
          )}
          Generate Thumbnail
        </Button>
      </div>
    );
  }

  return null;
}

/**
 * Hook that provides auto-retry logic for operations that fail
 * because the file is still being processed.
 */
export function useAutoRetry(options: {
  errorMessage?: string | null;
  onRetry: () => void;
  maxRetries?: number;
  retryDelaySeconds?: number;
}) {
  const { errorMessage, onRetry, maxRetries = 3, retryDelaySeconds = 30 } = options;
  const [retryCount, setRetryCount] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [isAutoRetrying, setIsAutoRetrying] = useState(false);

  // Check if the error is a "still being processed" error
  const isProcessingError = errorMessage && (
    errorMessage.includes("still being processed") ||
    errorMessage.includes("being assembled") ||
    errorMessage.includes("Failed to download audio file") ||
    errorMessage.includes("Failed to download") ||
    errorMessage.includes("Could not access the video")
  );

  useEffect(() => {
    if (!isProcessingError || retryCount >= maxRetries) {
      setIsAutoRetrying(false);
      setCountdown(0);
      return;
    }

    // Start countdown for auto-retry
    setIsAutoRetrying(true);
    setCountdown(retryDelaySeconds);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setRetryCount((c) => c + 1);
          setIsAutoRetrying(false);
          onRetry();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isProcessingError, retryCount, maxRetries, retryDelaySeconds, onRetry]);

  // Reset retry count when error clears
  useEffect(() => {
    if (!errorMessage) {
      setRetryCount(0);
      setIsAutoRetrying(false);
      setCountdown(0);
    }
  }, [errorMessage]);

  return {
    isAutoRetrying,
    countdown,
    retryCount,
    maxRetries,
    canAutoRetry: isProcessingError && retryCount < maxRetries,
  };
}
