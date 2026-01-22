import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight,
  Download,
  RotateCw,
  Play,
  Pause,
  Maximize,
  Minimize,
  Columns2,
  Pencil
} from "lucide-react";
import { toast } from "sonner";
import { AnnotationCanvas } from "./AnnotationCanvas";

interface FilePreviewLightboxProps {
  files: any[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}

export function FilePreviewLightbox({
  files,
  currentIndex,
  open,
  onOpenChange,
  onIndexChange,
}: FilePreviewLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [comparisonIndex, setComparisonIndex] = useState(currentIndex + 1);
  const [annotationMode, setAnnotationMode] = useState(false);
  const slideshowIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const currentFile = files[currentIndex];
  const comparisonFile = comparisonMode && comparisonIndex < files.length ? files[comparisonIndex] : null;
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < files.length - 1;

  // Reset zoom and rotation when file changes
  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [currentIndex]);

  // Slideshow logic
  useEffect(() => {
    if (isPlaying && canGoNext) {
      slideshowIntervalRef.current = setInterval(() => {
        onIndexChange(currentIndex + 1);
      }, 3000); // 3 seconds per slide
    } else if (isPlaying && !canGoNext) {
      // Stop at the end
      setIsPlaying(false);
      toast.info("Slideshow ended");
    }

    return () => {
      if (slideshowIntervalRef.current) {
        clearInterval(slideshowIntervalRef.current);
      }
    };
  }, [isPlaying, currentIndex, canGoNext, onIndexChange]);

  // Fullscreen API
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } catch (error) {
        toast.error("Fullscreen not supported");
      }
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen) {
          document.exitFullscreen();
        } else {
          onOpenChange(false);
        }
      } else if (e.key === "ArrowLeft" && canGoPrev) {
        onIndexChange(currentIndex - 1);
      } else if (e.key === "ArrowRight" && canGoNext) {
        onIndexChange(currentIndex + 1);
      } else if (e.key === "+" || e.key === "=") {
        setZoom((z) => Math.min(z + 0.25, 3));
      } else if (e.key === "-") {
        setZoom((z) => Math.max(z - 0.25, 0.5));
      } else if (e.key === "r" || e.key === "R") {
        setRotation((r) => (r + 90) % 360);
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      } else if (e.key === "c" || e.key === "C") {
        if (files.length > 1) {
          setComparisonMode((c) => !c);
        }
      } else if (e.key === "a" || e.key === "A") {
        if (currentFile.mimeType?.startsWith("image/")) {
          setAnnotationMode((a) => !a);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, currentIndex, canGoPrev, canGoNext, onOpenChange, onIndexChange, isFullscreen, files.length]);

  const handleDownload = async () => {
    try {
      const response = await fetch(currentFile.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = currentFile.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("File downloaded");
    } catch (error) {
      toast.error("Failed to download file");
    }
  };

  const renderImage = (file: any, className?: string) => {
    if (file.mimeType?.startsWith("image/")) {
      return (
        <img
          src={file.url}
          alt={file.filename}
          className={`max-w-full max-h-full object-contain transition-transform duration-200 ${className || ""}`}
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
          }}
        />
      );
    } else if (file.mimeType?.startsWith("video/")) {
      return (
        <video
          src={file.url}
          controls
          className={`max-w-full max-h-full ${className || ""}`}
          style={{
            transform: `scale(${zoom})`,
          }}
        />
      );
    } else {
      return (
        <div className="text-white text-center">
          <p className="text-lg mb-4">Preview not available</p>
          <Button onClick={handleDownload} variant="secondary">
            <Download className="h-4 w-4 mr-2" />
            Download File
          </Button>
        </div>
      );
    }
  };

  if (!currentFile) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        ref={containerRef}
        className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none"
      >
        {/* Top Controls */}
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">{currentFile.filename}</span>
            {comparisonMode && comparisonFile && (
              <span className="text-white/60 text-sm">vs {comparisonFile.filename}</span>
            )}
            <span className="text-white/60 text-sm">
              {currentIndex + 1} / {files.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Slideshow Controls */}
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? "Pause slideshow (Space)" : "Play slideshow (Space)"}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>

            {/* Annotation Mode */}
            {currentFile.mimeType?.startsWith("image/") && (
              <Button
                variant="ghost"
                size="icon"
                className={`text-white hover:bg-white/20 ${annotationMode ? 'bg-white/20' : ''}`}
                onClick={() => setAnnotationMode(!annotationMode)}
                title="Toggle annotation mode (A)"
              >
                <Pencil className="h-5 w-5" />
              </Button>
            )}

            {/* Comparison Mode */}
            {files.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className={`text-white hover:bg-white/20 ${comparisonMode ? 'bg-white/20' : ''}`}
                onClick={() => {
                  setComparisonMode(!comparisonMode);
                  if (!comparisonMode && currentIndex + 1 < files.length) {
                    setComparisonIndex(currentIndex + 1);
                  }
                }}
                title="Toggle comparison mode (C)"
              >
                <Columns2 className="h-5 w-5" />
              </Button>
            )}

            {/* Fullscreen */}
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen (F)" : "Enter fullscreen (F)"}
            >
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </Button>

            {/* Zoom Controls */}
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
            >
              <ZoomOut className="h-5 w-5" />
            </Button>
            <span className="text-white text-sm min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
            >
              <ZoomIn className="h-5 w-5" />
            </Button>

            {/* Rotation */}
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              title="Rotate (R)"
            >
              <RotateCw className="h-5 w-5" />
            </Button>

            {/* Download */}
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={handleDownload}
            >
              <Download className="h-5 w-5" />
            </Button>

            {/* Close */}
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Image Container */}
        <div className="relative w-full h-[95vh] flex items-center justify-center overflow-hidden p-4">
          {annotationMode && currentFile.mimeType?.startsWith("image/") ? (
            <div className="w-full h-full overflow-auto">
              <AnnotationCanvas
                imageUrl={currentFile.url}
                imageWidth={1200}
                imageHeight={800}
                fileId={currentFile.id}
                onSave={(dataUrl) => {
                  // Annotation is auto-saved via API
                  console.log("Annotation saved:", dataUrl);
                }}
              />
            </div>
          ) : comparisonMode && comparisonFile ? (
            <div className="flex w-full h-full gap-2">
              <div className="flex-1 flex items-center justify-center border-r border-white/20">
                {renderImage(currentFile)}
              </div>
              <div className="flex-1 flex items-center justify-center">
                {renderImage(comparisonFile)}
              </div>
            </div>
          ) : (
            renderImage(currentFile)
          )}
        </div>

        {/* Navigation Arrows */}
        {!comparisonMode && canGoPrev && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
            onClick={() => onIndexChange(currentIndex - 1)}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
        )}
        {!comparisonMode && canGoNext && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
            onClick={() => onIndexChange(currentIndex + 1)}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        )}

        {/* Comparison Mode Controls */}
        {comparisonMode && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 px-4 py-2 rounded-lg">
            <span className="text-white text-sm">Compare with:</span>
            <select
              className="bg-white/20 text-white px-3 py-1 rounded border border-white/30"
              value={comparisonIndex}
              onChange={(e) => setComparisonIndex(parseInt(e.target.value))}
            >
              {files.map((file: any, idx: number) => (
                idx !== currentIndex && (
                  <option key={idx} value={idx} className="bg-black">
                    {file.filename}
                  </option>
                )
              ))}
            </select>
          </div>
        )}

        {/* Bottom Metadata - Horizontal Layout */}
        <div className="absolute bottom-0 left-0 right-0 p-2 md:p-4 bg-gradient-to-t from-black/90 to-transparent">
          <div className="text-white/90 space-y-1">
            {currentFile.description && (
              <p className="line-clamp-1 text-xs md:text-sm truncate">{currentFile.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 md:gap-4 text-[10px] md:text-xs">
              <span className="truncate max-w-[120px] md:max-w-none">{currentFile.mimeType}</span>
              <span className="whitespace-nowrap">{(currentFile.fileSize / 1024 / 1024).toFixed(2)} MB</span>
              {currentFile.tags && currentFile.tags.length > 0 && (
                <span className="truncate flex-1">
                  Tags: {currentFile.tags.map((t: any) => t.name).join(", ")}
                </span>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
