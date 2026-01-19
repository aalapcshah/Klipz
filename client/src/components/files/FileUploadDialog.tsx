import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, Mic, X, Loader2, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { uploadFileToStorage } from "@/lib/storage";
import exifr from "exifr";

interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete?: () => void;
}

interface FileWithMetadata {
  file: File;
  title: string;
  description: string;
  voiceRecording?: Blob;
  voiceTranscript?: string;
  isRecording?: boolean;
  uploadProgress?: number;
  uploadStatus?: 'pending' | 'uploading' | 'completed' | 'error';
}

export function FileUploadDialog({
  open,
  onOpenChange,
  onUploadComplete,
}: FileUploadDialogProps) {
  const [files, setFiles] = useState<FileWithMetadata[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCancelled, setUploadCancelled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const createFileMutation = trpc.files.create.useMutation();
  const transcribeVoiceMutation = trpc.files.transcribeVoice.useMutation();
  const enrichMutation = trpc.files.enrich.useMutation();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
    }
  }, []);

  const addFiles = (newFiles: File[]) => {
    const filesWithMetadata: FileWithMetadata[] = newFiles.map((file) => ({
      file,
      title: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
      description: "",
      uploadProgress: 0,
      uploadStatus: 'pending',
    }));
    setFiles((prev) => [...prev, ...filesWithMetadata]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFileMetadata = (
    index: number,
    updates: Partial<FileWithMetadata>
  ) => {
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  const startRecording = async (index: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        updateFileMetadata(index, {
          voiceRecording: audioBlob,
          isRecording: false,
        });

        // Upload voice recording and transcribe
        try {
          const { url: voiceUrl } = await uploadToS3(audioBlob, "voice-recording.webm");
          const { transcript } = await transcribeVoiceMutation.mutateAsync({
            audioUrl: voiceUrl,
          });
          updateFileMetadata(index, {
            voiceTranscript: transcript,
            description: transcript, // Auto-fill description with transcript
          });
          toast.success("Voice recording transcribed!");
        } catch (error) {
          toast.error("Failed to transcribe voice recording");
        }

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      updateFileMetadata(index, { isRecording: true });
    } catch (error) {
      toast.error("Failed to access microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const trpcUtils = trpc.useUtils();

  const uploadToS3 = async (file: File | Blob, filename: string): Promise<{ url: string; fileKey: string }> => {
    const result = await uploadFileToStorage(file, filename, trpcUtils);
    return result;
  };

  const handleUpload = async (enrichWithAI: boolean = false) => {
    if (files.length === 0) {
      toast.error("Please select at least one file");
      return;
    }

    setUploading(true);
    setUploadCancelled(false);

    try {
      for (let i = 0; i < files.length; i++) {
        if (uploadCancelled) {
          toast.info("Upload cancelled");
          break;
        }

        const fileData = files[i];
        
        // Update status to uploading
        updateFileMetadata(i, { uploadStatus: 'uploading', uploadProgress: 0 });

        // Simulate progress for file upload (S3 upload doesn't provide progress)
        const progressInterval = setInterval(() => {
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === i
                ? { ...f, uploadProgress: Math.min((f.uploadProgress || 0) + 10, 90) }
                : f
            )
          );
        }, 200);

        try {
          // Extract metadata from image files
          let extractedTitle = fileData.title;
          let extractedDescription = fileData.description;
          let extractedKeywords: string[] = [];
          
          if (fileData.file.type.startsWith("image/")) {
            try {
              const metadata = await exifr.parse(fileData.file, {
                iptc: true,
                xmp: true,
                icc: false,
                jfif: false,
                ihdr: false,
              });
              
              if (metadata) {
                // Extract title from various metadata fields
                if (!extractedTitle || extractedTitle === fileData.file.name.replace(/\.[^/.]+$/, "")) {
                  extractedTitle = metadata.title || 
                                 metadata.ObjectName || 
                                 metadata.Headline || 
                                 metadata.Title ||
                                 extractedTitle;
                }
                
                // Extract description from various metadata fields
                if (!extractedDescription) {
                  extractedDescription = metadata.description || 
                                       metadata.ImageDescription ||
                                       metadata.Caption ||
                                       metadata["Caption-Abstract"] ||
                                       metadata.UserComment ||
                                       "";
                }
                
                // Extract keywords/tags
                if (metadata.Keywords) {
                  extractedKeywords = Array.isArray(metadata.Keywords) 
                    ? metadata.Keywords 
                    : [metadata.Keywords];
                } else if (metadata.Subject) {
                  extractedKeywords = Array.isArray(metadata.Subject)
                    ? metadata.Subject
                    : [metadata.Subject];
                }
              }
            } catch (metadataError) {
              console.log("Could not extract metadata:", metadataError);
              // Continue with upload even if metadata extraction fails
            }
          }
          
          // Upload file to S3
          const { url: fileUrl, fileKey } = await uploadToS3(fileData.file, fileData.file.name);

          // Upload voice recording if exists
          let voiceRecordingUrl: string | undefined;
          if (fileData.voiceRecording) {
            const { url } = await uploadToS3(
              fileData.voiceRecording,
              `voice-${fileData.file.name}.webm`
            );
            voiceRecordingUrl = url;
          }

          // Create file record in database with extracted metadata
          const { id } = await createFileMutation.mutateAsync({
            fileKey,
            url: fileUrl,
            filename: fileData.file.name,
            mimeType: fileData.file.type,
            fileSize: fileData.file.size,
            title: extractedTitle,
            description: extractedDescription,
            voiceRecordingUrl,
            voiceTranscript: fileData.voiceTranscript,
            extractedMetadata: fileData.file.type.startsWith("image/") ? await exifr.parse(fileData.file, { iptc: true, xmp: true }) : undefined,
            extractedKeywords: extractedKeywords.length > 0 ? extractedKeywords : undefined,
          });

          clearInterval(progressInterval);
          updateFileMetadata(i, { uploadStatus: 'completed', uploadProgress: 100 });

          // Enrich with AI if requested
          if (enrichWithAI) {
            enrichMutation.mutate({ id });
          }
        } catch (error) {
          clearInterval(progressInterval);
          updateFileMetadata(i, { uploadStatus: 'error', uploadProgress: 0 });
          throw error;
        }
      }

      if (!uploadCancelled) {
        toast.success(`${files.length} file(s) uploaded successfully!`);
        setFiles([]);
        onOpenChange(false);
        onUploadComplete?.();
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload files");
    } finally {
      setUploading(false);
    }
  };

  const handleCancelUpload = () => {
    setUploadCancelled(true);
    setUploading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload & Tag Files</DialogTitle>
          <DialogDescription>
            Upload media files and add metadata using voice or text
          </DialogDescription>
        </DialogHeader>

        {/* Drag & Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50"
          }`}
        >
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-medium mb-2">
            Drag & Drop Files Here
          </p>
          <p className="text-sm text-muted-foreground">
            or click to browse your computer
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Supported: Images, Videos, PDFs, Documents
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,application/pdf,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Uploaded Files List */}
        {files.length > 0 && (
          <div className="space-y-4 mt-6">
            <h3 className="font-medium">Uploaded Files ({files.length})</h3>
            {files.map((fileData, index) => (
              <div
                key={index}
                className="border border-border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {fileData.file.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(fileData.file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                    {fileData.uploadStatus === 'uploading' && (
                      <div className="text-xs text-primary font-medium">
                        Uploading... {fileData.uploadProgress}%
                      </div>
                    )}
                    {fileData.uploadStatus === 'completed' && (
                      <div className="text-xs text-green-500 font-medium">
                        ✓ Uploaded
                      </div>
                    )}
                    {fileData.uploadStatus === 'error' && (
                      <div className="text-xs text-red-500 font-medium">
                        ✗ Failed
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(index)}
                    disabled={uploading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Progress Bar */}
                {fileData.uploadStatus === 'uploading' && (
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${fileData.uploadProgress}%` }}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <div>
                    <Label htmlFor={`title-${index}`}>Title</Label>
                    <Input
                      id={`title-${index}`}
                      value={fileData.title}
                      onChange={(e) =>
                        updateFileMetadata(index, { title: e.target.value })
                      }
                      placeholder="Enter file title"
                    />
                  </div>

                  <div>
                    <Label htmlFor={`description-${index}`}>
                      Description (Voice or Type)
                    </Label>
                    <div className="flex gap-2">
                      <Textarea
                        id={`description-${index}`}
                        value={fileData.description}
                        onChange={(e) =>
                          updateFileMetadata(index, {
                            description: e.target.value,
                          })
                        }
                        placeholder="Describe this file..."
                        rows={3}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant={fileData.isRecording ? "destructive" : "outline"}
                        size="icon"
                        onClick={() =>
                          fileData.isRecording
                            ? stopRecording()
                            : startRecording(index)
                        }
                      >
                        <Mic
                          className={`h-4 w-4 ${
                            fileData.isRecording ? "animate-pulse" : ""
                          }`}
                        />
                      </Button>
                    </div>
                    {fileData.voiceTranscript && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ✓ Voice transcribed
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between gap-2 mt-6">
          <Button 
            variant="outline" 
            onClick={() => uploading ? handleCancelUpload() : onOpenChange(false)}
          >
            {uploading ? "Cancel Upload" : "Cancel"}
          </Button>
          <div className="flex gap-2">
            <Button
              onClick={() => handleUpload(false)}
              disabled={uploading || files.length === 0}
            >
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Files
            </Button>
            <Button
              onClick={() => handleUpload(true)}
              disabled={uploading || files.length === 0}
              className="bg-accent hover:bg-accent/90"
            >
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Sparkles className="h-4 w-4 mr-2" />
              Enrich with AI
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
