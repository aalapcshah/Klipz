import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, X, CheckCircle2, AlertCircle, Loader2, Video } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";

interface UploadingFile {
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
  fileId?: number;
  thumbnails?: string[]; // Base64 encoded thumbnails
}

const ACCEPTED_VIDEO_FORMATS = [
  "video/mp4",
  "video/quicktime", // .mov
  "video/x-msvideo", // .avi
  "video/webm",
  "video/x-matroska", // .mkv
  "video/mpeg",
];

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

export function VideoUploadSection() {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [enableCompression, setEnableCompression] = useState(false);
  const [compressionQuality, setCompressionQuality] = useState(0.7); // 0.1 to 1.0
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.files.create.useMutation();

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_VIDEO_FORMATS.includes(file.type)) {
      return `Invalid format. Accepted formats: MP4, MOV, AVI, WebM, MKV, MPEG`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size: 2GB`;
    }
    return null;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newFiles: UploadingFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const error = validateFile(file);

      if (error) {
        toast.error(`${file.name}: ${error}`);
        triggerHaptic('light');
        continue;
      }

      newFiles.push({
        file,
        progress: 0,
        status: "uploading",
      });
    }

    if (newFiles.length === 0) return;

    setUploadingFiles((prev) => [...prev, ...newFiles]);
    triggerHaptic('medium');

    // Upload files sequentially
    for (const uploadFile of newFiles) {
      try {
        // Simulate progress with stages
        const updateProgress = (progress: number) => {
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.file === uploadFile.file
                ? { ...f, progress }
                : f
            )
          );
        };
        
        updateProgress(10); // Starting

        // Compress video if enabled
        let fileToUpload = uploadFile.file;
        if (enableCompression) {
          try {
            updateProgress(20);
            toast.info(`Compressing ${uploadFile.file.name}...`);
            fileToUpload = await compressVideo(uploadFile.file, compressionQuality);
            const originalSize = (uploadFile.file.size / (1024 * 1024)).toFixed(2);
            const compressedSize = (fileToUpload.size / (1024 * 1024)).toFixed(2);
            const reduction = ((1 - fileToUpload.size / uploadFile.file.size) * 100).toFixed(0);
            toast.success(`Compressed: ${originalSize}MB → ${compressedSize}MB (${reduction}% reduction)`);
            updateProgress(40);
          } catch (error) {
            console.error('Failed to compress video:', error);
            toast.warning('Compression failed, uploading original file');
            updateProgress(30);
            // Continue with original file
          }
        } else {
          updateProgress(30);
        }

        // Generate thumbnails with timeout
        let thumbnails: string[] = [];
        try {
          updateProgress(50);
          toast.info('Generating thumbnails...');
          thumbnails = await Promise.race([
            generateVideoThumbnails(fileToUpload),
            new Promise<string[]>((_, reject) => 
              setTimeout(() => reject(new Error('Thumbnail generation timeout')), 30000)
            )
          ]);
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.file === uploadFile.file
                ? { ...f, thumbnails }
                : f
            )
          );
          updateProgress(60);
        } catch (error) {
          console.error('Failed to generate thumbnails:', error);
          toast.warning('Skipping thumbnail generation');
          updateProgress(60);
          // Continue without thumbnails
        }

        // Convert file to base64 for upload
        updateProgress(70);
        toast.info('Processing video file...');
        const base64 = await fileToBase64(fileToUpload);

        // Upload file to S3 first (using storagePut would require server-side implementation)
        // For now, we'll use a simplified approach with base64 in database
        // In production, implement proper S3 upload flow
        
        updateProgress(85);
        toast.info('Uploading to server...');
        const result = await uploadMutation.mutateAsync({
          fileKey: `uploads/${Date.now()}-${uploadFile.file.name}`,
          url: `data:${uploadFile.file.type};base64,${base64}`,
          filename: uploadFile.file.name,
          mimeType: uploadFile.file.type,
          fileSize: uploadFile.file.size,
          title: uploadFile.file.name.replace(/\.[^/.]+$/, ""),
        });

        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.file === uploadFile.file
              ? { ...f, progress: 100, status: "success", fileId: result.id }
              : f
          )
        );

        toast.success(`${uploadFile.file.name} uploaded successfully`);
        triggerHaptic('medium');
      } catch (error: any) {
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.file === uploadFile.file
              ? {
                  ...f,
                  status: "error",
                  error: error.message || "Upload failed",
                }
              : f
          )
        );
        toast.error(`Failed to upload ${uploadFile.file.name}`);
        triggerHaptic('light');
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  const compressVideo = async (file: File, quality: number): Promise<File> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      video.preload = 'metadata';
      video.src = URL.createObjectURL(file);

      video.onloadedmetadata = () => {
        // Scale down resolution based on quality
        const scale = 0.5 + (quality * 0.5); // 0.5x to 1.0x
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;

        const stream = canvas.captureStream(30); // 30 FPS
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 2500000 * quality, // Adjust bitrate based on quality
        });

        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const compressedBlob = new Blob(chunks, { type: 'video/webm' });
          const compressedFile = new File(
            [compressedBlob],
            file.name.replace(/\.[^/.]+$/, '.webm'),
            { type: 'video/webm' }
          );
          URL.revokeObjectURL(video.src);
          resolve(compressedFile);
        };

        mediaRecorder.start();
        video.play();

        const drawFrame = () => {
          if (video.ended) {
            mediaRecorder.stop();
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          requestAnimationFrame(drawFrame);
        };

        drawFrame();
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error('Error loading video for compression'));
      };
    });
  };

  const generateVideoThumbnails = async (file: File): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const thumbnails: string[] = [];
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      video.preload = 'metadata';
      video.src = URL.createObjectURL(file);

      video.onloadedmetadata = () => {
        const duration = video.duration;
        const timestamps = [0, duration * 0.25, duration * 0.5, duration * 0.75];
        
        // Set canvas size (thumbnail resolution)
        canvas.width = 320;
        canvas.height = (320 / video.videoWidth) * video.videoHeight;

        let currentIndex = 0;

        const captureFrame = () => {
          if (currentIndex >= timestamps.length) {
            URL.revokeObjectURL(video.src);
            resolve(thumbnails);
            return;
          }

          video.currentTime = timestamps[currentIndex];
        };

        video.onseeked = () => {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
          thumbnails.push(thumbnail);
          currentIndex++;
          captureFrame();
        };

        video.onerror = () => {
          URL.revokeObjectURL(video.src);
          reject(new Error('Error loading video for thumbnail generation'));
        };

        captureFrame();
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error('Error loading video'));
      };
    });
  };

  const removeFile = (file: File) => {
    setUploadingFiles((prev) => prev.filter((f) => f.file !== file));
    triggerHaptic('light');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* Upload Area */}
      <Card
        className={`p-8 sm:p-12 border-2 border-dashed transition-colors cursor-pointer ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <div className="p-4 rounded-full bg-primary/10">
            <Upload className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-semibold mb-2">
              Upload Video Files
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mb-4">
              Drag and drop video files here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Supported formats: MP4, MOV, AVI, WebM, MKV, MPEG (Max: 2GB)
            </p>
          </div>
          <Button
            type="button"
            variant="default"
            size="lg"
            className="min-h-[44px]"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            <Upload className="h-4 w-4 mr-2" />
            Select Videos
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_VIDEO_FORMATS.join(",")}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </Card>

      {/* Compression Settings */}
      <Card className="p-4 mb-4 border-dashed">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enable-compression"
              checked={enableCompression}
              onChange={(e) => setEnableCompression(e.target.checked)}
              className="h-4 w-4 cursor-pointer"
            />
            <label htmlFor="enable-compression" className="text-sm font-medium cursor-pointer">
              Enable Video Compression
            </label>
          </div>
          {enableCompression && (
            <span className="text-xs text-muted-foreground">
              Quality: {Math.round(compressionQuality * 100)}%
            </span>
          )}
        </div>
        {enableCompression && (
          <div className="space-y-2">
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.1"
              value={compressionQuality}
              onChange={(e) => setCompressionQuality(parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Lower quality = smaller file size. Recommended: 70% for good balance.
            </p>
          </div>
        )}
      </Card>

      {/* Uploading Files List */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base sm:text-lg font-semibold">
            Uploading ({uploadingFiles.length})
          </h3>
          <div className="space-y-2">
            {uploadingFiles.map((uploadFile, index) => (
              <Card key={index} className="p-3 sm:p-4 max-w-full overflow-hidden">
                <div className="flex items-start gap-3">
                  {/* File Icon */}
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded flex items-center justify-center">
                      <Video className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                    </div>
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium truncate">
                          {uploadFile.file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(uploadFile.file.size)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        onClick={() => removeFile(uploadFile.file)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Progress Bar */}
                    {uploadFile.status === "uploading" && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Uploading...
                          </span>
                          <span className="text-muted-foreground">
                            {uploadFile.progress}%
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all duration-300"
                            style={{ width: `${uploadFile.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Success State */}
                    {uploadFile.status === "success" && (
                      <div className="flex items-center gap-2 text-green-500">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-xs sm:text-sm">
                          Upload complete
                        </span>
                      </div>
                    )}

                    {/* Error State */}
                    {uploadFile.status === "error" && (
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-xs sm:text-sm">
                          {uploadFile.error || "Upload failed"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      <Card className="p-4 bg-muted/50 max-w-full overflow-x-hidden">
        <h4 className="text-sm font-semibold mb-2">Tips for best results:</h4>
        <ul className="text-xs sm:text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li>Upload videos in MP4 format for best compatibility</li>
          <li>Ensure good audio quality for accurate transcription</li>
          <li>Videos will appear in the Video Library after upload</li>
          <li>You can add annotations and generate file suggestions after upload</li>
        </ul>
      </Card>
    </div>
  );
}
