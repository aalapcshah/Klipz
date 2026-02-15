/**
 * Video Thumbnail Generation Module
 * 
 * Extracts a frame from a video file (via URL) using FFmpeg and uploads
 * the thumbnail to S3. Works with both direct S3 URLs and local files.
 * 
 * FFmpeg downloads the video, seeks to a specific timestamp, and extracts
 * a single frame as a JPEG image.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { storagePut } from "../storage";
import { getFFmpegPath } from "./ffmpegPaths";

const execFileAsync = promisify(execFile);

/**
 * Generate a thumbnail from a video URL.
 * 
 * @param videoUrl - Direct URL to the video file (S3/CloudFront URL)
 * @param options - Configuration options
 * @returns The S3 URL and key of the uploaded thumbnail, or null if generation failed
 */
export async function generateVideoThumbnail(
  videoUrl: string,
  options: {
    userId: number;
    filename: string;
    /** Timestamp in seconds to extract the frame from (default: 1) */
    seekTime?: number;
    /** Output width in pixels (default: 640, height auto-scaled) */
    width?: number;
    /** JPEG quality 1-31 where 2 is best (default: 5) */
    quality?: number;
  }
): Promise<{ url: string; key: string } | null> {
  const {
    userId,
    filename,
    seekTime = 1,
    width = 640,
    quality = 5,
  } = options;

  const tmpDir = os.tmpdir();
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const outputFile = path.join(tmpDir, `thumb-${timestamp}-${randomSuffix}.jpg`);

  try {
    console.log(`[VideoThumbnail] Generating thumbnail for ${filename} from ${videoUrl.substring(0, 80)}...`);

    // Use FFmpeg to extract a single frame
    // -ss before -i enables fast seeking (input seeking)
    // -vframes 1 extracts exactly one frame
    // -vf scale limits the width while maintaining aspect ratio
    // -q:v controls JPEG quality (2=best, 31=worst)
    await execFileAsync(getFFmpegPath(), [
      "-ss", String(seekTime),
      "-i", videoUrl,
      "-vframes", "1",
      "-vf", `scale=${width}:-1`,
      "-q:v", String(quality),
      "-y", // Overwrite output file
      outputFile,
    ], {
      timeout: 30000, // 30 second timeout
    });

    // Check if the output file was created
    if (!fs.existsSync(outputFile)) {
      console.error(`[VideoThumbnail] FFmpeg did not produce output file for ${filename}`);
      return null;
    }

    const stats = fs.statSync(outputFile);
    if (stats.size === 0) {
      console.error(`[VideoThumbnail] FFmpeg produced empty output file for ${filename}`);
      return null;
    }

    console.log(`[VideoThumbnail] Frame extracted (${(stats.size / 1024).toFixed(1)}KB), uploading to S3...`);

    // Read the thumbnail and upload to S3
    const thumbnailBuffer = fs.readFileSync(outputFile);
    const baseName = path.basename(filename, path.extname(filename));
    const thumbnailKey = `user-${userId}/thumbnails/${timestamp}-${randomSuffix}-${baseName}.jpg`;

    const result = await storagePut(thumbnailKey, thumbnailBuffer, "image/jpeg");

    console.log(`[VideoThumbnail] ✅ Thumbnail uploaded for ${filename}: ${result.url.substring(0, 80)}...`);

    return { url: result.url, key: thumbnailKey };

  } catch (error: any) {
    // Don't fail hard — thumbnail generation is optional
    console.error(`[VideoThumbnail] ❌ Failed to generate thumbnail for ${filename}:`, error.message || error);
    return null;

  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    } catch {}
  }
}
