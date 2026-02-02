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
  status: "active" | "paused" | "completed" | "error" | "expired";
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
  // Local tracking
  file?: File;
  isPaused?: boolean;
}

interface UseResumableUploadOptions {
  onComplete?: (session: ResumableUploadSession, result: { fileId: number; videoId?: number; url: string }) => void;
  onError?: (session: ResumableUploadSession, error: Error) => void;
  onProgress?: (session: ResumableUploadSession) => void;
}

export function useResumableUpload(options: UseResumableUploadOptions = {}) {
  const [sessions, setSessions] = useState<ResumableUploadSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const activeUploadsRef = useRef<Set<string>>(new Set());

  // tRPC mutations
  const createSessionMutation = trpc.resumableUpload.createSession.useMutation();
  const uploadChunkMutation = trpc.resumableUpload.uploadChunk.useMutation();
  const finalizeUploadMutation = trpc.resumableUpload.finalizeUpload.useMutation();
  const pauseSessionMutation = trpc.resumableUpload.pauseSession.useMutation();
  const cancelSessionMutation = trpc.resumableUpload.cancelSession.useMutation();
  
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
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt,
      }));
      
      setSessions(mappedSessions);
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
      const reader = new FileReader();
      const blob = file.slice(start, end);
      
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1]; // Remove data:... prefix
        resolve(base64);
      };
      
      reader.onerror = () => reject(new Error("Failed to read chunk"));
      reader.readAsDataURL(blob);
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
        const chunkData = await readChunkAsBase64(file, start, end);

        // Upload chunk with retries
        let retries = 0;
        const maxRetries = 3;
        
        while (retries < maxRetries) {
          try {
            if (abortController.signal.aborted) return;
            
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
          } catch (error) {
            retries++;
            if (retries >= maxRetries) {
              throw new Error(`Failed to upload chunk ${i} after ${maxRetries} attempts`);
            }
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
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

  // Get active/resumable sessions count
  const activeCount = sessions.filter(s => s.status === "active").length;
  const pausedCount = sessions.filter(s => s.status === "paused").length;
  const resumableCount = sessions.filter(s => s.status === "active" || s.status === "paused").length;

  return {
    sessions,
    isLoading,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    refetchSessions,
    activeCount,
    pausedCount,
    resumableCount,
  };
}
