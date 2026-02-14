import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, Image } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FileProcessingBannerProps {
  fileId: number;
  onReady?: () => void;
  /** If true, show retry assembly and generate thumbnail actions */
  showActions?: boolean;
}

/**
 * Shows a processing indicator when a file hasn't been fully assembled
 * to S3 after a chunked upload. The file is still accessible via streaming
 * URL, but assembly to S3 enables faster access and thumbnails.
 * 
 * Also provides "Retry Assembly" and "Generate Thumbnail" actions.
 */
export function FileProcessingBanner({ fileId, onReady, showActions = true }: FileProcessingBannerProps) {
  const [wasStreaming, setWasStreaming] = useState(false);


  const { data, isLoading, refetch } = trpc.files.checkFileReady.useQuery(
    { fileId },
    {
      refetchInterval: (query) => {
        const result = query.state.data;
        // Poll every 15 seconds while not assembled
        if (result && !result.assembled) return 15000;
        return false;
      },
      staleTime: 5000,
    }
  );

  const retryAssembly = trpc.files.retryAssembly.useMutation({
    onSuccess: (result) => {
      toast.success("Assembly Triggered", { description: result.message });
      // Start polling more frequently
      setTimeout(() => refetch(), 5000);
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

  if (isLoading) return null;

  // File is accessible via streaming but not yet assembled to S3
  if (data && !data.assembled && data.status === "streaming") {
    return (
      <Alert className="border-amber-500/30 bg-amber-500/10 mb-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-amber-500 flex-shrink-0" />
            <AlertDescription className="text-amber-200">
              <span className="font-medium">File is being optimized.</span>{" "}
              Your file is accessible but still being assembled for optimal performance.
              AI features (transcription, captioning) are available and will use the streaming URL.
            </AlertDescription>
          </div>
          {showActions && (
            <div className="flex items-center gap-2 ml-8">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                onClick={() => retryAssembly.mutate({ fileId })}
                disabled={retryAssembly.isPending}
              >
                {retryAssembly.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                Retry Assembly
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
