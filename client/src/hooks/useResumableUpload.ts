import { useState, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks (matches server)
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
  const autoResumedRef = useRef(false);
  const chunkDelayRef = useRef(options.chunkDelayMs ?? 0);

  // Keep chunkDelay ref in sync with options
  useEffect(() => {
    chunkDelayRef.current = options.chunkDelayMs ?? 0;
  }, [options.chunkDelayMs]);

  // tRPC mutations
  const createSessionMutation = trpc.resumableUpload.createSession.useMutation();
  const uploadChunkMutation = trpc.resumableUpload.uploadChunk.useMutation();
  const finalizeUploadMutation = trpc.resumableUpload.finalizeUpload.useMutation();
  const pauseSessionMutation = trpc.resumableUpload.pauseSession.useMutation();
  const cancelSessionMutation = trpc.resumableUpload.cancelSession.useMutation();
  const saveThumbnailMutation = trpc.resumableUpload.saveThumbnail.useMutation();
  
  // tRPC queries
  const { data: serverSessions, refetch: refetchSessions } = trpc.resumableUpload.listActiveSessions.useQuery(
    undefined,
    { enabled: true }
  );
  const getSessionStatusQuery = trpc.resumableUpload.getSessionStatus.useQuery;

  // Load sessions from server on mount
  useEffect(() => {
    if (serverSessions) {
      const mappedSessions: ResumableUploadSession[] = serverSessions.map((s: any) => ({
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
      
      // Merge file references from existing sessions (in case user navigated away and back)
      setSessions(prev => {
        return mappedSessions.map(mapped => {
          const existing = prev.find(p => p.sessionToken === mapped.sessionToken);
          if (existing?.file) {
            return { ...mapped, file: existing.file };
          }
          return mapped;
        });
      });
      setIsLoading(false);
      
      // Show toast if there are resumable sessions
      if (mappedSessions.length > 0) {
        const pausedCount = mappedSessions.filter(s => s.status === 'paused' || s.status === 'active').length;
        if (pausedCount > 0) {
          toast.info(`${pausedCount} upload(s) can be resumed`, {
            action: {
              label: "View",
              onClick: () => {
                // Scroll to upload section or open upload dialog
                document.getElementById("resumable-uploads-banner")?.scrollIntoView({ behavior: "smooth" });
              },
            },
          });
        }
      }
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

      setSessions(prev => [...prev, newSession]);

      // Generate and save thumbnail in background (non-blocking)
      if (file.type.startsWith('video/')) {
        generateVideoThumbnail(file).then((thumbnailBase64: string | null) => {
          if (thumbnailBase64) {
            saveThumbnailMutation.mutateAsync({
              sessionToken: result.sessionToken,
              thumbnailBase64,
            }).then((res: { thumbnailUrl: string | null }) => {
              if (res.thumbnailUrl) {
                setSessions(prev => prev.map(s =>
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

  // Upload chunks for a session
  const uploadChunks = useCallback(async (session: ResumableUploadSession, file: File) => {
    const abortController = new AbortController();
    abortControllersRef.current.set(session.sessionToken, abortController);
    activeUploadsRef.current.add(session.sessionToken);

    let lastSpeedUpdate = Date.now();
    let lastBytesForSpeed = session.uploadedBytes;

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

        // Upload chunk with retries (includes file read retry)
        let retries = 0;
        const maxRetries = 3;
        
        while (retries < maxRetries) {
          try {
            if (abortController.signal.aborted) return;
            
            // Read chunk inside retry loop so file read failures are also retried
            const chunkData = await readChunkAsBase64(file, start, end);
            
            const result = await uploadChunkMutation.mutateAsync({
              sessionToken: session.sessionToken,
              chunkIndex: i,
              chunkData,
            });

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

            setSessions(prev => prev.map(s => 
              s.sessionToken === session.sessionToken
                ? {
                    ...s,
                    uploadedChunks: result.uploadedChunks,
                    uploadedBytes: result.uploadedBytes,
                    progress: (result.uploadedChunks / result.totalChunks) * 100,
                    speed,
                    eta,
                  }
                : s
            ));

            options.onProgress?.({
              ...session,
              uploadedChunks: result.uploadedChunks,
              uploadedBytes: result.uploadedBytes,
              progress: (result.uploadedChunks / result.totalChunks) * 100,
              speed,
              eta,
            });

            break; // Success, exit retry loop
          } catch (error: any) {
            retries++;
            if (retries >= maxRetries) {
              throw new Error(`Failed to upload chunk ${i} after ${maxRetries} retries: ${error?.message || 'Unknown error'}`);
            }
            console.warn(`[ResumableUpload] Chunk ${i} attempt ${retries} failed: ${error?.message}, retrying...`);
            // Exponential backoff (longer for memory recovery on mobile)
            await new Promise(resolve => setTimeout(resolve, 1500 * Math.pow(2, retries)));
          }
        }
      }

      // All chunks uploaded, finalize
      const finalResult = await finalizeUploadMutation.mutateAsync({
        sessionToken: session.sessionToken,
      });

      setSessions(prev => prev.map(s => 
        s.sessionToken === session.sessionToken
          ? { ...s, status: "completed" as const, progress: 100 }
          : s
      ));

      options.onComplete?.(session, finalResult);
      toast.success(`${session.filename} uploaded successfully!`);

    } catch (error) {
      if (!abortController.signal.aborted) {
        console.error("[ResumableUpload] Upload failed:", error);
        
        setSessions(prev => prev.map(s => 
          s.sessionToken === session.sessionToken
            ? { ...s, status: "error" as const, error: error instanceof Error ? error.message : "Upload failed" }
            : s
        ));

        options.onError?.(session, error instanceof Error ? error : new Error("Upload failed"));
        toast.error(`Failed to upload ${session.filename}`);
      }
    } finally {
      activeUploadsRef.current.delete(session.sessionToken);
      abortControllersRef.current.delete(session.sessionToken);
    }
  }, [uploadChunkMutation, finalizeUploadMutation, readChunkAsBase64, options]);

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

    // Verify file matches
    if (uploadFile.name !== session.filename || uploadFile.size !== session.fileSize) {
      toast.error("File doesn't match the original upload. Please select the correct file.");
      return;
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

  // Cancel an upload
  const cancelUpload = useCallback(async (sessionToken: string) => {
    const controller = abortControllersRef.current.get(sessionToken);
    if (controller) {
      controller.abort();
    }

    try {
      await cancelSessionMutation.mutateAsync({ sessionToken });
      
      setSessions(prev => prev.filter(s => s.sessionToken !== sessionToken));
      toast.info("Upload cancelled");
    } catch (error) {
      console.error("[ResumableUpload] Failed to cancel:", error);
    }
  }, [cancelSessionMutation]);

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
