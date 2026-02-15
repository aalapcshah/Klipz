import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import axios from "axios";
import { getFFmpegPath } from "./lib/ffmpegPaths";

const execAsync = promisify(exec);

interface TranscodeResult {
  success: boolean;
  url?: string;
  fileKey?: string;
  error?: string;
}

/**
 * Transcode a video from WebM (or any format) to MP4 (H.264 + AAC)
 * for cross-browser compatibility, especially iOS Safari.
 *
 * Downloads the source video from its URL, runs FFmpeg to convert it,
 * uploads the result to S3, and returns the new URL + key.
 */
export async function transcodeToMp4(
  sourceUrl: string,
  originalFilename: string
): Promise<TranscodeResult> {
  const tempDir = `/tmp/video-transcode-${nanoid()}`;
  const inputPath = path.join(tempDir, "input");
  const outputPath = path.join(tempDir, "output.mp4");

  try {
    // Create temp directory
    await mkdir(tempDir, { recursive: true });

    // Download source video
    console.log("[Transcode] Downloading source video...");
    const response = await axios.get(sourceUrl, {
      responseType: "arraybuffer",
      timeout: 120000, // 2 min timeout for large files
    });
    await writeFile(inputPath, Buffer.from(response.data));

    // Build FFmpeg command for WebM → MP4 conversion
    // -movflags +faststart: enables progressive playback (important for web)
    // -preset fast: balance between speed and compression
    // -crf 23: good quality with reasonable file size
    // -c:a aac: ensure audio is AAC (Safari requires it)
    const ffmpegCommand = [
      getFFmpegPath(),
      "-i", inputPath,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ].join(" ");

    console.log("[Transcode] Converting to MP4...");

    const { stderr } = await execAsync(ffmpegCommand, {
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer
      timeout: 300000, // 5 min timeout
    });

    if (stderr) {
      // FFmpeg outputs progress info to stderr, this is normal
      console.log("[Transcode] FFmpeg output:", stderr.substring(0, 300));
    }

    // Check if output exists
    if (!existsSync(outputPath)) {
      throw new Error("FFmpeg did not produce output file");
    }

    // Upload to S3
    console.log("[Transcode] Uploading transcoded MP4...");
    const outputBuffer = await readFile(outputPath);
    const baseName = originalFilename.replace(/\.[^.]+$/, "");
    const fileKey = `transcoded/${nanoid()}-${baseName}.mp4`;
    const { url } = await storagePut(fileKey, outputBuffer, "video/mp4");

    // Cleanup temp files
    await cleanup(tempDir);

    console.log("[Transcode] Transcoding complete:", url);
    return {
      success: true,
      url,
      fileKey,
    };
  } catch (error) {
    console.error("[Transcode] Failed:", error);
    await cleanup(tempDir);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function cleanup(dir: string) {
  try {
    const { exec: execCb } = await import("child_process");
    const execP = promisify(execCb);
    await execP(`rm -rf ${dir}`);
  } catch {
    // Ignore cleanup errors
  }
}
