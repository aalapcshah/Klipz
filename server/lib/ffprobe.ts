/**
 * FFprobe Utility Module
 * 
 * Extracts video metadata (duration, resolution, codec info) from video files.
 * Works with both local file paths and remote URLs (S3, CDN, streaming endpoints).
 * 
 * For streaming/chunked URLs (e.g., /api/files/stream/:token), the function
 * requires a fully-qualified base URL to construct an accessible URL.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { getFFprobePath } from "./ffmpegPaths";

const execAsync = promisify(exec);

export interface VideoMetadata {
  duration: number;       // Duration in seconds (rounded)
  width: number | null;   // Video width in pixels
  height: number | null;  // Video height in pixels
  codec: string | null;   // Video codec name (e.g., "h264", "vp9")
  audioCodec: string | null; // Audio codec name (e.g., "aac", "opus")
  bitrate: number | null; // Overall bitrate in bits/second
  fps: number | null;     // Frames per second
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Extract video metadata using FFprobe.
 * 
 * @param url - Video URL (S3 URL, CDN URL, or local path)
 * @param options - Optional configuration
 * @returns VideoMetadata or null if extraction fails
 */
export async function extractVideoMetadata(
  url: string,
  options?: {
    timeout?: number;
    baseUrl?: string; // Required for relative URLs like /api/files/stream/:token
  }
): Promise<VideoMetadata | null> {
  try {
    // Resolve the URL if it's relative
    let resolvedUrl = url;
    if (url.startsWith('/') && options?.baseUrl) {
      resolvedUrl = `${options.baseUrl.replace(/\/+$/, '')}${url}`;
    } else if (url.startsWith('/')) {
      // Can't probe a relative URL without a base URL
      console.warn(`[FFprobe] Cannot probe relative URL without baseUrl: ${url}`);
      return null;
    }

    const timeout = options?.timeout || DEFAULT_TIMEOUT;

    // Use FFprobe to extract format and stream information in JSON
    const command = [
      getFFprobePath(),
      '-v', 'error',
      '-show_entries', 'format=duration,bit_rate',
      '-show_entries', 'stream=width,height,codec_name,codec_type,r_frame_rate',
      '-of', 'json',
      `"${resolvedUrl}"`,
    ].join(' ');

    const { stdout } = await execAsync(command, {
      timeout,
      maxBuffer: 1024 * 1024, // 1MB buffer
    });

    const data = JSON.parse(stdout);

    // Extract duration from format
    const duration = Math.round(parseFloat(data.format?.duration) || 0);
    const bitrate = parseInt(data.format?.bit_rate) || null;

    // Find video and audio streams
    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');

    // Parse frame rate (FFprobe returns it as a fraction like "30/1" or "30000/1001")
    let fps: number | null = null;
    if (videoStream?.r_frame_rate) {
      const parts = videoStream.r_frame_rate.split('/');
      if (parts.length === 2) {
        const num = parseInt(parts[0]);
        const den = parseInt(parts[1]);
        if (den > 0) {
          fps = Math.round((num / den) * 100) / 100;
        }
      }
    }

    const metadata: VideoMetadata = {
      duration,
      width: videoStream?.width || null,
      height: videoStream?.height || null,
      codec: videoStream?.codec_name || null,
      audioCodec: audioStream?.codec_name || null,
      bitrate,
      fps,
    };

    console.log(
      `[FFprobe] Extracted metadata for ${url.substring(0, 80)}: ` +
      `${duration}s, ${metadata.width}x${metadata.height}, ` +
      `codec=${metadata.codec}, fps=${fps}`
    );

    return metadata;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[FFprobe] Failed to extract metadata for ${url.substring(0, 80)}: ${msg}`);
    return null;
  }
}

/**
 * Extract just the duration from a video file.
 * Lightweight version that only queries duration (faster than full metadata).
 * 
 * @param url - Video URL or local path
 * @param options - Optional configuration
 * @returns Duration in seconds, or 0 if extraction fails
 */
export async function extractVideoDuration(
  url: string,
  options?: {
    timeout?: number;
    baseUrl?: string;
  }
): Promise<number> {
  try {
    let resolvedUrl = url;
    if (url.startsWith('/') && options?.baseUrl) {
      resolvedUrl = `${options.baseUrl.replace(/\/+$/, '')}${url}`;
    } else if (url.startsWith('/')) {
      console.warn(`[FFprobe] Cannot probe relative URL without baseUrl: ${url}`);
      return 0;
    }

    const timeout = options?.timeout || DEFAULT_TIMEOUT;

    const { stdout } = await execAsync(
      `${getFFprobePath()} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${resolvedUrl}"`,
      { timeout }
    );

    const duration = Math.round(parseFloat(stdout.trim()) || 0);
    console.log(`[FFprobe] Duration for ${url.substring(0, 80)}: ${duration}s`);
    return duration;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[FFprobe] Duration extraction failed for ${url.substring(0, 80)}: ${msg}`);
    return 0;
  }
}
