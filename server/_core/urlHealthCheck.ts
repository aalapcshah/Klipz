import { getDb, updateVideo, updateFile } from "../db";
import { resolveFileUrl } from "../lib/resolveFileUrl";

/**
 * Check and re-resolve stale/broken video URLs
 * Runs periodically to ensure all video URLs are fresh and playable
 */
export async function checkAndResolveVideoUrls(): Promise<{
  checked: number;
  resolved: number;
  failed: number;
}> {
  let checked = 0;
  let resolved = 0;
  let failed = 0;

  try {
    // Get all videos (we'll check a batch at a time)
    const database = await getDb();
    if (!database) {
      console.log("[URLHealthCheck] Database not available, skipping");
      return { checked: 0, resolved: 0, failed: 0 };
    }

    const { videos } = await import("../../drizzle/schema");
    const allVideos = await database
      .select({
        id: videos.id,
        url: videos.url,
        fileKey: videos.fileKey,
        transcodedUrl: videos.transcodedUrl,
        transcodedKey: videos.transcodedKey,
      })
      .from(videos)
      .limit(100); // Process in batches of 100

    for (const video of allVideos) {
      checked++;
      try {
        let needsUpdate = false;
        const updates: Record<string, string> = {};

        // Check if the main URL is accessible
        const isMainUrlOk = await checkUrlAccessible(video.url);
        if (!isMainUrlOk && video.fileKey) {
          // Try to resolve a fresh URL from the file key
          const freshUrl = await resolveFileUrl({
            url: video.url,
            fileKey: video.fileKey,
          });
          if (freshUrl && freshUrl !== video.url) {
            updates.url = freshUrl;
            needsUpdate = true;
          }
        }

        // Check transcoded URL if it exists
        if (video.transcodedUrl) {
          const isTranscodedOk = await checkUrlAccessible(video.transcodedUrl);
          if (!isTranscodedOk && video.transcodedKey) {
            const freshTranscodedUrl = await resolveFileUrl({
              url: video.transcodedUrl,
              fileKey: video.transcodedKey,
            });
            if (freshTranscodedUrl && freshTranscodedUrl !== video.transcodedUrl) {
              updates.transcodedUrl = freshTranscodedUrl;
              needsUpdate = true;
            }
          }
        }

        if (needsUpdate) {
          await updateVideo(video.id, updates as any);
          resolved++;
          console.log(
            `[URLHealthCheck] Re-resolved URLs for video ${video.id}`
          );
        }
      } catch (err) {
        failed++;
        console.error(
          `[URLHealthCheck] Failed to check video ${video.id}:`,
          err
        );
      }
    }

    // Also check files table for video files
    const { files } = await import("../../drizzle/schema");
    const { like } = await import("drizzle-orm");
    const videoFiles = await database
      .select({
        id: files.id,
        url: files.url,
        fileKey: files.fileKey,
        mimeType: files.mimeType,
      })
      .from(files)
      .where(like(files.mimeType, "video/%"))
      .limit(100);

    for (const file of videoFiles) {
      checked++;
      try {
        const isOk = await checkUrlAccessible(file.url);
        if (!isOk && file.fileKey) {
          const freshUrl = await resolveFileUrl({
            url: file.url,
            fileKey: file.fileKey,
            mimeType: file.mimeType,
          });
          if (freshUrl && freshUrl !== file.url) {
            await updateFile(file.id, { url: freshUrl });
            resolved++;
            console.log(
              `[URLHealthCheck] Re-resolved URL for file ${file.id}`
            );
          }
        }
      } catch (err) {
        failed++;
        console.error(
          `[URLHealthCheck] Failed to check file ${file.id}:`,
          err
        );
      }
    }
  } catch (err) {
    console.error("[URLHealthCheck] Error in URL health check:", err);
  }

  return { checked, resolved, failed };
}

/**
 * Check if a URL is accessible by making a HEAD request
 * Returns true if the URL responds with 2xx status
 */
async function checkUrlAccessible(url: string): Promise<boolean> {
  if (!url || !url.startsWith("http")) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);
    return response.ok; // 2xx status
  } catch {
    return false;
  }
}
