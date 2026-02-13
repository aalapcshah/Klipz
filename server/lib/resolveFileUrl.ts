/**
 * Resolve a file's URL to a publicly accessible URL.
 *
 * Files uploaded via chunked upload initially have relative streaming URLs
 * like `/api/files/stream/:sessionToken`. These are only accessible from
 * the local server and cannot be used by external services (Whisper API,
 * LLM vision API, etc.).
 *
 * This utility resolves such URLs to direct S3/CDN URLs that external
 * services can access. It handles three cases:
 *
 * 1. URL is already absolute (starts with "http") — return as-is
 * 2. URL is a relative streaming URL — use storageGet() with the fileKey
 *    to get a presigned S3 download URL
 * 3. Fallback — prepend the deployed domain to make it absolute
 */

import { storageGet } from "../storage";

export interface FileUrlResolvable {
  url: string;
  fileKey: string;
}

/**
 * Resolve a file record's URL to a publicly accessible URL.
 *
 * @param file - Object with `url` and `fileKey` fields (from files table)
 * @returns A publicly accessible URL string
 */
export async function resolveFileUrl(file: FileUrlResolvable): Promise<string> {
  // Already an absolute URL (direct S3/CDN URL)
  if (file.url.startsWith("http://") || file.url.startsWith("https://")) {
    return file.url;
  }

  // Relative streaming URL — get a presigned S3 URL from the fileKey
  if (file.fileKey) {
    try {
      const { url } = await storageGet(file.fileKey);
      if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
        return url;
      }
    } catch (error) {
      console.warn(`[resolveFileUrl] Failed to get S3 URL for key "${file.fileKey}":`, error);
    }
  }

  // Last resort: this shouldn't normally happen, but log a warning
  console.warn(`[resolveFileUrl] Could not resolve URL for file with key "${file.fileKey}" and url "${file.url}"`);
  throw new Error(`Cannot resolve file URL to a publicly accessible address. File key: ${file.fileKey}`);
}
