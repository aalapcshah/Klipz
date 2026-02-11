import { useState, useRef, useEffect } from "react";
import React from 'react';
import { FilePreviewLightbox } from "./FilePreviewLightbox";
import { VideoThumbnail } from "@/components/VideoThumbnail";
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
  PenLine,
  ChevronDown,
  ChevronUp,
  Filter,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FileGridEnhancedProps {
  onFileClick?: (fileId: number) => void;
  selectedFileIds?: number[];
  onSelectionChange?: (fileIds: number[]) => void;
  onFilteredCountChange?: (count: number) => void;
  advancedFilters?: {
    dateFrom: string;
    dateTo: string;
    fileSizeMin: number;
    fileSizeMax: number;
    enrichmentStatus: string[];
    qualityScore: string[];
  };
  files?: any[]; // Files passed from parent component
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
  onFilteredCountChange,
  advancedFilters,
  files: externalFiles
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
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [lastClickedFileId, setLastClickedFileId] = useState<number | null>(null);
  const [swipedFileId, setSwipedFileId] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const isSwipeSelectingRef = useRef(false);
  const swipeSelectStartFileRef = useRef<number | null>(null);
  const lastSwipeSelectedFileRef = useRef<number | null>(null);
  const swipeSelectDirectionRef = useRef<'select' | 'deselect' | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const deletedFilesRef = useRef<DeletedFile[]>([]);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Use external files if provided, otherwise fetch our own
  const { data: internalFilesData, isLoading: internalLoading } = trpc.files.list.useQuery(
    filterCollectionId ? { collectionId: filterCollectionId } : undefined,
    { enabled: !externalFiles } // Only fetch if no external files provided
  );
  const filesData = externalFiles ? { files: externalFiles } : internalFilesData;
  const isLoading = externalFiles ? false : internalLoading;
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

  const reorderMutation = trpc.files.reorder.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
      toast.success("Files reordered");
    },
    onError: (error) => {
      toast.error("Failed to reorder files");
      console.error("Reorder error:", error);
    },
  });

  // Drag-and-drop reordering state
  const [isDraggingForReorder, setIsDraggingForReorder] = useState(false);
  const [draggedReorderFileId, setDraggedReorderFileId] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const [exportMutation, setExportMutation] = useState({ isPending: false });

  let files = externalFiles || filesData?.files || [];

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

    // File size filter (convert MB to bytes) - only apply if changed from default
    if (advancedFilters.fileSizeMin > 0 || advancedFilters.fileSizeMax < 100) {
      const minBytes = advancedFilters.fileSizeMin * 1024 * 1024;
      const maxBytes = advancedFilters.fileSizeMax * 1024 * 1024;
      files = files.filter((file: any) => {
        const fileSize = file.fileSize || 0;
        return fileSize >= minBytes && fileSize <= maxBytes;
      });
    }

    // Enrichment status filter
    // Map UI filter values to database values:
    // "not_enriched" -> "pending" or "processing"
    // "enriched" -> "completed"
    // "failed" -> "failed"
    if (advancedFilters.enrichmentStatus.length > 0) {
      files = files.filter((file: any) => {
        const status = file.enrichmentStatus;
        return advancedFilters.enrichmentStatus.some((filterStatus: string) => {
          if (filterStatus === "not_enriched") {
            return status === "pending" || status === "processing";
          }
          if (filterStatus === "enriched") {
            return status === "completed";
          }
          if (filterStatus === "failed") {
            return status === "failed";
          }
          return false;
        });
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

  // Report filtered count to parent
  useEffect(() => {
    if (onFilteredCountChange) {
      onFilteredCountChange(files.length);
    }
  }, [files.length, onFilteredCountChange]);

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

  const toggleFile = (fileId: number, shiftKey: boolean = false) => {
    const newSelected = new Set(selectedFilesSet);
    
    // Shift+click range selection
    if (shiftKey && lastClickedFileId !== null && files.length > 0) {
      const fileIds = files.map(f => f.id);
      const lastIndex = fileIds.indexOf(lastClickedFileId);
      const currentIndex = fileIds.indexOf(fileId);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const startIndex = Math.min(lastIndex, currentIndex);
        const endIndex = Math.max(lastIndex, currentIndex);
        
        // Select all files in range
        for (let i = startIndex; i <= endIndex; i++) {
          newSelected.add(fileIds[i]);
        }
        setSelectedFiles(newSelected);
        return;
      }
    }
    
    // Normal toggle
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
    setLastClickedFileId(fileId);
  };

  // Long-press handlers for mobile selection
  const handleTouchStart = (fileId: number) => {
    longPressTimerRef.current = setTimeout(() => {
      // Enter selection mode and select this file
      setIsSelectionMode(true);
      setSelectedFiles(new Set([fileId]));
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500); // 500ms long press
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchMove = () => {
    // Cancel long press if user moves finger
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedFiles(new Set());
  };

  // Swipe-to-delete handlers for mobile
  const handleSwipeStart = (e: React.TouchEvent, fileId: number) => {
    if (isSelectionMode) return;
    // Close any other swiped card first
    if (swipedFileId !== null && swipedFileId !== fileId) {
      setSwipeOffset(0);
    }
    swipeStartXRef.current = e.touches[0].clientX;
    swipeStartYRef.current = e.touches[0].clientY;
    setSwipedFileId(fileId);
  };

  const handleSwipeMove = (e: React.TouchEvent) => {
    if (swipeStartXRef.current === null || swipeStartYRef.current === null || isSelectionMode) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = swipeStartXRef.current - currentX;
    const diffY = Math.abs(currentY - swipeStartYRef.current);
    // Only allow left swipe if horizontal movement dominates vertical (prevent scroll interference)
    if (diffX > 10 && diffX > diffY * 1.5) {
      setSwipeOffset(Math.min(diffX, 160)); // Max 160px swipe for two buttons
      e.preventDefault(); // Prevent scrolling while swiping
    } else if (diffX <= 0) {
      setSwipeOffset(0);
    }
  };

  const handleSwipeEnd = () => {
    if (swipeOffset > 80) {
      // Keep both action buttons visible
      setSwipeOffset(160);
    } else if (swipeOffset > 40) {
      // Partial swipe - snap to full reveal
      setSwipeOffset(160);
    } else {
      // Reset swipe
      setSwipeOffset(0);
      setSwipedFileId(null);
    }
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
  };

  const handleSwipeDelete = (fileId: number) => {
    const file = files.find((f: any) => f.id === fileId);
    if (file) {
      deletedFilesRef.current.push({
        id: file.id,
        title: file.title || file.filename,
        filename: file.filename,
        description: file.description || '',
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        fileKey: file.fileKey,
        url: file.url,
        enrichmentStatus: file.enrichmentStatus || 'pending',
        userId: file.userId,
      });
      deleteMutation.mutate({ id: fileId });
      toast.success(`Deleted "${file.title || file.filename}"`, {
        action: {
          label: "Undo",
          onClick: () => handleUndo(),
        },
      });
    }
    setSwipeOffset(0);
    setSwipedFileId(null);
  };

  const handleSwipeEnrich = (fileId: number) => {
    const file = files.find((f: any) => f.id === fileId);
    if (file) {
      enrichMutation.mutate({ id: fileId });
      toast.success(`Enriching "${file.title || file.filename}"...`);
    }
    setSwipeOffset(0);
    setSwipedFileId(null);
  };

  const resetSwipe = () => {
    setSwipeOffset(0);
    setSwipedFileId(null);
  };

  // Swipe-to-select handlers for mobile multi-selection
  const handleSwipeSelectStart = (e: React.TouchEvent, fileId: number) => {
    // Only enable swipe-select in selection mode
    if (!isSelectionMode) return;
    
    swipeStartXRef.current = e.touches[0].clientX;
    swipeStartYRef.current = e.touches[0].clientY;
    swipeSelectStartFileRef.current = fileId;
    lastSwipeSelectedFileRef.current = fileId;
    
    // Determine direction based on current selection state
    const isCurrentlySelected = selectedFilesSet.has(fileId);
    swipeSelectDirectionRef.current = isCurrentlySelected ? 'deselect' : 'select';
  };

  const handleSwipeSelectMove = (e: React.TouchEvent, fileId: number) => {
    if (!isSelectionMode || swipeStartXRef.current === null || swipeStartYRef.current === null) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = Math.abs(currentX - swipeStartXRef.current);
    const diffY = Math.abs(currentY - swipeStartYRef.current);
    
    // Only activate swipe selection if horizontal movement is greater than vertical
    // This prevents accidental selection while scrolling
    if (diffX > 20 && diffX > diffY * 1.5) {
      isSwipeSelectingRef.current = true;
      e.preventDefault(); // Prevent scrolling while swiping to select
    }
    
    // If we're in swipe-select mode and this is a different file than last selected
    if (isSwipeSelectingRef.current && fileId !== lastSwipeSelectedFileRef.current) {
      lastSwipeSelectedFileRef.current = fileId;
      
      // Apply selection based on direction
      setSelectedFiles((prev) => {
        const newSet = new Set(prev);
        if (swipeSelectDirectionRef.current === 'select') {
          newSet.add(fileId);
        } else {
          newSet.delete(fileId);
        }
        return newSet;
      });
      
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(10);
      }
    }
  };

  const handleSwipeSelectEnd = () => {
    if (isSwipeSelectingRef.current) {
      // Show toast with selection count
      const count = selectedFilesSet.size;
      if (count > 0) {
        toast.info(`${count} file${count > 1 ? 's' : ''} selected`);
      }
    }
    
    // Reset all swipe-select refs
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
    isSwipeSelectingRef.current = false;
    swipeSelectStartFileRef.current = null;
    lastSwipeSelectedFileRef.current = null;
    swipeSelectDirectionRef.current = null;
  };

  // Get file at touch position for swipe selection
  const getFileAtTouchPosition = (touch: React.Touch): number | null => {
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return null;
    
    // Find the closest gridcell parent
    const gridCell = element.closest('[role="gridcell"]');
    if (!gridCell) return null;
    
    // Extract file ID from aria-label or data attribute
    const ariaLabel = gridCell.getAttribute('aria-label');
    if (ariaLabel) {
      const filename = ariaLabel.replace('File: ', '');
      const file = files.find((f: any) => f.filename === filename);
      return file?.id || null;
    }
    return null;
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
    if (mimeType.startsWith("image/")) return <FileImage className="h-4 w-4 md:h-5 md:w-5" />;
    if (mimeType.startsWith("video/")) return <Video className="h-4 w-4 md:h-5 md:w-5" />;
    if (mimeType.includes("pdf") || mimeType.includes("document"))
      return <FileText className="h-4 w-4 md:h-5 md:w-5" />;
    return <FileIcon className="h-4 w-4 md:h-5 md:w-5" />;
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
        {/* Filters and Sort - Mobile: Collapsible, Desktop: Always visible */}
        {/* Mobile Filter Toggle Button */}
        <div className="md:hidden">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 justify-between"
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span className="text-xs">Filters & Sort</span>
              {(sortBy !== "date" || filterType !== "all" || filterTagSource !== "all" || filterQualityScore !== "all" || filterCollectionId !== null) && (
                <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                  Active
                </span>
              )}
            </div>
            {mobileFiltersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        
        {/* Filter Content - Collapsible on mobile, always visible on desktop */}
        <div className={`${mobileFiltersOpen ? 'block' : 'hidden'} md:block`}>
          <div className="grid grid-cols-2 md:flex md:items-center gap-2 md:gap-4 p-2 md:p-0 bg-muted/30 md:bg-transparent rounded-lg md:rounded-none">
            {/* Collection Filter */}
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
              <label className="text-xs md:text-sm font-medium">Collection:</label>
              <Select
                value={filterCollectionId?.toString() || "all"}
                onValueChange={(value) => {
                  if (value === "all") setFilterCollectionId(null);
                  else if (value === "none") setFilterCollectionId(-1);
                  else if (value === "create") setCreateCollectionDialogOpen(true);
                  else setFilterCollectionId(parseInt(value));
                }}
              >
                <SelectTrigger className="h-8 md:h-9 w-full md:w-[180px] bg-card text-xs md:text-sm">
                  <SelectValue placeholder="All" />
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
                      Create New
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* File Type Filter */}
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
              <label className="text-xs md:text-sm font-medium">Type:</label>
              <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
                <SelectTrigger className="h-8 md:h-9 w-full md:w-[130px] bg-card text-xs md:text-sm">
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
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
              <label className="text-xs md:text-sm font-medium">Tags:</label>
              <Select value={filterTagSource} onValueChange={(value: any) => setFilterTagSource(value)}>
                <SelectTrigger className="h-8 md:h-9 w-full md:w-[130px] bg-card text-xs md:text-sm">
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
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
              <label className="text-xs md:text-sm font-medium">Sort:</label>
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="h-8 md:h-9 w-full md:w-[130px] bg-card text-xs md:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date Added</SelectItem>
                  <SelectItem value="size">File Size</SelectItem>
                  <SelectItem value="enrichment">Enrichment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quality Score Filter */}
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
              <label className="text-xs md:text-sm font-medium">Quality:</label>
              <Select value={filterQualityScore} onValueChange={(value: any) => setFilterQualityScore(value)}>
                <SelectTrigger className="h-8 md:h-9 w-full md:w-[130px] bg-card text-xs md:text-sm">
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

            {/* Thumbnail Size - Hidden on mobile */}
            <div className="hidden md:flex md:items-center gap-2">
              <label className="text-sm font-medium">Thumbnail:</label>
              <Select value={thumbnailSize} onValueChange={(value: 'small' | 'medium' | 'large') => {
                setThumbnailSize(value);
                localStorage.setItem('thumbnailSize', value);
              }}>
                <SelectTrigger className="w-[100px] bg-card">
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
                className="h-8 text-xs col-span-2 md:col-span-1"
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
        </div>



        {/* Batch Actions Toolbar */}
        {selectedFilesSet.size > 0 && (
          <Card className="p-4">
            <div className="flex flex-col gap-2">
              {/* Mobile swipe hint */}
              {isSelectionMode && (
                <div className="md:hidden text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded flex items-center gap-1">
                  <span>💡</span>
                  <span>Swipe horizontally across files to quickly select or deselect multiple items</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-sm font-medium">
                    {selectedFilesSet.size} selected
                  </span>

                  {/* 1. Clear Selected */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedFiles(new Set());
                      setIsSelectionMode(false);
                    }}
                    aria-label="Clear file selection"
                  >
                    <X className="h-4 w-4 mr-2" />
                    {isSelectionMode ? "Exit Selection" : "Clear Selected"}
                  </Button>

                  {/* 2. Add Tag */}
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

                  {/* 3. Edit Metadata */}
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

                  {/* 4. Enrich (purple) */}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleBatchEnrich}
                    disabled={enrichMutation.isPending}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    aria-label={`Enrich ${selectedFilesSet.size} selected files with AI`}
                  >
                    {enrichMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Enrich
                  </Button>

                  {/* 5. Improve Quality */}
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

                  {/* 6. Compare Files */}
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

                  {/* 7. Export (dropdown) */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={exportMutation.isPending}
                        aria-label={`Export ${selectedFilesSet.size} selected files`}
                      >
                        {exportMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Export
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={handleBatchExport}>
                        <Download className="h-4 w-4 mr-2" />
                        Export as ZIP
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportJSON}>
                        <FileText className="h-4 w-4 mr-2" />
                        Export as JSON
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* 9. Add to Collection */}
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

                  {/* 10. Delete (red) */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteDialogOpen(true)}
                    disabled={deleteMutation.isPending}
                    className="text-red-500 border-red-500/50 hover:bg-red-500/10 hover:text-red-500"
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
              </div>
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

        {/* Select All / Clear Selection */}
        {!compareMode && files.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedFilesSet.size === files.length && files.length > 0}
                onCheckedChange={toggleAll}
                className="h-4 w-4"
              />
              <span className="text-sm text-muted-foreground">Select All</span>
            </div>
            {selectedFilesSet.size > 0 && (
              <button
                onClick={() => setSelectedFiles(new Set())}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear ({selectedFilesSet.size})
              </button>
            )}
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
                        <VideoThumbnail
                          src={file.url}
                          alt={file.title || file.filename}
                          className="w-full h-48 bg-muted rounded cursor-pointer"
                          showPlayIcon={true}
                          onClick={(e) => {
                            e.stopPropagation();
                            onFileClick?.(file.id);
                          }}
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
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Status:</span>
                          {file.enrichmentStatus === "completed" && (
                            <span className="flex items-center gap-1 text-green-500">
                              <span className="w-2 h-2 rounded-full bg-green-500"></span>
                              Enriched
                            </span>
                          )}
                          {file.enrichmentStatus === "processing" && (
                            <span className="flex items-center gap-1 text-blue-500">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Processing
                            </span>
                          )}
                          {file.enrichmentStatus === "pending" && (
                            <span className="flex items-center gap-1 text-amber-500">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              Pending
                            </span>
                          )}
                          {file.enrichmentStatus === "failed" && (
                            <span className="flex items-center gap-1 text-red-500">
                              <span className="w-2 h-2 rounded-full bg-red-500"></span>
                              Failed
                            </span>
                          )}
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

        {/* Drag-and-drop hint */}
        {isDraggingForReorder && (
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 mb-4 text-center">
            <p className="text-sm text-primary font-medium">🔄 Drag to reorder - Drop on another file to swap positions</p>
          </div>
        )}

        {/* File Grid */}
        {files.length === 0 ? (
          <Card className="p-12 text-center">
            <FileIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            {(filterType !== 'all' || filterTagSource !== 'all' || filterQualityScore !== 'all' || 
              (advancedFilters && (advancedFilters.enrichmentStatus.length > 0 || advancedFilters.qualityScore.length > 0 || advancedFilters.dateFrom || advancedFilters.fileSizeMin > 0))) ? (
              <>
                <h3 className="text-lg font-semibold mb-2">No files match your filters</h3>
                <p className="text-muted-foreground mb-4">Try adjusting or clearing your filters to see more files</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilterType('all');
                    setFilterTagSource('all');
                    setFilterQualityScore('all');
                  }}
                >
                  Clear Filters
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-2">No files yet</h3>
                <p className="text-muted-foreground">Upload your first file to get started</p>
              </>
            )}
          </Card>
        ) : (
          <div 
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3 w-full"
            role="grid"
            aria-label="File grid"
            onClick={(e) => {
              // Close any swiped card when tapping on the grid background
              if (swipedFileId !== null && swipeOffset > 0) {
                const target = e.target as HTMLElement;
                // Only reset if clicking on the grid itself, not on a swipe action button
                if (!target.closest('[data-swipe-actions]')) {
                  resetSwipe();
                }
              }
            }}
          >
            {files.map((file: any, index: number) => {
              const fileCollections = getFileCollections(file.id);
              const isSwipedFile = swipedFileId === file.id;
              const isDropTarget = dropTargetIndex === index;
              const isDragged = draggedReorderFileId === file.id;
              return (
                <div 
                  key={file.id} 
                  className={`relative overflow-hidden transition-all duration-200 ${
                    isDropTarget ? "ring-2 ring-primary ring-offset-2" : ""
                  } ${isDragged ? "opacity-50 scale-95" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedReorderFileId !== null && draggedReorderFileId !== file.id) {
                      setDropTargetIndex(index);
                    }
                  }}
                  onDragLeave={() => {
                    if (dropTargetIndex === index) {
                      setDropTargetIndex(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedReorderFileId !== null && draggedReorderFileId !== file.id) {
                      // Reorder files
                      const fileIds = files.map((f: any) => f.id);
                      const fromIndex = fileIds.indexOf(draggedReorderFileId);
                      const toIndex = index;
                      
                      if (fromIndex !== -1 && fromIndex !== toIndex) {
                        // Create new order
                        const newOrder = [...fileIds];
                        newOrder.splice(fromIndex, 1);
                        newOrder.splice(toIndex, 0, draggedReorderFileId);
                        
                        // Save to backend
                        reorderMutation.mutate({
                          fileIds: newOrder,
                          collectionId: filterCollectionId || undefined,
                        });
                      }
                    }
                    setDraggedReorderFileId(null);
                    setDropTargetIndex(null);
                    setIsDraggingForReorder(false);
                  }}
                >
                  {/* Swipe action buttons - revealed on swipe left */}
                  <div 
                    data-swipe-actions
                    className="absolute right-0 top-0 bottom-0 w-40 flex md:hidden rounded-r-lg overflow-hidden"
                    style={{ opacity: isSwipedFile ? 1 : 0, pointerEvents: isSwipedFile && swipeOffset > 40 ? 'auto' : 'none' }}
                  >
                    <button
                      className="flex-1 flex flex-col items-center justify-center gap-1 bg-primary text-primary-foreground active:opacity-80"
                      onClick={(e) => { e.stopPropagation(); handleSwipeEnrich(file.id); }}
                    >
                      <Sparkles className="h-5 w-5" />
                      <span className="text-[10px] font-medium">Enrich</span>
                    </button>
                    <button
                      className="flex-1 flex flex-col items-center justify-center gap-1 bg-destructive text-destructive-foreground active:opacity-80"
                      onClick={(e) => { e.stopPropagation(); handleSwipeDelete(file.id); }}
                    >
                      <Trash2 className="h-5 w-5" />
                      <span className="text-[10px] font-medium">Delete</span>
                    </button>
                  </div>
                  <Card
                    className={`group p-2 md:p-3 hover:border-primary/50 transition-colors cursor-grab active:cursor-grabbing relative ${
                      draggedFileId === file.id ? "opacity-50" : ""
                    } ${isSelectionMode && selectedFilesSet.has(file.id) ? "ring-2 ring-primary bg-primary/10" : ""} ${
                      isSelectionMode && isSwipeSelectingRef.current ? "transition-all duration-100" : ""
                    } ${isDraggingForReorder ? "cursor-grabbing" : ""}`}
                    style={{
                      transform: isSwipedFile ? `translateX(-${swipeOffset}px)` : 'translateX(0)',
                      transition: swipeStartXRef.current === null ? 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none'
                    }}
                    draggable
                    onDragStart={(e) => {
                      handleDragStart(e, file.id);
                      setDraggedReorderFileId(file.id);
                      setIsDraggingForReorder(true);
                    }}
                    onDragEnd={() => {
                      handleDragEnd();
                      setDraggedReorderFileId(null);
                      setDropTargetIndex(null);
                      setIsDraggingForReorder(false);
                    }}
                    onTouchStart={(e) => {
                      handleTouchStart(file.id);
                      if (isSelectionMode) {
                        handleSwipeSelectStart(e, file.id);
                      } else {
                        handleSwipeStart(e, file.id);
                      }
                    }}
                    onTouchEnd={() => {
                      handleTouchEnd();
                      if (isSelectionMode) {
                        handleSwipeSelectEnd();
                      } else {
                        handleSwipeEnd();
                      }
                    }}
                    onTouchMove={(e) => {
                      handleTouchMove();
                      if (isSelectionMode) {
                        // Get file at current touch position for continuous selection
                        const touch = e.touches[0];
                        const fileAtPosition = getFileAtTouchPosition(touch);
                        if (fileAtPosition !== null) {
                          handleSwipeSelectMove(e, fileAtPosition);
                        }
                      } else {
                        handleSwipeMove(e);
                      }
                    }}
                    onClick={() => {
                      if (isSwipedFile && swipeOffset > 0) {
                        resetSwipe();
                        return;
                      }
                      if (isSelectionMode) {
                        toggleFile(file.id);
                      }
                    }}
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
                  <div className="flex items-start gap-1 md:gap-3">
                    {/* Checkbox - always visible, smaller on mobile */}
                    <div className="flex-shrink-0 flex items-center justify-center w-5 h-5 md:w-6 md:h-6">
                      {compareMode ? (
                        <Checkbox
                          checked={compareFiles.includes(file.id)}
                          onCheckedChange={() => toggleCompareFile(file.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4"
                        />
                      ) : (
                        <Checkbox
                          checked={selectedFilesSet.has(file.id)}
                          onCheckedChange={() => {}}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFile(file.id, e.shiftKey);
                          }}
                          className="w-4 h-4"
                        />
                      )}
                    </div>
                    <div
                      className="flex-1 min-w-0"
                      onClick={() => {
                        if (!isSelectionMode) {
                          onFileClick?.(file.id);
                        }
                      }}
                    >
                      <div className="flex items-start gap-2 md:gap-3">
                        {/* Thumbnail - only show on desktop (md and up) */}
                        <div className={`hidden md:flex flex-shrink-0 items-center justify-center rounded border border-border bg-muted/50 relative ${
                          thumbnailSize === 'small' ? 'w-12 h-12' :
                          thumbnailSize === 'large' ? 'w-24 h-24' :
                          'w-16 h-16'
                        }`}>
                          {file.mimeType?.startsWith('image/') ? (
                            <img
                              src={file.url}
                              alt={file.filename}
                              className="w-full h-full object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                              loading="lazy"
                              onClick={(e) => {
                                e.stopPropagation();
                                const index = files.findIndex((f: any) => f.id === file.id);
                                setLightboxIndex(index);
                                setLightboxOpen(true);
                              }}
                              onError={(e) => {
                                // Hide broken image
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : file.mimeType?.startsWith('video/') ? (
                            <VideoThumbnail
                              src={file.url}
                              alt={file.filename}
                              className="w-full h-full rounded"
                              showPlayIcon={false}
                              onClick={(e) => {
                                e.stopPropagation();
                                onFileClick?.(file.id);
                              }}
                            />
                          ) : (() => {
                            // Check for social media thumbnail in extractedMetadata
                            const metadata = file.extractedMetadata ? (typeof file.extractedMetadata === 'string' ? JSON.parse(file.extractedMetadata) : file.extractedMetadata) : null;
                            const thumbnailUrl = metadata?.thumbnailUrl;
                            if (thumbnailUrl) {
                              return (
                                <img
                                  src={thumbnailUrl}
                                  alt={file.filename}
                                  className="w-full h-full object-cover rounded"
                                  loading="lazy"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement?.querySelector('.fallback-icon')?.classList.remove('hidden');
                                  }}
                                />
                              );
                            }
                            return (
                              <div className="text-primary">
                                {getFileIcon(file.mimeType)}
                              </div>
                            );
                          })()}
                          {/* Enrichment status badge */}
                          {file.enrichmentStatus === 'pending' && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border border-background" title="Needs enrichment" />
                          )}
                          {file.enrichmentStatus === 'processing' && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center" title="Processing">
                              <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
                            </div>
                          )}
                          {file.enrichmentStatus === 'completed' && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-background" title="Enriched" />
                          )}
                          {file.enrichmentStatus === 'failed' && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-background" title="Enrichment failed" />
                          )}
                        </div>
                        {/* Mobile: just show small icon with enrichment indicator */}
                        <div className="flex md:hidden flex-shrink-0 text-primary relative">
                          <div className="w-4 h-4">
                            {getFileIcon(file.mimeType)}
                          </div>
                          {/* Mobile enrichment badge */}
                          {file.enrichmentStatus === 'pending' && (
                            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full" />
                          )}
                          {file.enrichmentStatus === 'processing' && (
                            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                          )}
                          {file.enrichmentStatus === 'failed' && (
                            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium truncate">
                            {file.title || file.filename}
                          </h3>
                          {file.title && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {file.filename}
                            </p>
                          )}
                          {file.description && (
                            <MetadataPopup description={file.description} maxLength={50} fileUrl={file.url} mimeType={file.mimeType} />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="shrink-0">{formatFileSize(file.fileSize)}</span>
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Annotate button for video files */}
                          {file.mimeType?.startsWith('video/') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                onFileClick?.(file.id);
                              }}
                            >
                              <PenLine className="h-3 w-3 mr-1" />
                              Annotate
                            </Button>
                          )}
                          {file.enrichmentStatus === "enriched" && (
                            <span className="text-green-500">Enriched</span>
                          )}
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
                        <div className="mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              const tagsDiv = e.currentTarget.nextElementSibling as HTMLElement;
                              if (tagsDiv) {
                                tagsDiv.classList.toggle('hidden');
                                e.currentTarget.textContent = tagsDiv.classList.contains('hidden') 
                                  ? `Show ${file.tags.length} tags` 
                                  : 'Hide tags';
                              }
                            }}
                          >
                            Show {file.tags.length} tags
                          </Button>
                          <div className="hidden flex-wrap gap-1 mt-1">
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
                        </div>
                      )}
                    </div>
                  </div>
                  </Card>
                </div>
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
