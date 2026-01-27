import { useState, useEffect, useCallback, ReactNode } from "react";
import { Upload, Video, FileImage } from "lucide-react";
import { useUploadManager } from "@/contexts/UploadManagerContext";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";

const VIDEO_FORMATS = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
  "video/x-matroska",
  "video/mpeg",
];

const IMAGE_FORMATS = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
];

const DOCUMENT_FORMATS = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

const ALL_SUPPORTED_FORMATS = [...VIDEO_FORMATS, ...IMAGE_FORMATS, ...DOCUMENT_FORMATS];

const MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024; // 4GB
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB for regular files

interface GlobalDropZoneProps {
  children: ReactNode;
}

export function GlobalDropZone({ children }: GlobalDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const { addUpload, addUploads } = useUploadManager();

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
    
    if (e.dataTransfer?.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragCounter(0);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const validFiles: { file: File; uploadType: 'video' | 'file' }[] = [];
    const errors: string[] = [];

    for (const file of fileArray) {
      // Check if format is supported
      if (!ALL_SUPPORTED_FORMATS.includes(file.type)) {
        errors.push(`${file.name}: Unsupported format`);
        continue;
      }

      // Check size limits
      const isVideo = VIDEO_FORMATS.includes(file.type);
      const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
      
      if (file.size > maxSize) {
        const maxSizeStr = isVideo ? '4GB' : '100MB';
        errors.push(`${file.name}: File too large (max ${maxSizeStr})`);
        continue;
      }

      validFiles.push({
        file,
        uploadType: isVideo ? 'video' : 'file',
      });
    }

    // Show errors
    if (errors.length > 0) {
      errors.forEach(error => toast.error(error));
      triggerHaptic("error");
    }

    // Add valid files to upload queue
    if (validFiles.length > 0) {
      const videoFiles = validFiles.filter(f => f.uploadType === 'video');
      const regularFiles = validFiles.filter(f => f.uploadType === 'file');

      if (videoFiles.length > 0) {
        addUploads(videoFiles.map(f => ({
          file: f.file,
          uploadType: 'video' as const,
          metadata: { quality: 'high' },
        })));
        toast.success(`${videoFiles.length} video(s) added to upload queue`);
      }

      if (regularFiles.length > 0) {
        addUploads(regularFiles.map(f => ({
          file: f.file,
          uploadType: 'file' as const,
        })));
        toast.success(`${regularFiles.length} file(s) added to upload queue`);
      }

      triggerHaptic("success");
    }
  }, [addUploads]);

  useEffect(() => {
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  return (
    <>
      {children}
      
      {/* Global drop overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card border-2 border-dashed border-primary rounded-2xl p-12 max-w-lg mx-4 text-center shadow-2xl">
            <div className="flex justify-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Video className="w-8 h-8 text-primary" />
              </div>
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <FileImage className="w-8 h-8 text-primary" />
              </div>
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="w-8 h-8 text-primary" />
              </div>
            </div>
            
            <h2 className="text-2xl font-bold mb-2">Drop files to upload</h2>
            <p className="text-muted-foreground mb-4">
              Videos, images, and documents will be automatically sorted
            </p>
            
            <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
              <span className="bg-muted px-2 py-1 rounded">Videos: MP4, MOV, AVI, WebM</span>
              <span className="bg-muted px-2 py-1 rounded">Images: JPG, PNG, GIF, WebP</span>
              <span className="bg-muted px-2 py-1 rounded">Docs: PDF, Word, Excel</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
