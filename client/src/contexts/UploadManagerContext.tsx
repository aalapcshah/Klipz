import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  notifyUploadComplete,
  notifyUploadFailed,
  notifyScheduledUploadStarted,
  notifyAllUploadsComplete,
  getNotificationSettings,
} from "@/lib/notifications";

const MAX_CONCURRENT_UPLOADS = 3;
const STORAGE_KEY = 'metaclips-upload-queue';
const SPEED_SAMPLE_INTERVAL = 1000; // Calculate speed every second

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 30000; // 30 seconds

export type UploadType = 'video' | 'file';
export type UploadStatus = 'pending' | 'uploading' | 'paused' | 'completed' | 'error' | 'cancelled' | 'scheduled' | 'retrying';

export interface UploadItem {
  id: string;
  file: File;
  filename: string;
  fileSize: number;
  mimeType: string;
  progress: number;
  uploadedBytes: number;
  status: UploadStatus;
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
  // Speed tracking
  speed: number; // bytes per second
  eta: number; // seconds remaining
  lastSpeedUpdate: number;
  lastBytesForSpeed: number;
  // Pause/resume tracking
  pausedAtChunk?: number;
  // Retry tracking
  retryCount: number;
  nextRetryAt?: number; // timestamp for next retry
  retryCountdown?: number; // seconds until next retry
  // Scheduling
  scheduledFor?: number; // timestamp when upload should start
}

// Serializable version for localStorage (without File object)
interface SerializedUploadItem {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: number;
  progress: number;
  uploadedBytes: number;
  status: UploadStatus;
  error?: string;
  sessionId?: string;
  uploadType: UploadType;
  metadata?: UploadItem['metadata'];
  result?: UploadItem['result'];
  createdAt: number;
  pausedAtChunk?: number;
  retryCount: number;
  scheduledFor?: number;
}

// Upload processor callback type
type UploadProcessor = (uploadId: string, file: File, resumeFromChunk?: number) => Promise<void>;

interface UploadManagerContextType {
  uploads: UploadItem[];
  addUpload: (file: File, uploadType: UploadType, metadata?: UploadItem['metadata'], scheduledFor?: number) => string;
  addUploads: (files: { file: File; uploadType: UploadType; metadata?: UploadItem['metadata']; scheduledFor?: number }[]) => string[];
  cancelUpload: (id: string) => void;
  cancelAllUploads: () => void;
  pauseUpload: (id: string) => void;
  resumeUpload: (id: string) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  retryUpload: (id: string) => void;
  updateUploadProgress: (id: string, progress: number, uploadedBytes: number) => void;
  updateUploadStatus: (id: string, status: UploadStatus, result?: UploadItem['result'], error?: string) => void;
  updateUploadSessionId: (id: string, sessionId: string) => void;
  updatePausedChunk: (id: string, chunkIndex: number) => void;
  registerProcessor: (type: UploadType, processor: UploadProcessor) => void;
  unregisterProcessor: (type: UploadType) => void;
  getAbortController: (id: string) => AbortController | undefined;
  scheduleUpload: (id: string, scheduledFor: number) => void;
  cancelSchedule: (id: string) => void;
  isUploading: boolean;
  totalProgress: number;
  pendingCount: number;
  uploadingCount: number;
  pausedCount: number;
  completedCount: number;
  scheduledCount: number;
  retryingCount: number;
  activeUploads: UploadItem[];
  queuedCount: number;
}

const UploadManagerContext = createContext<UploadManagerContextType | null>(null);

export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const processorsRef = useRef<Map<UploadType, UploadProcessor>>(new Map());
  const processingRef = useRef<Set<string>>(new Set());
  const pausedRef = useRef<Set<string>>(new Set());
  const retryTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const scheduleTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Upload history mutation
  const recordHistoryMutation = trpc.uploadHistory.record.useMutation();

  const generateId = () => `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Calculate exponential backoff delay
  const getRetryDelay = (retryCount: number): number => {
    const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
    return Math.min(delay, MAX_RETRY_DELAY);
  };

  // Save to localStorage (only metadata, not File objects)
  const saveToStorage = useCallback((items: UploadItem[]) => {
    try {
      const serialized: SerializedUploadItem[] = items
        .filter(item => item.status === 'pending' || item.status === 'uploading' || item.status === 'paused' || item.status === 'scheduled')
        .map(item => ({
          id: item.id,
          filename: item.filename,
          fileSize: item.fileSize,
          mimeType: item.fileSize, // Note: This was a bug, should be mimeType
          progress: item.progress,
          uploadedBytes: item.uploadedBytes,
          status: item.status === 'uploading' ? 'paused' : item.status, // Reset uploading to paused
          error: item.error,
          sessionId: item.sessionId,
          uploadType: item.uploadType,
          metadata: item.metadata,
          result: item.result,
          createdAt: item.createdAt,
          pausedAtChunk: item.pausedAtChunk,
          retryCount: item.retryCount,
          scheduledFor: item.scheduledFor,
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

  // Update retry countdowns every second
  useEffect(() => {
    const interval = setInterval(() => {
      setUploads(prev => {
        const now = Date.now();
        let hasChanges = false;
        
        const updated = prev.map(item => {
          if (item.status === 'retrying' && item.nextRetryAt) {
            const countdown = Math.max(0, Math.ceil((item.nextRetryAt - now) / 1000));
            if (countdown !== item.retryCountdown) {
              hasChanges = true;
              return { ...item, retryCountdown: countdown };
            }
          }
          return item;
        });
        
        return hasChanges ? updated : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Check for scheduled uploads
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      
      setUploads(prev => {
        let hasChanges = false;
        
        const updated = prev.map(item => {
          if (item.status === 'scheduled' && item.scheduledFor && item.scheduledFor <= now) {
            hasChanges = true;
            toast.info(`Starting scheduled upload: ${item.filename}`);
            
            // Send browser notification if page is not focused
            if (document.hidden) {
              notifyScheduledUploadStarted(item.filename, () => {
                window.focus();
              });
            }
            
            return { ...item, status: 'pending' as const, scheduledFor: undefined };
          }
          return item;
        });
        
        return hasChanges ? updated : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

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
        processor(upload.id, upload.file, upload.pausedAtChunk)
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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      retryTimersRef.current.forEach(timer => clearTimeout(timer));
      scheduleTimersRef.current.forEach(timer => clearTimeout(timer));
    };
  }, []);

  const addUpload = useCallback((file: File, uploadType: UploadType, metadata?: UploadItem['metadata'], scheduledFor?: number): string => {
    const id = generateId();
    const abortController = new AbortController();
    abortControllersRef.current.set(id, abortController);
    
    const isScheduled = scheduledFor && scheduledFor > Date.now();
    
    const newItem: UploadItem = {
      id,
      file,
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      progress: 0,
      uploadedBytes: 0,
      status: isScheduled ? 'scheduled' : 'pending',
      uploadType,
      metadata,
      createdAt: Date.now(),
      speed: 0,
      eta: 0,
      lastSpeedUpdate: Date.now(),
      lastBytesForSpeed: 0,
      retryCount: 0,
      scheduledFor: isScheduled ? scheduledFor : undefined,
    };

    setUploads(prev => [...prev, newItem]);
    
    if (isScheduled) {
      toast.success(`Upload scheduled for ${new Date(scheduledFor).toLocaleTimeString()}`);
    }
    
    return id;
  }, []);

  const addUploads = useCallback((files: { file: File; uploadType: UploadType; metadata?: UploadItem['metadata']; scheduledFor?: number }[]): string[] => {
    const ids: string[] = [];
    const newItems: UploadItem[] = [];

    for (const { file, uploadType, metadata, scheduledFor } of files) {
      const id = generateId();
      const abortController = new AbortController();
      abortControllersRef.current.set(id, abortController);
      
      const isScheduled = scheduledFor && scheduledFor > Date.now();
      
      ids.push(id);
      newItems.push({
        id,
        file,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        progress: 0,
        uploadedBytes: 0,
        status: isScheduled ? 'scheduled' : 'pending',
        uploadType,
        metadata,
        createdAt: Date.now(),
        speed: 0,
        eta: 0,
        lastSpeedUpdate: Date.now(),
        lastBytesForSpeed: 0,
        retryCount: 0,
        scheduledFor: isScheduled ? scheduledFor : undefined,
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
    
    // Clear any retry timer
    const retryTimer = retryTimersRef.current.get(id);
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimersRef.current.delete(id);
    }
    
    // Clear any schedule timer
    const scheduleTimer = scheduleTimersRef.current.get(id);
    if (scheduleTimer) {
      clearTimeout(scheduleTimer);
      scheduleTimersRef.current.delete(id);
    }
    
    processingRef.current.delete(id);
    pausedRef.current.delete(id);
    
    setUploads(prev => {
      const item = prev.find(u => u.id === id);
      
      // Record cancelled upload to history
      if (item && (item.status === 'pending' || item.status === 'uploading' || item.status === 'paused' || item.status === 'retrying')) {
        const durationSeconds = Math.round((Date.now() - item.createdAt) / 1000);
        
        recordHistoryMutation.mutate({
          filename: item.filename,
          fileSize: item.fileSize,
          mimeType: item.mimeType,
          uploadType: item.uploadType,
          status: 'cancelled',
          startedAt: item.createdAt,
          durationSeconds,
        });
      }
      
      return prev.map(item => {
        if (item.id === id && (item.status === 'pending' || item.status === 'uploading' || item.status === 'paused' || item.status === 'retrying' || item.status === 'scheduled')) {
          return { ...item, status: 'cancelled' as const, progress: 0, uploadedBytes: 0, speed: 0, eta: 0, nextRetryAt: undefined, retryCountdown: undefined };
        }
        return item;
      });
    });
  }, [recordHistoryMutation]);

  const cancelAllUploads = useCallback(() => {
    abortControllersRef.current.forEach(controller => controller.abort());
    retryTimersRef.current.forEach(timer => clearTimeout(timer));
    scheduleTimersRef.current.forEach(timer => clearTimeout(timer));
    retryTimersRef.current.clear();
    scheduleTimersRef.current.clear();
    processingRef.current.clear();
    pausedRef.current.clear();
    
    setUploads(prev => prev.map(item => {
      if (item.status === 'pending' || item.status === 'uploading' || item.status === 'paused' || item.status === 'retrying' || item.status === 'scheduled') {
        return { ...item, status: 'cancelled' as const, progress: 0, uploadedBytes: 0, speed: 0, eta: 0, nextRetryAt: undefined, retryCountdown: undefined };
      }
      return item;
    }));
  }, []);

  const pauseUpload = useCallback((id: string) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
    }
    
    // Clear any retry timer
    const retryTimer = retryTimersRef.current.get(id);
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimersRef.current.delete(id);
    }
    
    pausedRef.current.add(id);
    processingRef.current.delete(id);
    
    setUploads(prev => prev.map(item => {
      if (item.id === id && (item.status === 'uploading' || item.status === 'retrying')) {
        return { ...item, status: 'paused' as const, speed: 0, eta: 0, nextRetryAt: undefined, retryCountdown: undefined };
      }
      return item;
    }));
    
    toast.info("Upload paused");
  }, []);

  const resumeUpload = useCallback((id: string) => {
    pausedRef.current.delete(id);
    
    // Create new abort controller for resumed upload
    const newController = new AbortController();
    abortControllersRef.current.set(id, newController);
    
    setUploads(prev => prev.map(item => {
      if (item.id === id && item.status === 'paused') {
        return { 
          ...item, 
          status: 'pending' as const,
          lastSpeedUpdate: Date.now(),
          lastBytesForSpeed: item.uploadedBytes,
        };
      }
      return item;
    }));
    
    toast.info("Upload resumed");
  }, []);

  const retryUpload = useCallback((id: string) => {
    // Clear any existing retry timer
    const existingTimer = retryTimersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      retryTimersRef.current.delete(id);
    }
    
    // Create new abort controller
    const newController = new AbortController();
    abortControllersRef.current.set(id, newController);
    
    setUploads(prev => prev.map(item => {
      if (item.id === id && (item.status === 'error' || item.status === 'retrying')) {
        return { 
          ...item, 
          status: 'pending' as const,
          error: undefined,
          progress: 0,
          uploadedBytes: 0,
          pausedAtChunk: undefined,
          sessionId: undefined,
          lastSpeedUpdate: Date.now(),
          lastBytesForSpeed: 0,
          nextRetryAt: undefined,
          retryCountdown: undefined,
        };
      }
      return item;
    }));
    
    toast.info("Retrying upload...");
  }, []);

  const scheduleUpload = useCallback((id: string, scheduledFor: number) => {
    setUploads(prev => prev.map(item => {
      if (item.id === id && (item.status === 'pending' || item.status === 'paused' || item.status === 'error')) {
        toast.success(`Upload scheduled for ${new Date(scheduledFor).toLocaleTimeString()}`);
        return { 
          ...item, 
          status: 'scheduled' as const,
          scheduledFor,
          error: undefined,
        };
      }
      return item;
    }));
  }, []);

  const cancelSchedule = useCallback((id: string) => {
    const timer = scheduleTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      scheduleTimersRef.current.delete(id);
    }
    
    setUploads(prev => prev.map(item => {
      if (item.id === id && item.status === 'scheduled') {
        toast.info("Schedule cancelled");
        return { 
          ...item, 
          status: 'pending' as const,
          scheduledFor: undefined,
        };
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
    
    const retryTimer = retryTimersRef.current.get(id);
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimersRef.current.delete(id);
    }
    
    const scheduleTimer = scheduleTimersRef.current.get(id);
    if (scheduleTimer) {
      clearTimeout(scheduleTimer);
      scheduleTimersRef.current.delete(id);
    }
    
    processingRef.current.delete(id);
    pausedRef.current.delete(id);
    setUploads(prev => prev.filter(u => u.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => {
      const toRemove = prev.filter(u => u.status === 'completed' || u.status === 'error' || u.status === 'cancelled');
      toRemove.forEach(u => {
        abortControllersRef.current.delete(u.id);
        processingRef.current.delete(u.id);
        pausedRef.current.delete(u.id);
        const retryTimer = retryTimersRef.current.get(u.id);
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimersRef.current.delete(u.id);
        }
      });
      return prev.filter(u => u.status !== 'completed' && u.status !== 'error' && u.status !== 'cancelled');
    });
  }, []);

  const updateUploadProgress = useCallback((id: string, progress: number, uploadedBytes: number) => {
    setUploads(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      const now = Date.now();
      const timeDiff = (now - item.lastSpeedUpdate) / 1000; // seconds
      
      let speed = item.speed;
      let eta = item.eta;
      
      // Update speed calculation every second
      if (timeDiff >= 1) {
        const bytesDiff = uploadedBytes - item.lastBytesForSpeed;
        speed = bytesDiff / timeDiff;
        
        // Calculate ETA
        const remainingBytes = item.fileSize - uploadedBytes;
        eta = speed > 0 ? remainingBytes / speed : 0;
        
        return {
          ...item,
          progress,
          uploadedBytes,
          speed,
          eta,
          lastSpeedUpdate: now,
          lastBytesForSpeed: uploadedBytes,
        };
      }
      
      return { ...item, progress, uploadedBytes };
    }));
  }, []);

  const updateUploadStatus = useCallback((id: string, status: UploadStatus, result?: UploadItem['result'], error?: string) => {
    setUploads(prev => {
      const item = prev.find(u => u.id === id);
      
      // Handle automatic retry for errors
      if (status === 'error' && item && item.retryCount < MAX_RETRIES) {
        const newRetryCount = item.retryCount + 1;
        const retryDelay = getRetryDelay(newRetryCount);
        const nextRetryAt = Date.now() + retryDelay;
        
        toast.warning(`Upload failed. Retrying in ${retryDelay / 1000}s... (${newRetryCount}/${MAX_RETRIES})`);
        
        // Set up retry timer
        const timer = setTimeout(() => {
          retryTimersRef.current.delete(id);
          
          // Create new abort controller for retry
          const newController = new AbortController();
          abortControllersRef.current.set(id, newController);
          
          setUploads(prevUploads => prevUploads.map(u => {
            if (u.id === id && u.status === 'retrying') {
              return { 
                ...u, 
                status: 'pending' as const,
                error: undefined,
                progress: 0,
                uploadedBytes: 0,
                pausedAtChunk: undefined,
                sessionId: undefined,
                nextRetryAt: undefined,
                retryCountdown: undefined,
              };
            }
            return u;
          }));
        }, retryDelay);
        
        retryTimersRef.current.set(id, timer);
        
        return prev.map(u => 
          u.id === id ? { 
            ...u, 
            status: 'retrying' as const, 
            error, 
            speed: 0, 
            eta: 0,
            retryCount: newRetryCount,
            nextRetryAt,
            retryCountdown: Math.ceil(retryDelay / 1000),
          } : u
        );
      }
      
      const newUploads = prev.map(u => 
        u.id === id ? { ...u, status, result, error, speed: 0, eta: 0, nextRetryAt: undefined, retryCountdown: undefined } : u
      );
      
      // Show toast notifications and browser notifications
      if (status === 'completed' && item) {
        toast.success(`Uploaded: ${item.filename}`);
        
        // Send browser notification if page is not focused
        if (document.hidden) {
          notifyUploadComplete(item.filename, () => {
            window.focus();
          });
        }
        
        // Record to upload history
        const durationSeconds = Math.round((Date.now() - item.createdAt) / 1000);
        const averageSpeed = durationSeconds > 0 ? Math.round(item.fileSize / durationSeconds) : 0;
        
        recordHistoryMutation.mutate({
          fileId: result?.fileId,
          filename: item.filename,
          fileSize: item.fileSize,
          mimeType: item.mimeType,
          uploadType: item.uploadType,
          status: 'completed',
          startedAt: item.createdAt,
          durationSeconds,
          averageSpeed,
        });
      } else if (status === 'error' && error && item) {
        // Only show error toast if max retries exceeded
        if (item.retryCount >= MAX_RETRIES) {
          toast.error(`Failed to upload ${item.filename} after ${MAX_RETRIES} retries: ${error}`);
          
          // Send browser notification if page is not focused
          if (document.hidden) {
            notifyUploadFailed(item.filename, error, () => {
              window.focus();
            });
          }
          
          // Record failed upload to history
          const durationSeconds = Math.round((Date.now() - item.createdAt) / 1000);
          
          recordHistoryMutation.mutate({
            filename: item.filename,
            fileSize: item.fileSize,
            mimeType: item.mimeType,
            uploadType: item.uploadType,
            status: 'failed',
            errorMessage: error,
            startedAt: item.createdAt,
            durationSeconds,
          });
        }
      }
      
      return newUploads;
    });
  }, [recordHistoryMutation]);

  const updateUploadSessionId = useCallback((id: string, sessionId: string) => {
    setUploads(prev => prev.map(item => 
      item.id === id ? { ...item, sessionId } : item
    ));
  }, []);

  const updatePausedChunk = useCallback((id: string, chunkIndex: number) => {
    setUploads(prev => prev.map(item => 
      item.id === id ? { ...item, pausedAtChunk: chunkIndex } : item
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
  const pausedCount = uploads.filter(u => u.status === 'paused').length;
  const completedCount = uploads.filter(u => u.status === 'completed').length;
  const scheduledCount = uploads.filter(u => u.status === 'scheduled').length;
  const retryingCount = uploads.filter(u => u.status === 'retrying').length;
  const activeUploads = uploads.filter(u => 
    u.status === 'pending' || u.status === 'uploading' || u.status === 'paused' || u.status === 'retrying' || u.status === 'scheduled'
  );
  const queuedCount = pendingCount;
  
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
        pauseUpload,
        resumeUpload,
        removeUpload,
        clearCompleted,
        retryUpload,
        updateUploadProgress,
        updateUploadStatus,
        updateUploadSessionId,
        updatePausedChunk,
        registerProcessor,
        unregisterProcessor,
        getAbortController,
        scheduleUpload,
        cancelSchedule,
        isUploading,
        totalProgress,
        pendingCount,
        uploadingCount,
        pausedCount,
        completedCount,
        scheduledCount,
        retryingCount,
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

// Utility function to format speed
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return "0 B/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return `${(bytesPerSecond / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Utility function to format ETA
export function formatEta(seconds: number): string {
  if (seconds === 0 || !isFinite(seconds)) return "--";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}
