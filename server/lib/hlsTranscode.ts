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

import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, readdir, readFile, unlink, rmdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { storagePut } from "../storage";
import axios from "axios";
import * as db from "../db";
import { getFFmpegPath } from "./ffmpegPaths";

const execAsync = promisify(exec);

interface HlsVariant {
  name: string;
  width: number;
  height: number;
  videoBitrate: string;  // e.g., "800k"
  audioBitrate: string;  // e.g., "96k"
  maxrate: string;       // e.g., "856k"
  bufsize: string;       // e.g., "1200k"
}

const VARIANTS: HlsVariant[] = [
  { name: "360p",  width: 640,  height: 360,  videoBitrate: "800k",  audioBitrate: "96k",  maxrate: "856k",  bufsize: "1200k" },
  { name: "480p",  width: 854,  height: 480,  videoBitrate: "1200k", audioBitrate: "128k", maxrate: "1356k", bufsize: "2000k" },
  { name: "720p",  width: 1280, height: 720,  videoBitrate: "2500k", audioBitrate: "128k", maxrate: "2675k", bufsize: "3750k" },
  { name: "1080p", width: 1920, height: 1080, videoBitrate: "5000k", audioBitrate: "192k", maxrate: "5350k", bufsize: "7500k" },
];

const SEGMENT_DURATION = 6; // seconds per HLS segment

export interface HlsTranscodeResult {
  success: boolean;
  masterPlaylistUrl?: string;
  hlsKeyPrefix?: string;
  error?: string;
}

/**
 * Determine which quality variants to generate based on source resolution.
 * Only generates variants at or below the source resolution.
 */
function selectVariants(sourceWidth: number | null, sourceHeight: number | null): HlsVariant[] {
  if (!sourceWidth || !sourceHeight) {
    // Unknown resolution — generate up to 720p to be safe
    return VARIANTS.filter(v => v.height <= 720);
  }

  const sourceMaxDim = Math.max(sourceWidth, sourceHeight);
  return VARIANTS.filter(v => v.height <= sourceMaxDim);
}

/**
 * Transcode a video into HLS adaptive bitrate format.
 * 
 * @param sourceUrl - URL of the source video (S3 URL)
 * @param videoId - Database video ID for progress tracking
 * @param options - Source video metadata for variant selection
 * @returns HLS transcoding result with master playlist URL
 */
export async function transcodeToHls(
  sourceUrl: string,
  videoId: number,
  options?: {
    sourceWidth?: number | null;
    sourceHeight?: number | null;
    filename?: string;
    userId?: number;
  }
): Promise<HlsTranscodeResult> {
  const tempDir = `/tmp/hls-transcode-${nanoid()}`;
  const inputPath = path.join(tempDir, "input");
  const hlsOutputDir = path.join(tempDir, "hls");

  try {
    // Create temp directories
    await mkdir(tempDir, { recursive: true });
    await mkdir(hlsOutputDir, { recursive: true });

    // Update status to processing
    await db.updateVideo(videoId, { hlsStatus: "processing" } as any);

    // Download source video
    console.log(`[HLS] Downloading source video for video ${videoId}...`);
    const response = await axios.get(sourceUrl, {
      responseType: "arraybuffer",
      timeout: 180000, // 3 min timeout for large files
    });
    const inputBuffer = Buffer.from(response.data);
    const { writeFile } = await import("fs/promises");
    await writeFile(inputPath, inputBuffer);
    
    const fileSizeMB = (inputBuffer.length / 1024 / 1024).toFixed(1);
    console.log(`[HLS] Downloaded ${fileSizeMB}MB for video ${videoId}`);

    // Select appropriate variants based on source resolution
    const variants = selectVariants(
      options?.sourceWidth ?? null,
      options?.sourceHeight ?? null
    );

    if (variants.length === 0) {
      throw new Error("No suitable HLS variants for source resolution");
    }

    console.log(`[HLS] Generating ${variants.length} variants for video ${videoId}: ${variants.map(v => v.name).join(", ")}`);

    // Build FFmpeg command for multi-variant HLS output
    // Uses a single input with multiple output streams
    const ffmpegArgs: string[] = [
      getFFmpegPath(),
      "-i", inputPath,
      "-y", // Overwrite output files
    ];

    // Add output streams for each variant
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      ffmpegArgs.push(
        `-map`, `0:v:0`, `-map`, `0:a:0?`, // Map video and optional audio
        `-c:v:${i}`, "libx264",
        `-b:v:${i}`, v.videoBitrate,
        `-maxrate:v:${i}`, v.maxrate,
        `-bufsize:v:${i}`, v.bufsize,
        `-s:v:${i}`, `${v.width}x${v.height}`,
        `-c:a:${i}`, "aac",
        `-b:a:${i}`, v.audioBitrate,
        `-preset`, "fast",
        `-sc_threshold`, "0", // Consistent keyframe placement
        `-g`, String(SEGMENT_DURATION * 30), // GOP size (assuming ~30fps)
        `-keyint_min`, String(SEGMENT_DURATION * 30),
      );
    }

    // HLS output settings
    const varStreamMap = variants.map((_, i) => `v:${i},a:${i}`).join(" ");
    ffmpegArgs.push(
      `-f`, "hls",
      `-hls_time`, String(SEGMENT_DURATION),
      `-hls_list_size`, "0", // Include all segments in playlist
      `-hls_segment_type`, "mpegts",
      `-hls_segment_filename`, path.join(hlsOutputDir, "v%v/segment_%03d.ts"),
      `-master_pl_name`, "master.m3u8",
      `-var_stream_map`, varStreamMap,
      path.join(hlsOutputDir, "v%v/playlist.m3u8"),
    );

    // Create variant output directories
    for (let i = 0; i < variants.length; i++) {
      await mkdir(path.join(hlsOutputDir, `v${i}`), { recursive: true });
    }

    const command = ffmpegArgs.join(" ");
    console.log(`[HLS] Running FFmpeg for video ${videoId}...`);

    // Calculate timeout based on file size (10 min base + 5 min per 100MB)
    const timeoutMs = Math.min(
      (600 + Math.ceil(inputBuffer.length / (100 * 1024 * 1024)) * 300) * 1000,
      3600000 // 1 hour max
    );

    const { stderr } = await execAsync(command, {
      maxBuffer: 100 * 1024 * 1024,
      timeout: timeoutMs,
    });

    if (stderr) {
      console.log(`[HLS] FFmpeg output for video ${videoId}: ${stderr.substring(0, 300)}`);
    }

    // Verify master playlist was created
    const masterPlaylistPath = path.join(hlsOutputDir, "master.m3u8");
    if (!existsSync(masterPlaylistPath)) {
      throw new Error("FFmpeg did not produce master playlist");
    }

    // Upload all HLS files to S3
    console.log(`[HLS] Uploading HLS files to S3 for video ${videoId}...`);
    const hlsKeyPrefix = `hls/${videoId}-${nanoid(8)}`;
    let uploadedFiles = 0;

    // Upload master playlist
    const masterContent = await readFile(masterPlaylistPath, "utf-8");
    // Rewrite master playlist to use relative S3 paths
    const rewrittenMaster = rewriteMasterPlaylist(masterContent, variants);
    const masterBuffer = Buffer.from(rewrittenMaster, "utf-8");
    const masterResult = await storagePut(
      `${hlsKeyPrefix}/master.m3u8`,
      masterBuffer,
      "application/vnd.apple.mpegurl"
    );
    uploadedFiles++;

    // Upload each variant's playlist and segments
    for (let i = 0; i < variants.length; i++) {
      const variantDir = path.join(hlsOutputDir, `v${i}`);
      if (!existsSync(variantDir)) continue;

      const files = await readdir(variantDir);
      for (const file of files) {
        const filePath = path.join(variantDir, file);
        const fileContent = await readFile(filePath);
        
        let contentType = "video/mp2t"; // .ts segments
        if (file.endsWith(".m3u8")) {
          contentType = "application/vnd.apple.mpegurl";
        }

        // Rewrite variant playlist to use relative paths
        let uploadContent: Buffer;
        if (file.endsWith(".m3u8")) {
          const playlistContent = fileContent.toString("utf-8");
          // Segment filenames are already relative in the variant playlist
          uploadContent = Buffer.from(playlistContent, "utf-8");
        } else {
          uploadContent = fileContent;
        }

        await storagePut(
          `${hlsKeyPrefix}/v${i}/${file}`,
          uploadContent,
          contentType
        );
        uploadedFiles++;
      }
    }

    console.log(`[HLS] Uploaded ${uploadedFiles} files for video ${videoId}`);

    // Update video record with HLS info
    await db.updateVideo(videoId, {
      hlsUrl: masterResult.url,
      hlsKey: hlsKeyPrefix,
      hlsStatus: "completed",
    } as any);

    // Cleanup temp files
    await cleanup(tempDir);

    console.log(`[HLS] ✅ Transcoding complete for video ${videoId}: ${masterResult.url}`);
    return {
      success: true,
      masterPlaylistUrl: masterResult.url,
      hlsKeyPrefix,
    };

  } catch (error) {
    console.error(`[HLS] ❌ Transcoding failed for video ${videoId}:`, error);
    
    // Update status to failed
    await db.updateVideo(videoId, { hlsStatus: "failed" } as any).catch(() => {});
    
    await cleanup(tempDir);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Rewrite the master playlist to use correct variant paths.
 * FFmpeg generates paths like "v0/playlist.m3u8" which need to stay relative.
 */
function rewriteMasterPlaylist(content: string, variants: HlsVariant[]): string {
  // The master playlist should already have correct relative paths
  // Just ensure the BANDWIDTH and RESOLUTION tags are correct
  return content;
}

async function cleanup(dir: string) {
  try {
    await execAsync(`rm -rf "${dir}"`);
  } catch {
    // Ignore cleanup errors
  }
}
