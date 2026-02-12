import { useEffect, useCallback, useRef } from "react";
import { useUploadManager } from "@/contexts/UploadManagerContext";
import { trpcCall } from "@/lib/trpcCall";

/**
 * FileUploadProcessor - Registers a 'file' type upload processor with the UploadManager.
 * This handles file uploads via the GlobalDropZone drag-and-drop flow.
 * Must be rendered inside UploadManagerProvider.
 *
 * Uses the resumable upload system which stores chunks in S3 (not server memory).
 * This prevents OOM errors and timeouts during finalization for large files.
 * For files >50MB, uses chunk-streaming (no re-assembly needed).
 *
 * Uses direct fetch() calls (via trpcCall) instead of React Query mutations
 * so the upload loop is independent of React component lifecycle.
 */

// Detect mobile for smaller chunk sizes (base64 encoding inflates ~33%, so 2MB → ~2.7MB payload)
const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const CHUNK_SIZE = isMobile ? 2 * 1024 * 1024 : 5 * 1024 * 1024; // 2MB on mobile, 5MB on desktop

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

  // Poll for background finalization completion (for large files)
  const pollFinalizeStatus = useCallback(async (
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
        return {
          fileId: 0, // Will be resolved by the file list refresh
          url: status.url || '',
        };
      }

      if (status.status === 'failed') {
        throw new Error(status.message || 'File assembly failed on server');
      }

      // Still finalizing, continue polling
      console.log(`[FileUpload] Still assembling ${sessionToken}...`);
    }

    throw new Error('File assembly timed out after 30 minutes');
  }, []);

  // Stable processFileUpload function that never changes reference
  const processFileUpload = useCallback(async (
    uploadId: string,
    file: File,
    resumeFromChunk?: number,
    existingSessionId?: string,
    metadata?: { title?: string; description?: string; quality?: string },
  ) => {
    const { getAbortController: getAbort, updateUploadProgress: updateProgress, updateUploadStatus: updateStatus, updateUploadSessionId: updateSessionId, updatePausedChunk: updateChunk } = callbacksRef.current;
    const abortController = getAbort(uploadId);

    try {
      // Check if cancelled
      if (abortController?.signal.aborted) return;

      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      console.log(`[FileUpload] Starting upload for ${file.name} (${file.size} bytes, ${totalChunks} chunks) using resumable upload`);

      let sessionToken: string;
      let startChunk = 0;

      // Try to resume from existing session
      if (existingSessionId) {
        console.log(`[FileUpload] Checking existing resumable session ${existingSessionId} for resume...`);
        try {
          const sessionStatus = await trpcCall<{
            sessionToken: string;
            status: string;
            totalChunks: number;
            uploadedChunks: number;
            uploadedBytes: number;
            chunks: Array<{ index: number; status: string }>;
          }>(
            'resumableUpload.getSessionStatus',
            { sessionToken: existingSessionId },
            'query'
          );

          if (sessionStatus.status === 'active' || sessionStatus.status === 'paused') {
            sessionToken = sessionStatus.sessionToken;
            // Find the first chunk that hasn't been uploaded
            const uploadedSet = new Set(
              sessionStatus.chunks
                .filter((c: any) => c.status === 'uploaded' || c.status === 'verified')
                .map((c: any) => c.index)
            );
            startChunk = 0;
            for (let i = 0; i < totalChunks; i++) {
              if (!uploadedSet.has(i)) {
                startChunk = i;
                break;
              }
              if (i === totalChunks - 1) {
                startChunk = totalChunks; // All chunks uploaded
              }
            }
            console.log(`[FileUpload] Resuming session ${sessionToken}: starting from chunk ${startChunk}/${totalChunks}`);

            // Update progress to reflect already-uploaded chunks
            if (startChunk > 0) {
              const progress = (startChunk / totalChunks) * 100;
              const uploadedBytes = Math.min(startChunk * CHUNK_SIZE, file.size);
              updateProgress(uploadId, progress, uploadedBytes);
            }
          } else {
            // Session exists but can't resume - start fresh
            console.log(`[FileUpload] Session ${existingSessionId} status is ${sessionStatus.status}. Starting fresh.`);
            // Detect upload type based on MIME type - videos should be created as video records
            const detectedMimeType = file.type || "application/octet-stream";
            const detectedUploadType = detectedMimeType.startsWith('video/') ? 'video' as const : 'file' as const;

            const createResult = await trpcCall<{ sessionToken: string; totalChunks: number }>(
              'resumableUpload.createSession',
              {
                filename: file.name,
                fileSize: file.size,
                mimeType: detectedMimeType,
                uploadType: detectedUploadType,
                chunkSize: CHUNK_SIZE,
                ...(metadata?.title || metadata?.description ? { metadata: { title: metadata.title, description: metadata.description } } : {}),
              }
            );
            sessionToken = createResult.sessionToken;
            updateSessionId(uploadId, sessionToken);
          }
        } catch (err) {
          // Failed to check session - start fresh
          console.warn(`[FileUpload] Failed to check session status, starting fresh:`, err);
          const detectedMimeType = file.type || "application/octet-stream";
          const detectedUploadType = detectedMimeType.startsWith('video/') ? 'video' as const : 'file' as const;

          const createResult = await trpcCall<{ sessionToken: string; totalChunks: number }>(
            'resumableUpload.createSession',
            {
              filename: file.name,
              fileSize: file.size,
              mimeType: detectedMimeType,
              uploadType: detectedUploadType,
              chunkSize: CHUNK_SIZE,
              ...(metadata?.title || metadata?.description ? { metadata: { title: metadata.title, description: metadata.description } } : {}),
            }
          );
          sessionToken = createResult.sessionToken;
          updateSessionId(uploadId, sessionToken);
        }
      } else {
        // No existing session - create new one via resumable upload
        // Detect upload type based on MIME type - videos should be created as video records
        const detectedMimeType = file.type || "application/octet-stream";
        const detectedUploadType = detectedMimeType.startsWith('video/') ? 'video' as const : 'file' as const;

        const createResult = await trpcCall<{ sessionToken: string; totalChunks: number }>(
          'resumableUpload.createSession',
          {
            filename: file.name,
            fileSize: file.size,
            mimeType: detectedMimeType,
            uploadType: detectedUploadType,
            chunkSize: CHUNK_SIZE,
            ...(metadata?.title || metadata?.description ? { metadata: { title: metadata.title, description: metadata.description } } : {}),
          }
        );
        sessionToken = createResult.sessionToken;
        console.log(`[FileUpload] New resumable session created: ${sessionToken}`);
        updateSessionId(uploadId, sessionToken);
      }

      // Upload chunks sequentially (reliable on slow/mobile connections)
      for (let i = startChunk; i < totalChunks; i++) {
        if (abortController?.signal.aborted) {
          console.log(`[FileUpload] Upload cancelled at chunk ${i}`);
          return;
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        let retries = 0;
        const maxChunkRetries = isMobile ? 8 : 5; // More retries on mobile
        const chunkTimeoutMs = isMobile ? 120_000 : 180_000; // 2min mobile, 3min desktop

        while (retries < maxChunkRetries) {
          if (abortController?.signal.aborted) return;

          try {
            const chunkData = await readChunkAsBase64(file, start, end);

            await trpcCall<{
              success: boolean;
              uploadedChunks: number;
              totalChunks: number;
              uploadedBytes: number;
            }>('resumableUpload.uploadChunk', {
              sessionToken,
              chunkIndex: i,
              chunkData,
            }, 'mutation', {
              timeoutMs: chunkTimeoutMs,
              signal: abortController?.signal,
            });
            break; // Success
          } catch (error: any) {
            if (abortController?.signal.aborted) return;
            retries++;
            if (retries >= maxChunkRetries) {
              updateChunk(uploadId, i);
              throw new Error(`Failed to upload chunk ${i + 1}/${totalChunks} after ${maxChunkRetries} retries: ${error.message}`);
            }
            // Exponential backoff: 2s, 4s, 8s, 16s, 32s, capped at 60s
            const backoffDelay = Math.min(2000 * Math.pow(2, retries - 1), 60_000);
            console.warn(`[FileUpload] Chunk ${i + 1}/${totalChunks} attempt ${retries} failed, retrying in ${backoffDelay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          }
        }

        // Update progress after each chunk
        const progress = ((i + 1) / totalChunks) * 100;
        const uploadedBytes = Math.min((i + 1) * CHUNK_SIZE, file.size);
        updateProgress(uploadId, progress, uploadedBytes);
        updateChunk(uploadId, i + 1);
      }

      console.log(`[FileUpload] All chunks uploaded, finalizing via resumable upload...`);

      // Finalize upload via resumable upload API
      const finalizeResult = await trpcCall<{
        success: boolean;
        async?: boolean;
        fileId?: number;
        videoId?: number;
        url?: string;
        fileKey?: string;
        message?: string;
      }>('resumableUpload.finalizeUpload', {
        sessionToken,
      }, 'mutation', {
        timeoutMs: 300_000, // 5 minute timeout for sync finalization
        signal: abortController?.signal,
      });

      let completedResult: { fileId: number; videoId?: number; url: string };

      if (finalizeResult.async) {
        // Large file: server is assembling in background, poll for completion
        console.log(`[FileUpload] Background assembly started, polling for completion...`);
        completedResult = await pollFinalizeStatus(
          sessionToken,
          abortController?.signal || new AbortController().signal
        );
      } else {
        // Small file or chunk-streaming: completed synchronously
        completedResult = {
          fileId: finalizeResult.fileId!,
          videoId: finalizeResult.videoId,
          url: finalizeResult.url!,
        };
      }

      console.log(`[FileUpload] Upload complete! File ID: ${completedResult.fileId}`);

      updateStatus(uploadId, 'completed', {
        fileId: completedResult.fileId,
        url: completedResult.url,
      });

    } catch (error: any) {
      // Don't show error if cancelled
      if (abortController?.signal.aborted) return;

      console.error("[FileUpload] Upload error:", error);
      updateStatus(uploadId, 'error', undefined, error.message || "Upload failed");
    }
  }, [readChunkAsBase64, pollFinalizeStatus]); // Minimal dependencies - uses refs for all callbacks

  // Register file processor on mount - stable reference, only registers once
  useEffect(() => {
    console.log('[FileUploadProcessor] Registering file upload processor (resumable)');
    registerProcessor('file', processFileUpload);
    return () => {
      console.log('[FileUploadProcessor] Unregistering file upload processor');
      unregisterProcessor('file');
    };
  }, [registerProcessor, unregisterProcessor, processFileUpload]);

  // This component doesn't render anything
  return null;
}
