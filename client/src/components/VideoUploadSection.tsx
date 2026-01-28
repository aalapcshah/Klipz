import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Upload, X, CheckCircle2, AlertCircle, Loader2, Video, Clock, Pause, Play, RefreshCw, Calendar, FolderOpen } from "lucide-react";
import { DuplicateWarningDialog, DuplicateFile, DuplicateAction } from "@/components/DuplicateWarningDialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";
import { useUploadManager, UploadItem, formatSpeed, formatEta } from "@/contexts/UploadManagerContext";
import { extractVideoMetadata, generateVideoThumbnail, formatDuration } from "@/lib/videoUtils";
import { compressVideo, estimateCompressedSize, getVideoMetadata, isCompressionSupported, formatFileSize, COMPRESSION_PRESETS, CompressionProgress } from "@/lib/videoCompression";
import { useFeatureAccess, useVideoLimit } from "@/components/FeatureGate";
import { Link } from "wouter";
import { Lock, Crown, Sparkles } from "lucide-react";

type VideoQuality = "original" | "high" | "medium" | "low" | "custom";

const ACCEPTED_VIDEO_FORMATS = [
  "video/mp4",
  "video/quicktime", // .mov
  "video/x-msvideo", // .avi
  "video/webm",
  "video/x-matroska", // .mkv
  "video/mpeg",
];

const MAX_FILE_SIZE = 6 * 1024 * 1024 * 1024; // 6GB - supports large video files
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks for better performance with large files
const LARGE_FILE_THRESHOLD = 500 * 1024 * 1024; // 500MB - use large file upload for files above this

const QUALITY_SETTINGS = {
  original: { label: "Original Quality", maxHeight: null, bitrate: null },
  high: { label: "High (1080p)", maxHeight: 1080, bitrate: 5000 },
  medium: { label: "Medium (720p)", maxHeight: 720, bitrate: 2500 },
  low: { label: "Low (480p)", maxHeight: 480, bitrate: 1000 },
  custom: { label: "Custom", maxHeight: null, bitrate: null },
};

export function VideoUploadSection() {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>("high");
  const [customBitrate, setCustomBitrate] = useState<number>(3000); // Custom bitrate in kbps
  const [customResolution, setCustomResolution] = useState<number>(720); // Custom max height
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleUploadId, setScheduleUploadId] = useState<string | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  
  // Duplicate detection state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [duplicateFiles, setDuplicateFiles] = useState<DuplicateFile[]>([]);
  const [nonDuplicateFiles, setNonDuplicateFiles] = useState<File[]>([]);
  
  // Compression state
  const [compressionProgress, setCompressionProgress] = useState<Map<string, CompressionProgress>>(new Map());
  const [estimatedSizes, setEstimatedSizes] = useState<Map<string, { original: number; compressed: number }>>(new Map());
  const [previewEstimate, setPreviewEstimate] = useState<{ filename: string; original: number; estimated: number; savings: string } | null>(null);
  
  const {
    uploads,
    addUpload,
    cancelUpload,
    pauseUpload,
    resumeUpload,
    removeUpload,
    retryUpload,
    scheduleUpload,
    cancelSchedule,
    updateUploadProgress,
    updateUploadStatus,
    updateUploadSessionId,
    updatePausedChunk,
    registerProcessor,
    unregisterProcessor,
    getAbortController,
    queuedCount,
    uploadingCount,
    pausedCount,
    scheduledCount,
    retryingCount,
  } = useUploadManager();

  const initUploadMutation = trpc.uploadChunk.initUpload.useMutation();
  const uploadChunkMutation = trpc.uploadChunk.uploadChunk.useMutation();
  const finalizeUploadMutation = trpc.uploadChunk.finalizeUpload.useMutation();
  
  // Large file upload mutations (for files > 500MB)
  const initLargeUploadMutation = trpc.largeFileUpload.initLargeUpload.useMutation();
  const uploadLargeChunkMutation = trpc.largeFileUpload.uploadLargeChunk.useMutation();
  const finalizeLargeUploadMutation = trpc.largeFileUpload.finalizeLargeUpload.useMutation();
  const checkDuplicatesMutation = trpc.duplicateCheck.checkBatch.useMutation();
  const updateVideoMutation = trpc.videos.update.useMutation();
  const uploadThumbnailMutation = trpc.files.uploadThumbnail.useMutation();

  // Feature gate hooks
  const { allowed: canUploadVideos, loading: featureLoading } = useFeatureAccess('uploadVideo');
  const { allowed: hasVideoSlots, currentCount: videoCount, limit: videoLimit, message: videoLimitMessage } = useVideoLimit();
  
  // Filter uploads to show only video uploads
  const videoUploads = uploads.filter(u => u.uploadType === 'video');

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_VIDEO_FORMATS.includes(file.type)) {
      return `Invalid format. Accepted formats: MP4, MOV, AVI, WebM, MKV, MPEG`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size: 6GB`;
    }
    return null;
  };

  const readChunk = (file: File, start: number, end: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const blob = file.slice(start, end);
      
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1]; // Remove data:... prefix
        resolve(base64);
      };
      
      reader.onerror = () => reject(new Error("Failed to read chunk"));
      reader.readAsDataURL(blob);
    });
  };

  // Video upload processor - registered with UploadManager
  const processVideoUpload = useCallback(async (uploadId: string, file: File, resumeFromChunk?: number) => {
    const abortController = getAbortController(uploadId);
    
    try {
      // Check if already cancelled
      if (abortController?.signal.aborted) {
        return;
      }

      // Get quality from upload metadata
      const upload = uploads.find(u => u.id === uploadId);
      const quality = (upload?.metadata?.quality as VideoQuality) || 'high';
      
      // Compress video if quality is not original and compression is supported
      let fileToUpload = file;
      if (quality !== 'original' && isCompressionSupported() && !resumeFromChunk) {
        updateUploadStatus(uploadId, 'uploading'); // Show as active
        toast.info(`Compressing ${file.name}...`, { duration: 3000 });
        
        // Get compression settings - use custom values if quality is 'custom'
        const compressionSettings = quality === 'custom' 
          ? { maxHeight: customResolution, videoBitrate: customBitrate, audioBitrate: 128 }
          : COMPRESSION_PRESETS[quality];
        try {
          fileToUpload = await compressVideo(file, compressionSettings, (progress) => {
            setCompressionProgress(prev => {
              const newMap = new Map(prev);
              newMap.set(uploadId, progress);
              return newMap;
            });
            // Update progress during compression (0-30%)
            if (progress.stage === 'encoding') {
              // Show estimated compressed bytes based on compression progress
              const estimatedCompressedSize = file.size * 0.5; // Estimate 50% compression
              const estimatedBytes = Math.floor(progress.progress * 0.01 * estimatedCompressedSize);
              updateUploadProgress(uploadId, progress.progress * 0.3, estimatedBytes);
            }
          });
          
          // Clear compression progress
          setCompressionProgress(prev => {
            const newMap = new Map(prev);
            newMap.delete(uploadId);
            return newMap;
          });
          
          const savings = ((file.size - fileToUpload.size) / file.size * 100).toFixed(1);
          if (fileToUpload.size < file.size) {
            toast.success(`Compressed ${file.name}: ${formatFileSize(file.size)} → ${formatFileSize(fileToUpload.size)} (${savings}% smaller)`);
          }
        } catch (compressError) {
          console.warn('Compression failed, uploading original:', compressError);
          toast.warning(`Compression failed for ${file.name}, uploading original`);
          fileToUpload = file;
        }
      }
      
      const isLargeFile = fileToUpload.size > LARGE_FILE_THRESHOLD;

      // Initialize upload session (or reuse existing)
      let sessionId = upload?.sessionId;
      let startChunk = resumeFromChunk || 0;
      let totalChunks: number;
      
      if (!sessionId) {
        if (isLargeFile) {
          // Use large file upload for files > 500MB
          console.log(`[Upload] Using large file upload for ${fileToUpload.name} (${(fileToUpload.size / (1024 * 1024 * 1024)).toFixed(2)} GB)`);
          const initResult = await initLargeUploadMutation.mutateAsync({
            filename: file.name, // Keep original filename
            totalSize: fileToUpload.size,
            mimeType: fileToUpload.type,
          });
          sessionId = initResult.sessionId;
          totalChunks = initResult.totalChunks;
        } else {
          const initResult = await initUploadMutation.mutateAsync({
            filename: file.name, // Keep original filename
            totalSize: fileToUpload.size,
            mimeType: fileToUpload.type,
          });
          sessionId = initResult.sessionId;
          totalChunks = Math.ceil(fileToUpload.size / CHUNK_SIZE);
        }
        updateUploadSessionId(uploadId, sessionId);
      } else {
        totalChunks = Math.ceil(fileToUpload.size / CHUNK_SIZE);
      }
      
      // Upload chunks (progress starts at 30% after compression)
      const progressOffset = quality !== 'original' && isCompressionSupported() ? 30 : 0;
      for (let i = startChunk; i < totalChunks; i++) {
        // Check if paused or cancelled
        if (abortController?.signal.aborted) {
          updatePausedChunk(uploadId, i);
          return;
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileToUpload.size);
        const chunkData = await readChunk(fileToUpload, start, end);

        let retries = 0;
        const maxRetries = 3;
        
        while (retries < maxRetries) {
          try {
            if (isLargeFile) {
              await uploadLargeChunkMutation.mutateAsync({
                sessionId,
                chunkIndex: i,
                chunkData,
              });
            } else {
              await uploadChunkMutation.mutateAsync({
                sessionId,
                chunkIndex: i,
                chunkData,
                totalChunks,
              });
            }
            break;
          } catch (error: any) {
            retries++;
            if (retries >= maxRetries) {
              throw new Error(`Failed to upload chunk ${i} after ${maxRetries} attempts: ${error.message}`);
            }
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
          }
        }

        // Update progress (account for compression phase if applicable)
        const uploadProgress = ((i + 1) / totalChunks) * (100 - progressOffset);
        const progress = progressOffset + uploadProgress;
        const uploadedBytes = Math.min((i + 1) * CHUNK_SIZE, fileToUpload.size);
        updateUploadProgress(uploadId, progress, uploadedBytes);
      }

      // Finalize upload
      const result = isLargeFile 
        ? await finalizeLargeUploadMutation.mutateAsync({ sessionId })
        : await finalizeUploadMutation.mutateAsync({ sessionId });

      // Extract duration, resolution and generate thumbnail in background
      try {
        // Extract video metadata (duration and resolution)
        const metadata = await extractVideoMetadata(file);
        
        // Generate thumbnail
        const thumbnailBlob = await generateVideoThumbnail(file);
        
        // Convert thumbnail to base64
        const thumbnailBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(thumbnailBlob);
        });
        
        // Upload thumbnail to S3
        const thumbnailFilename = `${file.name.replace(/\.[^/.]+$/, '')}_thumb.jpg`;
        const thumbnailResult = await uploadThumbnailMutation.mutateAsync({
          content: thumbnailBase64,
          filename: thumbnailFilename,
          mimeType: 'image/jpeg',
        });
        
        // Update video with duration, resolution and thumbnail
        if (result.videoId) {
          await updateVideoMutation.mutateAsync({
            id: result.videoId,
            duration: metadata.duration,
            width: metadata.width,
            height: metadata.height,
            thumbnailUrl: thumbnailResult.url,
            thumbnailKey: thumbnailResult.key,
          });
        }
      } catch (metadataError) {
        console.warn('Failed to extract video metadata:', metadataError);
        // Don't fail the upload if metadata extraction fails
      }

      updateUploadStatus(uploadId, 'completed', {
        fileId: result.fileId,
        url: result.url,
      });

      triggerHaptic("success");

    } catch (error: any) {
      // Don't show error if cancelled/paused
      if (abortController?.signal.aborted) {
        return;
      }
      
      console.error("Upload error:", error);
      updateUploadStatus(uploadId, 'error', undefined, error.message || "Upload failed");
      triggerHaptic("error");
    }
  }, [
    getAbortController,
    uploads,
    initUploadMutation,
    uploadChunkMutation,
    finalizeUploadMutation,
    initLargeUploadMutation,
    uploadLargeChunkMutation,
    finalizeLargeUploadMutation,
    uploadThumbnailMutation,
    updateVideoMutation,
    updateUploadSessionId,
    updateUploadProgress,
    updateUploadStatus,
    updatePausedChunk,
  ]);

  // Register video processor on mount
  useEffect(() => {
    registerProcessor('video', processVideoUpload);
    return () => {
      unregisterProcessor('video');
    };
  }, [registerProcessor, unregisterProcessor, processVideoUpload]);

  // Helper to add files to upload queue
  const addFilesToQueue = (filesToAdd: File[]) => {
    for (const file of filesToAdd) {
      addUpload(file, 'video', {
        quality: selectedQuality,
      });
    }
    if (filesToAdd.length > 0) {
      toast.success(`Added ${filesToAdd.length} video${filesToAdd.length !== 1 ? 's' : ''} to queue`);
      triggerHaptic("success");
    }
  };

  // Check files for duplicates before adding to queue
  const checkAndAddFiles = async (filesToCheck: File[]) => {
    if (filesToCheck.length === 0) return;

    // Validate files first
    const validFiles: File[] = [];
    for (const file of filesToCheck) {
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        triggerHaptic("error");
      } else {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) return;

    // Check for duplicates
    try {
      const result = await checkDuplicatesMutation.mutateAsync({
        files: validFiles.map(f => ({
          filename: f.name,
          fileSize: f.size,
          type: 'video' as const,
        })),
      });

      if (result.hasDuplicates) {
        // Separate duplicates from non-duplicates
        const duplicates: DuplicateFile[] = [];
        const nonDuplicates: File[] = [];

        for (let i = 0; i < validFiles.length; i++) {
          const checkResult = result.results[i];
          if (checkResult.isDuplicate && checkResult.existingFile) {
            duplicates.push({
              filename: validFiles[i].name,
              fileSize: validFiles[i].size,
              type: 'video',
              existingFile: checkResult.existingFile,
            });
          } else {
            nonDuplicates.push(validFiles[i]);
          }
        }

        // Store state and show dialog
        setPendingFiles(validFiles);
        setDuplicateFiles(duplicates);
        setNonDuplicateFiles(nonDuplicates);
        setDuplicateDialogOpen(true);
      } else {
        // No duplicates, add all files
        addFilesToQueue(validFiles);
      }
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      // On error, proceed with upload anyway
      addFilesToQueue(validFiles);
    }
  };

  // Handle duplicate dialog confirmation
  const handleDuplicateConfirm = (action: DuplicateAction, applyToAll: boolean) => {
    const filesToUpload: File[] = [];

    if (action === 'skip') {
      // Only upload non-duplicates
      filesToUpload.push(...nonDuplicateFiles);
      if (duplicateFiles.length > 0) {
        toast.info(`Skipped ${duplicateFiles.length} duplicate file${duplicateFiles.length !== 1 ? 's' : ''}`);
      }
    } else if (action === 'replace' || action === 'keep_both') {
      // Upload all files (for now, both actions upload the new file)
      // TODO: Implement actual replace logic (delete existing file first)
      filesToUpload.push(...pendingFiles);
      if (action === 'keep_both') {
        toast.info('Files will be uploaded with the same name. Consider renaming to avoid confusion.');
      }
    }

    addFilesToQueue(filesToUpload);

    // Reset state
    setPendingFiles([]);
    setDuplicateFiles([]);
    setNonDuplicateFiles([]);
  };

  // Handle duplicate dialog cancel
  const handleDuplicateCancel = () => {
    toast.info('Upload cancelled');
    setPendingFiles([]);
    setDuplicateFiles([]);
    setNonDuplicateFiles([]);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    // Check feature access
    if (!canUploadVideos) {
      toast.error('Video uploads require a Pro subscription', {
        description: 'Start a free trial or upgrade to Pro to upload videos.',
        action: {
          label: 'View Plans',
          onClick: () => window.location.href = '/pricing',
        },
      });
      return;
    }
    
    // Check video limit
    if (!hasVideoSlots) {
      toast.error(videoLimitMessage || 'Video upload limit reached', {
        description: 'Upgrade to Pro for unlimited video uploads.',
        action: {
          label: 'Upgrade',
          onClick: () => window.location.href = '/pricing',
        },
      });
      return;
    }
    
    // Calculate estimated compression for first file
    const fileArray = Array.from(files);
    if (fileArray.length > 0 && selectedQuality !== 'original' && isCompressionSupported()) {
      const firstFile = fileArray[0];
      try {
        const metadata = await getVideoMetadata(firstFile);
        const settings = COMPRESSION_PRESETS[selectedQuality];
        const estimated = estimateCompressedSize(firstFile.size, metadata.duration, settings);
        const savings = ((firstFile.size - estimated) / firstFile.size * 100).toFixed(1);
        setPreviewEstimate({
          filename: firstFile.name,
          original: firstFile.size,
          estimated,
          savings: `${savings}%`,
        });
      } catch (e) {
        console.warn('Could not estimate compression:', e);
      }
    }
    
    await checkAndAddFiles(fileArray);
  };

  const handleFolderSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    // Filter for video files from the folder
    const videoFiles: File[] = [];
    let skippedCount = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Check if it's a video file
      if (ACCEPTED_VIDEO_FORMATS.includes(file.type) || 
          file.name.match(/\.(mp4|mov|avi|webm|mkv|mpeg|mpg|m4v)$/i)) {
        videoFiles.push(file);
      } else {
        skippedCount++;
      }
    }
    
    if (videoFiles.length === 0) {
      toast.error("No valid video files found in the selected folder");
      triggerHaptic("error");
      return;
    }
    
    if (skippedCount > 0) {
      toast.info(`${skippedCount} non-video file${skippedCount !== 1 ? 's' : ''} skipped`);
    }
    
    // Check for duplicates
    await checkAndAddFiles(videoFiles);
    
    // Reset the input
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  const handleCancelUpload = (uploadId: string) => {
    cancelUpload(uploadId);
    triggerHaptic("light");
  };

  const handlePauseUpload = (uploadId: string) => {
    pauseUpload(uploadId);
    triggerHaptic("light");
  };

  const handleResumeUpload = (uploadId: string) => {
    resumeUpload(uploadId);
    triggerHaptic("light");
  };

  const handleRetryUpload = (uploadId: string) => {
    retryUpload(uploadId);
    triggerHaptic("light");
  };

  const openScheduleDialog = (uploadId: string) => {
    setScheduleUploadId(uploadId);
    // Default to 1 hour from now
    const defaultTime = new Date(Date.now() + 60 * 60 * 1000);
    setScheduleTime(defaultTime.toISOString().slice(0, 16));
    setScheduleDialogOpen(true);
  };

  const handleScheduleConfirm = () => {
    if (scheduleUploadId && scheduleTime) {
      const scheduledTimestamp = new Date(scheduleTime).getTime();
      if (scheduledTimestamp > Date.now()) {
        scheduleUpload(scheduleUploadId, scheduledTimestamp);
        triggerHaptic("success");
      } else {
        toast.error("Please select a future time");
      }
    }
    setScheduleDialogOpen(false);
    setScheduleUploadId(null);
  };

  const handleCancelSchedule = (uploadId: string) => {
    cancelSchedule(uploadId);
    triggerHaptic("light");
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatScheduledTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleString([], { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploading':
        return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-muted-foreground" />;
      case 'paused':
        return <Pause className="w-5 h-5 text-yellow-500" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'cancelled':
        return <X className="w-5 h-5 text-muted-foreground" />;
      case 'retrying':
        return <RefreshCw className="w-5 h-5 animate-spin text-orange-500" />;
      case 'scheduled':
        return <Calendar className="w-5 h-5 text-blue-500" />;
      default:
        return null;
    }
  };

  // Show upgrade banner if video uploads are not allowed
  if (!canUploadVideos && !featureLoading) {
    return (
      <div className="space-y-6">
        <Card className="p-6 border-dashed">
          <div className="text-center py-8">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Lock className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Video Uploads are a Pro Feature</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Upload, annotate, and transcribe videos with a Pro subscription. 
              Start with a free 14-day trial - no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/pricing">
                <Button className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Start Free Trial
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="outline" className="gap-2">
                  <Crown className="h-4 w-4" />
                  View Plans
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Quality Selector */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Upload Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Video Quality</label>
            <Select value={selectedQuality} onValueChange={(v) => setSelectedQuality(v as VideoQuality)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(QUALITY_SETTINGS).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-2">
              {selectedQuality === "original"
                ? "Upload without any compression or quality reduction"
                : `Video will be compressed to ${QUALITY_SETTINGS[selectedQuality].label} before upload`}
            </p>
            {selectedQuality !== "original" && (
              <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  {isCompressionSupported() ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="text-green-600">Browser compression supported</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-yellow-500" />
                      <span className="text-yellow-600">Compression not supported - original file will be uploaded</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedQuality === 'custom' 
                    ? `Compression reduces file size by re-encoding at ${customBitrate} kbps (${customResolution}p)`
                    : `Compression reduces file size by re-encoding at ${QUALITY_SETTINGS[selectedQuality].bitrate} kbps`}
                </p>
                
                {/* Custom compression controls */}
                {selectedQuality === 'custom' && (
                  <div className="mt-3 space-y-4 p-3 bg-background rounded border">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-medium">Video Bitrate</label>
                        <span className="text-xs text-muted-foreground">{customBitrate} kbps</span>
                      </div>
                      <Slider
                        value={[customBitrate]}
                        onValueChange={(v) => setCustomBitrate(v[0])}
                        min={500}
                        max={8000}
                        step={100}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>500 kbps (smaller)</span>
                        <span>8000 kbps (better quality)</span>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-medium">Max Resolution</label>
                        <span className="text-xs text-muted-foreground">{customResolution}p</span>
                      </div>
                      <Slider
                        value={[customResolution]}
                        onValueChange={(v) => setCustomResolution(v[0])}
                        min={360}
                        max={1080}
                        step={90}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>360p</span>
                        <span>1080p</span>
                      </div>
                    </div>
                  </div>
                )}
                {previewEstimate && (
                  <div className="mt-2 p-2 bg-background rounded border">
                    <p className="text-xs font-medium">Estimated for {previewEstimate.filename}:</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs">{formatFileSize(previewEstimate.original)}</span>
                      <span className="text-xs">→</span>
                      <span className="text-xs text-green-600 font-medium">{formatFileSize(previewEstimate.estimated)}</span>
                      <span className="text-xs text-green-600">({previewEstimate.savings} smaller)</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Upload Area */}
      <Card
        className={`border-2 border-dashed transition-colors ${
          isDragging ? "border-primary bg-primary/5" : "border-border"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="p-12 text-center">
          <Video className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Upload Videos</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Drag and drop video files here, or click to browse
          </p>
          <div className="flex gap-2 justify-center mb-2">
            <Button
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              Choose Files
            </Button>
            <Button
              variant="outline"
              onClick={() => folderInputRef.current?.click()}
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Choose Folder
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Supported: MP4, MOV, AVI, WebM, MKV, MPEG (max 4GB)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_VIDEO_FORMATS.join(",")}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <input
            ref={folderInputRef}
            type="file"
            // @ts-ignore - webkitdirectory is not in the type definitions
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            onChange={(e) => handleFolderSelect(e.target.files)}
          />
        </div>
      </Card>

      {/* Queue Status */}
      {(queuedCount > 0 || pausedCount > 0 || scheduledCount > 0 || retryingCount > 0) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-2">
          <Clock className="w-4 h-4" />
          <span>
            {uploadingCount > 0 && `${uploadingCount} uploading`}
            {queuedCount > 0 && `${uploadingCount > 0 ? ', ' : ''}${queuedCount} in queue`}
            {pausedCount > 0 && `, ${pausedCount} paused`}
            {retryingCount > 0 && `, ${retryingCount} retrying`}
            {scheduledCount > 0 && `, ${scheduledCount} scheduled`}
            {" "}(max 3 concurrent uploads)
          </span>
        </div>
      )}

      {/* Uploading Files List */}
      {videoUploads.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Uploads ({videoUploads.length})</h3>
          {videoUploads.map((upload) => (
            <Card key={upload.id} className="p-4">
              <div className="flex items-start gap-3">
                <Video className="w-10 h-10 text-muted-foreground flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{upload.filename}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(upload.fileSize)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {getStatusIcon(upload.status)}
                      
                      {/* Pause button for uploading */}
                      {upload.status === "uploading" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePauseUpload(upload.id)}
                          title="Pause upload"
                        >
                          <Pause className="w-4 h-4" />
                        </Button>
                      )}
                      
                      {/* Resume button for paused */}
                      {upload.status === "paused" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResumeUpload(upload.id)}
                          title="Resume upload"
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                      )}
                      
                      {/* Retry button for errors */}
                      {upload.status === "error" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRetryUpload(upload.id)}
                          title="Retry upload"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      )}
                      
                      {/* Schedule button for pending/paused/error */}
                      {(upload.status === "pending" || upload.status === "paused" || upload.status === "error") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openScheduleDialog(upload.id)}
                          title="Schedule upload"
                        >
                          <Calendar className="w-4 h-4" />
                        </Button>
                      )}
                      
                      {/* Start now button for scheduled */}
                      {upload.status === "scheduled" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelSchedule(upload.id)}
                          title="Start now"
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                      )}
                      
                      {/* Cancel button for active uploads */}
                      {(upload.status === "pending" || upload.status === "uploading" || upload.status === "paused" || upload.status === "retrying" || upload.status === "scheduled") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelUpload(upload.id)}
                          title="Cancel upload"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                      
                      {/* Remove button for finished uploads */}
                      {(upload.status === "error" || upload.status === "completed" || upload.status === "cancelled") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeUpload(upload.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {(upload.status === "uploading" || upload.status === "pending" || upload.status === "paused") && (
                    <div className="space-y-1">
                      <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            upload.status === "paused" ? "bg-yellow-500" : "bg-primary"
                          }`}
                          style={{ width: `${upload.progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {upload.status === "pending" && "Queued..."}
                          {upload.status === "paused" && "Paused"}
                          {upload.status === "uploading" && (
                            upload.progress < 30 && compressionProgress.has(upload.id)
                              ? `Compressing... ${upload.progress.toFixed(0)}%`
                              : `${upload.progress.toFixed(0)}%`
                          )}
                        </span>
                        <div className="flex gap-3">
                          {upload.status === "uploading" && upload.progress >= 30 && upload.speed > 0 && (
                            <>
                              <span>{formatSpeed(upload.speed)}</span>
                              <span>ETA: {formatEta(upload.eta)}</span>
                            </>
                          )}
                          <span>
                            {upload.progress < 30 && compressionProgress.has(upload.id)
                              ? `Compressing...`
                              : `${formatFileSize(upload.uploadedBytes)} / ${formatFileSize(upload.fileSize)}`
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Retry countdown */}
                  {upload.status === "retrying" && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-orange-500">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>
                          Retrying in {upload.retryCountdown}s... (Attempt {upload.retryCount}/3)
                        </span>
                      </div>
                      {upload.error && (
                        <p className="text-sm text-muted-foreground">{upload.error}</p>
                      )}
                    </div>
                  )}

                  {/* Scheduled time */}
                  {upload.status === "scheduled" && upload.scheduledFor && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 text-sm text-blue-500">
                        <Calendar className="w-4 h-4" />
                        <span>Scheduled for {formatScheduledTime(upload.scheduledFor)}</span>
                      </div>
                    </div>
                  )}

                  {/* Error Message */}
                  {upload.status === "error" && upload.error && (
                    <div className="mt-2 space-y-2">
                      <p className="text-sm text-red-600">{upload.error}</p>
                      <p className="text-xs text-muted-foreground">
                        Max retries exceeded. Click retry to try again.
                      </p>
                    </div>
                  )}

                  {/* Success Message */}
                  {upload.status === "completed" && (
                    <p className="text-sm text-green-600 mt-2">
                      Upload complete!
                    </p>
                  )}
                  
                  {/* Cancelled Message */}
                  {upload.status === "cancelled" && (
                    <div className="mt-2 space-y-2">
                      <p className="text-sm text-muted-foreground">Upload was cancelled</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Duplicate Warning Dialog */}
      <DuplicateWarningDialog
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
        duplicates={duplicateFiles}
        onConfirm={handleDuplicateConfirm}
        onCancel={handleDuplicateCancel}
      />

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Upload</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-time">Start upload at</Label>
              <Input
                id="schedule-time"
                type="datetime-local"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              The upload will automatically start at the scheduled time. This is useful for uploading large files during off-peak hours when network bandwidth is typically better.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleScheduleConfirm}>
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
