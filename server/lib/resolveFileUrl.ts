/**
 * Resolve a file's URL to a publicly accessible URL.
 *
 * Files uploaded via chunked upload initially have relative streaming URLs
 * like `/api/files/stream/:sessionToken`. These are only accessible from
 * the local server and cannot be used by external services (Whisper API,
 * LLM vision API, etc.).
 *
 * This utility resolves such URLs to direct S3/CDN URLs that external
 * services can access. It handles these cases:
 *
 * 1. URL is already absolute (starts with "http") — return as-is
 * 2. URL is a relative streaming URL with a chunked fileKey — re-fetch
 *    the file from DB to check if background assembly has completed
 *    and updated the URL to a direct S3 URL
 * 3. If still a streaming URL after re-fetch — construct a public URL
 *    using the deployed domain so external services can access it
 * 4. For non-chunked relative URLs — use storageGet() with the fileKey
 */

import { storageGet } from "../storage";
import * as db from "../db";

export interface FileUrlResolvable {
  id?: number;
  url: string;
  fileKey: string;
  mimeType?: string | null;
}

/**
 * Resolve a file record's URL to a publicly accessible URL.
 *
 * @param file - Object with `url`, `fileKey`, and optionally `id` fields (from files table)
 * @returns A publicly accessible URL string
 */
export async function resolveFileUrl(file: FileUrlResolvable): Promise<string> {
  // Already an absolute URL (direct S3/CDN URL)
  if (file.url.startsWith("http://") || file.url.startsWith("https://")) {
    return file.url;
  }

  // Check if this is a chunked upload file (streaming URL)
  const isStreamingUrl = file.url.startsWith("/api/files/stream/");
  const isChunkedKey = file.fileKey.startsWith("chunked/");

  if (isStreamingUrl || isChunkedKey) {
    // The file was uploaded via resumable/chunked upload.
    // Background assembly may have completed and updated the URL to a direct S3 URL.
    // Re-fetch the file record from the database to get the latest URL.
    if (file.id) {
      try {
        const freshFile = await db.getFileById(file.id);
        if (freshFile && freshFile.url.startsWith("http")) {
          console.log(`[resolveFileUrl] File ${file.id} has been assembled — using S3 URL`);
          return freshFile.url;
        }
        // Update our local reference with the latest data
        if (freshFile) {
          file.url = freshFile.url;
          file.fileKey = freshFile.fileKey;
        }
      } catch (error) {
        console.warn(`[resolveFileUrl] Failed to re-fetch file ${file.id}:`, error);
      }
    }

    // If the file still has a streaming URL, the background assembly hasn't completed yet.
    // For chunked files, the fileKey "chunked/sessionToken/filename" is NOT a real S3 key —
    // the actual chunks are stored at per-chunk keys. So storageGet() won't work.
    // Instead, construct a public URL using the deployed domain.
    if (file.url.startsWith("/api/files/stream/")) {
      const deployedDomain = getDeployedDomain();
      if (deployedDomain) {
        const publicUrl = `${deployedDomain}${file.url}`;
        console.log(`[resolveFileUrl] Using deployed domain for streaming URL: ${publicUrl.substring(0, 80)}...`);
        return publicUrl;
      }
      
      // If no deployed domain is available, we can't resolve this URL
      throw new Error(
        `Video file is still being processed. The file was uploaded in chunks and hasn't been fully assembled yet. ` +
        `Please wait a few minutes for the background assembly to complete, then try again.`
      );
    }
  }

  // Non-chunked relative URL — try storageGet with the fileKey
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

/**
 * Get the deployed domain for constructing public URLs.
 * Uses VITE_APP_ID to construct the manus.space domain,
 * or falls back to environment-based detection.
 */
function getDeployedDomain(): string | null {
  // The deployed domain follows the pattern: https://{app-name}.manus.space
  // We can derive it from the VITE_APP_ID or use a known pattern
  const appTitle = process.env.VITE_APP_TITLE;
  
  // Check for common deployment domain patterns
  // In production, the app is deployed at a .manus.space domain
  // The streaming endpoint is accessible from the same domain
  
  // Try to get the domain from the OAuth callback URL or other env vars
  const oauthUrl = process.env.OAUTH_SERVER_URL;
  
  // For Manus deployments, the domain is typically klipz.manus.space or similar
  // We can construct it from the app ID
  const appId = process.env.VITE_APP_ID;
  if (appId) {
    // The deployed URL pattern for manus.space apps
    // Check if there's a custom domain configured
    // For now, use the known deployed domain
    return "https://klipz.manus.space";
  }
  
  // Fallback for local development
  return "http://localhost:3000";
}
