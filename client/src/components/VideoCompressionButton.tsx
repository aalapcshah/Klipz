import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Shrink,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Server,
  ArrowDown,
  HardDrive,
} from "lucide-react";
import { toast } from "sonner";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface VideoCompressionButtonProps {
  fileId: number | null;
  fileSize?: number;
  compressionStatus?: string;
  variant?: "icon" | "full";
}

export function VideoCompressionButton({
  fileId,
  fileSize,
  compressionStatus: initialStatus,
  variant = "icon",
}: VideoCompressionButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [quality, setQuality] = useState<"high" | "medium" | "low">("medium");
  const [polling, setPolling] = useState(false);

  const compressMutation = trpc.videoCompression.compress.useMutation();
  const revertMutation = trpc.videoCompression.revert.useMutation();

  const { data: status, refetch: refetchStatus } =
    trpc.videoCompression.getStatus.useQuery(
      { fileId: fileId! },
      {
        enabled: !!fileId && polling,
        refetchInterval: polling ? 2000 : false,
      }
    );

  const { data: presets } = trpc.videoCompression.getPresets.useQuery(
    undefined,
    { enabled: dialogOpen }
  );

  // Size estimation query - updates when quality changes
  const { data: estimate, isLoading: estimateLoading } =
    trpc.videoCompression.estimateSize.useQuery(
      { fileId: fileId!, quality },
      { enabled: dialogOpen && !!fileId }
    );

  // Start/stop polling based on status
  useEffect(() => {
    if (
      status?.status === "downloading" ||
      status?.status === "compressing" ||
      status?.status === "uploading"
    ) {
      setPolling(true);
    } else if (status?.status === "complete" || status?.status === "failed") {
      setPolling(false);
    }
  }, [status?.status]);

  // Check initial status on mount
  useEffect(() => {
    if (
      fileId &&
      (initialStatus === "processing" || initialStatus === "pending")
    ) {
      setPolling(true);
    }
  }, [fileId, initialStatus]);

  const handleCompress = async () => {
    if (!fileId) return;
    try {
      await compressMutation.mutateAsync({ fileId, quality });
      setDialogOpen(false);
      setPolling(true);
      toast.success("Server-side compression started", {
        description:
          "Your video is being compressed with FFmpeg. Audio will be preserved.",
      });
    } catch (error: any) {
      toast.error("Failed to start compression", {
        description: error.message,
      });
    }
  };

  const handleRevert = async () => {
    if (!fileId) return;
    try {
      await revertMutation.mutateAsync({ fileId });
      toast.success("Reverted to original file");
      refetchStatus();
    } catch (error: any) {
      toast.error("Failed to revert", { description: error.message });
    }
  };

  if (!fileId) return null;

  const isActive =
    status?.status === "downloading" ||
    status?.status === "compressing" ||
    status?.status === "uploading";
  const isComplete =
    status?.status === "complete" || initialStatus === "completed";
  const isFailed = status?.status === "failed" || initialStatus === "failed";

  // Show inline progress if actively compressing
  if (isActive) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs">
          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
          <span className="text-blue-600 font-medium">
            {status?.status === "downloading"
              ? "Downloading..."
              : status?.status === "uploading"
                ? "Uploading..."
                : `Compressing ${status?.progress || 0}%`}
          </span>
        </div>
        {status?.status === "compressing" && (
          <div className="flex-1 max-w-[80px] bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${status?.progress || 0}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  // Show completed badge
  if (isComplete && !isFailed) {
    return (
      <div className="flex items-center gap-1">
        <Badge
          variant="outline"
          className="text-xs text-green-600 border-green-300 gap-1"
        >
          <CheckCircle2 className="h-3 w-3" />
          Compressed
          {status &&
            "originalSize" in status &&
            "compressedSize" in status &&
            status.originalSize &&
            status.compressedSize && (
              <span className="text-green-500">
                (
                {Math.round(
                  (1 -
                    (status.compressedSize as number) /
                      (status.originalSize as number)) *
                    100
                )}
                % smaller)
              </span>
            )}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1 text-[10px]"
          onClick={handleRevert}
          disabled={revertMutation.isPending}
          title="Revert to original"
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Show failed badge
  if (isFailed) {
    return (
      <div className="flex items-center gap-1">
        <Badge
          variant="outline"
          className="text-xs text-red-600 border-red-300 gap-1"
        >
          <AlertCircle className="h-3 w-3" />
          Failed
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1 text-[10px]"
          onClick={() => setDialogOpen(true)}
          title="Retry compression"
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Default: show compress button
  return (
    <>
      {variant === "icon" ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          onClick={() => setDialogOpen(true)}
          title="Compress video (server-side with FFmpeg)"
        >
          <Shrink className="h-2.5 w-2.5 mr-0.5" />
          Compress
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="gap-1.5"
        >
          <Server className="h-3.5 w-3.5" />
          Compress Video
        </Button>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Server-Side Video Compression
            </DialogTitle>
            <DialogDescription>
              Compress this video using FFmpeg on the server. Audio is fully
              preserved and the full video duration is maintained.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Quality selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Compression Quality</label>
              <Select
                value={quality}
                onValueChange={(v) =>
                  setQuality(v as "high" | "medium" | "low")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presets?.map((preset) => (
                    <SelectItem key={preset.key} value={preset.key}>
                      <div className="flex flex-col">
                        <span>{preset.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {preset.maxResolution} · {preset.videoBitrate} video ·{" "}
                          {preset.audioBitrate} audio
                        </span>
                      </div>
                    </SelectItem>
                  )) || (
                    <>
                      <SelectItem value="high">
                        High Quality (1080p)
                      </SelectItem>
                      <SelectItem value="medium">
                        Medium Quality (720p)
                      </SelectItem>
                      <SelectItem value="low">Low Quality (480p)</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Size Estimation Card */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                Size Estimate
              </div>
              {estimateLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Calculating...
                </div>
              ) : estimate ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Current size</span>
                    <span className="font-mono">
                      {formatFileSize(estimate.originalSize)}
                    </span>
                  </div>
                  <div className="flex items-center justify-center">
                    <ArrowDown className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Estimated after
                    </span>
                    <span className="font-mono text-green-600">
                      ~{formatFileSize(estimate.estimatedSize)}
                    </span>
                  </div>
                  <div className="flex items-center justify-center pt-1">
                    <Badge
                      variant="outline"
                      className="text-xs text-green-600 border-green-300"
                    >
                      ~{estimate.savings}% reduction
                    </Badge>
                  </div>
                </div>
              ) : fileSize ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current size</span>
                  <span className="font-mono">{formatFileSize(fileSize)}</span>
                </div>
              ) : null}
            </div>

            {/* Benefits */}
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span>Audio fully preserved (AAC encoding)</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span>Full video duration maintained</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span>Original file preserved (can revert anytime)</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCompress}
              disabled={compressMutation.isPending}
              className="gap-1.5"
            >
              {compressMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Shrink className="h-4 w-4" />
              )}
              Start Compression
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
