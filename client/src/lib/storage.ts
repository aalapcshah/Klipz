import { trpc } from "./trpc";

/**
 * Client-side storage helper for uploading files to S3 via tRPC
 * Uses base64 encoding for simplicity and compatibility
 */
export async function uploadFileToStorage(
  file: File | Blob,
  filename: string,
  trpcClient: ReturnType<typeof trpc.useUtils>
): Promise<{ url: string; fileKey: string }> {
  try {
    console.log('[Upload] Starting upload:', filename, 'Size:', file.size, 'bytes');
    
    // Check file size (limit to 10MB for base64 encoding)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error(`File too large. Maximum size is ${maxSize / 1024 / 1024}MB`);
    }
    
    // Convert file to base64
    console.log('[Upload] Converting to base64...');
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ""
      )
    );
    console.log('[Upload] Base64 conversion complete. Length:', base64.length);

    // Upload via tRPC
    console.log('[Upload] Sending to server...');
    const result = await trpcClient.client.storage.uploadFile.mutate({
      filename,
      contentType: file.type || "application/octet-stream",
      base64Data: base64,
    });
    
    console.log('[Upload] Upload successful!', result);
    return result;
  } catch (error) {
    console.error("[Upload] Error:", error);
    if (error instanceof Error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
    throw new Error('Upload failed: Unknown error');
  }
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
