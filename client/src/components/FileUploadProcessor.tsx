import { useEffect, useCallback, useRef } from "react";
import { useUploadManager } from "@/contexts/UploadManagerContext";
import { trpcCall } from "@/lib/trpcCall";

/**
 * FileUploadProcessor - Registers a 'file' type upload processor with the UploadManager.
 * This handles file uploads via the GlobalDropZone drag-and-drop flow.
 * Must be rendered inside UploadManagerProvider.
 *
 * Uses direct fetch() calls (via trpcCall) instead of React Query mutations
 * so the upload loop is independent of React component lifecycle. This prevents
 * uploads from getting stuck at "Queued" when the component re-renders.
 *
 * Supports resume: when retrying a failed upload, it checks if the previous
 * session is still valid and skips already-uploaded chunks.
 */

interface SessionStatus {
  exists: boolean;
  status?: string;
  receivedChunks?: number[];
  totalChunks?: number;
  totalSize?: number;
  filename?: string;
  hasChunksInMemory?: boolean;
  memoryChunks?: number;
  canResume?: boolean;
}

export function FileUploadProcessor() {
  const {
    registerProcessor,
    unregisterProcessor,
    getAbortController,
    updateUploadProgress,
    updateUploadStatus,
    updateUploadSessionId,
    updatePausedChunk,
  } = useUploadManager();

  // Use refs for the upload manager callbacks so the processFileUpload
  // function doesn't need to be recreated when they change
  const callbacksRef = useRef({
    getAbortController,
    updateUploadProgress,
    updateUploadStatus,
    updateUploadSessionId,
    updatePausedChunk,
  });

  // Keep refs up to date
  useEffect(() => {
    callbacksRef.current = {
      getAbortController,
      updateUploadProgress,
      updateUploadStatus,
      updateUploadSessionId,
      updatePausedChunk,
    };
  }, [getAbortController, updateUploadProgress, updateUploadStatus, updateUploadSessionId, updatePausedChunk]);

  // Stable processFileUpload function that never changes reference
  const processFileUpload = useCallback(async (
    uploadId: string,
    file: File,
    resumeFromChunk?: number,
    existingSessionId?: string,
  ) => {
    const { getAbortController: getAbort, updateUploadProgress: updateProgress, updateUploadStatus: updateStatus, updateUploadSessionId: updateSessionId, updatePausedChunk: updateChunk } = callbacksRef.current;
    const abortController = getAbort(uploadId);

    try {
      // Check if cancelled
      if (abortController?.signal.aborted) return;

      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks (matches server)
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      console.log(`[FileUpload] Starting upload for ${file.name} (${file.size} bytes, ${totalChunks} chunks)`);

      let sessionId: string;
      let alreadyReceivedChunks: number[] = [];

      // Try to resume from existing session
      if (existingSessionId) {
        console.log(`[FileUpload] Checking existing session ${existingSessionId} for resume...`);
        try {
          // Query session status to see if we can resume
          const sessionStatus = await trpcCall<SessionStatus>(
            'uploadChunk.getSessionStatus',
            { sessionId: existingSessionId },
            'query'
          );

          if (sessionStatus.exists && sessionStatus.canResume) {
            // Session is still active and chunks are in memory - we can resume!
            sessionId = existingSessionId;
            alreadyReceivedChunks = sessionStatus.receivedChunks || [];
            console.log(`[FileUpload] Resuming session ${sessionId}: ${alreadyReceivedChunks.length}/${totalChunks} chunks already uploaded`);
            
            // Update progress to reflect already-uploaded chunks
            if (alreadyReceivedChunks.length > 0) {
              const maxChunk = Math.max(...alreadyReceivedChunks);
              const progress = ((maxChunk + 1) / totalChunks) * 100;
              const uploadedBytes = Math.min((maxChunk + 1) * CHUNK_SIZE, file.size);
              updateProgress(uploadId, progress, uploadedBytes);
            }
          } else {
            // Session exists but can't resume (chunks lost from memory, expired, etc.)
            console.log(`[FileUpload] Session ${existingSessionId} cannot be resumed (status: ${sessionStatus.status}, chunksInMemory: ${sessionStatus.hasChunksInMemory}). Starting fresh.`);
            const initResult = await trpcCall<{ sessionId: string }>('uploadChunk.initUpload', {
              filename: file.name,
              mimeType: file.type || "application/octet-stream",
              totalSize: file.size,
            });
            sessionId = initResult.sessionId;
            updateSessionId(uploadId, sessionId);
          }
        } catch (err) {
          // Failed to check session - start fresh
          console.warn(`[FileUpload] Failed to check session status, starting fresh:`, err);
          const initResult = await trpcCall<{ sessionId: string }>('uploadChunk.initUpload', {
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            totalSize: file.size,
          });
          sessionId = initResult.sessionId;
          updateSessionId(uploadId, sessionId);
        }
      } else {
        // No existing session - initialize new one
        const initResult = await trpcCall<{ sessionId: string }>('uploadChunk.initUpload', {
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          totalSize: file.size,
        });
        sessionId = initResult.sessionId;
        console.log(`[FileUpload] New session initialized: ${sessionId}`);
        updateSessionId(uploadId, sessionId);
      }

      // Upload chunks using direct fetch calls
      for (let i = 0; i < totalChunks; i++) {
        // Check if cancelled
        if (abortController?.signal.aborted) {
          console.log(`[FileUpload] Upload cancelled at chunk ${i}`);
          return;
        }

        // Skip chunks that were already received (for resume)
        if (alreadyReceivedChunks.includes(i)) {
          const progress = ((i + 1) / totalChunks) * 100;
          const uploadedBytes = Math.min((i + 1) * CHUNK_SIZE, file.size);
          updateProgress(uploadId, progress, uploadedBytes);
          continue;
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        // Convert chunk to base64
        const arrayBuffer = await chunk.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ""
          )
        );

        // Upload chunk with retry (per-chunk retry with exponential backoff)
        let retries = 0;
        const maxChunkRetries = 5;
        while (retries < maxChunkRetries) {
          try {
            // Check if cancelled before each attempt
            if (abortController?.signal.aborted) {
              console.log(`[FileUpload] Upload cancelled during chunk ${i} retry`);
              return;
            }

            await trpcCall<{ success: boolean; receivedChunks: number; totalChunks: number }>('uploadChunk.uploadChunk', {
              sessionId,
              chunkIndex: i,
              chunkData: base64,
              totalChunks,
            });
            break; // Success
          } catch (error: any) {
            retries++;
            if (retries >= maxChunkRetries) {
              // Save the current chunk position so we can resume later
              updateChunk(uploadId, i);
              throw new Error(`Failed to upload chunk ${i + 1}/${totalChunks} after ${maxChunkRetries} retries: ${error.message}`);
            }
            const backoffDelay = 1500 * Math.pow(2, retries - 1);
            console.warn(`[FileUpload] Chunk ${i + 1}/${totalChunks} attempt ${retries} failed, retrying in ${backoffDelay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          }
        }

        // Update progress
        const progress = ((i + 1) / totalChunks) * 100;
        const uploadedBytes = Math.min((i + 1) * CHUNK_SIZE, file.size);
        updateProgress(uploadId, progress, uploadedBytes);
        updateChunk(uploadId, i + 1);
      }

      console.log(`[FileUpload] All chunks uploaded, finalizing...`);

      // Finalize upload via direct fetch
      const result = await trpcCall<{ success: boolean; fileId: number; videoId?: number; url: string; fileKey: string }>('uploadChunk.finalizeUpload', { sessionId });

      console.log(`[FileUpload] Upload complete! File ID: ${result.fileId}`);

      updateStatus(uploadId, 'completed', {
        fileId: result.fileId,
        url: result.url,
      });

    } catch (error: any) {
      // Don't show error if cancelled
      if (abortController?.signal.aborted) return;

      console.error("[FileUpload] Upload error:", error);
      updateStatus(uploadId, 'error', undefined, error.message || "Upload failed");
    }
  }, []); // No dependencies - uses refs for all callbacks

  // Register file processor on mount - stable reference, only registers once
  useEffect(() => {
    console.log('[FileUploadProcessor] Registering file upload processor');
    registerProcessor('file', processFileUpload);
    return () => {
      console.log('[FileUploadProcessor] Unregistering file upload processor');
      unregisterProcessor('file');
    };
  }, [registerProcessor, unregisterProcessor, processFileUpload]);

  // This component doesn't render anything
  return null;
}
