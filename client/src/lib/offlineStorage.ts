// Offline Storage Utility using IndexedDB
// Caches file metadata and thumbnails for offline access

const DB_NAME = 'metaclips-offline';
const DB_VERSION = 1;
const STORES = {
  files: 'files',
  thumbnails: 'thumbnails',
  syncQueue: 'syncQueue',
};

let db: IDBDatabase | null = null;

// Initialize IndexedDB
export async function initOfflineDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Files store - cache file metadata
      if (!database.objectStoreNames.contains(STORES.files)) {
        const filesStore = database.createObjectStore(STORES.files, { keyPath: 'id' });
        filesStore.createIndex('userId', 'userId', { unique: false });
        filesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Thumbnails store - cache image thumbnails as blobs
      if (!database.objectStoreNames.contains(STORES.thumbnails)) {
        database.createObjectStore(STORES.thumbnails, { keyPath: 'fileId' });
      }

      // Sync queue - track changes made offline
      if (!database.objectStoreNames.contains(STORES.syncQueue)) {
        const syncStore = database.createObjectStore(STORES.syncQueue, { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// File metadata operations
export async function cacheFile(file: any): Promise<void> {
  const database = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.files, 'readwrite');
    const store = transaction.objectStore(STORES.files);
    const request = store.put({ ...file, cachedAt: Date.now() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function cacheFiles(files: any[]): Promise<void> {
  const database = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.files, 'readwrite');
    const store = transaction.objectStore(STORES.files);
    
    files.forEach(file => {
      store.put({ ...file, cachedAt: Date.now() });
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getCachedFiles(userId?: string): Promise<any[]> {
  const database = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.files, 'readonly');
    const store = transaction.objectStore(STORES.files);
    const request = userId 
      ? store.index('userId').getAll(userId)
      : store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedFile(fileId: number): Promise<any | null> {
  const database = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.files, 'readonly');
    const store = transaction.objectStore(STORES.files);
    const request = store.get(fileId);
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteCachedFile(fileId: number): Promise<void> {
  const database = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.files, 'readwrite');
    const store = transaction.objectStore(STORES.files);
    const request = store.delete(fileId);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Thumbnail caching
export async function cacheThumbnail(fileId: number, thumbnailUrl: string): Promise<void> {
  try {
    const response = await fetch(thumbnailUrl);
    if (!response.ok) return;
    
    const blob = await response.blob();
    const database = await initOfflineDB();
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORES.thumbnails, 'readwrite');
      const store = transaction.objectStore(STORES.thumbnails);
      const request = store.put({ fileId, blob, cachedAt: Date.now() });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to cache thumbnail:', error);
  }
}

export async function getCachedThumbnail(fileId: number): Promise<string | null> {
  const database = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.thumbnails, 'readonly');
    const store = transaction.objectStore(STORES.thumbnails);
    const request = store.get(fileId);
    
    request.onsuccess = () => {
      if (request.result?.blob) {
        resolve(URL.createObjectURL(request.result.blob));
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Sync queue operations
export interface SyncAction {
  type: 'create' | 'update' | 'delete';
  entity: 'file' | 'video' | 'collection';
  data: any;
  timestamp: number;
}

export async function addToSyncQueue(action: Omit<SyncAction, 'timestamp'>): Promise<void> {
  const database = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.syncQueue, 'readwrite');
    const store = transaction.objectStore(STORES.syncQueue);
    const request = store.add({ ...action, timestamp: Date.now() });
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getSyncQueue(): Promise<SyncAction[]> {
  const database = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.syncQueue, 'readonly');
    const store = transaction.objectStore(STORES.syncQueue);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function clearSyncQueue(): Promise<void> {
  const database = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.syncQueue, 'readwrite');
    const store = transaction.objectStore(STORES.syncQueue);
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Clear all cached data
export async function clearOfflineCache(): Promise<void> {
  const database = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.files, STORES.thumbnails], 'readwrite');
    
    transaction.objectStore(STORES.files).clear();
    transaction.objectStore(STORES.thumbnails).clear();
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Get cache statistics
export async function getCacheStats(): Promise<{ fileCount: number; thumbnailCount: number; syncQueueCount: number }> {
  const database = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.files, STORES.thumbnails, STORES.syncQueue], 'readonly');
    
    let fileCount = 0;
    let thumbnailCount = 0;
    let syncQueueCount = 0;

    transaction.objectStore(STORES.files).count().onsuccess = (e) => {
      fileCount = (e.target as IDBRequest).result;
    };
    transaction.objectStore(STORES.thumbnails).count().onsuccess = (e) => {
      thumbnailCount = (e.target as IDBRequest).result;
    };
    transaction.objectStore(STORES.syncQueue).count().onsuccess = (e) => {
      syncQueueCount = (e.target as IDBRequest).result;
    };

    transaction.oncomplete = () => resolve({ fileCount, thumbnailCount, syncQueueCount });
    transaction.onerror = () => reject(transaction.error);
  });
}
