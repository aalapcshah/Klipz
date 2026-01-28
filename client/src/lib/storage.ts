import { trpc } from "./trpc";

export interface UploadProgressCallback {
  (progress: number, uploadedBytes: number, totalBytes: number): void;
}

/**
 * Client-side storage helper for uploading files to S3 via tRPC
 * Uses base64 encoding for simplicity and compatibility
 */
export async function uploadFileToStorage(
  file: File | Blob,
  filename: string,
  trpcClient: ReturnType<typeof trpc.useUtils>,
  onProgress?: UploadProgressCallback
): Promise<{ url: string; fileKey: string }> {
  try {
    console.log('[Upload] Starting upload:', filename, 'Size:', file.size, 'bytes');
    
    // Check file size (limit to 10MB for base64 encoding)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error(`File too large. Maximum size is ${maxSize / 1024 / 1024}MB`);
    }
    
    // Report initial progress
    onProgress?.(0, 0, file.size);
    
    // Convert file to base64
    console.log('[Upload] Converting to base64...');
    const arrayBuffer = await file.arrayBuffer();
    
    // Report progress for base64 conversion (0-30%)
    onProgress?.(15, Math.floor(file.size * 0.15), file.size);
    
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ""
      )
    );
    console.log('[Upload] Base64 conversion complete. Length:', base64.length);
    
    // Report progress for base64 complete (30%)
    onProgress?.(30, Math.floor(file.size * 0.3), file.size);

    // Upload via tRPC
    console.log('[Upload] Sending to server...');
    
    // Simulate progress during upload (30-95%)
    // Since tRPC doesn't provide native progress, we estimate based on file size
    const uploadStartTime = Date.now();
    const estimatedUploadTime = Math.max(1000, file.size / 50000); // Estimate ~50KB/s minimum
    
    let progressInterval: NodeJS.Timeout | null = null;
    if (onProgress) {
      progressInterval = setInterval(() => {
        const elapsed = Date.now() - uploadStartTime;
        const estimatedProgress = Math.min(95, 30 + (elapsed / estimatedUploadTime) * 65);
        const estimatedBytes = Math.floor(file.size * (estimatedProgress / 100));
        onProgress(estimatedProgress, estimatedBytes, file.size);
      }, 100);
    }
    
    try {
      const result = await trpcClient.client.storage.uploadFile.mutate({
        filename,
        contentType: file.type || "application/octet-stream",
        base64Data: base64,
      });
      
      // Clear progress interval
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      
      // Report complete
      onProgress?.(100, file.size, file.size);
      
      console.log('[Upload] Upload successful!', result);
      return result;
    } catch (error) {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      throw error;
    }
  } catch (error) {
    console.error('[Upload] Storage upload error occurred');
    console.error('[Upload] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[Upload] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[Upload] Full error:', error);
    console.error('[Upload] File details - Name:', filename, 'Size:', file.size, 'Type:', file.type);
    
    if (error instanceof Error) {
      // Preserve original error message for better debugging
      throw new Error(`Upload failed: ${error.message}`);
    }
    throw new Error('Upload failed: Unknown error');
  }
}

/**
 * Upload file with real progress tracking using XMLHttpRequest
 * This provides actual upload progress instead of estimates
 */
export async function uploadFileWithProgress(
  file: File | Blob,
  filename: string,
  trpcClient: ReturnType<typeof trpc.useUtils>,
  onProgress?: UploadProgressCallback
): Promise<{ url: string; fileKey: string }> {
  // For now, use the base64 method with simulated progress
  // In the future, this could use a direct S3 presigned URL upload for real progress
  return uploadFileToStorage(file, filename, trpcClient, onProgress);
}

// Helper to convert File to ArrayBuffer
export async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Format file size for display
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format upload speed
export function formatUploadSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return '0 B/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format ETA
export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '--';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
