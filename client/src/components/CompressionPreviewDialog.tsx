import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Loader2, Image as ImageIcon, FileVideo, Sparkles } from "lucide-react";
import { formatFileSize, estimateCompressedSize, getVideoMetadata, COMPRESSION_PRESETS } from "@/lib/videoCompression";

type VideoQuality = "original" | "high" | "medium" | "low" | "custom";

interface CompressionPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  onConfirm: (quality: VideoQuality, customBitrate?: number, customResolution?: number) => void;
  defaultQuality?: VideoQuality;
}

interface PreviewData {
  thumbnail: string;
  duration: number;
  width: number;
  height: number;
}

const QUALITY_OPTIONS = [
  { value: "original", label: "Original", description: "No compression, full quality" },
  { value: "high", label: "High (1080p)", description: "5 Mbps, great for most uses" },
  { value: "medium", label: "Medium (720p)", description: "2.5 Mbps, good balance" },
  { value: "low", label: "Low (480p)", description: "1 Mbps, smaller file size" },
  { value: "custom", label: "Custom", description: "Set your own bitrate & resolution" },
];

export function CompressionPreviewDialog({
  open,
  onOpenChange,
  file,
  onConfirm,
  defaultQuality = "high",
}: CompressionPreviewDialogProps) {
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>(defaultQuality);
  const [customBitrate, setCustomBitrate] = useState(3000);
  const [customResolution, setCustomResolution] = useState(720);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate preview thumbnail when file changes
  useEffect(() => {
    if (!file || !open) return;

    const generatePreview = async () => {
      setLoading(true);
      try {
        const metadata = await getVideoMetadata(file);
        
        // Create video element to capture thumbnail
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        
        const thumbnailPromise = new Promise<string>((resolve, reject) => {
          video.onloadeddata = () => {
            // Seek to 1 second or 10% of duration for thumbnail
            video.currentTime = Math.min(1, metadata.duration * 0.1);
          };
          
          video.onseeked = () => {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(video, 0, 0);
              resolve(canvas.toDataURL("image/jpeg", 0.8));
            } else {
              reject(new Error("Failed to get canvas context"));
            }
            URL.revokeObjectURL(video.src);
          };
          
          video.onerror = () => {
            URL.revokeObjectURL(video.src);
            reject(new Error("Failed to load video"));
          };
        });
        
        video.src = URL.createObjectURL(file);
        
        const thumbnail = await thumbnailPromise;
        setPreviewData({
          thumbnail,
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
        });
      } catch (error) {
        console.error("Failed to generate preview:", error);
      } finally {
        setLoading(false);
      }
    };

    generatePreview();
  }, [file, open]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedQuality(defaultQuality);
    }
  }, [open, defaultQuality]);

  const getEstimatedSize = (quality: VideoQuality): number => {
    if (!file || !previewData) return 0;
    
    if (quality === "original") {
      return file.size;
    }
    
    const settings = quality === "custom"
      ? { maxHeight: customResolution, videoBitrate: customBitrate, audioBitrate: 128 }
      : COMPRESSION_PRESETS[quality];
    
    return estimateCompressedSize(file.size, previewData.duration, settings);
  };

  const getSavingsPercent = (quality: VideoQuality): string => {
    if (!file) return "0%";
    const estimated = getEstimatedSize(quality);
    const savings = ((file.size - estimated) / file.size) * 100;
    return savings > 0 ? `-${savings.toFixed(0)}%` : "0%";
  };

  const getOutputResolution = (quality: VideoQuality): string => {
    if (!previewData) return "";
    
    if (quality === "original") {
      return `${previewData.width}×${previewData.height}`;
    }
    
    const maxHeight = quality === "custom" 
      ? customResolution 
      : COMPRESSION_PRESETS[quality]?.maxHeight || previewData.height;
    
    if (previewData.height <= maxHeight) {
      return `${previewData.width}×${previewData.height}`;
    }
    
    const scale = maxHeight / previewData.height;
    const newWidth = Math.round(previewData.width * scale / 2) * 2;
    return `${newWidth}×${maxHeight}`;
  };

  const handleConfirm = () => {
    if (selectedQuality === "custom") {
      onConfirm(selectedQuality, customBitrate, customResolution);
    } else {
      onConfirm(selectedQuality);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Compression Quality Preview
          </DialogTitle>
          <DialogDescription>
            Choose compression quality for {file?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6">
          {/* Preview Section */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Preview</Label>
            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : previewData?.thumbnail ? (
                <img
                  src={previewData.thumbnail}
                  alt="Video preview"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <FileVideo className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
            </div>
            
            {/* Video Info */}
            {previewData && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Original Size:</span>
                  <span className="font-medium">{formatFileSize(file?.size || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Resolution:</span>
                  <span className="font-medium">{previewData.width}×{previewData.height}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-medium">{Math.floor(previewData.duration / 60)}:{(Math.floor(previewData.duration) % 60).toString().padStart(2, "0")}</span>
                </div>
              </div>
            )}
          </div>

          {/* Quality Selection */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Quality Settings</Label>
            <RadioGroup
              value={selectedQuality}
              onValueChange={(value) => setSelectedQuality(value as VideoQuality)}
              className="space-y-2"
            >
              {QUALITY_OPTIONS.map((option) => (
                <div
                  key={option.value}
                  className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    selectedQuality === option.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedQuality(option.value as VideoQuality)}
                >
                  <RadioGroupItem value={option.value} id={option.value} className="mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-center">
                      <Label htmlFor={option.value} className="font-medium cursor-pointer">
                        {option.label}
                      </Label>
                      {previewData && (
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(getEstimatedSize(option.value as VideoQuality))}
                          {option.value !== "original" && (
                            <span className="text-green-500 ml-1">
                              ({getSavingsPercent(option.value as VideoQuality)})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                    {previewData && option.value !== "original" && option.value !== "custom" && (
                      <p className="text-xs text-muted-foreground">
                        Output: {getOutputResolution(option.value as VideoQuality)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </RadioGroup>

            {/* Custom Settings */}
            {selectedQuality === "custom" && (
              <div className="space-y-4 p-3 rounded-lg border border-border bg-muted/30">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-sm">Bitrate</Label>
                    <span className="text-sm text-muted-foreground">{customBitrate} kbps</span>
                  </div>
                  <Slider
                    value={[customBitrate]}
                    onValueChange={([value]) => setCustomBitrate(value)}
                    min={500}
                    max={10000}
                    step={100}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-sm">Max Resolution</Label>
                    <span className="text-sm text-muted-foreground">{customResolution}p</span>
                  </div>
                  <Slider
                    value={[customResolution]}
                    onValueChange={([value]) => setCustomResolution(value)}
                    min={360}
                    max={2160}
                    step={60}
                  />
                </div>
                {previewData && (
                  <div className="text-xs text-muted-foreground">
                    Estimated: {formatFileSize(getEstimatedSize("custom"))} ({getSavingsPercent("custom")})
                    <br />
                    Output: {getOutputResolution("custom")}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Upload with {selectedQuality === "original" ? "Original" : selectedQuality.charAt(0).toUpperCase() + selectedQuality.slice(1)} Quality
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
