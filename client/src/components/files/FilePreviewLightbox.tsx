import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight,
  Download,
  RotateCw
} from "lucide-react";
import { toast } from "sonner";

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
  
  const currentFile = files[currentIndex];
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < files.length - 1;

  // Reset zoom and rotation when file changes
  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, currentIndex, canGoPrev, canGoNext, onOpenChange, onIndexChange]);

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

  if (!currentFile) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none">
        {/* Top Controls */}
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">{currentFile.filename}</span>
            <span className="text-white/60 text-sm">
              {currentIndex + 1} / {files.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
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
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => setRotation((r) => (r + 90) % 360)}
            >
              <RotateCw className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={handleDownload}
            >
              <Download className="h-5 w-5" />
            </Button>
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
        <div className="relative w-full h-[95vh] flex items-center justify-center overflow-hidden">
          {currentFile.mimeType?.startsWith("image/") ? (
            <img
              src={currentFile.url}
              alt={currentFile.filename}
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
              }}
            />
          ) : currentFile.mimeType?.startsWith("video/") ? (
            <video
              src={currentFile.url}
              controls
              className="max-w-full max-h-full"
              style={{
                transform: `scale(${zoom})`,
              }}
            />
          ) : (
            <div className="text-white text-center">
              <p className="text-lg mb-4">Preview not available</p>
              <Button onClick={handleDownload} variant="secondary">
                <Download className="h-4 w-4 mr-2" />
                Download File
              </Button>
            </div>
          )}
        </div>

        {/* Navigation Arrows */}
        {canGoPrev && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
            onClick={() => onIndexChange(currentIndex - 1)}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
        )}
        {canGoNext && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
            onClick={() => onIndexChange(currentIndex + 1)}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        )}

        {/* Bottom Metadata */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <div className="text-white/80 text-sm space-y-1">
            {currentFile.description && (
              <p className="line-clamp-2">{currentFile.description}</p>
            )}
            <div className="flex items-center gap-4 text-xs">
              <span>{currentFile.mimeType}</span>
              <span>{(currentFile.fileSize / 1024 / 1024).toFixed(2)} MB</span>
              {currentFile.tags && currentFile.tags.length > 0 && (
                <span>
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
