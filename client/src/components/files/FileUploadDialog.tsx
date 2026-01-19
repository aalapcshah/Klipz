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
import { Upload, Mic, X, Loader2, Sparkles, AlertCircle, FileText, Edit3 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  extractedMetadata?: Record<string, any>;
  extractedKeywords?: string[];
  showMetadataPreview?: boolean;
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
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkTitle, setBulkTitle] = useState("");
  const [bulkDescription, setBulkDescription] = useState("");
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [showEditTemplateDialog, setShowEditTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [editTemplateName, setEditTemplateName] = useState("");
  const [editTemplateCategory, setEditTemplateCategory] = useState("General");
  const [editTitlePattern, setEditTitlePattern] = useState("");
  const [editDescriptionPattern, setEditDescriptionPattern] = useState("");
  const [newTemplateCategory, setNewTemplateCategory] = useState("General");
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [descriptionSuggestions, setDescriptionSuggestions] = useState<string[]>([]);
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);
  const [showDescriptionSuggestions, setShowDescriptionSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Metadata templates
  const metadataTemplates = {
    "legal-document": {
      name: "Legal Document",
      titlePattern: "[Document Type] - [Date]",
      descriptionPattern: "Legal document regarding [subject matter]. Filed on [date]. [Additional context].",
    },
    "marketing-asset": {
      name: "Marketing Asset",
      titlePattern: "[Campaign Name] - [Asset Type]",
      descriptionPattern: "Marketing material for [campaign/product]. Target audience: [audience]. Purpose: [purpose].",
    },
    "product-photo": {
      name: "Product Photo",
      titlePattern: "[Product Name] - [Angle/View]",
      descriptionPattern: "Product photograph of [product name]. [Color/variant]. Shot from [angle]. For use in [purpose].",
    },
    "meeting-notes": {
      name: "Meeting Notes",
      titlePattern: "[Meeting Title] - [Date]",
      descriptionPattern: "Notes from [meeting type] on [date]. Attendees: [names]. Key topics: [topics]. Action items: [items].",
    },
    "invoice-receipt": {
      name: "Invoice/Receipt",
      titlePattern: "Invoice #[Number] - [Vendor]",
      descriptionPattern: "Invoice from [vendor] dated [date]. Amount: [amount]. Payment method: [method]. Purpose: [description].",
    },
  };

  const applyTemplate = (templateKey: string) => {
    if (!templateKey || templateKey === "") return;
    
    // Check preset templates first
    const presetTemplate = metadataTemplates[templateKey as keyof typeof metadataTemplates];
    if (presetTemplate) {
      setFiles((prev) =>
        prev.map((f) => ({
          ...f,
          title: f.title || presetTemplate.titlePattern,
          description: f.description || presetTemplate.descriptionPattern,
        }))
      );
      toast.success(`Applied "${presetTemplate.name}" template to all files`);
      return;
    }
    
    // Check custom templates
    const customTemplate = customTemplates.find(t => t.id.toString() === templateKey);
    if (customTemplate) {
      setFiles((prev) =>
        prev.map((f) => ({
          ...f,
          title: f.title || customTemplate.titlePattern || "",
          description: f.description || customTemplate.descriptionPattern || "",
        }))
      );
      toast.success(`Applied "${customTemplate.name}" template to all files`);
    }
  };
  
  const saveAsTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    
    if (files.length === 0) {
      toast.error("No files to save as template");
      return;
    }
    
    // Use the first file's metadata as the template
    const firstFile = files[0];
    
    try {
      await createTemplateMutation.mutateAsync({
        name: newTemplateName,
        category: newTemplateCategory,
        titlePattern: firstFile.title || "",
        descriptionPattern: firstFile.description || "",
      });
      
      await refetchTemplates();
      toast.success(`Template "${newTemplateName}" saved successfully`);
      setShowSaveTemplateDialog(false);
      setNewTemplateName("");
    } catch (error) {
      toast.error("Failed to save template");
    }
  };
  
  const deleteTemplate = async (templateId: number, templateName: string) => {
    try {
      await deleteTemplateMutation.mutateAsync({ id: templateId });
      await refetchTemplates();
      toast.success(`Template "${templateName}" deleted`);
    } catch (error) {
      toast.error("Failed to delete template");
    }
  };
  
  const openEditTemplate = (template: any) => {
    setEditingTemplate(template);
    setEditTemplateName(template.name);
    setEditTemplateCategory(template.category || "General");
    setEditTitlePattern(template.titlePattern || "");
    setEditDescriptionPattern(template.descriptionPattern || "");
    setShowEditTemplateDialog(true);
  };
  
  const saveEditedTemplate = async () => {
    if (!editTemplateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    
    if (!editingTemplate) return;
    
    try {
      await updateTemplateMutation.mutateAsync({
        id: editingTemplate.id,
        name: editTemplateName,
        category: editTemplateCategory,
        titlePattern: editTitlePattern,
        descriptionPattern: editDescriptionPattern,
      });
      
      await refetchTemplates();
      toast.success(`Template "${editTemplateName}" updated successfully`);
      setShowEditTemplateDialog(false);
      setEditingTemplate(null);
      setEditTemplateName("");
      setEditTitlePattern("");
      setEditDescriptionPattern("");
    } catch (error) {
      toast.error("Failed to update template");
    }
  };

  const applyBulkEdit = () => {
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        title: bulkTitle || f.title,
        description: bulkDescription || f.description,
      }))
    );
    toast.success(`Applied bulk edits to ${files.length} file(s)`);
    setBulkEditMode(false);
    setBulkTitle("");
    setBulkDescription("");
  };
  
  // Auto-complete handlers
  const handleTitleChange = (index: number, value: string) => {
    updateFileMetadata(index, { title: value });
    
    if (value.length > 1 && metadataSuggestions.length > 0) {
      const suggestions = metadataSuggestions
        .filter(s => s.title && s.title.toLowerCase().includes(value.toLowerCase()))
        .map(s => s.title!)
        .slice(0, 5);
      setTitleSuggestions(suggestions);
      setShowTitleSuggestions(suggestions.length > 0);
    } else {
      setShowTitleSuggestions(false);
    }
  };
  
  const handleDescriptionChange = (index: number, value: string) => {
    updateFileMetadata(index, { description: value });
    
    if (value.length > 2 && metadataSuggestions.length > 0) {
      const suggestions = metadataSuggestions
        .filter(s => s.description && s.description.toLowerCase().includes(value.toLowerCase()))
        .map(s => s.description!)
        .slice(0, 5);
      setDescriptionSuggestions(suggestions);
      setShowDescriptionSuggestions(suggestions.length > 0);
    } else {
      setShowDescriptionSuggestions(false);
    }
  };
  
  const selectTitleSuggestion = (index: number, suggestion: string) => {
    updateFileMetadata(index, { title: suggestion });
    setShowTitleSuggestions(false);
  };
  
  const selectDescriptionSuggestion = (index: number, suggestion: string) => {
    updateFileMetadata(index, { description: suggestion });
    setShowDescriptionSuggestions(false);
  };

  const createFileMutation = trpc.files.create.useMutation();
  const transcribeVoiceMutation = trpc.files.transcribeVoice.useMutation();
  const enrichMutation = trpc.files.enrich.useMutation();
  const createTagMutation = trpc.tags.create.useMutation();
  
  // Custom templates
  const { data: customTemplates = [], refetch: refetchTemplates } = trpc.metadataTemplates.list.useQuery();
  const createTemplateMutation = trpc.metadataTemplates.create.useMutation();
  const updateTemplateMutation = trpc.metadataTemplates.update.useMutation();
  const deleteTemplateMutation = trpc.metadataTemplates.delete.useMutation();
  const trackUsageMutation = trpc.metadataTemplates.trackUsage.useMutation();
  const linkTagMutation = trpc.tags.linkToFile.useMutation();
  const { data: existingTags = [] } = trpc.tags.list.useQuery();
  
  // Get metadata suggestions based on file type
  const fileType = files.length > 0 ? files[0].file.type.split('/')[0] : '';
  const { data: metadataSuggestions = [] } = trpc.metadataTemplates.getSuggestions.useQuery(
    { fileType, limit: 3 },
    { enabled: files.length > 0 && fileType.length > 0 }
  ); 

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

  const addFiles = async (newFiles: File[]) => {
    const filesWithMetadata: FileWithMetadata[] = [];
    
    for (const file of newFiles) {
      let extractedTitle = file.name.replace(/\.[^/.]+$/, "");
      let extractedDescription = "";
      let extractedKeywords: string[] = [];
      let extractedMetadata: Record<string, any> | undefined;
      
      // Extract metadata from image files immediately
      if (file.type.startsWith("image/")) {
        try {
          const metadata = await exifr.parse(file, {
            iptc: true,
            xmp: true,
            icc: false,
            jfif: false,
            ihdr: false,
          });
          
          if (metadata) {
            extractedMetadata = metadata;
            
            // Extract title
            const metadataTitle = metadata.title || 
                                 metadata.ObjectName || 
                                 metadata.Headline || 
                                 metadata.Title;
            if (metadataTitle) {
              extractedTitle = metadataTitle;
            }
            
            // Extract description
            extractedDescription = metadata.description || 
                                 metadata.ImageDescription ||
                                 metadata.Caption ||
                                 metadata["Caption-Abstract"] ||
                                 metadata.UserComment ||
                                 "";
            
            // Extract keywords
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
        } catch (error) {
          console.log("Could not extract metadata:", error);
        }
      }
      
      filesWithMetadata.push({
        file,
        title: extractedTitle,
        description: extractedDescription,
        uploadProgress: 0,
        uploadStatus: 'pending',
        extractedMetadata,
        extractedKeywords,
        showMetadataPreview: !!extractedMetadata,
      });
    }
    
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
            extractedMetadata: fileData.extractedMetadata,
            extractedKeywords: extractedKeywords.length > 0 ? extractedKeywords : undefined,
          });

          clearInterval(progressInterval);
          updateFileMetadata(i, { uploadStatus: 'completed', uploadProgress: 100 });
          
          // Track metadata usage for future suggestions
          try {
            await trackUsageMutation.mutateAsync({
              title: extractedTitle,
              description: extractedDescription,
              fileType: fileData.file.type.split('/')[0], // image, video, application, etc.
            });
          } catch (error) {
            console.log("Failed to track metadata usage:", error);
          }

          // Auto-tag based on extracted keywords
          if (extractedKeywords.length > 0) {
            for (const keyword of extractedKeywords) {
              // Check if tag already exists
              const existingTag = existingTags.find(
                (t: any) => t.name.toLowerCase() === keyword.toLowerCase()
              );
              
              if (existingTag) {
                // Link existing tag
                await linkTagMutation.mutateAsync({
                  fileId: id,
                  tagId: existingTag.id,
                });
              } else {
                // Create new tag and link it
                const { id: tagId } = await createTagMutation.mutateAsync({
                  name: keyword,
                  source: "metadata" as any,
                });
                await linkTagMutation.mutateAsync({
                  fileId: id,
                  tagId,
                });
              }
            }
          }

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
    <>
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
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Uploaded Files ({files.length})</h3>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedTemplate} onValueChange={(value) => { setSelectedTemplate(value); applyTemplate(value); }}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Apply template..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template</SelectItem>
                    {Object.entries(metadataTemplates).map(([key, template]) => (
                      <SelectItem key={key} value={key}>
                        📋 {template.name}
                      </SelectItem>
                    ))}
                    {customTemplates.length > 0 && (
                      <>
                        {Object.entries(
                          customTemplates.reduce((acc: any, template: any) => {
                            const category = template.category || "General";
                            if (!acc[category]) acc[category] = [];
                            acc[category].push(template);
                            return acc;
                          }, {})
                        ).map(([category, templates]: [string, any]) => (
                          <div key={category}>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center justify-between">
                              <span>{category}</span>
                              <span className="text-xs text-muted-foreground">Right-click to edit</span>
                            </div>
                            {templates.map((template: any) => (
                              <div
                                key={template.id}
                                className="relative group"
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  openEditTemplate(template);
                                }}
                              >
                                <SelectItem value={template.id.toString()}>
                                  <div className="flex items-center justify-between w-full">
                                    <span>⭐ {template.name}</span>
                                  </div>
                                </SelectItem>
                              </div>
                            ))}
                          </div>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSaveTemplateDialog(true)}
                  disabled={files.length === 0}
                  title="Save current metadata as template"
                >
                  💾
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkEditMode(!bulkEditMode)}
                >
                  <Edit3 className="h-4 w-4 mr-2" />
                  Bulk Edit
                </Button>
              </div>
            </div>
            
            {/* Bulk Edit Panel */}
            {bulkEditMode && (
              <div className="bg-accent/10 border border-accent rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-accent flex items-center gap-2">
                    <Edit3 className="h-4 w-4" />
                    Bulk Edit Mode
                  </h4>
                  <Button variant="ghost" size="sm" onClick={() => setBulkEditMode(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Enter values below to apply to all {files.length} files. Leave blank to keep individual values.
                </p>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="bulk-title">Title (Apply to All)</Label>
                    <Input
                      id="bulk-title"
                      value={bulkTitle}
                      onChange={(e) => setBulkTitle(e.target.value)}
                      placeholder="Enter title for all files..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="bulk-description">Description (Apply to All)</Label>
                    <Textarea
                      id="bulk-description"
                      value={bulkDescription}
                      onChange={(e) => setBulkDescription(e.target.value)}
                      placeholder="Enter description for all files..."
                      rows={3}
                    />
                  </div>
                  <Button onClick={applyBulkEdit} className="w-full">
                    Apply to All {files.length} Files
                  </Button>
                </div>
              </div>
            )}
            
            {/* Metadata Suggestions from History */}
            {metadataSuggestions.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 space-y-3 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100">Suggested Metadata</h4>
                  <span className="text-xs text-blue-600 dark:text-blue-400">Based on your previous uploads</span>
                </div>
                <div className="space-y-2">
                  {metadataSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setFiles((prev) =>
                          prev.map((f) => ({
                            ...f,
                            title: f.title || suggestion.title || "",
                            description: f.description || suggestion.description || "",
                          }))
                        );
                        toast.success("Applied suggested metadata");
                      }}
                      className="w-full text-left p-3 rounded-md bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-gray-700 transition-colors"
                    >
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {suggestion.title || "(No title)"}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                        {suggestion.description || "(No description)"}
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        Used {suggestion.usageCount} time{suggestion.usageCount !== 1 ? 's' : ''}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
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

                {/* Extracted Metadata Preview */}
                {fileData.extractedMetadata && fileData.showMetadataPreview && (
                  <div className="bg-accent/10 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-accent">📋 Extracted Metadata</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateFileMetadata(index, { showMetadataPreview: false })}
                      >
                        Hide
                      </Button>
                    </div>
                    <div className="text-xs space-y-1">
                      {fileData.extractedKeywords && fileData.extractedKeywords.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">Keywords: </span>
                          <span className="font-medium">{fileData.extractedKeywords.join(", ")}</span>
                        </div>
                      )}
                      {fileData.extractedMetadata.Make && (
                        <div>
                          <span className="text-muted-foreground">Camera: </span>
                          <span className="font-medium">{fileData.extractedMetadata.Make} {fileData.extractedMetadata.Model}</span>
                        </div>
                      )}
                      {fileData.extractedMetadata.DateTimeOriginal && (
                        <div>
                          <span className="text-muted-foreground">Taken: </span>
                          <span className="font-medium">{new Date(fileData.extractedMetadata.DateTimeOriginal).toLocaleString()}</span>
                        </div>
                      )}
                      {fileData.extractedMetadata.latitude && fileData.extractedMetadata.longitude && (
                        <div>
                          <span className="text-muted-foreground">Location: </span>
                          <span className="font-medium">{fileData.extractedMetadata.latitude.toFixed(4)}, {fileData.extractedMetadata.longitude.toFixed(4)}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground italic mt-2">
                      ✓ Title and description have been auto-filled from file metadata. You can edit them below.
                    </p>
                  </div>
                )}
                {fileData.extractedMetadata && !fileData.showMetadataPreview && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateFileMetadata(index, { showMetadataPreview: true })}
                    className="w-full"
                  >
                    📋 Show Extracted Metadata
                  </Button>
                )}

                <div className="space-y-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`title-${index}`}>Title</Label>
                      {(!fileData.title || fileData.title.trim().length === 0) && (
                        <div className="flex items-center gap-1 text-amber-500 text-xs">
                          <AlertCircle className="h-3 w-3" />
                          <span>Missing</span>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        id={`title-${index}`}
                        value={fileData.title}
                        onChange={(e) => handleTitleChange(index, e.target.value)}
                        onFocus={() => {
                          if (fileData.title.length > 1 && titleSuggestions.length > 0) {
                            setShowTitleSuggestions(true);
                          }
                        }}
                        onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 200)}
                        placeholder="Enter file title"
                        className={(!fileData.title || fileData.title.trim().length === 0) ? "border-amber-500" : ""}
                      />
                      {showTitleSuggestions && titleSuggestions.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                          {titleSuggestions.map((suggestion, idx) => (
                            <div
                              key={idx}
                              className="px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                              onClick={() => selectTitleSuggestion(index, suggestion)}
                            >
                              {suggestion}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`description-${index}`}>
                        Description (Voice or Type)
                      </Label>
                      {(!fileData.description || fileData.description.trim().length === 0) && (
                        <div className="flex items-center gap-1 text-amber-500 text-xs">
                          <AlertCircle className="h-3 w-3" />
                          <span>Missing</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Textarea
                          id={`description-${index}`}
                          value={fileData.description}
                          onChange={(e) => handleDescriptionChange(index, e.target.value)}
                          onFocus={() => {
                            if (fileData.description.length > 2 && descriptionSuggestions.length > 0) {
                              setShowDescriptionSuggestions(true);
                            }
                          }}
                          onBlur={() => setTimeout(() => setShowDescriptionSuggestions(false), 200)}
                          placeholder="Describe this file..."
                          rows={3}
                          className="flex-1"
                        />
                        {showDescriptionSuggestions && descriptionSuggestions.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                            {descriptionSuggestions.map((suggestion, idx) => (
                              <div
                                key={idx}
                                className="px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                                onClick={() => selectDescriptionSuggestion(index, suggestion)}
                              >
                                {suggestion.substring(0, 100)}{suggestion.length > 100 ? '...' : ''}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
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
    
    {/* Save Template Dialog */}
    <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Save the current metadata (title and description) as a reusable template.
          </p>
          <div>
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="e.g., Product Photos, Meeting Notes"
              onKeyDown={(e) => e.key === 'Enter' && saveAsTemplate()}
            />
          </div>
          <div>
            <Label htmlFor="template-category">Category</Label>
            <Select value={newTemplateCategory} onValueChange={setNewTemplateCategory}>
              <SelectTrigger id="template-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="General">General</SelectItem>
                <SelectItem value="Work">Work</SelectItem>
                <SelectItem value="Personal">Personal</SelectItem>
                <SelectItem value="Legal">Legal</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="bg-accent/10 rounded-lg p-3 space-y-2">
            <div className="text-sm font-medium">Preview:</div>
            <div className="text-xs space-y-1">
              <div>
                <span className="text-muted-foreground">Title: </span>
                <span>{files[0]?.title || "(empty)"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Description: </span>
                <span>{files[0]?.description || "(empty)"}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSaveTemplateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveAsTemplate} disabled={!newTemplateName.trim()}>
              Save Template
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    
    {/* Edit Template Dialog */}
    <Dialog open={showEditTemplateDialog} onOpenChange={setShowEditTemplateDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-template-name">Template Name</Label>
            <Input
              id="edit-template-name"
              value={editTemplateName}
              onChange={(e) => setEditTemplateName(e.target.value)}
              placeholder="e.g., Product Photos, Meeting Notes"
            />
          </div>
          <div>
            <Label htmlFor="edit-template-category">Category</Label>
            <Select value={editTemplateCategory} onValueChange={setEditTemplateCategory}>
              <SelectTrigger id="edit-template-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="General">General</SelectItem>
                <SelectItem value="Work">Work</SelectItem>
                <SelectItem value="Personal">Personal</SelectItem>
                <SelectItem value="Legal">Legal</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-title-pattern">Title Pattern</Label>
            <Input
              id="edit-title-pattern"
              value={editTitlePattern}
              onChange={(e) => setEditTitlePattern(e.target.value)}
              placeholder="e.g., Product - {filename}"
            />
          </div>
          <div>
            <Label htmlFor="edit-description-pattern">Description Pattern</Label>
            <Textarea
              id="edit-description-pattern"
              value={editDescriptionPattern}
              onChange={(e) => setEditDescriptionPattern(e.target.value)}
              placeholder="e.g., High-quality product image for..."
              rows={3}
            />
          </div>
          <div className="flex justify-between gap-2">
            <Button
              variant="destructive"
              onClick={() => {
                if (editingTemplate) {
                  deleteTemplate(editingTemplate.id, editingTemplate.name);
                  setShowEditTemplateDialog(false);
                }
              }}
            >
              Delete Template
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowEditTemplateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveEditedTemplate} disabled={!editTemplateName.trim()}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
