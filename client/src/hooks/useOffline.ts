import { useState, useEffect, useCallback } from 'react';
import { 
  initOfflineDB, 
  cacheFiles, 
  getCachedFiles, 
  cacheThumbnail,
  getSyncQueue,
  clearSyncQueue,
  getCacheStats,
  clearOfflineCache
} from '@/lib/offlineStorage';

export interface OfflineState {
  isOnline: boolean;
  isOfflineReady: boolean;
  pendingSyncCount: number;
  cachedFileCount: number;
}

export function useOffline() {
  const [state, setState] = useState<OfflineState>({
    isOnline: navigator.onLine,
    isOfflineReady: false,
    pendingSyncCount: 0,
    cachedFileCount: 0,
  });

  // Initialize offline database
  useEffect(() => {
    initOfflineDB()
      .then(() => {
        setState(prev => ({ ...prev, isOfflineReady: true }));
        updateStats();
      })
      .catch(err => console.error('Failed to init offline DB:', err));
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
      // Trigger sync when coming back online
      syncPendingChanges();
    };

    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Update cache statistics
  const updateStats = useCallback(async () => {
    try {
      const stats = await getCacheStats();
      setState(prev => ({
        ...prev,
        cachedFileCount: stats.fileCount,
        pendingSyncCount: stats.syncQueueCount,
      }));
    } catch (error) {
      console.error('Failed to get cache stats:', error);
    }
  }, []);

  // Cache files for offline access
  const cacheFilesForOffline = useCallback(async (files: any[]) => {
    try {
      await cacheFiles(files);
      
      // Cache thumbnails in background
      for (const file of files) {
        if (file.thumbnailUrl) {
          cacheThumbnail(file.id, file.thumbnailUrl).catch(() => {});
        }
      }
      
      await updateStats();
    } catch (error) {
      console.error('Failed to cache files:', error);
    }
  }, [updateStats]);

  // Get cached files when offline
  const getOfflineFiles = useCallback(async (userId?: string) => {
    try {
      return await getCachedFiles(userId);
    } catch (error) {
      console.error('Failed to get cached files:', error);
      return [];
    }
  }, []);

  // Sync pending changes when back online
  const syncPendingChanges = useCallback(async () => {
    if (!state.isOnline) return;

    try {
      const queue = await getSyncQueue();
      if (queue.length === 0) return;

      // Process sync queue
      for (const action of queue) {
        try {
          // Here you would call the appropriate API endpoints
          // For now, we just log the actions
          console.log('Syncing action:', action);
        } catch (error) {
          console.error('Failed to sync action:', action, error);
        }
      }

      // Clear the queue after successful sync
      await clearSyncQueue();
      await updateStats();
    } catch (error) {
      console.error('Failed to sync pending changes:', error);
    }
  }, [state.isOnline, updateStats]);

  // Clear all offline cache
  const clearCache = useCallback(async () => {
    try {
      await clearOfflineCache();
      await updateStats();
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }, [updateStats]);

  return {
    ...state,
    cacheFilesForOffline,
    getOfflineFiles,
    syncPendingChanges,
    clearCache,
    updateStats,
  };
}
