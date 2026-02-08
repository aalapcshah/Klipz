import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatFileSize, CompressionProgress } from "@/lib/videoCompression";
import { useFeatureAccess, useVideoLimit } from "@/components/FeatureGate";
import { Link } from "wouter";
import { Lock, Crown, Sparkles } from "lucide-react";
import { UploadTranscriptInline } from "@/components/UploadTranscriptInline";
import { useUploadSettings, type ThrottleLevel, getThrottlePresets, getThrottleLabel } from "@/hooks/useUploadSettings";
// CompressionPreviewDialog no longer needed (compression moved to server-side)

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
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks - smaller chunks are more reliable through reverse proxies
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB - use large file upload (disk-based) for files above this

// Format time duration for ETA display
function formatTimeDuration(ms: number): string {
  if (ms < 0 || !isFinite(ms)) return '--:--';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const QUALITY_SETTINGS = {
  original: { label: "Original Quality", maxHeight: null, bitrate: null },
  high: { label: "High (1080p)", maxHeight: 1080, bitrate: 5000 },
  medium: { label: "Medium (720p)", maxHeight: 720, bitrate: 2500 },
  low: { label: "Low (480p)", maxHeight: 480, bitrate: 1000 },
  custom: { label: "Custom", maxHeight: null, bitrate: null },
};

export function VideoUploadSection() {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>("original");
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
  
  // Compression preview dialog state
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [pendingPreviewFiles, setPendingPreviewFiles] = useState<File[]>([]);
  
  // Quality is always 'original' now - server-side compression happens after upload
  
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
  const autoCaptionMutation = trpc.videoVisualCaptions.autoCaptionVideo.useMutation();
  const autoTranscribeMutation = trpc.videoTranscription.transcribeVideo.useMutation();
  const autoFileSuggestionsMutation = trpc.videoTranscription.generateFileSuggestions.useMutation();
  const compressMutation = trpc.videoCompression.compress.useMutation();
  // Upload settings (throttle)
  const { settings: uploadSettings, setThrottleLevel } = useUploadSettings();
  const chunkDelayRef = useRef(uploadSettings.chunkDelayMs);
  useEffect(() => {
    chunkDelayRef.current = uploadSettings.chunkDelayMs;
  }, [uploadSettings.chunkDelayMs]);

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
      try {
        const reader = new FileReader();
        const blob = file.slice(start, end);
        
        reader.onload = () => {
          try {
            const result = reader.result as string;
            const commaIndex = result.indexOf(",");
            const base64 = commaIndex >= 0 ? result.substring(commaIndex + 1) : result;
            resolve(base64);
          } catch (e) {
            reject(new Error("Failed to encode chunk data"));
          }
        };
        
        reader.onerror = () => reject(new Error("Failed to read chunk from file"));
        reader.onabort = () => reject(new Error("Chunk read was aborted"));
        reader.readAsDataURL(blob);
      } catch (e) {
        reject(new Error("Failed to initialize chunk reader"));
      }
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
      
      // Always upload original file - server-side compression available after upload
      let fileToUpload = file;
      
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
        // When resuming, use the correct chunk size based on file size
        const chunkSizeForCalc = isLargeFile ? (10 * 1024 * 1024) : CHUNK_SIZE;
        totalChunks = Math.ceil(fileToUpload.size / chunkSizeForCalc);
      }
      
      // Upload chunks
      const progressOffset = 0;
      const activeChunkSize = isLargeFile ? (10 * 1024 * 1024) : CHUNK_SIZE;
      for (let i = startChunk; i < totalChunks; i++) {
        // Check if paused or cancelled
        if (abortController?.signal.aborted) {
          updatePausedChunk(uploadId, i);
          return;
        }

        // Apply throttle delay between chunks (skip first chunk)
        if (i > startChunk && chunkDelayRef.current > 0) {
          await new Promise(resolve => setTimeout(resolve, chunkDelayRef.current));
        }

        const start = i * activeChunkSize;
        const end = Math.min(start + activeChunkSize, fileToUpload.size);

        let retries = 0;
        const maxRetries = 3;
        
        while (retries < maxRetries) {
          try {
            // Read chunk inside retry loop so file read failures are also retried
            const chunkData = await readChunk(fileToUpload, start, end);
            
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
              throw new Error(`Failed to upload chunk ${i} after ${maxRetries} retries: ${error.message}`);
            }
            console.warn(`[Upload] Chunk ${i} attempt ${retries} failed: ${error.message}, retrying...`);
            // Wait before retry with exponential backoff (longer on mobile for memory recovery)
            await new Promise(resolve => setTimeout(resolve, 1500 * Math.pow(2, retries)));
          }
        }

        // Update progress (account for compression phase if applicable)
        const uploadProgress = ((i + 1) / totalChunks) * (100 - progressOffset);
        const progress = progressOffset + uploadProgress;
        const uploadedBytes = Math.min((i + 1) * activeChunkSize, fileToUpload.size);
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

      // Auto-generate visual captions in the background
      if (result.fileId) {
        autoCaptionMutation.mutate(
          { fileId: result.fileId },
          {
            onSuccess: (data) => {
              if (data.queued) {
                toast.info("Visual captions are being generated in the background", {
                  description: "You'll see them when you open the video.",
                  duration: 4000,
                });
              }
            },
            onError: () => {
              // Silently fail - auto-caption is a nice-to-have
              console.warn("Auto-caption failed for file", result.fileId);
            },
          }
        );

        // Auto-transcribe speech from video audio
        autoTranscribeMutation.mutate(
          { fileId: result.fileId },
          {
            onSuccess: (data) => {
              if (data.status === 'completed' || data.status === 'already_exists') {
                if (data.status === 'completed') {
                  toast.info("Speech transcription completed", {
                    description: "Matching files to spoken content...",
                    duration: 4000,
                  });
                }
                // Auto-generate file suggestions from transcript
                autoFileSuggestionsMutation.mutate(
                  { fileId: result.fileId!, minRelevanceScore: 0.3 },
                  {
                    onSuccess: (sugData) => {
                      if ((sugData.count ?? 0) > 0) {
                        toast.success(`Found ${sugData.count} file matches from speech`, {
                          description: "View matched files in the video details.",
                          duration: 5000,
                        });
                      }
                    },
                    onError: () => {
                      console.warn("Auto file suggestion failed for file", result.fileId);
                    },
                  }
                );
              }
            },
            onError: () => {
              // Silently fail - transcription is a nice-to-have
              console.warn("Auto-transcription failed for file", result.fileId);
            },
          }
        );
      }

      // Auto-compress if a quality preset was selected (not 'original')
      if (quality !== 'original' && result.fileId) {
        const qualityMap: Record<string, 'high' | 'medium' | 'low'> = {
          high: 'high',
          medium: 'medium',
          low: 'low',
        };
        const compressionQuality = qualityMap[quality];
        if (compressionQuality) {
          toast.info(`Starting server-side compression (${QUALITY_SETTINGS[quality].label})...`, {
            description: 'You can track progress in the Video Library.',
            duration: 5000,
          });
          compressMutation.mutate(
            { fileId: result.fileId, quality: compressionQuality },
            {
              onSuccess: () => {
                toast.success(`Compression started for ${file.name}`, {
                  description: 'The video will be compressed in the background.',
                  duration: 4000,
                });
              },
              onError: (err) => {
                console.warn('Auto-compression failed:', err);
                toast.error('Auto-compression failed', {
                  description: 'You can manually compress from the Video Library.',
                  duration: 5000,
                });
              },
            }
          );
        }
      }

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
    compressMutation,
    autoTranscribeMutation,
    autoFileSuggestionsMutation,
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
    
    const fileArray = Array.from(files);
    // Always upload original quality - server-side compression available after upload
    await checkAndAddFiles(fileArray);
  };
  
  // Handle preview dialog confirmation
  const handlePreviewConfirm = async (quality: VideoQuality, customBitrateVal?: number, customResolutionVal?: number) => {
    // Update quality settings
    setSelectedQuality(quality);
    if (customBitrateVal) setCustomBitrate(customBitrateVal);
    if (customResolutionVal) setCustomResolution(customResolutionVal);
    
    // Process the preview file
    if (previewFile) {
      await checkAndAddFiles([previewFile]);
    }
    
    // Process any pending files with the same quality
    if (pendingPreviewFiles.length > 0) {
      await checkAndAddFiles(pendingPreviewFiles);
    }
    
    // Reset state
    setPreviewFile(null);
    setPendingPreviewFiles([]);
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
    <div className="space-y-4 md:space-y-6">
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
        <div className="p-4 md:p-12 text-center">
          <Video className="w-10 h-10 md:w-16 md:h-16 mx-auto mb-2 md:mb-4 text-muted-foreground" />
          <h3 className="text-base md:text-lg font-semibold mb-1 md:mb-2">Upload Videos</h3>
          <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">
            Drag and drop video files here, or click to browse
          </p>
          <div className="flex gap-2 justify-center mb-2">
            <Button
              size="sm"
              className="md:h-10 md:px-4 md:text-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              Choose Files
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="md:h-10 md:px-4 md:text-sm"
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

      {/* Queue Status - moved up on mobile */}
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

      {/* Upload Speed Control - moved up on mobile */}
      {videoUploads.some(u => u.status === 'uploading' || u.status === 'pending' || u.status === 'paused') && (
        <div className="flex items-center gap-3 bg-muted/30 rounded-lg px-4 py-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Upload Speed:</span>
          <Select value={uploadSettings.throttleLevel} onValueChange={(val) => setThrottleLevel(val as ThrottleLevel)}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(getThrottlePresets()).map(([key, preset]) => (
                <SelectItem key={key} value={key}>{preset.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {uploadSettings.throttleLevel !== 'unlimited' && (
            <span className="text-xs text-amber-500">Throttled — slower upload to save bandwidth</span>
          )}
        </div>
      )}

      {/* Uploading Files List - moved up before settings on mobile */}
      {videoUploads.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Uploads ({videoUploads.length})</h3>
            {/* Retry All Failed Button */}
            {videoUploads.some(u => u.status === 'error') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const failedUploads = videoUploads.filter(u => u.status === 'error');
                  failedUploads.forEach(u => retryUpload(u.id));
                  toast.info(`${failedUploads.length} failed upload(s) queued for retry`);
                  triggerHaptic("light");
                }}
                className="text-red-500 border-red-500 hover:bg-red-500/10"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry All Failed ({videoUploads.filter(u => u.status === 'error').length})
              </Button>
            )}
          </div>
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

                  {/* Compression Progress Bar - shown during compression phase */}
                  {compressionProgress.has(upload.id) && (
                    <div className="space-y-2">
                      {/* Compression row */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-amber-500 font-medium flex items-center gap-1">
                            <span className="inline-block w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                            {compressionProgress.get(upload.id)?.stage === 'loading' ? 'Loading video...' :
                             compressionProgress.get(upload.id)?.stage === 'processing' ? 'Processing...' :
                             compressionProgress.get(upload.id)?.stage === 'encoding' ? 'Compressing...' :
                             'Compressing...'}
                            {/* ETA display */}
                            {compressionProgress.get(upload.id)?.etaMs !== undefined && compressionProgress.get(upload.id)?.stage === 'encoding' && (
                              <span className="text-amber-400 ml-2">
                                (ETA: {formatTimeDuration(compressionProgress.get(upload.id)?.etaMs || 0)})
                              </span>
                            )}
                          </span>
                          <span className="text-amber-500 font-medium flex items-center gap-2">
                            {(compressionProgress.get(upload.id)?.progress || 0).toFixed(0)}%
                            {/* Cancel compression button */}
                            <button
                              onClick={() => {
                                cancelUpload(upload.id);
                                setCompressionProgress(prev => {
                                  const newMap = new Map(prev);
                                  newMap.delete(upload.id);
                                  return newMap;
                                });
                                toast.info('Compression cancelled. You can re-upload with original quality.');
                              }}
                              className="text-amber-400 hover:text-amber-300 transition-colors"
                              title="Cancel compression and upload original"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </div>
                        <div style={{ width: '100%', backgroundColor: 'hsl(var(--muted))', borderRadius: '9999px', height: '10px', overflow: 'hidden' }}>
                          <div
                            style={{ 
                              width: `${Math.max(2, compressionProgress.get(upload.id)?.progress || 0)}%`,
                              height: '100%',
                              background: 'linear-gradient(to right, #f59e0b, #fbbf24)',
                              borderRadius: '9999px',
                              transition: 'width 0.3s ease-out'
                            }}
                          />
                        </div>
                        {/* Elapsed time display */}
                        {compressionProgress.get(upload.id)?.elapsedMs !== undefined && (
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Elapsed: {formatTimeDuration(compressionProgress.get(upload.id)?.elapsedMs || 0)}</span>
                            {compressionProgress.get(upload.id)?.videoDuration && (
                              <span>Video: {Math.round(compressionProgress.get(upload.id)?.videoDuration || 0)}s</span>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Upload waiting row */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Upload (waiting)</span>
                          <span>0%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: '0%' }} />
                        </div>
                        <div className="flex justify-end text-xs text-muted-foreground">
                          <span>0 B / {formatFileSize(upload.fileSize)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Upload Progress Bar - hidden during compression */}
                  {(upload.status === "uploading" || upload.status === "pending" || upload.status === "paused") && !compressionProgress.has(upload.id) && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {!compressionProgress.has(upload.id) && upload.status === "uploading" && (
                          <span className="text-xs text-primary font-medium">Uploading</span>
                        )}
                        {compressionProgress.has(upload.id) && (
                          <span className="text-xs text-muted-foreground">Upload (waiting)</span>
                        )}
                        {upload.status === "pending" && (
                          <span className="text-xs text-muted-foreground">Queued</span>
                        )}
                        {upload.status === "paused" && (
                          <span className="text-xs text-yellow-500 font-medium">Paused</span>
                        )}
                        <div className={`flex-1 rounded-full h-2 overflow-hidden ${
                          compressionProgress.has(upload.id) ? "bg-primary" : "bg-secondary"
                        }`}>
                          <div
                            className={`h-full transition-all duration-300 ${
                              upload.status === "paused" ? "bg-yellow-500" : 
                              compressionProgress.has(upload.id) ? "bg-primary" : "bg-primary"
                            }`}
                            style={{ width: `${compressionProgress.has(upload.id) ? 100 : Math.max(0, upload.progress)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {compressionProgress.has(upload.id) 
                            ? "0%" 
                            : upload.status === "pending" 
                              ? "--" 
                              : `${Math.max(0, Math.round(upload.progress))}%`
                          }
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span></span>
                        <div className="flex gap-3">
                          {upload.status === "uploading" && !compressionProgress.has(upload.id) && upload.speed > 0 && (
                            <>
                              <span>{formatSpeed(upload.speed)}</span>
                              <span>ETA: {formatEta(upload.eta)}</span>
                            </>
                          )}
                          <span>
                            {compressionProgress.has(upload.id)
                              ? `0 B / ${formatFileSize(upload.fileSize)}`
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
                    <div>
                      <p className="text-sm text-green-600 mt-2">
                        Upload complete!
                      </p>
                      {/* Inline transcript and file suggestions */}
                      {upload.result?.fileId && (
                        <UploadTranscriptInline fileId={upload.result.fileId} />
                      )}
                    </div>
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

      {/* Upload Settings */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-3">Upload Settings</h3>
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Post-Upload Compression</Label>
            <Select value={selectedQuality} onValueChange={(v) => setSelectedQuality(v as VideoQuality)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select quality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">Original (No Compression)</SelectItem>
                <SelectItem value="high">High Quality (1080p)</SelectItem>
                <SelectItem value="medium">Medium Quality (720p)</SelectItem>
                <SelectItem value="low">Low Quality (480p)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1.5">
              {selectedQuality === 'original'
                ? 'Videos will be uploaded as-is. You can compress later from the Video Library.'
                : `Videos will be uploaded at original quality, then automatically compressed to ${QUALITY_SETTINGS[selectedQuality].label} using server-side FFmpeg after upload completes.`}
            </p>
          </div>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            <span>Server compression preserves audio, maintains full duration, and lets you revert to the original anytime</span>
          </div>
        </div>
      </Card>



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
