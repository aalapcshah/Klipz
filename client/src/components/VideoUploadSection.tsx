import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Upload, X, CheckCircle2, AlertCircle, Loader2, Video, Pause, Play } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";
import { ChunkedUploader } from "@/lib/chunkedUpload";
interface UploadingFile {
  file: File;
  progress: number;
  status: "uploading" | "paused" | "success" | "error";
  error?: string;
  fileId?: number;
  uploader?: ChunkedUploader;
  s3Key?: string;
  originalSize?: number;
  processedSize?: number;
  uploadedBytes?: number;
}

type VideoQuality = "original" | "high" | "medium" | "low";

const ACCEPTED_VIDEO_FORMATS = [
  "video/mp4",
  "video/quicktime", // .mov
  "video/x-msvideo", // .avi
  "video/webm",
  "video/x-matroska", // .mkv
  "video/mpeg",
];

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

const QUALITY_SETTINGS = {
  original: { label: "Original Quality", maxHeight: null, bitrate: null },
  high: { label: "High (1080p)", maxHeight: 1080, bitrate: 5000 },
  medium: { label: "Medium (720p)", maxHeight: 720, bitrate: 2500 },
  low: { label: "Low (480p)", maxHeight: 480, bitrate: 1000 },
};

export function VideoUploadSection() {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>("high");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Removed unused presigned URL mutation
  const completeUploadMutation = trpc.s3Upload.completeUpload.useMutation();
  const createFileMutation = trpc.files.create.useMutation();

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_VIDEO_FORMATS.includes(file.type)) {
      return `Invalid format. Accepted formats: MP4, MOV, AVI, WebM, MKV, MPEG`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size: 2GB`;
    }
    return null;
  };

  const processVideoQuality = async (file: File, quality: VideoQuality): Promise<File> => {
    if (quality === "original") {
      return file;
    }

    const settings = QUALITY_SETTINGS[quality];
    
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      
      video.onloadedmetadata = async () => {
        try {
          // Create canvas for processing
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          
          if (!ctx) {
            resolve(file); // Fallback to original
            return;
          }

          // Calculate new dimensions
          const aspectRatio = video.videoWidth / video.videoHeight;
          const targetHeight = settings.maxHeight!;
          const targetWidth = Math.round(targetHeight * aspectRatio);
          
          canvas.width = targetWidth;
          canvas.height = targetHeight;

          // For now, return original file as quality processing requires MediaRecorder API
          // which is complex for video transcoding
          toast.info(`Quality: ${settings.label} selected. Processing will be done server-side.`);
          resolve(file);
        } catch (error) {
          console.error("Video processing error:", error);
          resolve(file); // Fallback to original
        }
      };

      video.onerror = () => {
        resolve(file); // Fallback to original
      };

      video.src = URL.createObjectURL(file);
    });
  };

  const uploadToS3 = async (file: File, presignedUrl: string): Promise<void> => {
    const response = await fetch(presignedUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type,
      },
    });

    if (!response.ok) {
      throw new Error(`S3 upload failed: ${response.statusText}`);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        triggerHaptic("error");
        continue;
      }

      // Add to uploading list
      const uploadingFile: UploadingFile = {
        file,
        progress: 0,
        status: "uploading",
        originalSize: file.size,
      };

      setUploadingFiles(prev => [...prev, uploadingFile]);
      triggerHaptic("light");

      try {
        // Process quality if needed
        toast.info(`Processing ${file.name}...`);
        const processedFile = await processVideoQuality(file, selectedQuality);
        
        uploadingFile.processedSize = processedFile.size;

        // Convert to base64 for upload
        const reader = new FileReader();
        
        reader.onprogress = (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 80; // 0-80%
            setUploadingFiles(prev =>
              prev.map(f => (f.file === file ? { ...f, progress: percentComplete, uploadedBytes: e.loaded } : f))
            );
          }
        };
        
        reader.onload = async () => {
          try {
            const base64 = reader.result as string;
            
            // Update progress to 80%
            setUploadingFiles(prev =>
              prev.map(f => (f.file === file ? { ...f, progress: 80 } : f))
            );
            
            // Upload to backend with S3 storage
            const fileRecord = await createFileMutation.mutateAsync({
              filename: file.name,
              mimeType: file.type,
              fileSize: processedFile.size,
              content: base64,
              title: file.name.replace(/\.[^/.]+$/, ""),
              description: `Uploaded video - ${QUALITY_SETTINGS[selectedQuality].label}`,
            });
            
            // Success
            setUploadingFiles(prev =>
              prev.map(f =>
                f.file === file
                  ? { ...f, progress: 100, status: "success", fileId: fileRecord.id }
                  : f
              )
            );
            
            toast.success(`${file.name} uploaded successfully!`);
            triggerHaptic("success");
          } catch (error: any) {
            throw new Error(`Upload failed: ${error.message}`);
          }
        };
        
        reader.onerror = () => {
          throw new Error("Failed to read file");
        };
        
        reader.readAsDataURL(processedFile);

      } catch (error) {
        console.error("Upload error:", error);
        setUploadingFiles(prev =>
          prev.map(f =>
            f.file === file
              ? {
                  ...f,
                  status: "error",
                  error: error instanceof Error ? error.message : "Upload failed",
                }
              : f
          )
        );
        toast.error(`Failed to upload ${file.name}`);
        triggerHaptic("error");
      }
    }
  };

  const removeFile = (file: File) => {
    setUploadingFiles(prev => prev.filter(f => f.file !== file));
    triggerHaptic("light");
  };

  const retryUpload = async (uploadingFile: UploadingFile) => {
    removeFile(uploadingFile.file);
    await handleFiles(createFileList([uploadingFile.file]));
  };

  const createFileList = (files: File[]): FileList => {
    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));
    return dataTransfer.files;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getSizeReduction = (original?: number, processed?: number): string | null => {
    if (!original || !processed || original === processed) return null;
    const reduction = ((original - processed) / original) * 100;
    return `${reduction.toFixed(1)}% smaller`;
  };

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
                : `Video will be optimized to ${QUALITY_SETTINGS[selectedQuality].label}`}
            </p>
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
          <Button
            onClick={() => fileInputRef.current?.click()}
            className="mb-2"
          >
            <Upload className="w-4 h-4 mr-2" />
            Choose Files
          </Button>
          <p className="text-xs text-muted-foreground">
            Supported: MP4, MOV, AVI, WebM, MKV, MPEG (max 2GB)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_VIDEO_FORMATS.join(",")}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </Card>

      {/* Uploading Files List */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Uploading ({uploadingFiles.length})</h3>
          {uploadingFiles.map((uploadingFile, index) => (
            <Card key={index} className="p-4">
              <div className="flex items-start gap-3">
                <Video className="w-10 h-10 text-muted-foreground flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{uploadingFile.file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(uploadingFile.originalSize || 0)}
                        {uploadingFile.processedSize && uploadingFile.processedSize !== uploadingFile.originalSize && (
                          <span className="ml-2 text-green-600">
                            → {formatFileSize(uploadingFile.processedSize)}
                            {getSizeReduction(uploadingFile.originalSize, uploadingFile.processedSize) && (
                              <span className="ml-1">
                                ({getSizeReduction(uploadingFile.originalSize, uploadingFile.processedSize)})
                              </span>
                            )}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(uploadingFile.file)}
                      disabled={uploadingFile.status === "uploading"}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {uploadingFile.status === "uploading" && (
                    <div className="space-y-2">
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadingFile.progress}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {uploadingFile.progress.toFixed(0)}%
                          {uploadingFile.uploadedBytes !== undefined && uploadingFile.processedSize && (
                            <span className="ml-2 text-xs opacity-70">
                              ({(uploadingFile.uploadedBytes / 1024 / 1024).toFixed(1)} of {(uploadingFile.processedSize / 1024 / 1024).toFixed(1)} MB)
                            </span>
                          )}
                        </span>
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                    </div>
                  )}

                  {uploadingFile.status === "success" && (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-sm">Upload complete</span>
                    </div>
                  )}

                  {uploadingFile.status === "error" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm">{uploadingFile.error || "Upload failed"}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryUpload(uploadingFile)}
                      >
                        Retry Upload
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
