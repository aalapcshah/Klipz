/**
 * Frame extraction service for video files.
 *
 * Uses FFmpeg to extract key frames at regular intervals from a video,
 * producing JPEG images that can be sent to the LLM vision API for captioning.
 *
 * This approach handles videos of any size (up to 10GB+) because FFmpeg
 * streams the video and only decodes the frames it needs, rather than
 * loading the entire file into memory.
 *
 * Typical output:
 * - 57s video at 5s intervals → ~12 frames, ~50-200KB each
 * - 10min video at 5s intervals → ~120 frames, batched into groups
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { nanoid } from "nanoid";
import { storagePut } from "../storage";
import { getFFmpegPath } from "../lib/ffmpegPaths";

export interface ExtractedFrame {
  timestamp: number;     // Time in seconds from start of video
  localPath: string;     // Local temp file path
  sizeBytes: number;     // File size in bytes
}

export interface FrameExtractionResult {
  frames: ExtractedFrame[];
  videoDuration: number;  // Total video duration in seconds
  outputDir: string;      // Temp directory containing frames
}

export interface FrameExtractionError {
  error: string;
  code: "DOWNLOAD_FAILED" | "EXTRACTION_FAILED" | "TIMEOUT" | "NO_VIDEO_STREAM";
  details?: string;
}

/**
 * Extract frames from a video at regular intervals using FFmpeg.
 *
 * Uses the `select` filter to pick frames at the specified interval,
 * which is much faster than seeking because FFmpeg only decodes the
 * frames it needs.
 *
 * @param videoUrl - Public URL of the video file
 * @param options - Configuration for frame extraction
 * @returns Array of extracted frames with timestamps, or error
 */
export async function extractFramesFromVideo(
  videoUrl: string,
  options?: {
    intervalSeconds?: number;   // Default: 5 seconds
    maxFrames?: number;         // Default: 60 (5 minutes of video at 5s intervals)
    quality?: number;           // JPEG quality 1-31 (lower = better). Default: 5
    maxWidth?: number;          // Max frame width. Default: 1280
    timeoutSeconds?: number;    // Default: 300 (5 minutes)
    onProgress?: (message: string) => void;
  }
): Promise<FrameExtractionResult | FrameExtractionError> {
  const interval = options?.intervalSeconds || 5;
  const maxFrames = options?.maxFrames || 60;
  const quality = options?.quality || 5;
  const maxWidth = options?.maxWidth || 1280;
  const timeoutMs = (options?.timeoutSeconds || 300) * 1000;

  const tempDir = path.join(os.tmpdir(), `klipz-frames-${nanoid(10)}`);
  await fs.mkdir(tempDir, { recursive: true });

  options?.onProgress?.("Extracting video frames...");

  return new Promise((resolve) => {
    // Use the fps filter to extract 1 frame every N seconds,
    // scale down to maxWidth, and output as JPEG
    const args = [
      "-i", videoUrl,
      "-vf", `fps=1/${interval},scale='min(${maxWidth},iw)':-1`,
      "-qscale:v", quality.toString(),
      "-frames:v", maxFrames.toString(),
      "-y",
      path.join(tempDir, "frame_%04d.jpg"),
    ];

    console.log(`[FrameExtraction] Starting FFmpeg: ffmpeg ${args.slice(0, 6).join(" ")}... → ${tempDir}`);
    const startTime = Date.now();

    const ffmpeg = spawn(getFFmpegPath(), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let videoDuration = 0;

    ffmpeg.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;

      // Parse duration from FFmpeg output
      const durationMatch = chunk.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1]);
        const minutes = parseInt(durationMatch[2]);
        const seconds = parseFloat(durationMatch[3]);
        videoDuration = hours * 3600 + minutes * 60 + seconds;
        options?.onProgress?.(`Extracting frames from ${Math.round(videoDuration)}s video...`);
      }

      // Parse progress
      const timeMatch = chunk.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch && videoDuration > 0) {
        const h = parseInt(timeMatch[1]);
        const m = parseInt(timeMatch[2]);
        const s = parseFloat(timeMatch[3]);
        const currentTime = h * 3600 + m * 60 + s;
        const pct = Math.min(99, Math.round((currentTime / videoDuration) * 100));
        options?.onProgress?.(`Extracting frames... ${pct}%`);
      }
    });

    // Timeout handler
    const timeout = setTimeout(() => {
      ffmpeg.kill("SIGKILL");
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      resolve({
        error: "Frame extraction timed out",
        code: "TIMEOUT",
        details: `Extraction exceeded ${options?.timeoutSeconds || 300}s timeout`,
      });
    }, timeoutMs);

    ffmpeg.on("close", async (code) => {
      clearTimeout(timeout);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (code !== 0) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

        if (stderr.includes("does not contain any stream") || stderr.includes("no video")) {
          resolve({
            error: "Video has no video stream",
            code: "NO_VIDEO_STREAM",
            details: "The file does not contain a video track",
          });
          return;
        }

        console.error(`[FrameExtraction] FFmpeg failed with code ${code} (${elapsed}s): ${stderr.substring(stderr.length - 500)}`);
        resolve({
          error: "Frame extraction failed",
          code: "EXTRACTION_FAILED",
          details: `FFmpeg exited with code ${code}`,
        });
        return;
      }

      // Read all extracted frames
      try {
        const frameFiles = (await fs.readdir(tempDir))
          .filter((f) => f.startsWith("frame_") && f.endsWith(".jpg"))
          .sort();

        if (frameFiles.length === 0) {
          await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
          resolve({
            error: "No frames extracted from video",
            code: "EXTRACTION_FAILED",
            details: "FFmpeg produced no output frames",
          });
          return;
        }

        const frames: ExtractedFrame[] = [];
        for (let i = 0; i < frameFiles.length; i++) {
          const filePath = path.join(tempDir, frameFiles[i]);
          const stats = await fs.stat(filePath);
          frames.push({
            timestamp: i * interval,
            localPath: filePath,
            sizeBytes: stats.size,
          });
        }

        const totalSizeMB = frames.reduce((sum, f) => sum + f.sizeBytes, 0) / (1024 * 1024);
        console.log(`[FrameExtraction] Extracted ${frames.length} frames (${totalSizeMB.toFixed(2)}MB total) in ${elapsed}s`);
        options?.onProgress?.(`Extracted ${frames.length} frames`);

        resolve({
          frames,
          videoDuration: videoDuration || frames.length * interval,
          outputDir: tempDir,
        });
      } catch (err) {
        console.error(`[FrameExtraction] Failed to read output frames:`, err);
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        resolve({
          error: "Frame extraction failed",
          code: "EXTRACTION_FAILED",
          details: "Failed to read extracted frames",
        });
      }
    });

    ffmpeg.on("error", (err) => {
      clearTimeout(timeout);
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      console.error(`[FrameExtraction] FFmpeg spawn error:`, err);
      resolve({
        error: "Frame extraction failed",
        code: "EXTRACTION_FAILED",
        details: err.message,
      });
    });
  });
}

/**
 * Upload extracted frames to S3 and return their public URLs.
 * Uploads frames in parallel for speed.
 *
 * @param frames - Array of extracted frames
 * @param fileId - The file ID (used for S3 key prefix)
 * @returns Array of { timestamp, url } objects
 */
export async function uploadFramesToS3(
  frames: ExtractedFrame[],
  fileId: number
): Promise<Array<{ timestamp: number; url: string }>> {
  const uploadPromises = frames.map(async (frame) => {
    const buffer = await fs.readFile(frame.localPath);
    const key = `temp-frames/${fileId}/${nanoid(8)}-${Math.round(frame.timestamp)}s.jpg`;
    const { url } = await storagePut(key, buffer, "image/jpeg");
    return { timestamp: frame.timestamp, url };
  });

  return Promise.all(uploadPromises);
}

/**
 * Clean up temporary frame files after processing.
 */
export async function cleanupFrames(outputDir: string): Promise<void> {
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
    console.log(`[FrameExtraction] Cleaned up temp dir: ${outputDir}`);
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Determine the best captioning strategy based on file size.
 *
 * @param fileSizeBytes - Size of the video file in bytes (null if unknown)
 * @returns Strategy recommendation
 */
export function getCaptioningStrategy(fileSizeBytes: number | null): {
  method: "llm_direct" | "frame_extraction";
  reason: string;
} {
  if (!fileSizeBytes || fileSizeBytes === 0) {
    // Unknown size — use frame extraction to be safe
    return {
      method: "frame_extraction",
      reason: "File size unknown, using frame extraction for safety",
    };
  }

  const sizeMB = fileSizeBytes / (1024 * 1024);

  // LLM vision API can handle small videos directly (under ~20MB)
  if (sizeMB <= 20) {
    return {
      method: "llm_direct",
      reason: `File is ${sizeMB.toFixed(1)}MB (≤20MB), sending directly to LLM vision`,
    };
  }

  return {
    method: "frame_extraction",
    reason: `File is ${sizeMB.toFixed(1)}MB (>20MB), extracting frames first`,
  };
}
