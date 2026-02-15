/**
 * Audio extraction service for video files.
 * 
 * Uses FFmpeg to extract the audio track from a video file, producing a much
 * smaller file that can be sent to Whisper for high-quality transcription.
 * 
 * Typical compression ratios:
 * - 295MB MP4 video → ~15-30MB audio (depending on audio bitrate)
 * - 50MB MP4 video → ~3-8MB audio
 * 
 * Audio is extracted as MP3 at 64kbps mono, which is sufficient for speech
 * transcription and keeps file sizes small.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { nanoid } from "nanoid";
import { getFFmpegPath } from "../lib/ffmpegPaths";

export interface AudioExtractionResult {
  audioPath: string;       // Path to the extracted audio file
  audioSizeBytes: number;  // Size of the extracted audio in bytes
  durationSeconds: number; // Duration of the audio in seconds
  format: string;          // Audio format (e.g., "mp3")
}

export interface AudioExtractionError {
  error: string;
  code: "DOWNLOAD_FAILED" | "EXTRACTION_FAILED" | "NO_AUDIO_STREAM" | "TIMEOUT";
  details?: string;
}

/**
 * Extract audio from a video URL using FFmpeg.
 * 
 * Downloads the video and extracts the audio track as a compressed MP3.
 * Uses 64kbps mono encoding optimized for speech transcription.
 * 
 * @param videoUrl - Public URL of the video file
 * @param options - Optional configuration
 * @returns Path to extracted audio file, or error
 */
export async function extractAudioFromVideo(
  videoUrl: string,
  options?: {
    timeoutSeconds?: number;  // Default: 120 seconds
    audioBitrate?: string;    // Default: "64k" (sufficient for speech)
    onProgress?: (message: string) => void;
  }
): Promise<AudioExtractionResult | AudioExtractionError> {
  const timeoutMs = (options?.timeoutSeconds || 120) * 1000;
  const audioBitrate = options?.audioBitrate || "64k";
  const tempDir = os.tmpdir();
  const outputId = nanoid(10);
  const outputPath = path.join(tempDir, `klipz-audio-${outputId}.mp3`);

  options?.onProgress?.("Downloading and extracting audio track...");

  return new Promise((resolve) => {
    // Memory-saving flags for production containers:
    // -threads 1: Use single thread to limit memory usage
    // -nostdin: Don't read from stdin
    // -probesize 5000000: Limit probe size to 5MB
    // -analyzeduration 5000000: Limit analysis to 5 seconds
    const args = [
      "-threads", "1",
      "-nostdin",
      "-probesize", "5000000",
      "-analyzeduration", "5000000",
      "-i", videoUrl,           // Input from URL (FFmpeg handles the download)
      "-vn",                     // No video
      "-acodec", "libmp3lame",   // MP3 codec
      "-ab", audioBitrate,       // Audio bitrate
      "-ac", "1",                // Mono (speech doesn't need stereo)
      "-ar", "16000",            // 16kHz sample rate (Whisper's native rate)
      "-y",                      // Overwrite output
      outputPath,
    ];

    console.log(`[AudioExtraction] Starting FFmpeg: ffmpeg ${args.join(" ").substring(0, 200)}...`);
    const startTime = Date.now();

    const ffmpeg = spawn(getFFmpegPath(), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let duration = 0;

    ffmpeg.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;

      // Parse duration from FFmpeg output
      const durationMatch = chunk.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1]);
        const minutes = parseInt(durationMatch[2]);
        const seconds = parseFloat(durationMatch[3]);
        duration = hours * 3600 + minutes * 60 + seconds;
        options?.onProgress?.(`Extracting audio (${Math.round(duration)}s of audio)...`);
      }

      // Parse progress
      const timeMatch = chunk.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch && duration > 0) {
        const h = parseInt(timeMatch[1]);
        const m = parseInt(timeMatch[2]);
        const s = parseFloat(timeMatch[3]);
        const currentTime = h * 3600 + m * 60 + s;
        const pct = Math.min(99, Math.round((currentTime / duration) * 100));
        options?.onProgress?.(`Extracting audio... ${pct}%`);
      }
    });

    // Timeout handler
    const timeout = setTimeout(() => {
      ffmpeg.kill("SIGKILL");
      // Clean up partial file
      fs.unlink(outputPath).catch(() => {});
      resolve({
        error: "Audio extraction timed out",
        code: "TIMEOUT",
        details: `Extraction exceeded ${options?.timeoutSeconds || 120}s timeout`,
      });
    }, timeoutMs);

    ffmpeg.on("close", async (code, signal) => {
      clearTimeout(timeout);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (code !== 0) {
        // Clean up partial file
        await fs.unlink(outputPath).catch(() => {});

        // Check for common errors
        if (stderr.includes("does not contain any stream") || stderr.includes("no audio")) {
          console.log(`[AudioExtraction] No audio stream found (${elapsed}s)`);
          resolve({
            error: "Video has no audio stream",
            code: "NO_AUDIO_STREAM",
            details: "The video file does not contain an audio track",
          });
          return;
        }

        // Log full stderr for debugging
        const stderrTail = stderr.substring(Math.max(0, stderr.length - 1000));
        console.error(`[AudioExtraction] FFmpeg failed — code: ${code}, signal: ${signal}, elapsed: ${elapsed}s`);
        console.error(`[AudioExtraction] FFmpeg stderr (last 1000 chars): ${stderrTail}`);

        let details = `FFmpeg exited with code ${code}`;
        if (signal === "SIGKILL" || code === null) {
          details = "FFmpeg was killed (likely out of memory). The video may be too large for audio extraction in this environment.";
        } else if (signal) {
          details = `FFmpeg was killed by signal ${signal}`;
        }

        resolve({
          error: "Audio extraction failed",
          code: "EXTRACTION_FAILED",
          details,
        });
        return;
      }

      // Get output file size
      try {
        const stats = await fs.stat(outputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`[AudioExtraction] Success: ${sizeMB}MB audio extracted in ${elapsed}s (duration: ${Math.round(duration)}s)`);

        options?.onProgress?.(`Audio extracted: ${sizeMB}MB`);

        resolve({
          audioPath: outputPath,
          audioSizeBytes: stats.size,
          durationSeconds: duration,
          format: "mp3",
        });
      } catch (err) {
        console.error(`[AudioExtraction] Failed to stat output file:`, err);
        resolve({
          error: "Audio extraction failed",
          code: "EXTRACTION_FAILED",
          details: "Output file not found after extraction",
        });
      }
    });

    ffmpeg.on("error", (err) => {
      clearTimeout(timeout);
      fs.unlink(outputPath).catch(() => {});
      console.error(`[AudioExtraction] FFmpeg spawn error:`, err);
      resolve({
        error: "Audio extraction failed",
        code: "EXTRACTION_FAILED",
        details: err.message,
      });
    });
  });
}

/**
 * Clean up a temporary audio file after transcription.
 */
export async function cleanupAudioFile(audioPath: string): Promise<void> {
  try {
    await fs.unlink(audioPath);
    console.log(`[AudioExtraction] Cleaned up temp file: ${audioPath}`);
  } catch {
    // File may already be deleted, ignore
  }
}

/**
 * Determine the transcription strategy based on file size.
 * 
 * @param fileSizeBytes - Size of the video file in bytes
 * @returns The recommended transcription strategy
 */
export function getTranscriptionStrategy(fileSizeBytes: number | null): {
  method: "whisper_direct" | "llm_then_extract" | "extract_then_whisper";
  reason: string;
} {
  // Strategy:
  // - Small files (<=16MB): Try Whisper directly (best quality), LLM and FFmpeg as fallbacks
  // - Larger files (>16MB): Try LLM first (no FFmpeg needed), FFmpeg extraction as fallback
  //   This avoids depending on FFmpeg in production where it may crash due to memory limits.
  if (!fileSizeBytes || fileSizeBytes === 0) {
    return { method: "llm_then_extract", reason: "File size unknown, trying LLM first (FFmpeg extraction as fallback)" };
  }

  const sizeMB = fileSizeBytes / (1024 * 1024);

  if (sizeMB <= 16) {
    return { method: "whisper_direct", reason: `File is ${sizeMB.toFixed(1)}MB (≤16MB), using Whisper directly` };
  }

  // For ALL files >16MB: try LLM first, FFmpeg extraction as fallback
  return { method: "llm_then_extract", reason: `File is ${sizeMB.toFixed(1)}MB (>16MB), trying LLM first (FFmpeg extraction as fallback)` };
}

/**
 * Calculate appropriate FFmpeg timeout based on file size.
 * Larger files need more time to download and process.
 */
export function getExtractionTimeout(fileSizeBytes: number | null): number {
  if (!fileSizeBytes || fileSizeBytes === 0) return 300; // 5 min default
  const sizeMB = fileSizeBytes / (1024 * 1024);
  const sizeGB = sizeMB / 1024;
  // ~3 minutes per GB, minimum 3 minutes, maximum 60 minutes
  return Math.max(180, Math.min(3600, Math.round(sizeGB * 180)));
}
