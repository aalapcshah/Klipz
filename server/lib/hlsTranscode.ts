/**
 * HLS Adaptive Bitrate Transcoding Service
 * 
 * Converts video files into HLS (HTTP Live Streaming) format with multiple
 * quality variants for adaptive bitrate streaming. This allows the video player
 * to automatically select the best quality based on the viewer's network speed.
 * 
 * Quality variants:
 * - 360p  (640x360,   800kbps)  - Mobile on slow connections
 * - 480p  (854x480,   1200kbps) - Mobile on decent connections
 * - 720p  (1280x720,  2500kbps) - Desktop/tablet standard
 * - 1080p (1920x1080, 5000kbps) - Desktop high quality (only if source >= 1080p)
 * 
 * Each variant is segmented into 6-second .ts chunks and a variant playlist.
 * A master playlist references all variants so the player can switch dynamically.
 * 
 * All segments and playlists are uploaded to S3 under a unique prefix.
 */

import { spawn } from "child_process";
import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { storagePut } from "../storage";
import axios from "axios";
import * as db from "../db";
import { getFFmpegPath } from "./ffmpegPaths";
import {
  upsertJob,
  updateJobProgress,
  completeJob,
  failJob,
  parseFFmpegProgress,
  parseFFmpegDuration,
} from "./transcodingProgress";

const execAsync = promisify(exec);

interface HlsVariant {
  name: string;
  width: number;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
  maxrate: string;
  bufsize: string;
}

const VARIANTS: HlsVariant[] = [
  { name: "360p",  width: 640,  height: 360,  videoBitrate: "800k",  audioBitrate: "96k",  maxrate: "856k",  bufsize: "1200k" },
  { name: "480p",  width: 854,  height: 480,  videoBitrate: "1200k", audioBitrate: "128k", maxrate: "1356k", bufsize: "2000k" },
  { name: "720p",  width: 1280, height: 720,  videoBitrate: "2500k", audioBitrate: "128k", maxrate: "2675k", bufsize: "3750k" },
  { name: "1080p", width: 1920, height: 1080, videoBitrate: "5000k", audioBitrate: "192k", maxrate: "5350k", bufsize: "7500k" },
];

const SEGMENT_DURATION = 6;

export interface HlsTranscodeResult {
  success: boolean;
  masterPlaylistUrl?: string;
  hlsKeyPrefix?: string;
  error?: string;
}

/**
 * Determine which quality variants to generate based on source resolution.
 */
function selectVariants(sourceWidth: number | null, sourceHeight: number | null): HlsVariant[] {
  if (!sourceWidth || !sourceHeight) {
    return VARIANTS.filter(v => v.height <= 720);
  }
  const sourceMaxDim = Math.max(sourceWidth, sourceHeight);
  return VARIANTS.filter(v => v.height <= sourceMaxDim);
}

/**
 * Run FFmpeg with spawn and progress tracking via -progress pipe:1
 */
function runFFmpegWithProgress(
  args: string[],
  jobId: string,
  totalDuration: number,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(getFFmpegPath(), args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderrData = "";
    let stdoutData = "";
    let detectedDuration = totalDuration;
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      ffmpeg.kill("SIGKILL");
      reject(new Error(`FFmpeg timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    ffmpeg.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderrData += chunk;
      
      // Try to detect duration from stderr if not provided
      if (detectedDuration <= 0) {
        const dur = parseFFmpegDuration(stderrData);
        if (dur > 0) detectedDuration = dur;
      }
    });

    ffmpeg.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdoutData += chunk;
      
      if (detectedDuration > 0) {
        const progress = parseFFmpegProgress(chunk, detectedDuration);
        if (progress >= 0) {
          updateJobProgress(jobId, progress, "Transcoding...");
        }
      }
    });

    ffmpeg.on("close", (code) => {
      clearTimeout(timer);
      if (killed) return;
      
      if (code === 0) {
        resolve(stderrData);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderrData.slice(-300)}`));
      }
    });

    ffmpeg.on("error", (err) => {
      clearTimeout(timer);
      if (!killed) {
        reject(new Error(`Failed to start FFmpeg: ${err.message}`));
      }
    });
  });
}

/**
 * Transcode a video into HLS adaptive bitrate format.
 */
export async function transcodeToHls(
  sourceUrl: string,
  videoId: number,
  options?: {
    sourceWidth?: number | null;
    sourceHeight?: number | null;
    filename?: string;
    userId?: number;
    duration?: number;
  }
): Promise<HlsTranscodeResult> {
  const tempDir = `/tmp/hls-transcode-${nanoid()}`;
  const inputPath = path.join(tempDir, "input");
  const hlsOutputDir = path.join(tempDir, "hls");
  const jobId = `hls-${videoId}`;

  try {
    // Initialize progress tracking
    upsertJob(jobId, {
      type: "hls",
      entityId: videoId,
      status: "downloading",
      progress: 0,
      stage: "Downloading source video...",
    });

    await mkdir(tempDir, { recursive: true });
    await mkdir(hlsOutputDir, { recursive: true });

    await db.updateVideo(videoId, { hlsStatus: "processing" } as any);

    // Download source video
    console.log(`[HLS] Downloading source video for video ${videoId}...`);
    const response = await axios.get(sourceUrl, {
      responseType: "arraybuffer",
      timeout: 300000, // 5 min timeout for large files
      onDownloadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const pct = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          updateJobProgress(jobId, Math.min(pct, 10), `Downloading... ${pct}%`);
        }
      },
    });
    const inputBuffer = Buffer.from(response.data);
    await writeFile(inputPath, inputBuffer);
    
    const fileSizeMB = (inputBuffer.length / 1024 / 1024).toFixed(1);
    console.log(`[HLS] Downloaded ${fileSizeMB}MB for video ${videoId}`);

    upsertJob(jobId, {
      type: "hls",
      entityId: videoId,
      status: "processing",
      progress: 10,
      stage: "Preparing transcoding...",
    });

    const variants = selectVariants(
      options?.sourceWidth ?? null,
      options?.sourceHeight ?? null
    );

    if (variants.length === 0) {
      throw new Error("No suitable HLS variants for source resolution");
    }

    console.log(`[HLS] Generating ${variants.length} variants for video ${videoId}: ${variants.map(v => v.name).join(", ")}`);

    // Build FFmpeg args for spawn (array, not joined string)
    const ffmpegArgs: string[] = [
      "-i", inputPath,
      "-y",
    ];

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      ffmpegArgs.push(
        `-map`, `0:v:0`, `-map`, `0:a:0?`,
        `-c:v:${i}`, "libx264",
        `-b:v:${i}`, v.videoBitrate,
        `-maxrate:v:${i}`, v.maxrate,
        `-bufsize:v:${i}`, v.bufsize,
        `-s:v:${i}`, `${v.width}x${v.height}`,
        `-c:a:${i}`, "aac",
        `-b:a:${i}`, v.audioBitrate,
        `-preset`, "fast",
        `-sc_threshold`, "0",
        `-g`, String(SEGMENT_DURATION * 30),
        `-keyint_min`, String(SEGMENT_DURATION * 30),
      );
    }

    const varStreamMap = variants.map((_, i) => `v:${i},a:${i}`).join(" ");
    ffmpegArgs.push(
      `-f`, "hls",
      `-hls_time`, String(SEGMENT_DURATION),
      `-hls_list_size`, "0",
      `-hls_segment_type`, "mpegts",
      `-hls_segment_filename`, path.join(hlsOutputDir, "v%v/segment_%03d.ts"),
      `-master_pl_name`, "master.m3u8",
      `-var_stream_map`, varStreamMap,
      `-progress`, `pipe:1`,
      path.join(hlsOutputDir, "v%v/playlist.m3u8"),
    );

    for (let i = 0; i < variants.length; i++) {
      await mkdir(path.join(hlsOutputDir, `v${i}`), { recursive: true });
    }

    console.log(`[HLS] Running FFmpeg for video ${videoId}...`);

    const timeoutMs = Math.min(
      (600 + Math.ceil(inputBuffer.length / (100 * 1024 * 1024)) * 300) * 1000,
      3600000
    );

    const totalDuration = options?.duration || 0;

    await runFFmpegWithProgress(ffmpegArgs, jobId, totalDuration, timeoutMs);

    // Verify master playlist was created
    const masterPlaylistPath = path.join(hlsOutputDir, "master.m3u8");
    if (!existsSync(masterPlaylistPath)) {
      throw new Error("FFmpeg did not produce master playlist");
    }

    // Upload all HLS files to S3
    upsertJob(jobId, {
      type: "hls",
      entityId: videoId,
      status: "uploading",
      progress: 90,
      stage: "Uploading HLS files to storage...",
    });

    console.log(`[HLS] Uploading HLS files to S3 for video ${videoId}...`);
    const hlsKeyPrefix = `hls/${videoId}-${nanoid(8)}`;
    let uploadedFiles = 0;

    const masterContent = await readFile(masterPlaylistPath, "utf-8");
    const masterBuffer = Buffer.from(masterContent, "utf-8");
    const masterResult = await storagePut(
      `${hlsKeyPrefix}/master.m3u8`,
      masterBuffer,
      "application/vnd.apple.mpegurl"
    );
    uploadedFiles++;

    for (let i = 0; i < variants.length; i++) {
      const variantDir = path.join(hlsOutputDir, `v${i}`);
      if (!existsSync(variantDir)) continue;

      const dirFiles = await readdir(variantDir);
      for (const file of dirFiles) {
        const filePath = path.join(variantDir, file);
        const fileContent = await readFile(filePath);
        
        let contentType = "video/mp2t";
        if (file.endsWith(".m3u8")) {
          contentType = "application/vnd.apple.mpegurl";
        }

        await storagePut(
          `${hlsKeyPrefix}/v${i}/${file}`,
          fileContent,
          contentType
        );
        uploadedFiles++;
      }
    }

    console.log(`[HLS] Uploaded ${uploadedFiles} files for video ${videoId}`);

    await db.updateVideo(videoId, {
      hlsUrl: masterResult.url,
      hlsKey: hlsKeyPrefix,
      hlsStatus: "completed",
    } as any);

    await cleanup(tempDir);

    completeJob(jobId, { uploadedFiles });

    console.log(`[HLS] ✅ Transcoding complete for video ${videoId}: ${masterResult.url}`);
    return {
      success: true,
      masterPlaylistUrl: masterResult.url,
      hlsKeyPrefix,
    };

  } catch (error) {
    console.error(`[HLS] ❌ Transcoding failed for video ${videoId}:`, error);
    
    failJob(jobId, error instanceof Error ? error.message : "Unknown error");
    await db.updateVideo(videoId, { hlsStatus: "failed" } as any).catch(() => {});
    await cleanup(tempDir);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function cleanup(dir: string) {
  try {
    await execAsync(`rm -rf "${dir}"`);
  } catch {
    // Ignore cleanup errors
  }
}
