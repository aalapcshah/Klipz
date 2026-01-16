import { trpc } from "./trpc";

/**
 * Client-side storage helper for uploading files to S3 via tRPC
 */
export async function uploadFileToStorage(
  file: File | Blob,
  filename: string,
  trpcClient: ReturnType<typeof trpc.useUtils>
): Promise<{ url: string; fileKey: string }> {
  // Convert file to base64
  const arrayBuffer = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      ""
    )
  );

  // Upload via tRPC
  const result = await trpcClient.client.storage.uploadFile.mutate({
    filename,
    contentType: file.type,
    base64Data: base64,
  });

  return result;
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
