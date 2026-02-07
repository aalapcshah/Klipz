import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut, storageGet } from "../storage";
import { getDb } from "../db";
import { files, videos } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Quality presets for server-side compression
const COMPRESSION_PRESETS = {
  high: {
    label: "High Quality (1080p)",
    videoBitrate: "2500k",
    audioBitrate: "128k",
    crf: "23",
    preset: "medium",
    maxWidth: 1920,
    maxHeight: 1080,
  },
  medium: {
    label: "Medium Quality (720p)",
    videoBitrate: "1500k",
    audioBitrate: "96k",
    crf: "28",
    preset: "medium",
    maxWidth: 1280,
    maxHeight: 720,
  },
  low: {
    label: "Low Quality (480p)",
    videoBitrate: "800k",
    audioBitrate: "64k",
    crf: "32",
    preset: "fast",
    maxWidth: 854,
    maxHeight: 480,
  },
} as const;

type CompressionQuality = keyof typeof COMPRESSION_PRESETS;

// Track active compression jobs in memory
const activeJobs = new Map<
  number,
  {
    status: "downloading" | "compressing" | "uploading" | "complete" | "failed";
    progress: number; // 0-100
    error?: string;
    originalSize?: number;
    compressedSize?: number;
    quality?: string;
  }
>();

/**
 * Download a file from a URL to a local temp path
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download file: ${response.status} ${response.statusText}`
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

/**
 * Run FFmpeg compression with progress tracking
 */
function compressVideoFFmpeg(
  inputPath: string,
  outputPath: string,
  quality: CompressionQuality,
  duration: number,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const preset = COMPRESSION_PRESETS[quality];

    // Build FFmpeg args - audio is always preserved
    const args = [
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-crf",
      preset.crf,
      "-preset",
      preset.preset,
      "-b:v",
      preset.videoBitrate,
      // Scale down if larger than max resolution, maintaining aspect ratio
      "-vf",
      `scale=min(${preset.maxWidth}\\,iw):min(${preset.maxHeight}\\,ih):force_original_aspect_ratio=decrease`,
      // Audio: always re-encode to AAC to ensure compatibility
      "-c:a",
      "aac",
      "-b:a",
      preset.audioBitrate,
      // Ensure compatibility
      "-movflags",
      "+faststart",
      "-pix_fmt",
      "yuv420p",
      // Progress output
      "-progress",
      "pipe:1",
      "-y", // Overwrite output
      outputPath,
    ];

    console.log(
      `[VideoCompression] Starting FFmpeg: ffmpeg ${args.join(" ")}`
    );

    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderrData = "";

    ffmpeg.stderr?.on("data", (data: Buffer) => {
      stderrData += data.toString();
    });

    ffmpeg.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      // Parse progress from FFmpeg output
      const timeMatch = output.match(/out_time_us=(\d+)/);
      if (timeMatch && duration > 0) {
        const currentTimeUs = parseInt(timeMatch[1]);
        const currentTimeSec = currentTimeUs / 1_000_000;
        const percent = Math.min(
          99,
          Math.round((currentTimeSec / duration) * 100)
        );
        onProgress(percent);
      }
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        onProgress(100);
        resolve();
      } else {
        console.error(
          `[VideoCompression] FFmpeg exited with code ${code}`
        );
        console.error(
          `[VideoCompression] stderr: ${stderrData.slice(-500)}`
        );
        reject(
          new Error(
            `FFmpeg exited with code ${code}: ${stderrData.slice(-200)}`
          )
        );
      }
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Get video duration using FFprobe
 */
function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      filePath,
    ]);

    let stdout = "";
    ffprobe.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    ffprobe.on("close", (code) => {
      if (code === 0) {
        try {
          const info = JSON.parse(stdout);
          resolve(parseFloat(info.format?.duration || "0"));
        } catch {
          resolve(0);
        }
      } else {
        resolve(0); // Default to 0 if ffprobe fails
      }
    });

    ffprobe.on("error", () => resolve(0));
  });
}

export const videoCompressionRouter = router({
  // Get available compression presets
  getPresets: protectedProcedure.query(() => {
    return Object.entries(COMPRESSION_PRESETS).map(([key, preset]) => ({
      key,
      label: preset.label,
      maxResolution: `${preset.maxWidth}x${preset.maxHeight}`,
      videoBitrate: preset.videoBitrate,
      audioBitrate: preset.audioBitrate,
    }));
  }),

  // Start server-side compression for a video file
  compress: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        quality: z.enum(["high", "medium", "low"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { fileId, quality } = input;

      // Check if already compressing
      const existingJob = activeJobs.get(fileId);
      if (
        existingJob &&
        (existingJob.status === "downloading" ||
          existingJob.status === "compressing" ||
          existingJob.status === "uploading")
      ) {
        throw new Error(
          "Compression is already in progress for this file"
        );
      }

      // Get the file record
      const drizzle = await getDb();
      if (!drizzle) throw new Error("Database not available");
      const [fileRecord] = await drizzle
        .select()
        .from(files)
        .where(and(eq(files.id, fileId), eq(files.userId, ctx.user.id)));

      if (!fileRecord) {
        throw new Error("File not found");
      }

      if (!fileRecord.mimeType.startsWith("video/")) {
        throw new Error("File is not a video");
      }

      // Mark as pending in database
      await drizzle
        .update(files)
        .set({ compressionStatus: "pending" })
        .where(eq(files.id, fileId));

      // Initialize job tracking
      activeJobs.set(fileId, {
        status: "downloading",
        progress: 0,
        originalSize: fileRecord.fileSize,
        quality,
      });

      // Run compression in background (don't await)
      runCompressionJob(fileId, fileRecord, quality, ctx.user.id).catch(
        (err) => {
          console.error(
            `[VideoCompression] Job failed for file ${fileId}:`,
            err
          );
          activeJobs.set(fileId, {
            status: "failed",
            progress: 0,
            error: err.message,
            originalSize: fileRecord.fileSize,
          });
          // Update database status
          getDb().then((db) => {
            if (db) {
              db.update(files)
                .set({ compressionStatus: "failed" })
                .where(eq(files.id, fileId))
                .catch(console.error);
            }
          });
        }
      );

      return { started: true, fileId };
    }),

  // Get compression status for a file
  getStatus: protectedProcedure
    .input(z.object({ fileId: z.number() }))
    .query(async ({ input }) => {
      const job = activeJobs.get(input.fileId);
      if (job) {
        return job;
      }
      // Fall back to database status
      const drizzle = await getDb();
      if (!drizzle) return { status: "idle" as const, progress: 0 };
      const [fileRecord] = await drizzle
        .select({
          compressionStatus: files.compressionStatus,
          compressedSize: files.compressedSize,
          fileSize: files.fileSize,
        })
        .from(files)
        .where(eq(files.id, input.fileId));

      if (!fileRecord) return { status: "idle" as const, progress: 0 };

      if (fileRecord.compressionStatus === "completed") {
        return {
          status: "complete" as const,
          progress: 100,
          originalSize: fileRecord.fileSize,
          compressedSize: fileRecord.compressedSize ?? undefined,
        };
      }
      if (fileRecord.compressionStatus === "failed") {
        return {
          status: "failed" as const,
          progress: 0,
          error: "Compression failed",
        };
      }
      return { status: "idle" as const, progress: 0 };
    }),

  // Get compression status for multiple files
  getBatchStatus: protectedProcedure
    .input(z.object({ fileIds: z.array(z.number()) }))
    .query(async ({ input }) => {
      const statuses: Record<
        number,
        {
          status: string;
          progress: number;
          error?: string;
          originalSize?: number;
          compressedSize?: number;
        }
      > = {};
      for (const fileId of input.fileIds) {
        const job = activeJobs.get(fileId);
        if (job) {
          statuses[fileId] = job;
        }
      }
      return statuses;
    }),

  // Revert compression - restore original file
  revert: protectedProcedure
    .input(z.object({ fileId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new Error("Database not available");

      const [fileRecord] = await drizzle
        .select()
        .from(files)
        .where(and(eq(files.id, input.fileId), eq(files.userId, ctx.user.id)));

      if (!fileRecord) throw new Error("File not found");
      if (!fileRecord.originalFileKey || !fileRecord.originalUrl) {
        throw new Error("No original file to revert to");
      }

      // Restore original file references
      await drizzle
        .update(files)
        .set({
          fileKey: fileRecord.originalFileKey,
          url: fileRecord.originalUrl,
          fileSize: fileRecord.fileSize, // Note: original size was stored before compression
          compressionStatus: "none",
          compressedSize: null,
          originalFileKey: null,
          originalUrl: null,
        })
        .where(eq(files.id, input.fileId));

      // Also update video record if exists
      const [videoRecord] = await drizzle
        .select()
        .from(videos)
        .where(eq(videos.fileId, input.fileId));

      if (videoRecord) {
        await drizzle
          .update(videos)
          .set({
            fileKey: fileRecord.originalFileKey,
            url: fileRecord.originalUrl,
          })
          .where(eq(videos.id, videoRecord.id));
      }

      // Clear in-memory job
      activeJobs.delete(input.fileId);

      return { reverted: true };
    }),
});

/**
 * Background compression job
 */
async function runCompressionJob(
  fileId: number,
  fileRecord: {
    fileKey: string;
    url: string;
    filename: string;
    mimeType: string;
    fileSize: number;
  },
  quality: CompressionQuality,
  userId: number
): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-compress-"));
  const ext = path.extname(fileRecord.filename) || ".mp4";
  const inputPath = path.join(tmpDir, `input${ext}`);
  const outputPath = path.join(tmpDir, `output.mp4`);

  try {
    // Step 1: Download from S3
    console.log(
      `[VideoCompression] Downloading file ${fileId} from S3...`
    );
    activeJobs.set(fileId, {
      status: "downloading",
      progress: 0,
      originalSize: fileRecord.fileSize,
    });

    // Update database status
    const drizzle = await getDb();
    if (!drizzle) throw new Error("Database not available");
    await drizzle
      .update(files)
      .set({ compressionStatus: "processing" })
      .where(eq(files.id, fileId));

    // Get a fresh download URL
    const { url: downloadUrl } = await storageGet(fileRecord.fileKey);
    await downloadFile(downloadUrl, inputPath);

    const inputStats = fs.statSync(inputPath);
    console.log(
      `[VideoCompression] Downloaded ${inputStats.size} bytes to ${inputPath}`
    );

    // Step 2: Get duration for progress tracking
    const duration = await getVideoDuration(inputPath);
    console.log(`[VideoCompression] Video duration: ${duration}s`);

    // Step 3: Compress
    activeJobs.set(fileId, {
      status: "compressing",
      progress: 0,
      originalSize: fileRecord.fileSize,
    });

    await compressVideoFFmpeg(
      inputPath,
      outputPath,
      quality,
      duration,
      (percent) => {
        activeJobs.set(fileId, {
          status: "compressing",
          progress: percent,
          originalSize: fileRecord.fileSize,
        });
      }
    );

    const outputStats = fs.statSync(outputPath);
    console.log(
      `[VideoCompression] Compressed: ${inputStats.size} → ${outputStats.size} bytes (${Math.round((1 - outputStats.size / inputStats.size) * 100)}% reduction)`
    );

    // Step 4: Upload compressed version to S3
    activeJobs.set(fileId, {
      status: "uploading",
      progress: 95,
      originalSize: fileRecord.fileSize,
      compressedSize: outputStats.size,
    });

    const compressedBuffer = fs.readFileSync(outputPath);
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const compressedKey = `user-${userId}/videos/compressed-${timestamp}-${randomSuffix}.mp4`;

    const { url: compressedUrl } = await storagePut(
      compressedKey,
      compressedBuffer,
      "video/mp4"
    );
    console.log(
      `[VideoCompression] Uploaded compressed file to S3: ${compressedKey}`
    );

    // Step 5: Update database records - save original references before overwriting
    await drizzle
      .update(files)
      .set({
        originalFileKey: fileRecord.fileKey,
        originalUrl: fileRecord.url,
        fileKey: compressedKey,
        url: compressedUrl,
        compressedSize: outputStats.size,
        compressionStatus: "completed",
        mimeType: "video/mp4",
      })
      .where(eq(files.id, fileId));

    // Also update the video record if it exists
    const [videoRecord] = await drizzle
      .select()
      .from(videos)
      .where(eq(videos.fileId, fileId));

    if (videoRecord) {
      await drizzle
        .update(videos)
        .set({
          fileKey: compressedKey,
          url: compressedUrl,
          duration: Math.round(duration),
        })
        .where(eq(videos.id, videoRecord.id));
    }

    activeJobs.set(fileId, {
      status: "complete",
      progress: 100,
      originalSize: fileRecord.fileSize,
      compressedSize: outputStats.size,
    });

    console.log(
      `[VideoCompression] Compression complete for file ${fileId}`
    );
  } finally {
    // Cleanup temp files
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      fs.rmdirSync(tmpDir);
    } catch (e) {
      console.warn(`[VideoCompression] Cleanup warning:`, e);
    }
  }
}
