import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FileProcessingBannerProps {
  fileId: number;
  onReady?: () => void;
}

/**
 * Shows a processing indicator when a file is still being assembled
 * after a chunked upload. Polls the server every 10 seconds until
 * the file is ready, then calls onReady.
 */
export function FileProcessingBanner({ fileId, onReady }: FileProcessingBannerProps) {
  const [wasAssembling, setWasAssembling] = useState(false);

  const { data, isLoading } = trpc.files.checkFileReady.useQuery(
    { fileId },
    {
      refetchInterval: (query) => {
        // Poll every 10 seconds while not ready
        const result = query.state.data;
        if (result && result.ready) return false;
        return 10000;
      },
      staleTime: 5000,
    }
  );

  useEffect(() => {
    if (data?.status === "assembling") {
      setWasAssembling(true);
    }
    if (data?.ready && wasAssembling && onReady) {
      onReady();
    }
  }, [data, wasAssembling, onReady]);

  if (isLoading) return null;

  // File is still being assembled
  if (data && !data.ready && data.status === "assembling") {
    return (
      <Alert className="border-amber-500/30 bg-amber-500/10 mb-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-amber-500 flex-shrink-0" />
          <AlertDescription className="text-amber-200">
            <span className="font-medium">File is being processed.</span>{" "}
            Your video was uploaded in chunks and is being assembled in the background.
            Transcription and captioning will be available once processing completes.
            This usually takes a few minutes for large files.
          </AlertDescription>
        </div>
      </Alert>
    );
  }

  // File just became ready after assembling
  if (data?.ready && wasAssembling) {
    return (
      <Alert className="border-emerald-500/30 bg-emerald-500/10 mb-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
          <AlertDescription className="text-emerald-200">
            <span className="font-medium">File processing complete!</span>{" "}
            You can now use transcription and captioning features.
          </AlertDescription>
        </div>
      </Alert>
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
    errorMessage.includes("not supported for visual captioning")
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
