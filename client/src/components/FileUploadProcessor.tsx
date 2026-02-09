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
 */
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
  ) => {
    const { getAbortController: getAbort, updateUploadProgress: updateProgress, updateUploadStatus: updateStatus, updateUploadSessionId: updateSessionId, updatePausedChunk: updateChunk } = callbacksRef.current;
    const abortController = getAbort(uploadId);

    try {
      // Check if cancelled
      if (abortController?.signal.aborted) return;

      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks (matches server)
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      console.log(`[FileUpload] Starting upload for ${file.name} (${file.size} bytes, ${totalChunks} chunks)`);

      // Initialize upload session via direct fetch
      const { sessionId } = await trpcCall<{ sessionId: string }>('uploadChunk.initUpload', {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        totalSize: file.size,
      });

      console.log(`[FileUpload] Session initialized: ${sessionId}`);
      updateSessionId(uploadId, sessionId);

      const startChunk = resumeFromChunk || 0;

      // Upload chunks using direct fetch calls
      for (let i = startChunk; i < totalChunks; i++) {
        // Check if cancelled
        if (abortController?.signal.aborted) {
          console.log(`[FileUpload] Upload cancelled at chunk ${i}`);
          return;
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

        // Upload chunk with retry
        let retries = 0;
        const maxRetries = 3;
        while (retries < maxRetries) {
          try {
            await trpcCall<{ success: boolean; receivedChunks: number; totalChunks: number }>('uploadChunk.uploadChunk', {
              sessionId,
              chunkIndex: i,
              chunkData: base64,
              totalChunks,
            });
            break;
          } catch (error: any) {
            retries++;
            if (retries >= maxRetries) {
              throw new Error(`Failed to upload chunk ${i + 1}/${totalChunks} after ${maxRetries} retries: ${error.message}`);
            }
            console.warn(`[FileUpload] Chunk ${i + 1}/${totalChunks} attempt ${retries} failed, retrying in ${1.5 * Math.pow(2, retries)}s...`);
            await new Promise(resolve => setTimeout(resolve, 1500 * Math.pow(2, retries)));
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
