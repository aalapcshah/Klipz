import { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from "react";
import { toast } from "sonner";

const MAX_CONCURRENT_UPLOADS = 3;
const STORAGE_KEY = 'metaclips-upload-queue';

export type UploadType = 'video' | 'file';

export interface UploadItem {
  id: string;
  file: File;
  filename: string;
  fileSize: number;
  mimeType: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'cancelled';
  error?: string;
  sessionId?: string;
  uploadType: UploadType;
  metadata?: {
    title?: string;
    description?: string;
    quality?: string;
  };
  result?: {
    fileId: number;
    url: string;
  };
  createdAt: number;
}

// Serializable version for localStorage (without File object)
interface SerializedUploadItem {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  progress: number;
  status: UploadItem['status'];
  error?: string;
  sessionId?: string;
  uploadType: UploadType;
  metadata?: UploadItem['metadata'];
  result?: UploadItem['result'];
  createdAt: number;
}

// Upload processor callback type
type UploadProcessor = (uploadId: string, file: File) => Promise<void>;

interface UploadManagerContextType {
  uploads: UploadItem[];
  addUpload: (file: File, uploadType: UploadType, metadata?: UploadItem['metadata']) => string;
  addUploads: (files: { file: File; uploadType: UploadType; metadata?: UploadItem['metadata'] }[]) => string[];
  cancelUpload: (id: string) => void;
  cancelAllUploads: () => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  updateUploadProgress: (id: string, progress: number) => void;
  updateUploadStatus: (id: string, status: UploadItem['status'], result?: UploadItem['result'], error?: string) => void;
  updateUploadSessionId: (id: string, sessionId: string) => void;
  registerProcessor: (type: UploadType, processor: UploadProcessor) => void;
  unregisterProcessor: (type: UploadType) => void;
  getAbortController: (id: string) => AbortController | undefined;
  isUploading: boolean;
  totalProgress: number;
  pendingCount: number;
  uploadingCount: number;
  completedCount: number;
  activeUploads: UploadItem[];
  queuedCount: number;
}

const UploadManagerContext = createContext<UploadManagerContextType | null>(null);

export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const processorsRef = useRef<Map<UploadType, UploadProcessor>>(new Map());
  const processingRef = useRef<Set<string>>(new Set());

  const generateId = () => `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Save to localStorage (only metadata, not File objects)
  const saveToStorage = useCallback((items: UploadItem[]) => {
    try {
      const serialized: SerializedUploadItem[] = items
        .filter(item => item.status === 'pending' || item.status === 'uploading')
        .map(item => ({
          id: item.id,
          filename: item.filename,
          fileSize: item.fileSize,
          mimeType: item.mimeType,
          progress: item.progress,
          status: item.status === 'uploading' ? 'pending' : item.status, // Reset uploading to pending
          error: item.error,
          sessionId: item.sessionId,
          uploadType: item.uploadType,
          metadata: item.metadata,
          result: item.result,
          createdAt: item.createdAt,
        }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    } catch (e) {
      console.error('[UploadManager] Failed to save to localStorage:', e);
    }
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const serialized: SerializedUploadItem[] = JSON.parse(stored);
        // We can't restore File objects, but we can show the user what was pending
        // They'll need to re-add the files
        if (serialized.length > 0) {
          toast.info(`${serialized.length} upload(s) were interrupted. Please re-add the files to continue.`);
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error('[UploadManager] Failed to load from localStorage:', e);
    }
  }, []);

  // Save to storage whenever uploads change
  useEffect(() => {
    saveToStorage(uploads);
  }, [uploads, saveToStorage]);

  // Process queue - start uploads for pending items up to max concurrent
  const processQueue = useCallback(() => {
    const currentlyUploading = uploads.filter(u => u.status === 'uploading').length;
    const availableSlots = MAX_CONCURRENT_UPLOADS - currentlyUploading;
    
    if (availableSlots <= 0) return;

    const pendingUploads = uploads
      .filter(u => u.status === 'pending' && !processingRef.current.has(u.id))
      .slice(0, availableSlots);

    for (const upload of pendingUploads) {
      const processor = processorsRef.current.get(upload.uploadType);
      if (processor) {
        processingRef.current.add(upload.id);
        
        // Mark as uploading
        setUploads(prev => prev.map(u => 
          u.id === upload.id ? { ...u, status: 'uploading' as const } : u
        ));
        
        // Start the upload
        processor(upload.id, upload.file)
          .finally(() => {
            processingRef.current.delete(upload.id);
          });
      }
    }
  }, [uploads]);

  // Process queue when uploads change or processors are registered
  useEffect(() => {
    processQueue();
  }, [uploads, processQueue]);

  const addUpload = useCallback((file: File, uploadType: UploadType, metadata?: UploadItem['metadata']): string => {
    const id = generateId();
    const abortController = new AbortController();
    abortControllersRef.current.set(id, abortController);
    
    const newItem: UploadItem = {
      id,
      file,
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      progress: 0,
      status: 'pending',
      uploadType,
      metadata,
      createdAt: Date.now(),
    };

    setUploads(prev => [...prev, newItem]);
    
    return id;
  }, []);

  const addUploads = useCallback((files: { file: File; uploadType: UploadType; metadata?: UploadItem['metadata'] }[]): string[] => {
    const ids: string[] = [];
    const newItems: UploadItem[] = [];

    for (const { file, uploadType, metadata } of files) {
      const id = generateId();
      const abortController = new AbortController();
      abortControllersRef.current.set(id, abortController);
      
      ids.push(id);
      newItems.push({
        id,
        file,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        progress: 0,
        status: 'pending',
        uploadType,
        metadata,
        createdAt: Date.now(),
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
    processingRef.current.delete(id);
    
    setUploads(prev => prev.map(item => {
      if (item.id === id && (item.status === 'pending' || item.status === 'uploading')) {
        return { ...item, status: 'cancelled' as const, progress: 0 };
      }
      return item;
    }));
  }, []);

  const cancelAllUploads = useCallback(() => {
    abortControllersRef.current.forEach(controller => controller.abort());
    processingRef.current.clear();
    
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
    processingRef.current.delete(id);
    setUploads(prev => prev.filter(u => u.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => {
      const toRemove = prev.filter(u => u.status === 'completed' || u.status === 'error' || u.status === 'cancelled');
      toRemove.forEach(u => {
        abortControllersRef.current.delete(u.id);
        processingRef.current.delete(u.id);
      });
      return prev.filter(u => u.status !== 'completed' && u.status !== 'error' && u.status !== 'cancelled');
    });
  }, []);

  const updateUploadProgress = useCallback((id: string, progress: number) => {
    setUploads(prev => prev.map(item => 
      item.id === id ? { ...item, progress } : item
    ));
  }, []);

  const updateUploadStatus = useCallback((id: string, status: UploadItem['status'], result?: UploadItem['result'], error?: string) => {
    setUploads(prev => {
      const item = prev.find(u => u.id === id);
      const newUploads = prev.map(u => 
        u.id === id ? { ...u, status, result, error } : u
      );
      
      // Show toast notifications
      if (status === 'completed' && item) {
        toast.success(`Uploaded: ${item.filename}`);
      } else if (status === 'error' && error && item) {
        toast.error(`Failed to upload ${item.filename}: ${error}`);
      }
      
      return newUploads;
    });
  }, []);

  const updateUploadSessionId = useCallback((id: string, sessionId: string) => {
    setUploads(prev => prev.map(item => 
      item.id === id ? { ...item, sessionId } : item
    ));
  }, []);

  const registerProcessor = useCallback((type: UploadType, processor: UploadProcessor) => {
    processorsRef.current.set(type, processor);
    // Trigger queue processing when a processor is registered
    setTimeout(processQueue, 0);
  }, [processQueue]);

  const unregisterProcessor = useCallback((type: UploadType) => {
    processorsRef.current.delete(type);
  }, []);

  const getAbortController = useCallback((id: string): AbortController | undefined => {
    return abortControllersRef.current.get(id);
  }, []);

  // Computed values
  const isUploading = uploads.some(u => u.status === 'uploading');
  const pendingCount = uploads.filter(u => u.status === 'pending').length;
  const uploadingCount = uploads.filter(u => u.status === 'uploading').length;
  const completedCount = uploads.filter(u => u.status === 'completed').length;
  const activeUploads = uploads.filter(u => u.status === 'pending' || u.status === 'uploading');
  const queuedCount = pendingCount; // Items waiting in queue
  
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
        registerProcessor,
        unregisterProcessor,
        getAbortController,
        isUploading,
        totalProgress,
        pendingCount,
        uploadingCount,
        completedCount,
        activeUploads,
        queuedCount,
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
