import { useState, useEffect, useCallback, ReactNode } from "react";
import { Upload, Video, FileImage, FolderOpen, AlertTriangle } from "lucide-react";
import { useUploadManager } from "@/contexts/UploadManagerContext";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";
import { extractFilesFromDataTransfer, isVideoFile, FolderFile } from "@/lib/folderUpload";
import { trpcCall } from "@/lib/trpcCall";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface DuplicateInfo {
  file: File;
  uploadType: 'video' | 'file';
  existingFile: {
    id: number;
    filename: string;
    fileSize: number;
    url: string;
    createdAt: Date;
    type: 'video' | 'file';
  };
}

interface GlobalDropZoneProps {
  children: ReactNode;
}

export function GlobalDropZone({ children }: GlobalDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isFolder, setIsFolder] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const { addUploads } = useUploadManager();

  // Deduplication dialog state
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([]);
  const [nonDuplicates, setNonDuplicates] = useState<{ file: File; uploadType: 'video' | 'file' }[]>([]);
  const [selectedDuplicates, setSelectedDuplicates] = useState<Set<string>>(new Set());

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

  // Actually queue the files for upload
  const queueFiles = useCallback((files: { file: File; uploadType: 'video' | 'file' }[]) => {
    const videoFiles = files.filter(f => f.uploadType === 'video');
    const regularFiles = files.filter(f => f.uploadType === 'file');

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
  }, [addUploads]);

  // Handle duplicate dialog actions
  const handleUploadAll = useCallback(() => {
    // Upload everything: non-duplicates + all duplicates
    const allFiles = [
      ...nonDuplicates,
      ...duplicates.map(d => ({ file: d.file, uploadType: d.uploadType })),
    ];
    queueFiles(allFiles);
    setShowDuplicateDialog(false);
    setDuplicates([]);
    setNonDuplicates([]);
    setSelectedDuplicates(new Set());
  }, [nonDuplicates, duplicates, queueFiles]);

  const handleSkipDuplicates = useCallback(() => {
    // Upload only non-duplicates
    if (nonDuplicates.length > 0) {
      queueFiles(nonDuplicates);
    } else {
      toast.info("All files were duplicates — nothing to upload");
    }
    setShowDuplicateDialog(false);
    setDuplicates([]);
    setNonDuplicates([]);
    setSelectedDuplicates(new Set());
  }, [nonDuplicates, queueFiles]);

  const handleUploadSelected = useCallback(() => {
    // Upload non-duplicates + selected duplicates
    const selectedDups = duplicates
      .filter(d => selectedDuplicates.has(`${d.file.name}:${d.file.size}`))
      .map(d => ({ file: d.file, uploadType: d.uploadType }));
    const allFiles = [...nonDuplicates, ...selectedDups];
    if (allFiles.length > 0) {
      queueFiles(allFiles);
    } else {
      toast.info("No files selected for upload");
    }
    setShowDuplicateDialog(false);
    setDuplicates([]);
    setNonDuplicates([]);
    setSelectedDuplicates(new Set());
  }, [nonDuplicates, duplicates, selectedDuplicates, queueFiles]);

  const toggleDuplicate = useCallback((key: string) => {
    setSelectedDuplicates(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const processFiles = useCallback(async (files: File[] | FolderFile[]) => {
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

    if (validFiles.length === 0) {
      if (errors.length === 0) {
        toast.info("No supported files found");
      }
      return;
    }

    // Check for duplicates before uploading
    try {
      const checkResult = await trpcCall<{
        results: Array<{
          filename: string;
          fileSize: number;
          type: 'video' | 'file';
          isDuplicate: boolean;
          existingFile?: {
            id: number;
            filename: string;
            fileSize: number;
            url: string;
            createdAt: string;
            type: 'video' | 'file';
          };
        }>;
        hasDuplicates: boolean;
        duplicateCount: number;
      }>('duplicateCheck.checkBatch', {
        files: validFiles.map(f => ({
          filename: f.file.name,
          fileSize: f.file.size,
          type: f.uploadType,
        })),
      }, 'mutation', { timeoutMs: 15000 });

      if (checkResult.hasDuplicates) {
        // Build duplicate and non-duplicate lists
        const dupeList: DuplicateInfo[] = [];
        const nonDupeList: { file: File; uploadType: 'video' | 'file' }[] = [];

        for (const result of checkResult.results) {
          const matchingFile = validFiles.find(
            f => f.file.name === result.filename && f.file.size === result.fileSize
          );
          if (!matchingFile) continue;

          if (result.isDuplicate && result.existingFile) {
            dupeList.push({
              file: matchingFile.file,
              uploadType: matchingFile.uploadType,
              existingFile: {
                ...result.existingFile,
                createdAt: new Date(result.existingFile.createdAt),
              },
            });
          } else {
            nonDupeList.push(matchingFile);
          }
        }

        // Show the duplicate warning dialog
        setDuplicates(dupeList);
        setNonDuplicates(nonDupeList);
        setSelectedDuplicates(new Set()); // Start with none selected
        setShowDuplicateDialog(true);
        triggerHaptic("warning");
        return;
      }
    } catch (err) {
      // If duplicate check fails, just proceed with upload
      console.warn("[GlobalDropZone] Duplicate check failed, proceeding with upload:", err);
    }

    // No duplicates found — queue all files
    queueFiles(validFiles);
  }, [queueFiles]);

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

      {/* Duplicate files warning dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={(open) => {
        if (!open) {
          setShowDuplicateDialog(false);
          setDuplicates([]);
          setNonDuplicates([]);
          setSelectedDuplicates(new Set());
        }
      }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Duplicate Files Detected
            </DialogTitle>
            <DialogDescription>
              {duplicates.length === 1
                ? "1 file already exists in your library."
                : `${duplicates.length} files already exist in your library.`}
              {nonDuplicates.length > 0 && (
                <> {nonDuplicates.length} new file{nonDuplicates.length > 1 ? 's' : ''} will be uploaded regardless.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {duplicates.map((dup) => {
              const key = `${dup.file.name}:${dup.file.size}`;
              const isSelected = selectedDuplicates.has(key);
              return (
                <div
                  key={key}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                  }`}
                  onClick={() => toggleDuplicate(key)}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleDuplicate(key)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{dup.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(dup.file.size)} · Already uploaded on{" "}
                      {new Date(dup.existingFile.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full whitespace-nowrap">
                    Duplicate
                  </span>
                </div>
              );
            })}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleSkipDuplicates}
              >
                Skip Duplicates
              </Button>
              <Button
                className="flex-1"
                onClick={selectedDuplicates.size > 0 ? handleUploadSelected : handleUploadAll}
              >
                {selectedDuplicates.size > 0
                  ? `Upload Selected (${selectedDuplicates.size + nonDuplicates.length})`
                  : `Upload All (${duplicates.length + nonDuplicates.length})`
                }
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
