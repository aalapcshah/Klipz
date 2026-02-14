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
 *    using the request origin so external services can access it
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

export interface ResolveOptions {
  /**
   * The origin of the incoming request (e.g., "https://klipz.manus.space").
   * Used to construct public URLs for streaming endpoints when the file
   * hasn't been assembled to S3 yet.
   */
  origin?: string;
}

/**
 * Resolve a file record's URL to a publicly accessible URL.
 *
 * @param file - Object with `url`, `fileKey`, and optionally `id` fields (from files table)
 * @param options - Optional configuration including the request origin
 * @returns A publicly accessible URL string
 */
export async function resolveFileUrl(
  file: FileUrlResolvable,
  options?: ResolveOptions
): Promise<string> {
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
    // Instead, construct a public URL using the request origin.
    if (file.url.startsWith("/api/files/stream/")) {
      const origin = options?.origin || getDeployedDomain();
      if (origin) {
        const publicUrl = `${origin.replace(/\/$/, "")}${file.url}`;
        console.log(`[resolveFileUrl] Using origin for streaming URL: ${publicUrl.substring(0, 100)}...`);
        return publicUrl;
      }

      // If no origin is available, we can't resolve this URL
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
 * Reads from environment variables to determine the correct domain.
 */
function getDeployedDomain(): string | null {
  // 1. Check DEPLOY_URL / APP_URL if explicitly set
  if (process.env.DEPLOY_URL) return process.env.DEPLOY_URL.replace(/\/$/, "");
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");

  // 2. Try to extract from the Stripe webhook URL which contains the actual deployed domain
  //    e.g., "https://metaclips-saozcd7r.manus.space/api/stripe/webhook"
  const webhookUrl = process.env.STRIPE_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const url = new URL(webhookUrl);
      return url.origin;
    } catch {
      // ignore
    }
  }

  // 3. Try to read from the analytics endpoint which is on the same domain
  const analyticsEndpoint = process.env.VITE_ANALYTICS_ENDPOINT;
  if (analyticsEndpoint) {
    try {
      const url = new URL(analyticsEndpoint);
      return url.origin;
    } catch {
      // ignore
    }
  }

  // 4. Try to read from OAUTH_SERVER_URL or other known URLs
  //    The deployed domain for Manus apps follows the pattern: {appname}-{hash}.manus.space
  //    We can derive it from the VITE_APP_ID if available
  const appTitle = process.env.VITE_APP_TITLE;
  if (appTitle) {
    // For Manus deployments, the domain is typically {lowercase-title}-{hash}.manus.space
    // But we can't reliably construct this, so fall through
  }

  // 5. Hardcoded fallback for this specific deployment
  //    klipz.manus.space is the custom domain, metaclips-saozcd7r.manus.space is the auto-generated one
  return "https://klipz.manus.space";
}
