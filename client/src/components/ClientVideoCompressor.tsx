import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Minimize2,
  FileVideo,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  X,
  Zap,
} from "lucide-react";
import {
  compressVideo,
  isCompressionSupported,
  getVideoMetadata,
  estimateCompressedSize,
  COMPRESSION_PRESETS,
  formatFileSize,
  getCompressionRatio,
  type CompressionSettings,
  type CompressionProgress,
} from "@/lib/videoCompression";

export type CompressionQuality = "original" | "high" | "medium" | "low";

interface CompressionResult {
  originalFile: File;
  compressedFile: File;
  originalSize: number;
  compressedSize: number;
  quality: CompressionQuality;
  savings: string;
}

interface ClientVideoCompressorProps {
  /** Files to potentially compress before upload */
  files: File[];
  /** Called when user confirms (with original or compressed files) */
  onConfirm: (files: File[], compressionResults?: CompressionResult[]) => void;
  /** Called when user cancels */
  onCancel: () => void;
  /** Whether the dialog is open */
  open: boolean;
}

interface FileEstimate {
  file: File;
  duration: number;
  width: number;
  height: number;
  estimatedSizes: Record<CompressionQuality, number>;
}

export function ClientVideoCompressor({
  files,
  onConfirm,
  onCancel,
  open,
}: ClientVideoCompressorProps) {
  const [quality, setQuality] = useState<CompressionQuality>("medium");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [fileEstimates, setFileEstimates] = useState<FileEstimate[]>([]);
  const [compressionProgress, setCompressionProgress] = useState<Map<string, CompressionProgress>>(new Map());
  const [completedResults, setCompletedResults] = useState<CompressionResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const supported = isCompressionSupported();

  // Analyze files when dialog opens
  useEffect(() => {
    if (!open || files.length === 0) return;
    
    setIsAnalyzing(true);
    setFileEstimates([]);
    setCompressionProgress(new Map());
    setCompletedResults([]);
    setError(null);
    abortRef.current = false;

    const analyze = async () => {
      const estimates: FileEstimate[] = [];
      for (const file of files) {
        if (!file.type.startsWith("video/")) {
          // Non-video files don't need compression
          continue;
        }
        try {
          const metadata = await getVideoMetadata(file);
          const estimatedSizes: Record<CompressionQuality, number> = {
            original: file.size,
            high: estimateCompressedSize(file.size, metadata.duration, COMPRESSION_PRESETS.high),
            medium: estimateCompressedSize(file.size, metadata.duration, COMPRESSION_PRESETS.medium),
            low: estimateCompressedSize(file.size, metadata.duration, COMPRESSION_PRESETS.low),
          };
          estimates.push({
            file,
            duration: metadata.duration,
            width: metadata.width,
            height: metadata.height,
            estimatedSizes,
          });
        } catch (err) {
          console.warn(`Failed to analyze ${file.name}:`, err);
          // Still include the file but without estimates
          estimates.push({
            file,
            duration: 0,
            width: 0,
            height: 0,
            estimatedSizes: {
              original: file.size,
              high: file.size,
              medium: file.size,
              low: file.size,
            },
          });
        }
      }
      setFileEstimates(estimates);
      setIsAnalyzing(false);
    };

    analyze();
  }, [open, files]);

  // Compute totals
  const totalOriginalSize = fileEstimates.reduce((sum, f) => sum + f.file.size, 0);
  const totalEstimatedSize = fileEstimates.reduce((sum, f) => sum + f.estimatedSizes[quality], 0);
  const totalSavings = quality === "original" ? "0%" : getCompressionRatio(totalOriginalSize, totalEstimatedSize);
  const estimatedSavingsBytes = totalOriginalSize - totalEstimatedSize;

  const handleSkipCompression = useCallback(() => {
    onConfirm(files);
  }, [files, onConfirm]);

  const handleCompress = useCallback(async () => {
    if (quality === "original") {
      onConfirm(files);
      return;
    }

    setIsCompressing(true);
    setError(null);
    abortRef.current = false;

    const results: CompressionResult[] = [];
    const outputFiles: File[] = [];

    for (const estimate of fileEstimates) {
      if (abortRef.current) break;

      const settings = COMPRESSION_PRESETS[quality];
      
      try {
        const compressed = await compressVideo(
          estimate.file,
          settings,
          (progress) => {
            setCompressionProgress(prev => {
              const next = new Map(prev);
              next.set(estimate.file.name, progress);
              return next;
            });
          }
        );

        const result: CompressionResult = {
          originalFile: estimate.file,
          compressedFile: compressed,
          originalSize: estimate.file.size,
          compressedSize: compressed.size,
          quality,
          savings: getCompressionRatio(estimate.file.size, compressed.size),
        };
        results.push(result);
        outputFiles.push(compressed);
      } catch (err: any) {
        console.error(`Compression failed for ${estimate.file.name}:`, err);
        // On failure, use original file
        outputFiles.push(estimate.file);
      }
    }

    // Add non-video files as-is
    for (const file of files) {
      if (!file.type.startsWith("video/")) {
        outputFiles.push(file);
      }
    }

    setCompletedResults(results);
    setIsCompressing(false);
    
    if (!abortRef.current) {
      onConfirm(outputFiles, results.length > 0 ? results : undefined);
    }
  }, [quality, fileEstimates, files, onConfirm]);

  const handleCancel = useCallback(() => {
    abortRef.current = true;
    setIsCompressing(false);
    onCancel();
  }, [onCancel]);

  // Overall compression progress
  const overallProgress = (() => {
    if (fileEstimates.length === 0) return 0;
    let totalProgress = 0;
    for (const estimate of fileEstimates) {
      const progress = compressionProgress.get(estimate.file.name);
      totalProgress += progress?.progress || 0;
    }
    return totalProgress / fileEstimates.length;
  })();

  const videoFiles = files.filter(f => f.type.startsWith("video/"));
  const nonVideoFiles = files.filter(f => !f.type.startsWith("video/"));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Minimize2 className="h-5 w-5 text-primary" />
            Compress Before Upload?
          </DialogTitle>
          <DialogDescription>
            {supported
              ? "Compress videos in your browser before uploading to save bandwidth and time."
              : "Your browser doesn't support client-side video compression. Files will be uploaded as-is."}
          </DialogDescription>
        </DialogHeader>

        {isAnalyzing ? (
          <div className="flex items-center justify-center py-8 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Analyzing {videoFiles.length} video{videoFiles.length !== 1 ? "s" : ""}...</span>
          </div>
        ) : isCompressing ? (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
              <p className="text-sm font-medium">Compressing videos...</p>
              <p className="text-xs text-muted-foreground mt-1">
                This runs entirely in your browser. Keep this tab open.
              </p>
            </div>

            {/* Overall progress */}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Overall progress</span>
                <span>{Math.round(overallProgress)}%</span>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>

            {/* Per-file progress */}
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {fileEstimates.map((estimate) => {
                const progress = compressionProgress.get(estimate.file.name);
                return (
                  <div key={estimate.file.name} className="flex items-center gap-2 text-xs">
                    {progress?.stage === "complete" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    ) : (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary flex-shrink-0" />
                    )}
                    <span className="truncate flex-1">{estimate.file.name}</span>
                    <span className="text-muted-foreground flex-shrink-0">
                      {progress ? `${Math.round(progress.progress)}%` : "Waiting..."}
                    </span>
                    {progress?.etaMs && progress.etaMs > 0 && (
                      <span className="text-muted-foreground flex-shrink-0">
                        ~{Math.ceil(progress.etaMs / 1000)}s
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* File summary */}
            <div className="bg-muted rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <FileVideo className="h-4 w-4 text-muted-foreground" />
                <span>
                  {videoFiles.length} video{videoFiles.length !== 1 ? "s" : ""}
                  {nonVideoFiles.length > 0 && ` + ${nonVideoFiles.length} other file${nonVideoFiles.length !== 1 ? "s" : ""}`}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Total size: {formatFileSize(totalOriginalSize)}
              </div>
              {fileEstimates.length > 0 && fileEstimates[0].width > 0 && (
                <div className="text-xs text-muted-foreground">
                  {fileEstimates.map(f => `${f.width}×${f.height}`).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
                  {" · "}
                  {fileEstimates.map(f => `${Math.round(f.duration)}s`).join(", ")}
                </div>
              )}
            </div>

            {/* Quality selector */}
            {supported && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Compression Quality</label>
                <Select value={quality} onValueChange={(v) => setQuality(v as CompressionQuality)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="original">
                      <div className="flex items-center gap-2">
                        <span>Original (no compression)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="high">
                      <div className="flex items-center gap-2">
                        <span>High Quality (1080p)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="medium">
                      <div className="flex items-center gap-2">
                        <span>Medium (720p)</span>
                        <span className="text-xs text-green-500">Recommended</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="low">
                      <div className="flex items-center gap-2">
                        <span>Low (480p)</span>
                        <span className="text-xs text-amber-500">Smallest</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Size comparison */}
            {supported && quality !== "original" && (
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">Original</div>
                    <div className="font-mono font-semibold">{formatFileSize(totalOriginalSize)}</div>
                  </div>
                  <div className="flex flex-col items-center">
                    <ArrowRight className="h-4 w-4 text-primary" />
                    <span className="text-xs text-green-500 font-medium">{totalSavings}</span>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">Estimated</div>
                    <div className="font-mono font-semibold text-green-500">{formatFileSize(totalEstimatedSize)}</div>
                  </div>
                </div>
                {estimatedSavingsBytes > 0 && (
                  <div className="text-center mt-2 text-xs text-muted-foreground">
                    Save approximately {formatFileSize(estimatedSavingsBytes)} of upload data
                  </div>
                )}
              </div>
            )}

            {/* Per-file breakdown for multiple files */}
            {fileEstimates.length > 1 && quality !== "original" && supported && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {fileEstimates.map((estimate) => (
                  <div key={estimate.file.name} className="flex items-center justify-between text-xs px-1">
                    <span className="truncate flex-1 mr-2">{estimate.file.name}</span>
                    <span className="text-muted-foreground flex-shrink-0">
                      {formatFileSize(estimate.file.size)} → {formatFileSize(estimate.estimatedSizes[quality])}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {supported
                ? "Compression runs in your browser using WebCodecs. Output format is WebM. Actual savings may vary."
                : "Client-side compression is not available. You can use server-side compression after upload."}
            </p>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {!isCompressing && (
            <>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button variant="outline" onClick={handleSkipCompression}>
                <Zap className="h-4 w-4 mr-1" />
                Skip — Upload Original
              </Button>
              {supported && quality !== "original" && (
                <Button onClick={handleCompress} disabled={isAnalyzing || fileEstimates.length === 0}>
                  <Minimize2 className="h-4 w-4 mr-1" />
                  Compress & Upload
                </Button>
              )}
            </>
          )}
          {isCompressing && (
            <Button variant="destructive" onClick={handleCancel}>
              <X className="h-4 w-4 mr-1" />
              Cancel Compression
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
