/**
 * Audio chunking service for large audio files.
 *
 * When extracted audio is too large for Whisper (>16MB), this service
 * splits it into smaller chunks that can be transcribed individually,
 * then merges the results with corrected timestamps.
 *
 * Uses FFmpeg's segment muxer for precise splitting without re-encoding.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { nanoid } from "nanoid";
import { storagePut } from "../storage";
import { transcribeAudio } from "../_core/voiceTranscription";

export interface AudioChunk {
  index: number;
  path: string;
  sizeBytes: number;
  startTime: number;   // Offset in seconds from the start of the full audio
  duration: number;     // Duration of this chunk in seconds
}

export interface ChunkedTranscriptionResult {
  fullText: string;
  language: string;
  segments: Array<{ text: string; start: number; end: number }>;
  wordTimestamps: Array<{ word: string; start: number; end: number }>;
  confidence: number;
  method: "whisper_chunked";
  chunkCount: number;
}

/**
 * Split an audio file into chunks of approximately the target size.
 *
 * Uses FFmpeg's segment muxer to split at natural boundaries.
 * Each chunk is approximately targetDurationSeconds long.
 *
 * @param audioPath - Path to the input audio file
 * @param targetChunkSizeMB - Target size per chunk in MB (default: 12MB to stay under 16MB limit)
 * @param audioBitrate - Bitrate of the audio in kbps (default: 64)
 */
export async function splitAudioIntoChunks(
  audioPath: string,
  targetChunkSizeMB: number = 12,
  audioBitrate: number = 64
): Promise<AudioChunk[]> {
  const tempDir = path.join(os.tmpdir(), `klipz-chunks-${nanoid(10)}`);
  await fs.mkdir(tempDir, { recursive: true });

  // Calculate target duration per chunk based on bitrate
  // bitrate is in kbps, so bytes per second = bitrate * 1000 / 8
  const bytesPerSecond = (audioBitrate * 1000) / 8;
  const targetBytes = targetChunkSizeMB * 1024 * 1024;
  const targetDuration = Math.floor(targetBytes / bytesPerSecond);

  console.log(`[AudioChunking] Splitting into ~${targetDuration}s chunks (target ${targetChunkSizeMB}MB at ${audioBitrate}kbps)`);

  return new Promise((resolve, reject) => {
    const outputPattern = path.join(tempDir, "chunk_%04d.mp3");

    const args = [
      "-i", audioPath,
      "-f", "segment",
      "-segment_time", targetDuration.toString(),
      "-c", "copy",          // No re-encoding, just split
      "-reset_timestamps", "1",
      "-y",
      outputPattern,
    ];

    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    ffmpeg.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", async (code) => {
      if (code !== 0) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        reject(new Error(`FFmpeg chunking failed with code ${code}: ${stderr.substring(stderr.length - 300)}`));
        return;
      }

      try {
        const chunkFiles = (await fs.readdir(tempDir))
          .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
          .sort();

        const chunks: AudioChunk[] = [];
        let cumulativeTime = 0;

        for (let i = 0; i < chunkFiles.length; i++) {
          const chunkPath = path.join(tempDir, chunkFiles[i]);
          const stats = await fs.stat(chunkPath);

          // Get actual duration of this chunk using ffprobe
          const duration = await getAudioDuration(chunkPath);

          chunks.push({
            index: i,
            path: chunkPath,
            sizeBytes: stats.size,
            startTime: cumulativeTime,
            duration,
          });

          cumulativeTime += duration;
        }

        console.log(`[AudioChunking] Split into ${chunks.length} chunks, total duration: ${Math.round(cumulativeTime)}s`);
        resolve(chunks);
      } catch (err) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        reject(err);
      }
    });

    ffmpeg.on("error", (err) => {
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      reject(err);
    });
  });
}

/**
 * Get the duration of an audio file using ffprobe.
 */
async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const args = [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ];

    const ffprobe = spawn("ffprobe", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    ffprobe.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    ffprobe.on("close", () => {
      const duration = parseFloat(stdout.trim());
      resolve(isNaN(duration) ? 0 : duration);
    });

    ffprobe.on("error", () => {
      resolve(0);
    });
  });
}

/**
 * Transcribe audio chunks individually and merge results with corrected timestamps.
 *
 * @param chunks - Array of audio chunks to transcribe
 * @returns Merged transcription result
 */
export async function transcribeChunkedAudio(
  chunks: AudioChunk[]
): Promise<ChunkedTranscriptionResult> {
  const allSegments: Array<{ text: string; start: number; end: number }> = [];
  const allWordTimestamps: Array<{ word: string; start: number; end: number }> = [];
  let fullText = "";
  let detectedLanguage = "en";

  for (const chunk of chunks) {
    console.log(`[AudioChunking] Transcribing chunk ${chunk.index + 1}/${chunks.length} (${(chunk.sizeBytes / 1024 / 1024).toFixed(1)}MB, offset ${Math.round(chunk.startTime)}s)`);

    // Upload chunk to S3 for Whisper
    const buffer = await fs.readFile(chunk.path);
    const key = `temp-audio-chunks/${nanoid(8)}-chunk${chunk.index}.mp3`;
    const { url: chunkUrl } = await storagePut(key, buffer, "audio/mpeg");

    const result = await transcribeAudio({
      audioUrl: chunkUrl,
      language: detectedLanguage !== "en" ? detectedLanguage : undefined,
    });

    if ("error" in result) {
      console.warn(`[AudioChunking] Chunk ${chunk.index} failed: ${result.error}, skipping`);
      continue;
    }

    // Use detected language from first successful chunk
    if (chunk.index === 0 && result.language) {
      detectedLanguage = result.language;
    }

    // Offset all timestamps by the chunk's start time
    const offsetSegments = result.segments.map((seg) => ({
      text: seg.text,
      start: seg.start + chunk.startTime,
      end: seg.end + chunk.startTime,
    }));

    allSegments.push(...offsetSegments);

    // Build word timestamps with offset
    const offsetWords = result.segments.flatMap((segment) => {
      const words = segment.text.trim().split(/\s+/);
      if (words.length === 0 || (words.length === 1 && words[0] === "")) return [];
      const duration = segment.end - segment.start;
      const timePerWord = duration / words.length;
      return words.map((word, index) => ({
        word,
        start: segment.start + index * timePerWord + chunk.startTime,
        end: segment.start + (index + 1) * timePerWord + chunk.startTime,
      }));
    });

    allWordTimestamps.push(...offsetWords);

    if (result.text) {
      fullText += (fullText ? " " : "") + result.text;
    }
  }

  return {
    fullText,
    language: detectedLanguage,
    segments: allSegments,
    wordTimestamps: allWordTimestamps,
    confidence: 90, // Slightly lower than single-pass Whisper due to chunking
    method: "whisper_chunked",
    chunkCount: chunks.length,
  };
}

/**
 * Clean up chunk temp directory.
 */
export async function cleanupChunks(chunks: AudioChunk[]): Promise<void> {
  if (chunks.length === 0) return;
  const tempDir = path.dirname(chunks[0].path);
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log(`[AudioChunking] Cleaned up chunk dir: ${tempDir}`);
  } catch {
    // Ignore
  }
}
