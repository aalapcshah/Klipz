import { useState, useEffect, useCallback, ReactNode } from "react";
import { Upload, Video, FileImage, FolderOpen } from "lucide-react";
import { useUploadManager } from "@/contexts/UploadManagerContext";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";
import { extractFilesFromDataTransfer, isVideoFile, FolderFile } from "@/lib/folderUpload";

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
  const [isFolder, setIsFolder] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const { addUploads } = useUploadManager();

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
    
    if (e.dataTransfer?.types.includes('Files')) {
      setIsDragging(true);
      
      // Try to detect if it's a folder
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        const entry = items[0].webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          setIsFolder(true);
        } else {
          setIsFolder(false);
        }
      }
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
        setIsFolder(false);
      }
      return newCount;
    });
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const processFiles = useCallback((files: File[] | FolderFile[]) => {
    const validFiles: { file: File; uploadType: 'video' | 'file' }[] = [];
    const errors: string[] = [];

    for (const item of files) {
      const file = 'file' in item ? item.file : item;
      
      // Check if format is supported
      const isVideo = VIDEO_FORMATS.includes(file.type) || isVideoFile(file);
      const isImage = IMAGE_FORMATS.includes(file.type);
      const isDocument = DOCUMENT_FORMATS.includes(file.type);
      
      if (!isVideo && !isImage && !isDocument) {
        // Skip unsupported files silently for folders
        continue;
      }

      // Check size limits
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

    // Show errors (limit to first 3)
    if (errors.length > 0) {
      errors.slice(0, 3).forEach(error => toast.error(error));
      if (errors.length > 3) {
        toast.error(`...and ${errors.length - 3} more files with errors`);
      }
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
    } else if (errors.length === 0) {
      toast.info("No supported files found");
    }
  }, [addUploads]);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setIsFolder(false);
    setDragCounter(0);

    const items = e.dataTransfer?.items;
    const files = e.dataTransfer?.files;
    
    if (!items && !files) return;

    // Check if any item is a directory
    let hasDirectory = false;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          hasDirectory = true;
          break;
        }
      }
    }

    if (hasDirectory && items) {
      // Use File System Access API for folder traversal
      toast.info("Processing folder contents...");
      try {
        const folderFiles = await extractFilesFromDataTransfer(items);
        if (folderFiles.length === 0) {
          toast.info("No files found in the folder");
          return;
        }
        processFiles(folderFiles);
      } catch (error) {
        console.error("Error processing folder:", error);
        toast.error("Failed to process folder contents");
        triggerHaptic("error");
      }
    } else if (files && files.length > 0) {
      // Regular file drop
      processFiles(Array.from(files));
    }
  }, [processFiles]);

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
              {isFolder ? (
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <FolderOpen className="w-10 h-10 text-primary" />
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Video className="w-8 h-8 text-primary" />
                  </div>
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileImage className="w-8 h-8 text-primary" />
                  </div>
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                </>
              )}
            </div>
            
            <h2 className="text-2xl font-bold mb-2">
              {isFolder ? "Drop folder to upload" : "Drop files to upload"}
            </h2>
            <p className="text-muted-foreground mb-4">
              {isFolder 
                ? "All supported files in the folder will be uploaded"
                : "Videos, images, and documents will be automatically sorted"
              }
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
