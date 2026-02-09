import { useEffect, useCallback } from "react";
import { useUploadManager } from "@/contexts/UploadManagerContext";
import { trpc } from "@/lib/trpc";

/**
 * FileUploadProcessor - Registers a 'file' type upload processor with the UploadManager.
 * This handles file uploads via the GlobalDropZone drag-and-drop flow.
 * Must be rendered inside UploadManagerProvider.
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

  const initUploadMutation = trpc.uploadChunk.initUpload.useMutation();
  const uploadChunkMutation = trpc.uploadChunk.uploadChunk.useMutation();
  const finalizeUploadMutation = trpc.uploadChunk.finalizeUpload.useMutation();

  const processFileUpload = useCallback(async (
    uploadId: string,
    file: File,
    resumeFromChunk?: number,
  ) => {
    const abortController = getAbortController(uploadId);

    try {
      // Check if cancelled
      if (abortController?.signal.aborted) return;

      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks (matches server)
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      // Initialize upload session
      const { sessionId } = await initUploadMutation.mutateAsync({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        totalSize: file.size,
      });

      updateUploadSessionId(uploadId, sessionId);

      const startChunk = resumeFromChunk || 0;

      // Upload chunks
      for (let i = startChunk; i < totalChunks; i++) {
        // Check if cancelled or paused
        if (abortController?.signal.aborted) return;

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
            await uploadChunkMutation.mutateAsync({
              sessionId,
              chunkIndex: i,
              chunkData: base64,
              totalChunks,
            });
            break;
          } catch (error: any) {
            retries++;
            if (retries >= maxRetries) {
              throw new Error(`Failed to upload chunk ${i} after ${maxRetries} retries: ${error.message}`);
            }
            console.warn(`[FileUpload] Chunk ${i} attempt ${retries} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1500 * Math.pow(2, retries)));
          }
        }

        // Update progress
        const progress = ((i + 1) / totalChunks) * 100;
        const uploadedBytes = Math.min((i + 1) * CHUNK_SIZE, file.size);
        updateUploadProgress(uploadId, progress, uploadedBytes);
        updatePausedChunk(uploadId, i + 1);
      }

      // Finalize upload
      const result = await finalizeUploadMutation.mutateAsync({ sessionId });

      updateUploadStatus(uploadId, 'completed', {
        fileId: result.fileId,
        url: result.url,
      });

    } catch (error: any) {
      // Don't show error if cancelled
      if (abortController?.signal.aborted) return;

      console.error("[FileUpload] Upload error:", error);
      updateUploadStatus(uploadId, 'error', undefined, error.message || "Upload failed");
    }
  }, [
    getAbortController,
    initUploadMutation,
    uploadChunkMutation,
    finalizeUploadMutation,
    updateUploadSessionId,
    updateUploadProgress,
    updateUploadStatus,
    updatePausedChunk,
  ]);

  // Register file processor on mount
  useEffect(() => {
    registerProcessor('file', processFileUpload);
    return () => {
      unregisterProcessor('file');
    };
  }, [registerProcessor, unregisterProcessor, processFileUpload]);

  // This component doesn't render anything
  return null;
}
