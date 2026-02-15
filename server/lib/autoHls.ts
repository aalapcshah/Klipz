/**
 * Auto-HLS Transcoding Helper
 * 
 * Shared helper to automatically queue HLS transcoding for newly created videos.
 * Called from all video creation paths (resumable upload, background assembly,
 * auto-detect from Files, direct video creation).
 * 
 * Features:
 * - Deduplication: tracks in-flight jobs to prevent double-triggering
 * - Graceful failure: logs errors but never throws (fire-and-forget)
 * - Delay: waits a short period before starting to let FFprobe metadata finish first
 * - URL validation: only triggers for videos with valid S3 URLs (not streaming endpoints)
 */

import * as db from "../db";

// Track in-flight HLS jobs to prevent duplicates
const pendingHlsJobs = new Set<number>();

/**
 * Queue HLS transcoding for a video. Fire-and-forget — never throws.
 * 
 * @param videoId - The video's database ID
 * @param sourceUrl - The source video URL (must be an S3 URL, not a streaming endpoint)
 * @param options - Optional metadata for variant selection
 */
export async function queueAutoHls(
  videoId: number,
  sourceUrl: string,
  options?: {
    sourceWidth?: number | null;
    sourceHeight?: number | null;
    filename?: string;
    userId?: number;
    /** Delay in ms before starting transcoding (default: 5000ms to let FFprobe finish) */
    delay?: number;
  }
): Promise<void> {
  // Skip if already queued
  if (pendingHlsJobs.has(videoId)) {
    console.log(`[AutoHLS] Video ${videoId} already queued for HLS, skipping`);
    return;
  }

  // Only trigger for valid S3 URLs (not streaming endpoints or relative paths)
  if (!sourceUrl.startsWith("http")) {
    console.log(`[AutoHLS] Skipping video ${videoId} — URL is not an S3 URL: ${sourceUrl.substring(0, 60)}`);
    return;
  }

  pendingHlsJobs.add(videoId);
  const delay = options?.delay ?? 5000;

  console.log(`[AutoHLS] Queuing HLS transcoding for video ${videoId} (delay: ${delay}ms)`);

  // Delay to let FFprobe metadata extraction finish first
  // This ensures we have accurate resolution data for variant selection
  setTimeout(async () => {
    try {
      // Re-check the video record to get latest metadata (FFprobe may have updated it)
      const video = await db.getVideoById(videoId);
      if (!video) {
        console.log(`[AutoHLS] Video ${videoId} no longer exists, skipping HLS`);
        return;
      }

      // Skip if HLS is already completed or in progress
      if ((video as any).hlsStatus === "completed" || (video as any).hlsStatus === "processing" || (video as any).hlsStatus === "pending") {
        console.log(`[AutoHLS] Video ${videoId} already has HLS status: ${(video as any).hlsStatus}, skipping`);
        return;
      }

      // Use the latest URL from the video record (may have been updated by background assembly)
      const url = video.url.startsWith("http") ? video.url : sourceUrl;
      if (!url.startsWith("http")) {
        console.log(`[AutoHLS] Video ${videoId} still has non-S3 URL, skipping HLS`);
        return;
      }

      // Mark as pending
      await db.updateVideo(videoId, { hlsStatus: "pending" } as any);

      console.log(`[AutoHLS] Starting HLS transcoding for video ${videoId}`);

      const { transcodeToHls } = await import("./hlsTranscode");
      const result = await transcodeToHls(url, videoId, {
        sourceWidth: (video as any).width || options?.sourceWidth || null,
        sourceHeight: (video as any).height || options?.sourceHeight || null,
        filename: video.filename || options?.filename,
        userId: video.userId || options?.userId,
      });

      if (result.success) {
        console.log(`[AutoHLS] ✅ Video ${videoId} HLS transcoding complete: ${result.masterPlaylistUrl}`);
      } else {
        console.error(`[AutoHLS] ❌ Video ${videoId} HLS transcoding failed: ${result.error}`);
      }
    } catch (err) {
      console.error(`[AutoHLS] ❌ Video ${videoId} HLS auto-trigger error:`, err);
      // Mark as failed
      await db.updateVideo(videoId, { hlsStatus: "failed" } as any).catch(() => {});
    } finally {
      pendingHlsJobs.delete(videoId);
    }
  }, delay);
}

/**
 * Check if a video already has HLS queued.
 */
export function isHlsQueued(videoId: number): boolean {
  return pendingHlsJobs.has(videoId);
}
