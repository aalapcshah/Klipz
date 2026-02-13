import { useState, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { trpcCall } from "@/lib/trpcCall";

const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunks (kept small to avoid proxy body size limits on deployed sites)
const STORAGE_KEY = "metaclips-resumable-uploads";

export interface ResumableUploadSession {
  sessionToken: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadType: "video" | "file";
  status: "active" | "paused" | "finalizing" | "completed" | "error" | "expired";
  totalChunks: number;
  uploadedChunks: number;
  uploadedBytes: number;
  progress: number;
  speed: number;
  eta: number;
  metadata?: {
    title?: string;
    description?: string;
    quality?: string;
    collectionId?: number;
    tags?: string[];
  };
  expiresAt: string;
  createdAt?: string;
  lastActivityAt?: string;
  error?: string;
  thumbnailUrl?: string | null;
  // Local tracking
  file?: File;
  isPaused?: boolean;
}

interface UseResumableUploadOptions {
  onComplete?: (session: ResumableUploadSession, result: { fileId: number; videoId?: number; url: string }) => void;
  onError?: (session: ResumableUploadSession, error: Error) => void;
  onProgress?: (session: ResumableUploadSession) => void;
  /** If true, auto-resume sessions that have file references in memory on page load */
  autoResume?: boolean;
  /** Delay in ms to add between chunk uploads for throttling (0 = no throttle) */
  chunkDelayMs?: number;
}

// trpcCall is now imported from @/lib/trpcCall

// --- localStorage helpers for instant session display on page load ---
interface StoredSessionInfo {
  sessionToken: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadType: "video" | "file";
  progress: number;
  uploadedChunks: number;
  totalChunks: number;
  thumbnailUrl?: string | null;
}

function saveSessionsToStorage(sessions: ResumableUploadSession[]) {
  try {
    const toStore: StoredSessionInfo[] = sessions
      .filter(s => s.status === 'active' || s.status === 'paused' || s.status === 'finalizing' || s.status === 'error')
      .map(s => ({
        sessionToken: s.sessionToken,
        filename: s.filename,
        fileSize: s.fileSize,
        mimeType: s.mimeType,
        uploadType: s.uploadType,
        progress: s.progress,
        uploadedChunks: s.uploadedChunks,
        totalChunks: s.totalChunks,
        thumbnailUrl: s.thumbnailUrl,
      }));
    if (toStore.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage not available
  }
}

function loadSessionsFromStorage(): StoredSessionInfo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // localStorage not available
  }
  return [];
}

function clearSessionsFromStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage not available
  }
}

/**
 * Generate a thumbnail from a video file using a hidden <video> + <canvas>
 * Returns a base64-encoded JPEG data URL, or null on failure
 */
function generateVideoThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;

      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
        video.remove();
      };

      video.onloadeddata = () => {
        // Seek to 1 second or 10% of duration, whichever is smaller
        video.currentTime = Math.min(1, video.duration * 0.1);
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          // Generate a small thumbnail (max 320px wide)
          const scale = Math.min(320 / video.videoWidth, 240 / video.videoHeight, 1);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup();
            resolve(null);
            return;
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          cleanup();
          resolve(dataUrl);
        } catch (e) {
          console.warn('[Thumbnail] Canvas draw failed:', e);
          cleanup();
          resolve(null);
        }
      };

      video.onerror = () => {
        console.warn('[Thumbnail] Video load failed');
        cleanup();
        resolve(null);
      };

      // Timeout after 10 seconds
      setTimeout(() => {
        cleanup();
        resolve(null);
      }, 10000);
    } catch (e) {
      console.warn('[Thumbnail] Generation failed:', e);
      resolve(null);
    }
  });
}

export function useResumableUpload(options: UseResumableUploadOptions = {}) {
  const [sessions, setSessions] = useState<ResumableUploadSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const activeUploadsRef = useRef<Set<string>>(new Set());
  // Track session tokens that have been cleared/cancelled to prevent server sync from bringing them back
  const clearedTokensRef = useRef<Set<string>>(new Set());
  const autoResumedRef = useRef(false);
  const chunkDelayRef = useRef(options.chunkDelayMs ?? 0);
  // Keep refs to callbacks so the upload loop always calls the latest version
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; }, [options]);
  const setSessionsRef = useRef(setSessions);
  useEffect(() => { setSessionsRef.current = setSessions; }, [setSessions]);
  // Keep a ref to current sessions for use in timeouts/callbacks
  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  
  // tRPC utils for direct cache invalidation after upload completion
  const trpcUtils = trpc.useUtils();

  // Keep chunkDelay ref in sync with options
  useEffect(() => {
    chunkDelayRef.current = options.chunkDelayMs ?? 0;
  }, [options.chunkDelayMs]);

  // tRPC mutations - only used for non-upload-loop operations (create session, pause, cancel, thumbnail)
  const createSessionMutation = trpc.resumableUpload.createSession.useMutation();
  const pauseSessionMutation = trpc.resumableUpload.pauseSession.useMutation();
  // cancelSession now uses direct trpcCall() instead of React Query mutation
  const saveThumbnailMutation = trpc.resumableUpload.saveThumbnail.useMutation();
  
  // tRPC queries
  const { data: serverSessions, refetch: refetchSessions } = trpc.resumableUpload.listActiveSessions.useQuery(
    undefined,
    { enabled: true }
  );

  // Load cached sessions from localStorage immediately for instant UI display
  useEffect(() => {
    const cached = loadSessionsFromStorage();
    if (cached.length > 0) {
      const cachedSessions: ResumableUploadSession[] = cached.map(c => ({
        ...c,
        status: 'paused' as const,
        uploadedBytes: c.uploadedChunks * CHUNK_SIZE,
        speed: 0,
        eta: 0,
        expiresAt: '',
      }));
      setSessions(cachedSessions);
    }
  }, []);

  // Load sessions from server on mount (replaces cached data with authoritative server data)
  useEffect(() => {
    if (serverSessions) {
      // Filter out sessions that have been cleared/cancelled locally
      const filteredServerSessions = serverSessions.filter(
        (s: any) => !clearedTokensRef.current.has(s.sessionToken)
      );
      
      const mappedSessions: ResumableUploadSession[] = filteredServerSessions.map((s: any) => ({
        sessionToken: s.sessionToken,
        filename: s.filename,
        fileSize: Number(s.fileSize),
        mimeType: s.mimeType,
        uploadType: s.uploadType,
        status: s.status,
        totalChunks: s.totalChunks,
        uploadedChunks: s.uploadedChunks,
        uploadedBytes: Number(s.uploadedBytes),
        progress: s.totalChunks > 0 ? (s.uploadedChunks / s.totalChunks) * 100 : 0,
        speed: 0,
        eta: 0,
        metadata: s.metadata,
        thumbnailUrl: s.thumbnailUrl,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt,
      }));
      
      // Merge file references and preserve local error status from existing sessions
      setSessions(prev => {
        return mappedSessions.map(mapped => {
          const existing = prev.find(p => p.sessionToken === mapped.sessionToken);
          if (existing) {
            // Preserve local error status — don't let server sync override it
            // The user must explicitly retry or cancel an errored upload
            if (existing.status === 'error') {
              return { ...existing, file: existing.file };
            }
            // Preserve file reference for resuming
            if (existing.file) {
              return { ...mapped, file: existing.file };
            }
          }
          return mapped;
        });
      });
      setIsLoading(false);
      
      // Sync localStorage with server truth
      saveSessionsToStorage(mappedSessions);
      
      // Clean up clearedTokensRef: remove tokens that the server no longer returns
      // (meaning the server has actually processed the cancellation)
      const serverTokens = new Set(serverSessions.map((s: any) => s.sessionToken));
      Array.from(clearedTokensRef.current).forEach(token => {
        if (!serverTokens.has(token)) {
          clearedTokensRef.current.delete(token);
        }
      });
    }
  }, [serverSessions]);

  // Read chunk as base64
  const readChunkAsBase64 = useCallback((file: File, start: number, end: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        const blob = file.slice(start, end);
        
        reader.onload = () => {
          try {
            const result = reader.result as string;
            const commaIndex = result.indexOf(",");
            const base64 = commaIndex >= 0 ? result.substring(commaIndex + 1) : result;
            resolve(base64);
          } catch (e) {
            reject(new Error("Failed to encode chunk data"));
          }
        };
        
        reader.onerror = () => reject(new Error("Failed to read chunk from file"));
        reader.onabort = () => reject(new Error("Chunk read was aborted"));
        reader.readAsDataURL(blob);
      } catch (e) {
        reject(new Error("Failed to initialize chunk reader"));
      }
    });
  }, []);

  // Start a new upload
  const startUpload = useCallback(async (
    file: File,
    uploadType: "video" | "file",
    metadata?: ResumableUploadSession["metadata"]
  ): Promise<string> => {
    try {
      // Create session on server
      const result = await createSessionMutation.mutateAsync({
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadType,
        chunkSize: CHUNK_SIZE,
        metadata,
      });

      const newSession: ResumableUploadSession = {
        sessionToken: result.sessionToken,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadType,
        status: "active",
        totalChunks: result.totalChunks,
        uploadedChunks: 0,
        uploadedBytes: 0,
        progress: 0,
        speed: 0,
        eta: 0,
        metadata,
        expiresAt: result.expiresAt,
        file,
      };

      setSessions(prev => {
        const updated = [...prev, newSession];
        saveSessionsToStorage(updated);
        return updated;
      });

      // Generate and save thumbnail in background (non-blocking)
      if (file.type.startsWith('video/')) {
        generateVideoThumbnail(file).then((thumbnailBase64: string | null) => {
          if (thumbnailBase64) {
            // Use direct fetch for thumbnail too (fire and forget)
            trpcCall<{ thumbnailUrl: string | null }>('resumableUpload.saveThumbnail', {
              sessionToken: result.sessionToken,
              thumbnailBase64,
            }).then((res) => {
              if (res?.thumbnailUrl) {
                setSessionsRef.current(prev => prev.map(s =>
                  s.sessionToken === result.sessionToken
                    ? { ...s, thumbnailUrl: res.thumbnailUrl }
                    : s
                ));
              }
            }).catch((e: unknown) => console.warn('[ResumableUpload] Failed to save thumbnail:', e));
          }
        }).catch((e: unknown) => console.warn('[ResumableUpload] Failed to generate thumbnail:', e));
      }

      // Start uploading chunks
      uploadChunks(newSession, file);

      return result.sessionToken;
    } catch (error) {
      console.error("[ResumableUpload] Failed to create session:", error);
      throw error;
    }
  }, [createSessionMutation]);

  // Poll for background finalization completion (for large files)
  const pollFinalizeStatus = async (
    sessionToken: string,
    signal: AbortSignal
  ): Promise<{ fileId: number; videoId?: number; url: string }> => {
    const POLL_INTERVAL = 5000; // 5 seconds
    const MAX_POLL_TIME = 30 * 60 * 1000; // 30 minutes max
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_POLL_TIME) {
      if (signal.aborted) throw new Error('Upload was cancelled');

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

      if (signal.aborted) throw new Error('Upload was cancelled');

      const status = await trpcCall<{
        status: 'completed' | 'finalizing' | 'failed' | string;
        fileKey?: string;
        url?: string;
        message?: string;
      }>('resumableUpload.getFinalizeStatus', {
        sessionToken,
      }, 'query', {
        timeoutMs: 30_000,
        signal,
      });

      if (status.status === 'completed') {
        // Fetch the full session to get fileId/videoId
        // The server doesn't return these from getFinalizeStatus, so we use the URL
        // and rely on the onComplete callback to refresh the file list
        return {
          fileId: 0, // Will be resolved by the file list refresh
          url: status.url || '',
        };
      }

      if (status.status === 'failed') {
        throw new Error(status.message || 'File assembly failed on server');
      }

      // Still finalizing, continue polling
      console.log(`[ResumableUpload] Still assembling ${sessionToken}...`);
    }

    throw new Error('File assembly timed out after 30 minutes');
  };

  // Upload queue: only 1 upload runs at a time, others wait
  const uploadQueueRef = useRef<Array<{ session: ResumableUploadSession; file: File }>>([]);
  const isProcessingQueueRef = useRef(false);

  const processUploadQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;
    
    try {
      while (uploadQueueRef.current.length > 0) {
        const next = uploadQueueRef.current.shift();
        if (next) {
          // Check if this session was cancelled while waiting in queue
          if (clearedTokensRef.current.has(next.session.sessionToken)) continue;
          // Wait for any active upload to finish before starting next
          // (activeUploadsRef is cleaned up in executeUploadChunks finally block)
          while (activeUploadsRef.current.size > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          await executeUploadChunks(next.session, next.file);
        }
      }
    } finally {
      isProcessingQueueRef.current = false;
    }
  }, []);

  // Upload chunks for a session - uses direct fetch calls, survives component unmounts
  const uploadChunks = useCallback(async (session: ResumableUploadSession, file: File) => {
    // If another upload is already active AND it's a different session, queue this one
    const activeTokens = Array.from(activeUploadsRef.current);
    const otherActive = activeTokens.filter(t => t !== session.sessionToken);
    if (otherActive.length > 0) {
      console.log(`[ResumableUpload] Queuing upload for ${session.filename} (another upload is active: ${otherActive.join(', ')})`);
      uploadQueueRef.current.push({ session, file });
      setSessionsRef.current(prev => prev.map(s =>
        s.sessionToken === session.sessionToken
          ? { ...s, status: 'paused' as const, error: 'Waiting in queue...' }
          : s
      ));
      processUploadQueue();
      return;
    }
    // If this session is already marked as active (stale entry), clean it up first
    if (activeUploadsRef.current.has(session.sessionToken)) {
      console.log(`[ResumableUpload] Cleaning up stale active entry for ${session.sessionToken}`);
      const oldController = abortControllersRef.current.get(session.sessionToken);
      if (oldController) oldController.abort();
      activeUploadsRef.current.delete(session.sessionToken);
      abortControllersRef.current.delete(session.sessionToken);
    }
    await executeUploadChunks(session, file);
    // After this upload finishes, process the next one in the queue
    processUploadQueue();
  }, []);

  const executeUploadChunks = useCallback(async (session: ResumableUploadSession, file: File) => {
    const abortController = new AbortController();
    abortControllersRef.current.set(session.sessionToken, abortController);
    activeUploadsRef.current.add(session.sessionToken);

    // Update status to active
    setSessionsRef.current(prev => prev.map(s =>
      s.sessionToken === session.sessionToken
        ? { ...s, status: 'active' as const, error: undefined }
        : s
    ));

    let lastSpeedUpdate = Date.now();
    let lastBytesForSpeed = session.uploadedBytes;
    let consecutiveFailures = 0;

    try {
      for (let i = session.uploadedChunks; i < session.totalChunks; i++) {
        // Check if paused or cancelled
        if (abortController.signal.aborted) {
          console.log(`[ResumableUpload] Upload ${session.sessionToken} was aborted at chunk ${i}`);
          return;
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);

        // Apply throttle delay between chunks (skip first chunk)
        if (i > session.uploadedChunks && chunkDelayRef.current > 0) {
          await new Promise(resolve => setTimeout(resolve, chunkDelayRef.current));
        }

        // Upload chunk with retries (10 retries with exponential backoff, 2min timeout per chunk)
        let retries = 0;
        const maxRetries = 10;
        let chunkSuccess = false;
        
        while (retries < maxRetries) {
          try {
            if (abortController.signal.aborted) return;
            
            // Show retry status in UI
            if (retries > 0) {
              setSessionsRef.current(prev => prev.map(s =>
                s.sessionToken === session.sessionToken
                  ? { ...s, error: `Retrying chunk ${i + 1} (attempt ${retries + 1}/${maxRetries})...` }
                  : s
              ));
            }
            
            // Read chunk inside retry loop so file read failures are also retried
            const chunkData = await readChunkAsBase64(file, start, end);
            
            // Use direct fetch with timeout and abort signal
            const result = await trpcCall<{
              uploadedChunks: number;
              totalChunks: number;
              uploadedBytes: number;
            }>('resumableUpload.uploadChunk', {
              sessionToken: session.sessionToken,
              chunkIndex: i,
              chunkData,
            }, 'mutation', {
              timeoutMs: 120_000, // 2 minute timeout per chunk
              signal: abortController.signal,
            });

            console.log(`[ResumableUpload] Chunk ${i + 1}/${session.totalChunks} uploaded for ${session.filename}`);
            chunkSuccess = true;
            consecutiveFailures = 0; // Reset on success

            // Update session state
            const now = Date.now();
            const timeDiff = (now - lastSpeedUpdate) / 1000;
            const bytesDiff = result.uploadedBytes - lastBytesForSpeed;
            const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
            const remainingBytes = file.size - result.uploadedBytes;
            const eta = speed > 0 ? remainingBytes / speed : 0;

            if (timeDiff > 0.5) {
              lastSpeedUpdate = now;
              lastBytesForSpeed = result.uploadedBytes;
            }

            setSessionsRef.current(prev => {
              const updated = prev.map(s => 
                s.sessionToken === session.sessionToken
                  ? {
                      ...s,
                      uploadedChunks: result.uploadedChunks,
                      uploadedBytes: result.uploadedBytes,
                      progress: (result.uploadedChunks / result.totalChunks) * 100,
                      speed,
                      eta,
                      error: undefined, // Clear retry message on success
                    }
                  : s
              );
              // Sync to localStorage every 5 chunks for persistence
              if (result.uploadedChunks % 5 === 0) {
                saveSessionsToStorage(updated);
              }
              return updated;
            });

            optionsRef.current.onProgress?.({
              ...session,
              uploadedChunks: result.uploadedChunks,
              uploadedBytes: result.uploadedBytes,
              progress: (result.uploadedChunks / result.totalChunks) * 100,
              speed,
              eta,
            });

            break; // Success, exit retry loop
          } catch (error: any) {
            // If user cancelled, don't retry
            if (abortController.signal.aborted) return;
            
            retries++;
            consecutiveFailures++;
            const isTimeout = error?.message?.includes('timed out');
            const isNetwork = error?.message?.includes('fetch') || error?.message?.includes('network') || error?.name === 'TypeError';
            const retryLabel = isTimeout ? 'timeout' : isNetwork ? 'network error' : error?.message;
            console.warn(`[ResumableUpload] Chunk ${i} attempt ${retries} failed (${retryLabel})`);
            
            if (retries >= maxRetries) {
              // Mark as error so user can manually retry or cancel — do NOT auto-resume
              console.warn(`[ResumableUpload] Upload failed for ${session.filename} after ${maxRetries} retries on chunk ${i + 1}`);
              
              // Abort the controller to stop this upload
              abortController.abort();
              
              // Update session to error state (not paused — prevents auto-resume loop)
              setSessionsRef.current(prev => {
                const updated = prev.map(s =>
                  s.sessionToken === session.sessionToken
                    ? {
                        ...s,
                        status: 'error' as const,
                        speed: 0,
                        eta: 0,
                        error: `Failed at chunk ${i + 1}/${session.totalChunks}: ${retryLabel}. Tap retry or cancel.`,
                      }
                    : s
                );
                saveSessionsToStorage(updated);
                return updated;
              });
              
              toast.error(`${session.filename}: Upload failed after ${maxRetries} retries. You can retry or cancel the upload.`, {
                duration: 8000,
              });
              
              return; // Exit the upload function — no auto-resume
            }
            // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 60s, 60s, 60s, 60s, 60s
            const backoffMs = Math.min(2000 * Math.pow(2, retries - 1), 60_000);
            console.log(`[ResumableUpload] Retrying chunk ${i} in ${backoffMs / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
      }

      // All chunks uploaded, finalize
      console.log(`[ResumableUpload] All chunks uploaded for ${session.filename}, starting finalization...`);

      setSessionsRef.current(prev => prev.map(s => 
        s.sessionToken === session.sessionToken
          ? { ...s, status: "finalizing" as const, progress: 100 }
          : s
      ));

      const finalizeResult = await trpcCall<{
        success: boolean;
        async?: boolean;
        fileId?: number;
        videoId?: number;
        url?: string;
        fileKey?: string;
        message?: string;
      }>('resumableUpload.finalizeUpload', {
        sessionToken: session.sessionToken,
      }, 'mutation', {
        timeoutMs: 300_000, // 5 minute timeout for sync finalization
        signal: abortController.signal,
      });

      let completedResult: { fileId: number; videoId?: number; url: string };

      if (finalizeResult.async) {
        // Large file: server is assembling in background, poll for completion
        console.log(`[ResumableUpload] Background assembly started for ${session.filename}, polling for completion...`);
        toast.info(`${session.filename}: Assembling file on server... This may take a few minutes for large files.`);

        completedResult = await pollFinalizeStatus(session.sessionToken, abortController.signal);
      } else {
        // Small file: completed synchronously
        completedResult = {
          fileId: finalizeResult.fileId!,
          videoId: finalizeResult.videoId,
          url: finalizeResult.url!,
        };
      }

      console.log(`[ResumableUpload] Finalization complete for ${session.filename}:`, completedResult);

      setSessionsRef.current(prev => {
        const updated = prev.map(s => 
          s.sessionToken === session.sessionToken
            ? { ...s, status: "completed" as const, progress: 100 }
            : s
        );
        saveSessionsToStorage(updated);
        return updated;
      });

      // Invalidate file list cache directly to ensure the new file appears immediately
      // This is a safety net in addition to the onComplete callback's invalidation
      setTimeout(() => {
        trpcUtils.files.list.invalidate();
        trpcUtils.files.enrichmentCounts.invalidate();
        trpcUtils.recentlyViewed.list.invalidate();
      }, 500); // Small delay to ensure DB commit is visible
      
      optionsRef.current.onComplete?.(session, completedResult);
      toast.success(`${session.filename} uploaded successfully!`);

    } catch (error) {
      if (!abortController.signal.aborted) {
        console.error("[ResumableUpload] Upload failed:", error);
        
        setSessionsRef.current(prev => {
          const updated = prev.map(s => 
            s.sessionToken === session.sessionToken
              ? { ...s, status: "error" as const, error: error instanceof Error ? error.message : "Upload failed" }
              : s
          );
          saveSessionsToStorage(updated);
          return updated;
        });

        optionsRef.current.onError?.(session, error instanceof Error ? error : new Error("Upload failed"));
        toast.error(`Failed to upload ${session.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } finally {
      activeUploadsRef.current.delete(session.sessionToken);
      abortControllersRef.current.delete(session.sessionToken);
    }
  }, [readChunkAsBase64]);

  // Auto-resume: when sessions load and have file references in memory, auto-resume them
  useEffect(() => {
    if (autoResumedRef.current || isLoading || sessions.length === 0) return;
    if (!options.autoResume) return;

    const sessionsWithFiles = sessions.filter(
      s => (s.status === 'active' || s.status === 'paused') && 
           s.file && 
           !activeUploadsRef.current.has(s.sessionToken)
    );

    if (sessionsWithFiles.length > 0) {
      autoResumedRef.current = true;
      console.log(`[ResumableUpload] Auto-resuming ${sessionsWithFiles.length} upload(s) with files in memory`);
      toast.info(`Auto-resuming ${sessionsWithFiles.length} upload(s)...`);
      
      // Stagger auto-resumes to avoid overwhelming the server
      sessionsWithFiles.forEach((session, index) => {
        setTimeout(() => {
          if (session.file) {
            uploadChunks({ ...session, status: 'active' }, session.file);
            setSessions(prev => prev.map(s => 
              s.sessionToken === session.sessionToken
                ? { ...s, status: 'active' as const, isPaused: false }
                : s
            ));
          }
        }, index * 1000); // 1 second stagger between each
      });
    }
  }, [sessions, isLoading, options.autoResume, uploadChunks]);

  // Track last progress for stall detection: { timestamp, chunks }
  const lastProgressRef = useRef<Map<string, { time: number; chunks: number }>>(new Map());

  // Update last progress timestamp whenever a session makes progress
  useEffect(() => {
    for (const session of sessions) {
      if (session.status === 'active' && session.uploadedChunks > 0) {
        const prev = lastProgressRef.current.get(session.sessionToken);
        if (!prev || session.uploadedChunks > prev.chunks) {
          lastProgressRef.current.set(session.sessionToken, { time: Date.now(), chunks: session.uploadedChunks });
        }
      }
    }
  }, [sessions]);

  // Visibility change handler: when user returns to the tab/app, check for stalled uploads
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[ResumableUpload] Page became visible, checking for stalled uploads...');
        const now = Date.now();
        const currentSessions = sessionsRef.current;
        
        for (const session of currentSessions) {
          // Only restart truly active uploads — skip error/paused sessions
          if (session.status === 'active' && session.file && activeUploadsRef.current.has(session.sessionToken)) {
            const lastProgress = lastProgressRef.current.get(session.sessionToken);
            const stalledFor = lastProgress ? now - lastProgress.time : 0;
            
            // If an "active" upload hasn't made progress in 90 seconds, it's stalled
            if (lastProgress && stalledFor > 90_000) {
              console.warn(`[ResumableUpload] ${session.filename} stalled for ${Math.round(stalledFor / 1000)}s, restarting...`);
              
              // Abort the stalled upload
              const controller = abortControllersRef.current.get(session.sessionToken);
              if (controller) controller.abort();
              activeUploadsRef.current.delete(session.sessionToken);
              abortControllersRef.current.delete(session.sessionToken);
              
              // Re-queue it
              toast.info(`Resuming ${session.filename} after returning to app...`);
              uploadChunks({ ...session, status: 'active' }, session.file);
            }
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [uploadChunks]);

  // Periodic stall detection: every 60 seconds, check if active uploads are making progress
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const currentSessions = sessionsRef.current;
      
      for (const session of currentSessions) {
        if (session.status === 'active' && session.file && activeUploadsRef.current.has(session.sessionToken)) {
          const lastProgress = lastProgressRef.current.get(session.sessionToken);
          const stalledFor = lastProgress ? now - lastProgress.time : 0;
          
          // If active for more than 3 minutes without progress, restart
          if (lastProgress && stalledFor > 180_000) {
            console.warn(`[ResumableUpload] ${session.filename} stalled for ${Math.round(stalledFor / 1000)}s (periodic check), restarting...`);
            
            const controller = abortControllersRef.current.get(session.sessionToken);
            if (controller) controller.abort();
            activeUploadsRef.current.delete(session.sessionToken);
            abortControllersRef.current.delete(session.sessionToken);
            
            toast.info(`Restarting stalled upload: ${session.filename}`);
            uploadChunks({ ...session, status: 'active' }, session.file);
            
            // Reset the progress timestamp
            lastProgressRef.current.set(session.sessionToken, { time: now, chunks: session.uploadedChunks });
          }
        }
      }
    }, 60_000); // Check every 60 seconds

    return () => clearInterval(interval);
  }, [uploadChunks]);

  // Pause an upload
  const pauseUpload = useCallback(async (sessionToken: string) => {
    const controller = abortControllersRef.current.get(sessionToken);
    if (controller) {
      controller.abort();
    }

    try {
      await pauseSessionMutation.mutateAsync({ sessionToken });
      
      setSessions(prev => prev.map(s => 
        s.sessionToken === sessionToken
          ? { ...s, status: "paused" as const, isPaused: true, speed: 0, eta: 0 }
          : s
      ));

      toast.info("Upload paused");
    } catch (error) {
      console.error("[ResumableUpload] Failed to pause:", error);
    }
  }, [pauseSessionMutation]);

  // Resume an upload
  const resumeUpload = useCallback(async (sessionToken: string, file?: File) => {
    const session = sessions.find(s => s.sessionToken === sessionToken);
    if (!session) {
      toast.error("Session not found");
      return;
    }

    // If no file provided, we need the user to re-select it
    const uploadFile = file || session.file;
    if (!uploadFile) {
      toast.error("Please re-select the file to resume upload");
      return;
    }

    // Verify file matches - use size as primary check (name can differ on mobile)
    if (uploadFile.size !== session.fileSize) {
      toast.error(`File size doesn't match. Expected ${session.fileSize} bytes but got ${uploadFile.size} bytes. Please select the correct file.`);
      return;
    }
    // Warn if name differs but allow it (mobile file pickers can return different names)
    if (uploadFile.name !== session.filename) {
      console.warn(`[ResumableUpload] File name mismatch: expected "${session.filename}", got "${uploadFile.name}". Allowing because size matches.`);
      toast.info(`File name differs but size matches — resuming upload.`);
    }

    setSessions(prev => prev.map(s => 
      s.sessionToken === sessionToken
        ? { ...s, status: "active" as const, isPaused: false, file: uploadFile }
        : s
    ));

    // Continue uploading
    uploadChunks({ ...session, file: uploadFile }, uploadFile);
    toast.info("Upload resumed");
  }, [sessions, uploadChunks]);

  // Cancel an upload - uses direct fetch to ensure it works regardless of component lifecycle
  const cancelUpload = useCallback(async (sessionToken: string) => {
    const controller = abortControllersRef.current.get(sessionToken);
    if (controller) {
      controller.abort();
    }

    // Add to cleared tokens to prevent server sync from bringing it back
    clearedTokensRef.current.add(sessionToken);

    // Immediately remove from local state
    setSessions(prev => {
      const updated = prev.filter(s => s.sessionToken !== sessionToken);
      saveSessionsToStorage(updated);
      return updated;
    });

    try {
      // Use direct fetch to ensure the cancel reaches the server
      await trpcCall<{ success: boolean }>('resumableUpload.cancelSession', { sessionToken });
      console.log(`[ResumableUpload] Session ${sessionToken} cancelled on server`);
      // Invalidate the query cache so refetch doesn't bring it back
      refetchSessions();
      toast.info("Upload cancelled");
    } catch (error) {
      console.error("[ResumableUpload] Failed to cancel on server:", error);
      // Still show cancelled locally even if server call fails
      toast.info("Upload cancelled locally");
    }
  }, [refetchSessions]);

  // Clear all sessions (force delete from server)
  const clearAllSessions = useCallback(async () => {
    const allTokens = sessions.map(s => s.sessionToken);
    
    // Add all tokens to cleared set to prevent server sync from bringing them back
    for (const token of allTokens) {
      clearedTokensRef.current.add(token);
    }
    
    // Immediately clear local state
    setSessions([]);
    clearSessionsFromStorage();
    
    // Cancel each on the server (in parallel for speed)
    const cancelPromises = allTokens.map(async (token) => {
      const controller = abortControllersRef.current.get(token);
      if (controller) controller.abort();
      try {
        await trpcCall<{ success: boolean }>('resumableUpload.cancelSession', { sessionToken: token });
      } catch (e) {
        console.warn(`[ResumableUpload] Failed to cancel session ${token}:`, e);
      }
    });
    
    // Wait for all cancellations to complete before refetching
    await Promise.allSettled(cancelPromises);
    
    refetchSessions();
    toast.info("All uploads cleared");
  }, [sessions, refetchSessions]);

  // Pause all active uploads
  const pauseAll = useCallback(async () => {
    const activeUploads = sessions.filter(s => s.status === "active");
    for (const session of activeUploads) {
      await pauseUpload(session.sessionToken);
    }
    if (activeUploads.length > 0) {
      toast.info(`${activeUploads.length} upload(s) paused`);
    }
  }, [sessions, pauseUpload]);

  // Resume all paused uploads (requires files to be re-selected)
  const resumeAll = useCallback(async (fileMap?: Map<string, File>) => {
    const pausedUploads = sessions.filter(s => s.status === "paused");
    let resumed = 0;
    let needsFile = 0;
    
    for (const session of pausedUploads) {
      const file = fileMap?.get(session.sessionToken) || session.file;
      if (file) {
        await resumeUpload(session.sessionToken, file);
        resumed++;
      } else {
        needsFile++;
      }
    }
    
    if (resumed > 0) {
      toast.info(`${resumed} upload(s) resumed`);
    }
    if (needsFile > 0) {
      toast.warning(`${needsFile} upload(s) need files to be re-selected`);
    }
  }, [sessions, resumeUpload]);

  // Retry all failed uploads
  const retryAllFailed = useCallback(async (fileMap?: Map<string, File>) => {
    const failedUploads = sessions.filter(s => s.status === "error");
    let retried = 0;
    let needsFile = 0;
    
    for (const session of failedUploads) {
      const file = fileMap?.get(session.sessionToken) || session.file;
      if (file) {
        // Reset status and restart
        setSessions(prev => prev.map(s => 
          s.sessionToken === session.sessionToken
            ? { ...s, status: "active" as const, error: undefined }
            : s
        ));
        uploadChunks({ ...session, status: "active", file }, file);
        retried++;
      } else {
        needsFile++;
      }
    }
    
    if (retried > 0) {
      toast.info(`${retried} failed upload(s) retrying`);
    }
    if (needsFile > 0) {
      toast.warning(`${needsFile} upload(s) need files to be re-selected`);
    }
  }, [sessions, uploadChunks]);

  // Get active/resumable sessions count
  const activeCount = sessions.filter(s => s.status === "active").length;
  const pausedCount = sessions.filter(s => s.status === "paused").length;
  const errorCount = sessions.filter(s => s.status === "error").length;
  const resumableCount = sessions.filter(s => s.status === "active" || s.status === "paused").length;

  return {
    sessions,
    isLoading,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    clearAllSessions,
    pauseAll,
    resumeAll,
    retryAllFailed,
    refetchSessions,
    activeCount,
    pausedCount,
    errorCount,
    resumableCount,
  };
}
