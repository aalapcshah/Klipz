import { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from "react";
import { toast } from "sonner";

export interface UploadItem {
  id: string;
  file: File;
  filename: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'cancelled';
  error?: string;
  sessionId?: string;
  metadata?: {
    title?: string;
    description?: string;
    quality?: string;
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
  updateUploadProgress: (id: string, progress: number) => void;
  updateUploadStatus: (id: string, status: UploadItem['status'], result?: UploadItem['result'], error?: string) => void;
  updateUploadSessionId: (id: string, sessionId: string) => void;
  isUploading: boolean;
  totalProgress: number;
  pendingCount: number;
  uploadingCount: number;
  completedCount: number;
  activeUploads: UploadItem[];
}

const UploadManagerContext = createContext<UploadManagerContextType | null>(null);

export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const generateId = () => `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const addUpload = useCallback((file: File, metadata?: UploadItem['metadata']): string => {
    const id = generateId();
    const abortController = new AbortController();
    abortControllersRef.current.set(id, abortController);
    
    const newItem: UploadItem = {
      id,
      file,
      filename: file.name,
      progress: 0,
      status: 'pending',
      metadata,
    };

    setUploads(prev => [...prev, newItem]);
    
    return id;
  }, []);

  const addUploads = useCallback((files: { file: File; metadata?: UploadItem['metadata'] }[]): string[] => {
    const ids: string[] = [];
    const newItems: UploadItem[] = [];

    for (const { file, metadata } of files) {
      const id = generateId();
      const abortController = new AbortController();
      abortControllersRef.current.set(id, abortController);
      
      ids.push(id);
      newItems.push({
        id,
        file,
        filename: file.name,
        progress: 0,
        status: 'pending',
        metadata,
      });
    }

    setUploads(prev => [...prev, ...newItems]);
    
    return ids;
  }, []);

  const cancelUpload = useCallback((id: string) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
    }
    
    setUploads(prev => prev.map(item => {
      if (item.id === id && (item.status === 'pending' || item.status === 'uploading')) {
        return { ...item, status: 'cancelled' as const, progress: 0 };
      }
      return item;
    }));
  }, []);

  const cancelAllUploads = useCallback(() => {
    abortControllersRef.current.forEach(controller => controller.abort());
    
    setUploads(prev => prev.map(item => {
      if (item.status === 'pending' || item.status === 'uploading') {
        return { ...item, status: 'cancelled' as const, progress: 0 };
      }
      return item;
    }));
  }, []);

  const removeUpload = useCallback((id: string) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(id);
    }
    setUploads(prev => prev.filter(u => u.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => {
      const toRemove = prev.filter(u => u.status === 'completed' || u.status === 'error' || u.status === 'cancelled');
      toRemove.forEach(u => abortControllersRef.current.delete(u.id));
      return prev.filter(u => u.status !== 'completed' && u.status !== 'error' && u.status !== 'cancelled');
    });
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
    
    // Show toast notifications
    if (status === 'completed') {
      const item = uploads.find(u => u.id === id);
      if (item) {
        toast.success(`Uploaded: ${item.filename}`);
      }
    } else if (status === 'error' && error) {
      const item = uploads.find(u => u.id === id);
      if (item) {
        toast.error(`Failed to upload ${item.filename}: ${error}`);
      }
    }
  }, [uploads]);

  const updateUploadSessionId = useCallback((id: string, sessionId: string) => {
    setUploads(prev => prev.map(item => 
      item.id === id ? { ...item, sessionId } : item
    ));
  }, []);

  // Check if upload was cancelled
  const isUploadCancelled = useCallback((id: string): boolean => {
    const controller = abortControllersRef.current.get(id);
    return controller?.signal.aborted ?? false;
  }, []);

  // Computed values
  const isUploading = uploads.some(u => u.status === 'uploading');
  const pendingCount = uploads.filter(u => u.status === 'pending').length;
  const uploadingCount = uploads.filter(u => u.status === 'uploading').length;
  const completedCount = uploads.filter(u => u.status === 'completed').length;
  const activeUploads = uploads.filter(u => u.status === 'pending' || u.status === 'uploading');
  
  const totalProgress = activeUploads.length > 0
    ? activeUploads.reduce((sum, u) => sum + u.progress, 0) / activeUploads.length
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
        updateUploadProgress,
        updateUploadStatus,
        updateUploadSessionId,
        isUploading,
        totalProgress,
        pendingCount,
        uploadingCount,
        completedCount,
        activeUploads,
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

// Hook to get abort signal for a specific upload
export function useUploadAbortSignal(uploadId: string): AbortSignal | undefined {
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  return abortControllersRef.current.get(uploadId)?.signal;
}
