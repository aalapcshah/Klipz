import { createContext, useContext, useState, useCallback, ReactNode, useRef } from "react";
import { toast } from "sonner";

export interface UploadItem {
  id: string;
  file: File;
  filename: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'cancelled';
  error?: string;
  abortController?: AbortController;
  metadata?: {
    title?: string;
    description?: string;
    voiceRecording?: Blob;
    voiceTranscript?: string;
    extractedMetadata?: Record<string, any>;
    extractedKeywords?: string[];
    enrichWithAI?: boolean;
  };
  result?: {
    fileId: number;
    url: string;
  };
}

interface UploadManagerContextType {
  uploads: UploadItem[];
  addUpload: (file: File, metadata?: UploadItem['metadata']) => string;
  addUploads: (files: { file: File; metadata?: UploadItem['metadata'] }[]) => string[];
  cancelUpload: (id: string) => void;
  cancelAllUploads: () => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  isUploading: boolean;
  totalProgress: number;
  pendingCount: number;
  uploadingCount: number;
  completedCount: number;
  startProcessing: (processor: UploadProcessor) => void;
}

export type UploadProcessor = (
  item: UploadItem,
  updateProgress: (progress: number) => void,
  signal: AbortSignal
) => Promise<{ fileId: number; url: string }>;

const UploadManagerContext = createContext<UploadManagerContextType | null>(null);

export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const processorRef = useRef<UploadProcessor | null>(null);
  const processingRef = useRef<boolean>(false);

  const generateId = () => `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const addUpload = useCallback((file: File, metadata?: UploadItem['metadata']): string => {
    const id = generateId();
    const abortController = new AbortController();
    
    const newItem: UploadItem = {
      id,
      file,
      filename: file.name,
      progress: 0,
      status: 'pending',
      abortController,
      metadata,
    };

    setUploads(prev => [...prev, newItem]);
    
    // Trigger processing if we have a processor
    setTimeout(() => processQueue(), 0);
    
    return id;
  }, []);

  const addUploads = useCallback((files: { file: File; metadata?: UploadItem['metadata'] }[]): string[] => {
    const ids: string[] = [];
    const newItems: UploadItem[] = [];

    for (const { file, metadata } of files) {
      const id = generateId();
      const abortController = new AbortController();
      
      ids.push(id);
      newItems.push({
        id,
        file,
        filename: file.name,
        progress: 0,
        status: 'pending',
        abortController,
        metadata,
      });
    }

    setUploads(prev => [...prev, ...newItems]);
    
    // Trigger processing if we have a processor
    setTimeout(() => processQueue(), 0);
    
    return ids;
  }, []);

  const cancelUpload = useCallback((id: string) => {
    setUploads(prev => prev.map(item => {
      if (item.id === id && (item.status === 'pending' || item.status === 'uploading')) {
        item.abortController?.abort();
        return { ...item, status: 'cancelled' as const, progress: 0 };
      }
      return item;
    }));
  }, []);

  const cancelAllUploads = useCallback(() => {
    setUploads(prev => prev.map(item => {
      if (item.status === 'pending' || item.status === 'uploading') {
        item.abortController?.abort();
        return { ...item, status: 'cancelled' as const, progress: 0 };
      }
      return item;
    }));
  }, []);

  const removeUpload = useCallback((id: string) => {
    setUploads(prev => {
      const item = prev.find(u => u.id === id);
      if (item && (item.status === 'pending' || item.status === 'uploading')) {
        item.abortController?.abort();
      }
      return prev.filter(u => u.id !== id);
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => u.status !== 'completed' && u.status !== 'error' && u.status !== 'cancelled'));
  }, []);

  const updateUploadProgress = useCallback((id: string, progress: number) => {
    setUploads(prev => prev.map(item => 
      item.id === id ? { ...item, progress } : item
    ));
  }, []);

  const updateUploadStatus = useCallback((id: string, status: UploadItem['status'], result?: UploadItem['result'], error?: string) => {
    setUploads(prev => prev.map(item => 
      item.id === id ? { ...item, status, result, error } : item
    ));
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current || !processorRef.current) return;
    
    processingRef.current = true;

    while (true) {
      // Find next pending item
      let nextItem: UploadItem | undefined;
      setUploads(prev => {
        nextItem = prev.find(u => u.status === 'pending');
        if (nextItem) {
          return prev.map(u => u.id === nextItem!.id ? { ...u, status: 'uploading' as const } : u);
        }
        return prev;
      });

      if (!nextItem) break;

      const itemId = nextItem.id;
      const processor = processorRef.current;

      try {
        const result = await processor(
          nextItem,
          (progress) => updateUploadProgress(itemId, progress),
          nextItem.abortController!.signal
        );
        
        updateUploadStatus(itemId, 'completed', result);
        toast.success(`Uploaded: ${nextItem.filename}`);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // Already marked as cancelled
        } else {
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          updateUploadStatus(itemId, 'error', undefined, errorMessage);
          toast.error(`Failed to upload ${nextItem.filename}: ${errorMessage}`);
        }
      }
    }

    processingRef.current = false;
  }, [updateUploadProgress, updateUploadStatus]);

  const startProcessing = useCallback((processor: UploadProcessor) => {
    processorRef.current = processor;
    processQueue();
  }, [processQueue]);

  // Computed values
  const isUploading = uploads.some(u => u.status === 'uploading');
  const pendingCount = uploads.filter(u => u.status === 'pending').length;
  const uploadingCount = uploads.filter(u => u.status === 'uploading').length;
  const completedCount = uploads.filter(u => u.status === 'completed').length;
  
  const totalProgress = uploads.length > 0
    ? uploads.reduce((sum, u) => sum + (u.status === 'completed' ? 100 : u.progress), 0) / uploads.length
    : 0;

  return (
    <UploadManagerContext.Provider
      value={{
        uploads,
        addUpload,
        addUploads,
        cancelUpload,
        cancelAllUploads,
        removeUpload,
        clearCompleted,
        isUploading,
        totalProgress,
        pendingCount,
        uploadingCount,
        completedCount,
        startProcessing,
      }}
    >
      {children}
    </UploadManagerContext.Provider>
  );
}

export function useUploadManager() {
  const context = useContext(UploadManagerContext);
  if (!context) {
    throw new Error("useUploadManager must be used within UploadManagerProvider");
  }
  return context;
}
