import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Minimize2,
  Upload,
  Loader2,
  CheckCircle,
  XCircle,
  FileVideo,
} from "lucide-react";
import {
  compressVideo,
  isCompressionSupported,
  estimateCompressedSize,
  formatCompressedSize,
  type CompressionOptions,
  type CompressionResult,
} from "@/lib/videoCompressor";

interface VideoCompressionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  videoDuration?: number;
  onUploadOriginal: (file: File) => void;
  onUploadCompressed: (file: File) => void;
}

type CompressionState = 'idle' | 'compressing' | 'done' | 'error';

export function VideoCompressionDialog({
  open,
  onOpenChange,
  file,
  videoDuration,
  onUploadOriginal,
  onUploadCompressed,
}: VideoCompressionDialogProps) {
  const [quality, setQuality] = useState<CompressionOptions['quality']>('medium');
  const [state, setState] = useState<CompressionState>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const compressedFileRef = useRef<File | null>(null);

  const supported = isCompressionSupported();

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setState('idle');
      setProgress(0);
      setResult(null);
      setError(null);
      compressedFileRef.current = null;
    }
  }, [open]);

  const handleCompress = useCallback(async () => {
    if (!file) return;

    setState('compressing');
    setProgress(0);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const compressionResult = await compressVideo(file, {
        quality,
        onProgress: setProgress,
        signal: controller.signal,
      });

      setResult(compressionResult);
      
      // Create a new File from the compressed blob
      const ext = quality === 'high' ? '-hq' : quality === 'low' ? '-lq' : '-mq';
      const compressedName = file.name.replace(/\.[^.]+$/, `${ext}.webm`);
      compressedFileRef.current = new File([compressionResult.blob], compressedName, {
        type: compressionResult.blob.type,
      });

      setState('done');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setState('idle');
      } else {
        setError(err.message || 'Compression failed');
        setState('error');
      }
    }
  }, [file, quality]);

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  };

  const handleUploadOriginal = () => {
    if (file) {
      onUploadOriginal(file);
      onOpenChange(false);
    }
  };

  const handleUploadCompressed = () => {
    if (compressedFileRef.current) {
      onUploadCompressed(compressedFileRef.current);
      onOpenChange(false);
    }
  };

  if (!file) return null;

  const estimatedSizes = videoDuration ? {
    high: estimateCompressedSize(file.size, videoDuration, 'high'),
    medium: estimateCompressedSize(file.size, videoDuration, 'medium'),
    low: estimateCompressedSize(file.size, videoDuration, 'low'),
  } : null;

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (state === 'compressing') {
        handleCancel();
      }
      onOpenChange(v);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Minimize2 className="h-5 w-5 text-blue-500" />
            Compress Before Upload?
          </DialogTitle>
          <DialogDescription>
            Reduce file size to speed up upload. Original quality is preserved if you skip.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File info */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <FileVideo className="h-8 w-8 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-medium truncate text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatCompressedSize(file.size)}
                {videoDuration ? ` · ${Math.floor(videoDuration / 60)}:${String(Math.floor(videoDuration % 60)).padStart(2, '0')}` : ''}
              </p>
            </div>
          </div>

          {!supported && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-500">
              Video compression is not supported in this browser. You can still upload the original file.
            </div>
          )}

          {supported && state === 'idle' && (
            <>
              {/* Quality selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Compression Quality</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['high', 'medium', 'low'] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuality(q)}
                      className={`p-3 rounded-lg border text-center transition-colors ${
                        quality === q
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="text-sm font-medium capitalize">{q}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {q === 'high' ? '1920p · 4Mbps' : q === 'medium' ? '1280p · 2Mbps' : '854p · 1Mbps'}
                      </div>
                      {estimatedSizes && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          ~{formatCompressedSize(estimatedSizes[q])}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {state === 'compressing' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <span className="text-sm">Compressing... {Math.round(progress * 100)}%</span>
              </div>
              <Progress value={progress * 100} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Video is being re-encoded in your browser. This may take a while for large files.
              </p>
            </div>
          )}

          {state === 'done' && result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Compression Complete</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-2 bg-muted rounded">
                  <div className="text-xs text-muted-foreground">Original</div>
                  <div className="font-medium">{formatCompressedSize(result.originalSize)}</div>
                </div>
                <div className="p-2 bg-green-500/10 rounded">
                  <div className="text-xs text-green-600">Compressed</div>
                  <div className="font-medium text-green-600">{formatCompressedSize(result.compressedSize)}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {result.compressionRatio < 1
                  ? `Reduced by ${Math.round((1 - result.compressionRatio) * 100)}% · ${result.width}×${result.height} · Took ${(result.duration / 1000).toFixed(1)}s`
                  : 'File size was not reduced. Consider uploading the original.'}
              </div>
            </div>
          )}

          {state === 'error' && (
            <div className="flex items-center gap-2 text-red-500">
              <XCircle className="h-4 w-4" />
              <span className="text-sm">{error || 'Compression failed'}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {state === 'idle' && (
            <>
              <Button variant="outline" onClick={handleUploadOriginal} className="flex-1">
                <Upload className="h-4 w-4 mr-2" />
                Upload Original
              </Button>
              {supported && (
                <Button onClick={handleCompress} className="flex-1">
                  <Minimize2 className="h-4 w-4 mr-2" />
                  Compress & Upload
                </Button>
              )}
            </>
          )}

          {state === 'compressing' && (
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          )}

          {state === 'done' && result && (
            <>
              <Button variant="outline" onClick={handleUploadOriginal} className="flex-1">
                Upload Original ({formatCompressedSize(result.originalSize)})
              </Button>
              {result.compressionRatio < 1 && (
                <Button onClick={handleUploadCompressed} className="flex-1">
                  Upload Compressed ({formatCompressedSize(result.compressedSize)})
                </Button>
              )}
            </>
          )}

          {state === 'error' && (
            <>
              <Button variant="outline" onClick={handleUploadOriginal} className="flex-1">
                Upload Original
              </Button>
              <Button onClick={handleCompress} className="flex-1">
                Retry Compression
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
