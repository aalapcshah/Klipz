/**
 * Offline Recording Cache
 * 
 * Uses IndexedDB to store recorded video blobs when upload fails (e.g., no network).
 * Provides auto-retry logic and a way to list/manage pending uploads.
 */

const DB_NAME = "klipz-offline-recordings";
const DB_VERSION = 1;
const STORE_NAME = "pending-uploads";

export interface PendingRecording {
  id: string;
  blob: Blob;
  filename: string;
  duration: number;
  transcript: string;
  createdAt: number;
  retryCount: number;
  lastRetryAt: number | null;
  status: "pending" | "uploading" | "failed";
  errorMessage?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a recording to the offline cache
 */
export async function saveRecordingToCache(recording: Omit<PendingRecording, "id" | "createdAt" | "retryCount" | "lastRetryAt" | "status">): Promise<string> {
  const db = await openDB();
  const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const entry: PendingRecording = {
    ...recording,
    id,
    createdAt: Date.now(),
    retryCount: 0,
    lastRetryAt: null,
    status: "pending",
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(entry);
    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Get all pending recordings from cache
 */
export async function getPendingRecordings(): Promise<PendingRecording[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const results = (request.result as PendingRecording[]).sort(
        (a, b) => b.createdAt - a.createdAt
      );
      resolve(results);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Get count of pending recordings
 */
export async function getPendingCount(): Promise<number> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Update a pending recording's status
 */
export async function updateRecordingStatus(
  id: string,
  updates: Partial<Pick<PendingRecording, "status" | "retryCount" | "lastRetryAt" | "errorMessage">>
): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const entry = getRequest.result as PendingRecording;
      if (entry) {
        const updated = { ...entry, ...updates };
        store.put(updated);
      }
      resolve();
    };
    getRequest.onerror = () => reject(getRequest.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Remove a recording from the cache (after successful upload or manual discard)
 */
export async function removeRecordingFromCache(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Clear all pending recordings from cache
 */
export async function clearAllPendingRecordings(): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Check if the browser is online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Listen for online/offline events
 */
export function onConnectivityChange(callback: (online: boolean) => void): () => void {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}
