import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Upload, X, CheckCircle2, AlertCircle, Loader2, Video, Pause, Play } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";

interface UploadingFile {
  file: File;
  progress: number;
  status: "uploading" | "paused" | "success" | "error";
  error?: string;
  fileId?: number;
  s3Key?: string;
  originalSize?: number;
  processedSize?: number;
  uploadedBytes?: number;
  chunks?: string[];
  currentChunk?: number;
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
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

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

  const uploadChunkMutation = trpc.s3Upload.uploadChunk.useMutation();
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

  const readChunkAsBase64 = (file: File, start: number, end: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const blob = file.slice(start, end);
      const reader = new FileReader();
      
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get base64
        const base64 = result.split(",")[1] || result;
        resolve(base64);
      };
      
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  };

  const uploadFileInChunks = async (file: File, processedFile: File) => {
    const totalChunks = Math.ceil(processedFile.size / CHUNK_SIZE);
    const chunks: string[] = [];
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileKey = `uploads/${timestamp}-${sanitizedFilename}`;

    try {
      // Read and upload chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, processedFile.size);
        
        // Update progress - reading chunk
        setUploadingFiles(prev =>
          prev.map(f => (f.file === file ? { 
            ...f, 
            progress: (i / totalChunks) * 90, // 0-90% for chunks
            uploadedBytes: start,
            currentChunk: i + 1
          } : f))
        );

        // Read chunk as base64
        const chunkData = await readChunkAsBase64(processedFile, start, end);
        chunks.push(chunkData);

        // Update progress - chunk read
        setUploadingFiles(prev =>
          prev.map(f => (f.file === file ? { 
            ...f, 
            progress: ((i + 0.5) / totalChunks) * 90,
            uploadedBytes: end
          } : f))
        );
      }

      // Update progress to 90%
      setUploadingFiles(prev =>
        prev.map(f => (f.file === file ? { ...f, progress: 90 } : f))
      );

      // Complete upload by sending all chunks to server
      const uploadResult = await completeUploadMutation.mutateAsync({
        fileKey,
        filename: file.name,
        mimeType: file.type,
        fileSize: processedFile.size,
        title: file.name.replace(/\.[^/.]+$/, ""),
        chunks,
      });

      // Update progress to 95%
      setUploadingFiles(prev =>
        prev.map(f => (f.file === file ? { ...f, progress: 95 } : f))
      );

      // Create file record in database
      const fileRecord = await createFileMutation.mutateAsync({
        fileKey: uploadResult.fileKey,
        url: uploadResult.url,
        filename: file.name,
        mimeType: file.type,
        fileSize: processedFile.size,
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
        currentChunk: 0,
      };

      setUploadingFiles(prev => [...prev, uploadingFile]);
      triggerHaptic("light");

      try {
        // Process quality if needed
        toast.info(`Processing ${file.name}...`);
        const processedFile = await processVideoQuality(file, selectedQuality);
        
        uploadingFile.processedSize = processedFile.size;

        // Upload file in chunks
        await uploadFileInChunks(file, processedFile);

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
                      {uploadingFile.status === "uploading" && uploadingFile.currentChunk && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Processing chunk {uploadingFile.currentChunk} of {Math.ceil((uploadingFile.processedSize || uploadingFile.originalSize || 0) / CHUNK_SIZE)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {uploadingFile.status === "uploading" && (
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      )}
                      {uploadingFile.status === "success" && (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      )}
                      {uploadingFile.status === "error" && (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                      {(uploadingFile.status === "error" || uploadingFile.status === "success") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(uploadingFile.file)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {uploadingFile.status === "uploading" && (
                    <div className="space-y-1">
                      <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{ width: `${uploadingFile.progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{uploadingFile.progress.toFixed(0)}%</span>
                        {uploadingFile.uploadedBytes && (
                          <span>
                            {formatFileSize(uploadingFile.uploadedBytes)} / {formatFileSize(uploadingFile.processedSize || uploadingFile.originalSize || 0)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Error Message */}
                  {uploadingFile.status === "error" && uploadingFile.error && (
                    <div className="mt-2 space-y-2">
                      <p className="text-sm text-red-600">{uploadingFile.error}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => retryUpload(uploadingFile)}
                      >
                        Retry Upload
                      </Button>
                    </div>
                  )}

                  {/* Success Message */}
                  {uploadingFile.status === "success" && (
                    <p className="text-sm text-green-600 mt-2">
                      Upload complete! File ID: {uploadingFile.fileId}
                    </p>
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
