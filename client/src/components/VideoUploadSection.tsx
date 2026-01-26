import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, CheckCircle2, AlertCircle, Loader2, Video } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";

interface UploadingFile {
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
  sessionId?: string;
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

const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024; // 4GB
const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunks (safer for HTTP/2)

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

  const initUploadMutation = trpc.uploadChunk.initUpload.useMutation();
  const uploadChunkMutation = trpc.uploadChunk.uploadChunk.useMutation();
  const finalizeUploadMutation = trpc.uploadChunk.finalizeUpload.useMutation();

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_VIDEO_FORMATS.includes(file.type)) {
      return `Invalid format. Accepted formats: MP4, MOV, AVI, WebM, MKV, MPEG`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size: 4GB`;
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

  const uploadFileInChunks = async (file: File) => {
    try {
      // Initialize upload session
      const { sessionId } = await initUploadMutation.mutateAsync({
        filename: file.name,
        mimeType: file.type,
        totalSize: file.size,
        title: file.name.replace(/\.[^/.]+$/, ""),
        description: `Uploaded video - ${QUALITY_SETTINGS[selectedQuality].label}`,
      });

      setUploadingFiles(prev =>
        prev.map(f => (f.file === file ? { ...f, sessionId } : f))
      );

      // Calculate chunks
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      console.log(`[Upload] Starting upload of ${file.name}: ${totalChunks} chunks, ${file.size} bytes`);

      // Upload chunks sequentially with retry logic
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        
        // Read chunk
        const chunkData = await readChunk(file, start, end);
        
        // Upload chunk with retry (max 3 attempts)
        let retries = 0;
        const maxRetries = 3;
        let uploaded = false;
        
        while (!uploaded && retries < maxRetries) {
          try {
            await uploadChunkMutation.mutateAsync({
              sessionId,
              chunkIndex: i,
              chunkData,
              totalChunks,
            });
            uploaded = true;
          } catch (error: any) {
            retries++;
            console.error(`[Upload] Chunk ${i} failed (attempt ${retries}/${maxRetries}):`, error.message);
            
            if (retries >= maxRetries) {
              throw new Error(`Failed to upload chunk ${i} after ${maxRetries} attempts: ${error.message}`);
            }
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries - 1)));
          }
        }

        // Update progress (0-90% for chunks, 90-100% for finalization)
        const progress = ((i + 1) / totalChunks) * 90;
        const uploadedBytes = end;
        
        setUploadingFiles(prev =>
          prev.map(f =>
            f.file === file
              ? { ...f, progress, uploadedBytes }
              : f
          )
        );
      }

      // Finalize upload
      setUploadingFiles(prev =>
        prev.map(f => (f.file === file ? { ...f, progress: 95 } : f))
      );

      const result = await finalizeUploadMutation.mutateAsync({ sessionId });

      // Success
      setUploadingFiles(prev =>
        prev.map(f =>
          f.file === file
            ? { ...f, progress: 100, status: "success" }
            : f
        )
      );

      toast.success(`${file.name} uploaded successfully!`);
      triggerHaptic("success");

    } catch (error: any) {
      console.error("Upload error:", error);
      setUploadingFiles(prev =>
        prev.map(f =>
          f.file === file
            ? {
                ...f,
                status: "error",
                error: error.message || "Upload failed",
              }
            : f
        )
      );
      toast.error(`Failed to upload ${file.name}: ${error.message}`);
      triggerHaptic("error");
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
        uploadedBytes: 0,
      };

      setUploadingFiles(prev => [...prev, uploadingFile]);
      triggerHaptic("light");

      // Start upload
      uploadFileInChunks(file);
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
                        {formatFileSize(uploadingFile.file.size)}
                      </p>
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
                        {uploadingFile.uploadedBytes !== undefined && (
                          <span>
                            {formatFileSize(uploadingFile.uploadedBytes)} / {formatFileSize(uploadingFile.file.size)}
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
                      Upload complete!
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
