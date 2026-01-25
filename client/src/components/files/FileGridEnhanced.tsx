import { useState, useRef, useEffect } from "react";
import { FilePreviewLightbox } from "./FilePreviewLightbox";
import { FloatingActionBar } from "./FloatingActionBar";
import { MetadataPopup } from "./MetadataPopup";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileImage,
  FileText,
  Video,
  File as FileIcon,
  Loader2,
  Trash2,
  Tag,
  Sparkles,
  Folder,
  FolderPlus,
  Plus,
  Edit3,
  GitCompare,
  X,
  Download,
} from "lucide-react";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FileGridEnhancedProps {
  onFileClick?: (fileId: number) => void;
  selectedFileIds?: number[];
  onSelectionChange?: (fileIds: number[]) => void;
  advancedFilters?: {
    dateFrom: string;
    dateTo: string;
    fileSizeMin: number;
    fileSizeMax: number;
    enrichmentStatus: string[];
    qualityScore: string[];
  };
}

interface DeletedFile {
  id: number;
  title: string;
  filename: string;
  description: string;
  mimeType: string;
  fileSize: number;
  fileKey: string;
  url: string;
  enrichmentStatus: string;
  userId: number;
}

export default function FileGridEnhanced({ 
  onFileClick,
  selectedFileIds = [],
  onSelectionChange,
  advancedFilters 
}: FileGridEnhancedProps) {
  // Use external selection state if provided, otherwise use internal state
  const isExternalSelection = onSelectionChange !== undefined;
  const [internalSelectedFiles, setInternalSelectedFiles] = useState<Set<number>>(new Set());
  
  const selectedFilesSet = isExternalSelection 
    ? new Set(selectedFileIds) 
    : internalSelectedFiles;
    
  const setSelectedFiles = (updater: Set<number> | ((prev: Set<number>) => Set<number>)) => {
    if (isExternalSelection) {
      const newSet = typeof updater === 'function' ? updater(selectedFilesSet) : updater;
      onSelectionChange(Array.from(newSet));
    } else {
      setInternalSelectedFiles(updater);
    }
  };
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [thumbnailSize, setThumbnailSize] = useState<'small' | 'medium' | 'large'>(() => {
    const saved = localStorage.getItem('thumbnailSize');
    return (saved as 'small' | 'medium' | 'large') || 'medium';
  });
  const [filterCollectionId, setFilterCollectionId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [createCollectionDialogOpen, setCreateCollectionDialogOpen] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<string>("");
  const [draggedFileId, setDraggedFileId] = useState<number | null>(null);
  const [dragOverCollectionId, setDragOverCollectionId] = useState<number | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionColor, setNewCollectionColor] = useState("#6366f1");
  const [newTagName, setNewTagName] = useState("");
  const [isCreatingNewTag, setIsCreatingNewTag] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "size" | "enrichment">(() => {
    const saved = localStorage.getItem('filesSortBy');
    return (saved as "date" | "size" | "enrichment") || "date";
  });
  const [filterType, setFilterType] = useState<"all" | "image" | "video" | "document">(() => {
    const saved = localStorage.getItem('filesFilterType');
    return (saved as "all" | "image" | "video" | "document") || "all";
  });
  const [filterTagSource, setFilterTagSource] = useState<"all" | "manual" | "ai" | "voice" | "metadata">(() => {
    const saved = localStorage.getItem('filesFilterTagSource');
    return (saved as "all" | "manual" | "ai" | "voice" | "metadata") || "all";
  });
  const [filterQualityScore, setFilterQualityScore] = useState<"all" | "high" | "medium" | "low">(() => {
    const saved = localStorage.getItem('filesFilterQualityScore');
    return (saved as "all" | "high" | "medium" | "low") || "all";
  });
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [batchTitle, setBatchTitle] = useState("");
  const [batchDescription, setBatchDescription] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [compareFiles, setCompareFiles] = useState<number[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const deletedFilesRef = useRef<DeletedFile[]>([]);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: filesData, isLoading } = trpc.files.list.useQuery(
    filterCollectionId ? { collectionId: filterCollectionId } : undefined
  );
  const { data: tags = [] } = trpc.tags.list.useQuery();
  const { data: collections = [] } = trpc.collections.list.useQuery();
  const utils = trpc.useUtils();

  const createFileMutation = trpc.files.create.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
    },
  });

  const deleteMutation = trpc.files.delete.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
    },
  });

  const linkTagMutation = trpc.tags.linkToFile.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
      toast.success("Tag added to files");
      setSelectedFiles(new Set());
      setTagDialogOpen(false);
    },
  });

  const enrichMutation = trpc.files.enrich.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
      toast.success("Enrichment started");
      setSelectedFiles(new Set());
    },
  });

  const addToCollectionMutation = trpc.collections.addFile.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
      utils.collections.list.invalidate();
      toast.success("Added to collection");
    },
  });

  const bulkAddToCollectionMutation = trpc.collections.addFile.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
      utils.collections.list.invalidate();
    },
  });

  const createCollectionMutation = trpc.collections.create.useMutation({
    onSuccess: () => {
      utils.collections.list.invalidate();
      toast.success("Collection created");
      setCreateCollectionDialogOpen(false);
      setNewCollectionName("");
      setNewCollectionColor("#6366f1");
    },
  });

  const createTagMutation = trpc.tags.create.useMutation({
    onSuccess: (newTag) => {
      utils.tags.list.invalidate();
      toast.success("Tag created");
      setSelectedTagId(newTag.id.toString());
      setIsCreatingNewTag(false);
      setNewTagName("");
    },
  });

  const batchUpdateMutation = trpc.files.batchUpdate.useMutation({
    onSuccess: (result) => {
      utils.files.list.invalidate();
      toast.success(`Updated ${result.count} files`);
      setMetadataDialogOpen(false);
      setBatchTitle("");
      setBatchDescription("");
      setSelectedFiles(new Set());
    },
  });

  const [exportMutation, setExportMutation] = useState({ isPending: false });

  let files = filesData?.files || [];

  // Apply file type filter
  if (filterType !== "all") {
    files = files.filter((file: any) => {
      if (filterType === "image") return file.mimeType.startsWith("image/");
      if (filterType === "video") return file.mimeType.startsWith("video/");
      if (filterType === "document")
        return (
          file.mimeType.includes("pdf") ||
          file.mimeType.includes("document") ||
          file.mimeType.includes("text")
        );
      return true;
    });
  }

  // Apply tag source filter
  if (filterTagSource !== "all") {
    files = files.filter((file: any) => {
      if (!file.tags || file.tags.length === 0) return false;
      return file.tags.some((tag: any) => tag.source === filterTagSource);
    });
  }

  // Apply quality score filter
  if (filterQualityScore !== "all") {
    files = files.filter((file: any) => {
      const score = file.qualityScore || 0;
      if (filterQualityScore === "high") return score >= 80;
      if (filterQualityScore === "medium") return score >= 50 && score < 80;
      if (filterQualityScore === "low") return score < 50;
      return true;
    });
  }

  // Apply advanced filters
  if (advancedFilters) {
    // Date range filter
    if (advancedFilters.dateFrom) {
      const fromDate = new Date(advancedFilters.dateFrom);
      files = files.filter((file: any) => new Date(file.createdAt) >= fromDate);
    }
    if (advancedFilters.dateTo) {
      const toDate = new Date(advancedFilters.dateTo);
      toDate.setHours(23, 59, 59, 999); // Include the entire day
      files = files.filter((file: any) => new Date(file.createdAt) <= toDate);
    }

    // File size filter (convert MB to bytes)
    const minBytes = advancedFilters.fileSizeMin * 1024 * 1024;
    const maxBytes = advancedFilters.fileSizeMax * 1024 * 1024;
    files = files.filter((file: any) => {
      return file.fileSize >= minBytes && file.fileSize <= maxBytes;
    });

    // Enrichment status filter
    if (advancedFilters.enrichmentStatus.length > 0) {
      files = files.filter((file: any) => {
        return advancedFilters.enrichmentStatus.includes(file.enrichmentStatus);
      });
    }

    // Quality score filter (from advanced filters)
    if (advancedFilters.qualityScore.length > 0) {
      files = files.filter((file: any) => {
        const score = file.qualityScore || 0;
        return advancedFilters.qualityScore.some((range: string) => {
          if (range === "high") return score >= 80;
          if (range === "medium") return score >= 50 && score < 80;
          if (range === "low") return score < 50;
          return false;
        });
      });
    }
  }

  // Apply sorting
  files = [...files].sort((a: any, b: any) => {
    if (sortBy === "date") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sortBy === "size") {
      return b.fileSize - a.fileSize;
    }
    if (sortBy === "enrichment") {
      if (a.enrichmentStatus === "enriched" && b.enrichmentStatus !== "enriched")
        return -1;
      if (a.enrichmentStatus !== "enriched" && b.enrichmentStatus === "enriched")
        return 1;
      return 0;
    }
    return 0;
  });

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('filesSortBy', sortBy);
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem('filesFilterType', filterType);
  }, [filterType]);

  useEffect(() => {
    localStorage.setItem('filesFilterTagSource', filterTagSource);
  }, [filterTagSource]);

  useEffect(() => {
    localStorage.setItem('filesFilterQualityScore', filterQualityScore);
  }, [filterQualityScore]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Ctrl+A or Cmd+A: Select all files
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        if (files.length > 0) {
          setSelectedFiles(new Set(files.map((f: any) => f.id)));
          toast.success(`Selected all ${files.length} files`);
        }
      }

      // Delete key: Open delete dialog for selected files
      if (e.key === "Delete" && selectedFilesSet.size > 0) {
        e.preventDefault();
        setDeleteDialogOpen(true);
      }

      // Ctrl+Z or Cmd+Z: Undo last delete
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (deletedFilesRef.current.length > 0) {
          handleUndo();
        }
      }

      // Escape: Clear selection
      if (e.key === "Escape" && selectedFilesSet.size > 0) {
        e.preventDefault();
        setSelectedFiles(new Set());
        toast.success("Selection cleared");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [files, selectedFilesSet]);

  const toggleFile = (fileId: number) => {
    const newSelected = new Set(selectedFilesSet);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const toggleAll = () => {
    if (selectedFilesSet.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f: any) => f.id)));
    }
  };

  const handleUndo = async () => {
    if (deletedFilesRef.current.length === 0) return;

    // Clear the timeout
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    // Restore all deleted files
    const filesToRestore = [...deletedFilesRef.current];
    deletedFilesRef.current = [];

    try {
      for (const file of filesToRestore) {
        await createFileMutation.mutateAsync({
          title: file.title,
          filename: file.filename,
          description: file.description,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          fileKey: file.fileKey,
          url: file.url,
        });
      }
      toast.success(`Restored ${filesToRestore.length} file(s)`);
    } catch (error: any) {
      toast.error(`Failed to restore files: ${error.message}`);
    }
  };

  const handleBatchDelete = () => {
    // Store deleted files for undo
    const filesToDelete = files.filter((f: any) => selectedFilesSet.has(f.id));
    deletedFilesRef.current = filesToDelete.map((f: any) => ({
      id: f.id,
      title: f.title,
      filename: f.filename,
      description: f.description,
      mimeType: f.mimeType,
      fileSize: f.fileSize,
      fileKey: f.fileKey,
      url: f.url,
      enrichmentStatus: f.enrichmentStatus,
      userId: f.userId,
    }));

    // Delete files
    selectedFilesSet.forEach((fileId) => {
      deleteMutation.mutate({ id: fileId });
    });

    setDeleteDialogOpen(false);
    setSelectedFiles(new Set());

    // Show undo toast
    toast.success(`Deleted ${filesToDelete.length} file(s)`, {
      action: {
        label: "Undo",
        onClick: handleUndo,
      },
      duration: 10000, // 10 seconds to undo
    });

    // Set timeout to clear deleted files after 10 seconds
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }
    undoTimeoutRef.current = setTimeout(() => {
      deletedFilesRef.current = [];
      undoTimeoutRef.current = null;
    }, 10000);
  };

  const handleBatchTag = () => {
    if (!selectedTagId) {
      toast.error("Please select a tag");
      return;
    }

    selectedFilesSet.forEach((fileId) => {
      linkTagMutation.mutate({
        fileId,
        tagId: parseInt(selectedTagId),
      });
    });
  };

  const handleCreateTag = () => {
    if (!newTagName.trim()) {
      toast.error("Please enter a tag name");
      return;
    }

    createTagMutation.mutate({
      name: newTagName.trim(),
      source: "manual",
    });
  };

  const handleBatchMetadataUpdate = () => {
    if (!batchTitle.trim() && !batchDescription.trim()) {
      toast.error("Please enter at least a title or description");
      return;
    }

    const updates: { title?: string; description?: string } = {};
    if (batchTitle.trim()) updates.title = batchTitle.trim();
    if (batchDescription.trim()) updates.description = batchDescription.trim();

    batchUpdateMutation.mutate({
      fileIds: Array.from(selectedFilesSet),
      ...updates,
    });
  };

  const toggleCompareFile = (fileId: number) => {
    if (compareFiles.includes(fileId)) {
      setCompareFiles(compareFiles.filter(id => id !== fileId));
    } else if (compareFiles.length < 4) {
      setCompareFiles([...compareFiles, fileId]);
    } else {
      toast.error("You can compare up to 4 files at once");
    }
  };

  const exitCompareMode = () => {
    setCompareMode(false);
    setCompareFiles([]);
  };

  const handleBatchEnrich = () => {
    selectedFilesSet.forEach((fileId) => {
      enrichMutation.mutate({ id: fileId });
    });
  };

  const handleBulkQualityImprovement = async () => {
    const selectedFilesList = files.filter((f: any) =>
      selectedFilesSet.has(f.id)
    );

    // Filter files with low quality scores (below 80%)
    const lowQualityFiles = selectedFilesList.filter(
      (f: any) => (f.qualityScore || 0) < 80
    );

    if (lowQualityFiles.length === 0) {
      toast.info("All selected files already have high quality scores!");
      return;
    }

    toast.info(
      `Improving quality for ${lowQualityFiles.length} file${lowQualityFiles.length > 1 ? 's' : ''}...`
    );

    // Step 1: Enrich files that aren't enriched yet
    const unenrichedFiles = lowQualityFiles.filter(
      (f: any) => f.enrichmentStatus !== "completed"
    );

    for (const file of unenrichedFiles) {
      enrichMutation.mutate({ id: file.id });
    }

    // Step 2: Apply suggested tags to all low quality files
    const utils = trpc.useUtils();
    for (const file of lowQualityFiles) {
      try {
        const suggestions = await utils.files.suggestTags.fetch({ fileId: file.id });
        
        if (suggestions && suggestions.length > 0) {
          // Apply top 3 suggested tags
          const topSuggestions = suggestions.slice(0, 3);
          
          for (const tag of topSuggestions) {
            await linkTagMutation.mutateAsync({
              fileId: file.id,
              tagId: tag.id,
            });
          }
        }
      } catch (error) {
        console.error(`Failed to apply suggestions for file ${file.id}:`, error);
      }
    }

    toast.success(
      `Quality improvement complete for ${lowQualityFiles.length} file${lowQualityFiles.length > 1 ? 's' : ''}!`
    );
    setSelectedFiles(new Set());
  };

  const handleExportCSV = () => {
    const selectedFilesList = files.filter((f: any) =>
      selectedFilesSet.has(f.id)
    );

    // Prepare comprehensive metadata
    const metadata = selectedFilesList.map((file: any) => ({
      id: file.id,
      filename: file.filename,
      title: file.title,
      description: file.description,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      enrichmentStatus: file.enrichmentStatus,
      aiAnalysis: file.aiAnalysis,
      ocrText: file.ocrText,
      detectedObjects: file.detectedObjects,
      extractedKeywords: file.extractedKeywords,
      extractedMetadata: file.extractedMetadata,
      tags: file.tags?.map((t: any) => t.name).join(", "),
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      enrichedAt: file.enrichedAt,
      url: file.url,
    }));

    // Export as CSV
    const csvHeaders = [
      "ID",
      "Filename",
      "Title",
      "Description",
      "MIME Type",
      "File Size (MB)",
      "Enrichment Status",
      "AI Analysis",
      "OCR Text",
      "Keywords",
      "Tags",
      "Created At",
      "Updated At",
      "URL",
    ];
    const csvRows = metadata.map((file) => [
      file.id,
      `"${file.filename?.replace(/"/g, '""') || ""}"`,
      `"${file.title?.replace(/"/g, '""') || ""}"`,
      `"${file.description?.replace(/"/g, '""') || ""}"`,
      file.mimeType,
      (file.fileSize / 1024 / 1024).toFixed(2),
      file.enrichmentStatus,
      `"${file.aiAnalysis?.replace(/"/g, '""') || ""}"`,
      `"${file.ocrText?.replace(/"/g, '""') || ""}"`,
      `"${file.extractedKeywords?.join(", ") || ""}"`,
      `"${file.tags || ""}"`,
      new Date(file.createdAt).toLocaleString(),
      new Date(file.updatedAt).toLocaleString(),
      file.url,
    ]);
    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map((row) => row.join(",")),
    ].join("\n");

    const csvBlob = new Blob([csvContent], { type: "text/csv" });
    const csvUrl = URL.createObjectURL(csvBlob);
    const csvLink = document.createElement("a");
    csvLink.href = csvUrl;
    csvLink.download = `metadata-export-${Date.now()}.csv`;
    csvLink.click();
    URL.revokeObjectURL(csvUrl);

    toast.success(`Exported metadata for ${selectedFilesList.length} files as CSV`);
  };

  const handleExportJSON = () => {
    const selectedFilesList = files.filter((f: any) =>
      selectedFilesSet.has(f.id)
    );

    // Prepare comprehensive metadata
    const metadata = selectedFilesList.map((file: any) => ({
      id: file.id,
      filename: file.filename,
      title: file.title,
      description: file.description,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      enrichmentStatus: file.enrichmentStatus,
      aiAnalysis: file.aiAnalysis,
      ocrText: file.ocrText,
      detectedObjects: file.detectedObjects,
      extractedKeywords: file.extractedKeywords,
      extractedMetadata: file.extractedMetadata,
      tags: file.tags?.map((t: any) => ({ id: t.id, name: t.name, source: t.source })),
      collections: file.collections?.map((c: any) => ({ id: c.id, name: c.name, color: c.color })),
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      enrichedAt: file.enrichedAt,
      url: file.url,
      qualityScore: file.qualityScore,
    }));

    // Export as JSON
    const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], {
      type: "application/json",
    });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement("a");
    jsonLink.href = jsonUrl;
    jsonLink.download = `metadata-export-${Date.now()}.json`;
    jsonLink.click();
    URL.revokeObjectURL(jsonUrl);

    toast.success(`Exported metadata for ${selectedFilesList.length} files as JSON`);
  };

  const handleBatchExport = async () => {
    setExportMutation({ isPending: true });
    try {
      const zip = new JSZip();
      const selectedFilesList = files.filter((f: any) =>
        selectedFilesSet.has(f.id)
      );

      // Prepare metadata JSON
      const metadata = selectedFilesList.map((file: any) => ({
        id: file.id,
        filename: file.filename,
        title: file.title,
        description: file.description,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        enrichmentStatus: file.enrichmentStatus,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      }));

      zip.file("metadata.json", JSON.stringify(metadata, null, 2));

      // Fetch and add each file to ZIP
      for (const file of selectedFilesList) {
        try {
          const response = await fetch(file.url);
          const blob = await response.blob();
          zip.file(file.filename, blob);
        } catch (error) {
          console.error(`Failed to fetch file ${file.filename}:`, error);
          toast.error(`Failed to add ${file.filename} to ZIP`);
        }
      }

      // Generate and download ZIP
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `metaclips-export-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${selectedFilesList.length} files to ZIP`);
      setSelectedFiles(new Set());
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export files");
    } finally {
      setExportMutation({ isPending: false });
    }
  };

  const handleBatchAddToCollection = () => {
    if (!selectedCollectionId) {
      toast.error("Please select a collection");
      return;
    }

    const collectionId = parseInt(selectedCollectionId);
    let completed = 0;
    const total = selectedFilesSet.size;

    selectedFilesSet.forEach((fileId) => {
      bulkAddToCollectionMutation.mutate(
        { collectionId, fileId },
        {
          onSettled: () => {
            completed++;
            if (completed === total) {
              toast.success(`Added ${total} files to collection`);
              setSelectedFiles(new Set());
              setCollectionDialogOpen(false);
            }
          },
        }
      );
    });
  };

  const handleCreateCollection = () => {
    if (!newCollectionName.trim()) {
      toast.error("Please enter a collection name");
      return;
    }

    createCollectionMutation.mutate({
      name: newCollectionName.trim(),
      color: newCollectionColor,
    });
  };

  const handleDragStart = (e: React.DragEvent, fileId: number) => {
    setDraggedFileId(fileId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedFileId(null);
    setDragOverCollectionId(null);
  };

  const handleDragOver = (e: React.DragEvent, collectionId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCollectionId(collectionId);
  };

  const handleDragLeave = () => {
    setDragOverCollectionId(null);
  };

  const handleDrop = (e: React.DragEvent, collectionId: number) => {
    e.preventDefault();
    if (draggedFileId) {
      addToCollectionMutation.mutate({
        collectionId,
        fileId: draggedFileId,
      });
    }
    setDraggedFileId(null);
    setDragOverCollectionId(null);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <FileImage className="h-5 w-5" />;
    if (mimeType.startsWith("video/")) return <Video className="h-5 w-5" />;
    if (mimeType.includes("pdf") || mimeType.includes("document"))
      return <FileText className="h-5 w-5" />;
    return <FileIcon className="h-5 w-5" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileCollections = (fileId: number) => {
    return collections.filter((col: any) =>
      col.files?.some((f: any) => f.id === fileId)
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Main Content */}
      <div className="flex-1 space-y-4">
        {/* Filters and Sort */}
        <div className="grid grid-cols-2 md:flex md:items-center gap-3 md:gap-4">
          {/* Collection Filter */}
          <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Filter by Collection:</label>
          <Select
            value={filterCollectionId?.toString() || "all"}
            onValueChange={(value) => {
              if (value === "all") setFilterCollectionId(null);
              else if (value === "none") setFilterCollectionId(-1);
              else if (value === "create") setCreateCollectionDialogOpen(true);
              else setFilterCollectionId(parseInt(value));
            }}
          >
            <SelectTrigger className="w-[200px] bg-card">
              <SelectValue placeholder="All Collections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Collections</SelectItem>
              <SelectItem value="none">No Collection</SelectItem>
              {collections?.map((collection: any) => (
                <SelectItem key={collection.id} value={collection.id.toString()}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: collection.color || "#6366f1" }}
                    />
                    {collection.name}
                  </div>
                </SelectItem>
              ))}
              <SelectItem value="create">
                <div className="flex items-center gap-2 text-primary font-medium">
                  <Plus className="h-4 w-4" />
                  Create New Collection
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          {filterCollectionId !== null && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCollectionDialogOpen(true)}
                aria-label={`Add ${selectedFilesSet.size} selected files to collection`}
              >
              Clear Filter
            </Button>
          )}
          </div>

          {/* File Type Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">File Type:</label>
            <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
              <SelectTrigger className="w-[150px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="image">Images</SelectItem>
                <SelectItem value="video">Videos</SelectItem>
                <SelectItem value="document">Documents</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tag Source Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Tag Source:</label>
            <Select value={filterTagSource} onValueChange={(value: any) => setFilterTagSource(value)}>
              <SelectTrigger className="w-[150px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="ai">AI Generated</SelectItem>
                <SelectItem value="voice">Voice</SelectItem>
                <SelectItem value="metadata">From Metadata</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Sort By:</label>
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-[150px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date Added</SelectItem>
                <SelectItem value="size">File Size</SelectItem>
                <SelectItem value="enrichment">Enrichment Status</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quality Score Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Quality:</label>
            <Select value={filterQualityScore} onValueChange={(value: any) => setFilterQualityScore(value)}>
              <SelectTrigger className="w-[150px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Files</SelectItem>
                <SelectItem value="high">High (80%+)</SelectItem>
                <SelectItem value="medium">Medium (50-79%)</SelectItem>
                <SelectItem value="low">Low (&lt;50%)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Thumbnail Size */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Thumbnail:</label>
            <Select value={thumbnailSize} onValueChange={(value: 'small' | 'medium' | 'large') => {
              setThumbnailSize(value);
              localStorage.setItem('thumbnailSize', value);
            }}>
              <SelectTrigger className="w-[120px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reset Filters Button */}
          {(sortBy !== "date" || filterType !== "all" || filterTagSource !== "all" || filterQualityScore !== "all" || filterCollectionId !== null) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSortBy("date");
                setFilterType("all");
                setFilterTagSource("all");
                setFilterQualityScore("all");
                setFilterCollectionId(null);
                toast.info("Filters reset to defaults");
              }}
            >
              Reset Filters
            </Button>
          )}
        </div>



        {/* Batch Actions Toolbar */}
        {selectedFilesSet.size > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {selectedFilesSet.size} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMetadataDialogOpen(true)}
                  disabled={batchUpdateMutation.isPending}
                >
                  {batchUpdateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Edit3 className="h-4 w-4 mr-2" />
                  )}
                  Edit Metadata
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCompareMode(true);
                    setSelectedFiles(new Set());
                  }}
                >
                  <GitCompare className="h-4 w-4 mr-2" />
                  Compare Files
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBatchExport}
                  disabled={exportMutation.isPending}
                  aria-label={`Export ${selectedFilesSet.size} selected files to ZIP`}
                >
                  {exportMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Export ZIP
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportJSON}
                  aria-label={`Export metadata for ${selectedFilesSet.size} selected files`}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Export JSON
                </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTagDialogOpen(true)}
                disabled={linkTagMutation.isPending}
                aria-label={`Add tags to ${selectedFilesSet.size} selected files`}
              >
                  {linkTagMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Tag className="h-4 w-4 mr-2" />
                  )}
                  Add Tag
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCollectionDialogOpen(true)}
                  disabled={bulkAddToCollectionMutation.isPending}
                >
                  {bulkAddToCollectionMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FolderPlus className="h-4 w-4 mr-2" />
                  )}
                  Add to Collection
                </Button>
                <Button
                variant="outline"
                size="sm"
                onClick={handleBatchEnrich}
                disabled={enrichMutation.isPending}
                aria-label={`Enrich ${selectedFilesSet.size} selected files with AI`}
              >
                  {enrichMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Enrich
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleBulkQualityImprovement}
                  disabled={enrichMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  aria-label={`Automatically improve quality of ${selectedFilesSet.size} selected files`}
                >
                  {enrichMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Improve Quality
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={deleteMutation.isPending}
                  aria-label={`Delete ${selectedFilesSet.size} selected files`}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete
                </Button>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedFiles(new Set())}
                aria-label="Clear file selection"
              >
                Clear Selection
              </Button>
            </div>
          </Card>
        )}

        {/* Comparison Mode Banner */}
        {compareMode && (
          <Card className="p-4 bg-primary/10 border-primary">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <GitCompare className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-semibold">Comparison Mode</h3>
                  <p className="text-sm text-muted-foreground">
                    Select 2-4 files to compare ({compareFiles.length} selected)
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={exitCompareMode}>
                <X className="h-4 w-4 mr-2" />
                Exit Comparison
              </Button>
            </div>
          </Card>
        )}

        {/* Select All */}
        {!compareMode && files.length > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedFilesSet.size === files.length && files.length > 0}
              onCheckedChange={toggleAll}
            />
            <span className="text-sm text-muted-foreground">Select All</span>
          </div>
        )}

        {/* Comparison View */}
        {compareMode && compareFiles.length >= 2 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Side-by-Side Comparison</h3>
            <div className={`grid gap-4 ${compareFiles.length === 2 ? 'grid-cols-2' : compareFiles.length === 3 ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'}`}>
              {compareFiles.map(fileId => {
                const file = files.find((f: any) => f.id === fileId);
                if (!file) return null;
                const fileCollections = getFileCollections(file.id);
                return (
                  <Card key={file.id} className="p-4 relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => toggleCompareFile(file.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <div className="space-y-3">
                      {file.mimeType.startsWith("image/") ? (
                        <img
                          src={file.url}
                          alt={file.title || file.filename}
                          className="w-full h-48 object-contain bg-muted rounded"
                        />
                      ) : file.mimeType.startsWith("video/") ? (
                        <video
                          src={file.url}
                          className="w-full h-48 object-contain bg-muted rounded"
                          controls={false}
                        />
                      ) : (
                        <div className="w-full h-48 flex flex-col items-center justify-center bg-muted rounded">
                          {getFileIcon(file.mimeType)}
                          <span className="mt-2 text-sm text-muted-foreground">
                            {file.mimeType.split("/")[1]?.toUpperCase() || "FILE"}
                          </span>
                        </div>
                      )}
                      <div>
                        <h4 className="font-semibold text-sm line-clamp-2">
                          {file.title || file.filename}
                        </h4>
                        {file.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                            {file.description}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Size:</span>
                          <span>{formatFileSize(file.fileSize)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <span
                            className={
                              file.enrichmentStatus === "completed"
                                ? "text-green-500"
                                : "text-yellow-500"
                            }
                          >
                            {file.enrichmentStatus === "completed"
                              ? "Enriched"
                              : "Not Enriched"}
                          </span>
                        </div>
                        {fileCollections.length > 0 && (
                          <div>
                            <span className="text-muted-foreground">Collections:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {fileCollections.map((collection: any) => (
                                <span
                                  key={collection.id}
                                  className="px-2 py-0.5 bg-muted rounded text-xs"
                                >
                                  {collection.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {file.tags && file.tags.length > 0 && (
                          <div>
                            <span className="text-muted-foreground">Tags:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {file.tags.map((tag: any) => (
                                <span
                                  key={tag.id}
                                  className="px-2 py-0.5 bg-primary/20 text-primary rounded text-xs"
                                >
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </Card>
        )}

        {/* File Grid */}
        {files.length === 0 ? (
          <Card className="p-12 text-center">
            <FileIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No files yet</h3>
            <p className="text-muted-foreground">Upload your first file to get started</p>
          </Card>
        ) : (
          <div 
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4"
            role="grid"
            aria-label="File grid"
          >
            {files.map((file: any) => {
              const fileCollections = getFileCollections(file.id);
              return (
                      <Card
                        key={file.id}
                        className={`group p-4 md:p-4 sm:p-6 hover:border-primary/50 transition-colors cursor-pointer relative ${
                          draggedFileId === file.id ? "opacity-50" : ""
                        }`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, file.id)}
                        onDragEnd={handleDragEnd}
                        role="gridcell"
                        aria-label={`File: ${file.filename}`}
                      >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 h-7 w-7 md:h-6 md:w-6 md:opacity-0 md:group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-opacity z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFiles(new Set([file.id]));
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <div className="flex items-start gap-2 md:gap-3">
                    {compareMode ? (
                      <Checkbox
                        checked={compareFiles.includes(file.id)}
                        onCheckedChange={() => toggleCompareFile(file.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-2.5 h-2.5 md:w-3 md:h-3"
                      />
                    ) : (
                      <Checkbox
                        checked={selectedFilesSet.has(file.id)}
                        onCheckedChange={() => toggleFile(file.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-2.5 h-2.5 md:w-3 md:h-3"
                      />
                    )}
                    <div
                      className="flex-1 min-w-0"
                      onClick={() => onFileClick?.(file.id)}
                    >
                      <div className="flex items-start gap-3">
                        {file.mimeType?.startsWith('image/') ? (
                          <img
                            src={file.url}
                            alt={file.filename}
                            className={`object-cover rounded border border-border flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity ${
                              thumbnailSize === 'small' ? 'w-12 h-12' :
                              thumbnailSize === 'large' ? 'w-24 h-24' :
                              'w-16 h-16'
                            }`}
                            loading="lazy"
                            onClick={(e) => {
                              e.stopPropagation();
                              const index = files.findIndex((f: any) => f.id === file.id);
                              setLightboxIndex(index);
                              setLightboxOpen(true);
                            }}
                            onError={(e) => {
                              // Fallback to icon if image fails to load
                              e.currentTarget.style.display = 'none';
                              const iconDiv = e.currentTarget.nextElementSibling as HTMLElement;
                              if (iconDiv) iconDiv.style.display = 'block';
                            }}
                          />
                        ) : null}
                        <div className="text-primary" style={{ display: file.mimeType?.startsWith('image/') ? 'none' : 'block' }}>
                          {getFileIcon(file.mimeType)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium truncate">
                            {file.filename}
                          </h3>
                          {file.description && (
                            <MetadataPopup description={file.description} maxLength={50} />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="shrink-0">{formatFileSize(file.fileSize)}</span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={
                              file.enrichmentStatus === "completed"
                                ? "text-green-500"
                                : "text-yellow-500"
                            }
                          >
                            {file.enrichmentStatus === "enriched"
                              ? "Enriched"
                              : "Not Enriched"}
                          </span>
                          {(file as any).qualityScore !== undefined && (
                            <span
                              className={
                                `px-2 py-0.5 rounded text-xs font-medium ${
                                  (file as any).qualityScore >= 80
                                    ? "bg-green-500/20 text-green-600"
                                    : (file as any).qualityScore >= 50
                                    ? "bg-yellow-500/20 text-yellow-600"
                                    : "bg-red-500/20 text-red-600"
                                }`
                              }
                              title="Metadata Quality Score"
                            >
                              {(file as any).qualityScore}%
                            </span>
                          )}
                        </div>
                      </div>

                      {fileCollections.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {fileCollections.map((collection: any) => (
                            <div
                              key={collection.id}
                              className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs"
                            >
                              <Folder
                                className="h-3 w-3"
                                style={{ color: collection.color || "#6366f1" }}
                              />
                              <span>{collection.name}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {file.tags && file.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {file.tags.map((tag: any) => (
                            <span
                              key={tag.id}
                              className="px-2 py-1 bg-primary/20 text-primary text-xs rounded flex items-center gap-1"
                              title={`Source: ${tag.source}`}
                            >
                              {tag.name}
                              {tag.source === "ai" && <Sparkles className="h-3 w-3" />}
                              {tag.source === "metadata" && <FileIcon className="h-3 w-3" />}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                      </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Collections Sidebar (visible during drag) */}
      {draggedFileId && (
        <div className="w-64 space-y-2">
          <h3 className="font-semibold text-sm text-muted-foreground">
            Drop into collection
          </h3>
          {collections.map((collection: any) => (
            <div
              key={collection.id}
              className={`p-3 border-2 border-dashed rounded transition-colors ${
                dragOverCollectionId === collection.id
                  ? "border-primary bg-primary/10"
                  : "border-border"
              }`}
              onDragOver={(e) => handleDragOver(e, collection.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, collection.id)}
            >
              <div className="flex items-center gap-2">
                <Folder
                  className="h-4 w-4"
                  style={{ color: collection.color || "#10b981" }}
                />
                <span className="text-sm font-medium truncate">{collection.name}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedFilesSet.size} files?</AlertDialogTitle>
            <AlertDialogDescription>
              You can undo this action within 10 seconds after deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Metadata Edit Dialog */}
      <Dialog open={metadataDialogOpen} onOpenChange={setMetadataDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Metadata for {selectedFilesSet.size} Files</DialogTitle>
            <DialogDescription>
              Update title and/or description for all selected files. Leave fields empty to keep existing values.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="batch-title">Title</Label>
              <Input
                id="batch-title"
                value={batchTitle}
                onChange={(e) => setBatchTitle(e.target.value)}
                placeholder="Enter new title (optional)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-description">Description</Label>
              <Input
                id="batch-description"
                value={batchDescription}
                onChange={(e) => setBatchDescription(e.target.value)}
                placeholder="Enter new description (optional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMetadataDialogOpen(false);
                setBatchTitle("");
                setBatchDescription("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBatchMetadataUpdate}
              disabled={batchUpdateMutation.isPending}
            >
              {batchUpdateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Edit3 className="h-4 w-4 mr-2" />
              )}
              Update Metadata
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tag Dialog */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Tag to {selectedFilesSet.size} Files</DialogTitle>
            <DialogDescription>
              {isCreatingNewTag
                ? "Create a new tag and add it to all selected files"
                : "Select a tag to add to all selected files"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isCreatingNewTag ? (
              <div className="space-y-2">
                <Label htmlFor="new-tag-name">Tag Name</Label>
                <Input
                  id="new-tag-name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Enter tag name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateTag();
                  }}
                />
              </div>
            ) : (
              <Select
                value={selectedTagId}
                onValueChange={(value) => {
                  if (value === "create-new") {
                    setIsCreatingNewTag(true);
                  } else {
                    setSelectedTagId(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a tag" />
                </SelectTrigger>
                <SelectContent>
                  {tags.map((tag: any) => (
                    <SelectItem key={tag.id} value={tag.id.toString()}>
                      {tag.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="create-new">
                    <div className="flex items-center gap-2 text-primary font-medium">
                      <Plus className="h-4 w-4" />
                      Create New Tag
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <div className="flex justify-between w-full">
              <div>
                {isCreatingNewTag && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsCreatingNewTag(false);
                      setNewTagName("");
                    }}
                  >
                    Back
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setTagDialogOpen(false);
                    setIsCreatingNewTag(false);
                    setNewTagName("");
                  }}
                >
                  Cancel
                </Button>
                {isCreatingNewTag ? (
                  <Button
                    onClick={handleCreateTag}
                    disabled={createTagMutation.isPending}
                  >
                    {createTagMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Create Tag
                  </Button>
                ) : (
                  <Button onClick={handleBatchTag}>Add Tag</Button>
                )}
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Collection Dialog */}
      <Dialog open={collectionDialogOpen} onOpenChange={setCollectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {selectedFilesSet.size} Files to Collection</DialogTitle>
            <DialogDescription>
              Select a collection to add all selected files
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select
              value={selectedCollectionId}
              onValueChange={setSelectedCollectionId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a collection" />
              </SelectTrigger>
              <SelectContent>
                {collections.map((collection: any) => (
                  <SelectItem key={collection.id} value={collection.id.toString()}>
                    <div className="flex items-center gap-2">
                      <Folder
                        className="h-4 w-4"
                        style={{ color: collection.color || "#10b981" }}
                      />
                      {collection.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCollectionDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleBatchAddToCollection}>Add to Collection</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Collection Dialog */}
      <Dialog open={createCollectionDialogOpen} onOpenChange={setCreateCollectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Collection</DialogTitle>
            <DialogDescription>
              Create a new collection to organize your files
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="collection-name">Collection Name</Label>
              <Input
                id="collection-name"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="Enter collection name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCollection();
                }}
              />
            </div>
            <div>
              <Label htmlFor="collection-color">Collection Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="collection-color"
                  type="color"
                  value={newCollectionColor}
                  onChange={(e) => setNewCollectionColor(e.target.value)}
                  className="w-20 h-10"
                />
                <span className="text-sm text-muted-foreground">
                  {newCollectionColor}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateCollectionDialogOpen(false);
                setNewCollectionName("");
                setNewCollectionColor("#6366f1");
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateCollection}
              disabled={createCollectionMutation.isPending}
            >
              {createCollectionMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Preview Lightbox */}
      <FilePreviewLightbox
        files={files}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      />

      {/* Floating Action Bar */}
      {selectedFilesSet.size > 0 && (
        <FloatingActionBar
          selectedCount={selectedFilesSet.size}
          totalCount={files.length}
          onSelectAll={() => {
            setSelectedFiles(new Set(files.map((f: any) => f.id)));
            toast.success(`Selected all ${files.length} files`);
          }}
          onDeselectAll={() => {
            setSelectedFiles(new Set());
            toast.info("Selection cleared");
          }}
          onDownload={handleBulkQualityImprovement}
          onExportCSV={handleExportCSV}
          onExportJSON={handleExportJSON}
          onTag={() => setTagDialogOpen(true)}
          onMoveToCollection={() => setCollectionDialogOpen(true)}
          onBulkEnrich={async () => {
            const fileIds = Array.from(selectedFilesSet);
            const total = fileIds.length;
            const concurrency = 3; // Process 3 files at a time
            
            toast.info(`Starting enrichment for ${total} files (${concurrency} at a time)...`);
            
            let completed = 0;
            let failed = 0;
            
            // Process files in batches of 3
            for (let i = 0; i < fileIds.length; i += concurrency) {
              const batch = fileIds.slice(i, i + concurrency);
              
              const results = await Promise.allSettled(
                batch.map(fileId => enrichMutation.mutateAsync({ id: fileId }))
              );
              
              results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                  completed++;
                } else {
                  failed++;
                  console.error(`Failed to enrich file ${batch[index]}:`, result.reason);
                }
              });
              
              const progress = Math.round((completed + failed) / total * 100);
              toast.info(`Progress: ${progress}% (${completed} enriched, ${failed} failed)`);
            }
            
            if (failed === 0) {
              toast.success(`✅ Bulk enrichment complete: ${completed}/${total} files enriched`);
            } else {
              toast.warning(`⚠️ Enrichment complete: ${completed} succeeded, ${failed} failed`);
            }
            
            setSelectedFiles(new Set());
          }}
          onDelete={() => setDeleteDialogOpen(true)}
          onClose={() => setSelectedFiles(new Set())}
        />
      )}
    </div>
  );
}
