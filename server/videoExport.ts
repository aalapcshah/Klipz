import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import axios from "axios";
import { getFFmpegPath } from "./lib/ffmpegPaths";

const execAsync = promisify(exec);

interface Annotation {
  id: number;
  startTime: number;
  endTime: number;
  position: "left" | "right" | "center";
  keyword: string | null;
  fileUrl?: string;
}

interface ExportOptions {
  videoUrl: string;
  annotations: Annotation[];
  outputFilename: string;
}

interface ExportResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Export video with burned-in annotations
 * Downloads video and overlay images, generates FFmpeg command, processes video, uploads result
 */
export async function exportVideoWithAnnotations(
  options: ExportOptions
): Promise<ExportResult> {
  const tempDir = `/tmp/video-export-${nanoid()}`;
  const videoPath = path.join(tempDir, "input.mp4");
  const outputPath = path.join(tempDir, "output.mp4");

  try {
    // Create temp directory
    await mkdir(tempDir, { recursive: true });

    // Download source video
    console.log("[VideoExport] Downloading source video...");
    const videoResponse = await axios.get(options.videoUrl, {
      responseType: "arraybuffer",
    });
    await writeFile(videoPath, Buffer.from(videoResponse.data));

    // Download overlay images
    const overlayPaths: Map<number, string> = new Map();
    for (const ann of options.annotations) {
      if (ann.fileUrl) {
        const overlayPath = path.join(tempDir, `overlay-${ann.id}.jpg`);
        try {
          const imgResponse = await axios.get(ann.fileUrl, {
            responseType: "arraybuffer",
          });
          await writeFile(overlayPath, Buffer.from(imgResponse.data));
          overlayPaths.set(ann.id, overlayPath);
        } catch (error) {
          console.warn(`[VideoExport] Failed to download overlay for annotation ${ann.id}:`, error);
        }
      }
    }

    // Generate FFmpeg filter complex
    const filterComplex = generateFilterComplex(options.annotations, overlayPaths);

    // Build FFmpeg command
    const ffmpegCommand = [
      getFFmpegPath(),
      "-i", videoPath,
      ...Array.from(overlayPaths.values()).flatMap(p => ["-i", p]),
      "-filter_complex", filterComplex,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-c:a", "copy",
      "-y",
      outputPath
    ].join(" ");

    console.log("[VideoExport] Processing video with FFmpeg...");
    console.log("[VideoExport] Command:", ffmpegCommand);

    // Execute FFmpeg
    const { stdout, stderr } = await execAsync(ffmpegCommand, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });

    if (stderr) {
      console.log("[VideoExport] FFmpeg stderr:", stderr.substring(0, 500));
    }

    // Check if output exists
    if (!existsSync(outputPath)) {
      throw new Error("FFmpeg did not produce output file");
    }

    // Upload to S3
    console.log("[VideoExport] Uploading exported video...");
    const outputBuffer = await import("fs/promises").then(fs => fs.readFile(outputPath));
    const fileKey = `exports/${nanoid()}-${options.outputFilename}`;
    const { url } = await storagePut(fileKey, outputBuffer, "video/mp4");

    // Cleanup temp files
    await cleanup(tempDir);

    return {
      success: true,
      url,
    };
  } catch (error) {
    console.error("[VideoExport] Export failed:", error);
    await cleanup(tempDir);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate FFmpeg filter_complex string for annotations
 */
function generateFilterComplex(
  annotations: Annotation[],
  overlayPaths: Map<number, string>
): string {
  if (annotations.length === 0) {
    return "[0:v]copy[out]";
  }

  const filters: string[] = [];
  let currentStream = "[0:v]";
  let inputIndex = 1; // Start from 1 since 0 is the main video

  // Sort annotations by start time
  const sortedAnnotations = [...annotations].sort((a, b) => a.startTime - b.startTime);

  sortedAnnotations.forEach((ann, idx) => {
    const hasOverlay = overlayPaths.has(ann.id);
    const isLast = idx === sortedAnnotations.length - 1;
    const outputStream = isLast ? "[out]" : `[v${idx}]`;

    if (hasOverlay) {
      // Resize overlay to 240x180 (picture-in-picture size)
      filters.push(`[${inputIndex}:v]scale=240:180[overlay${idx}]`);

      // Calculate position based on annotation.position
      const position = getOverlayPosition(ann.position);

      // Add overlay with timing
      const overlayFilter = `${currentStream}[overlay${idx}]overlay=${position.x}:${position.y}:enable='between(t,${ann.startTime},${ann.endTime})'${outputStream}`;
      filters.push(overlayFilter);

      currentStream = outputStream;
      inputIndex++;
    }

    // Add text overlay for keyword if present
    if (ann.keyword) {
      const textPosition = getTextPosition(ann.position);
      const textFilter = `${currentStream}drawtext=text='${escapeText(ann.keyword)}':fontsize=20:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=5:x=${textPosition.x}:y=${textPosition.y}:enable='between(t,${ann.startTime},${ann.endTime})'${isLast ? "[out]" : `[v${idx}t]`}`;
      filters.push(textFilter);
      currentStream = isLast ? "[out]" : `[v${idx}t]`;
    }
  });

  // If no filters were added (no overlays or text), just copy
  if (filters.length === 0) {
    return "[0:v]copy[out]";
  }

  return filters.join(";");
}

/**
 * Get overlay position coordinates based on position setting
 */
function getOverlayPosition(position: "left" | "right" | "center"): { x: string; y: string } {
  const margin = 20;
  const bottom = 80; // From bottom

  switch (position) {
    case "left":
      return { x: String(margin), y: `main_h-overlay_h-${bottom}` };
    case "right":
      return { x: `main_w-overlay_w-${margin}`, y: `main_h-overlay_h-${bottom}` };
    case "center":
      return { x: "(main_w-overlay_w)/2", y: `main_h-overlay_h-${bottom}` };
  }
}

/**
 * Get text position coordinates based on position setting
 */
function getTextPosition(position: "left" | "right" | "center"): { x: string; y: string } {
  const margin = 20;
  const bottom = 50; // Above the overlay

  switch (position) {
    case "left":
      return { x: String(margin), y: `main_h-${bottom}` };
    case "right":
      return { x: `main_w-text_w-${margin}`, y: `main_h-${bottom}` };
    case "center":
      return { x: "(main_w-text_w)/2", y: `main_h-${bottom}` };
  }
}

/**
 * Escape special characters in text for FFmpeg
 */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/\n/g, " ");
}

/**
 * Clean up temporary files
 */
async function cleanup(tempDir: string): Promise<void> {
  try {
    await execAsync(`rm -rf ${tempDir}`);
  } catch (error) {
    console.warn("[VideoExport] Cleanup failed:", error);
  }
}


interface BatchExportOptions {
  videos: Array<{
    videoId: number;
    videoUrl: string;
    title: string;
    annotations: Annotation[];
  }>;
}

interface BatchExportResult {
  success: boolean;
  url?: string;
  filename?: string;
  processedCount?: number;
  failedCount?: number;
  error?: string;
}

/**
 * Export multiple videos with burned-in annotations as a ZIP file
 */
export async function batchExportVideosWithAnnotations(
  options: BatchExportOptions
): Promise<BatchExportResult> {
  const tempDir = `/tmp/batch-export-${nanoid()}`;
  const outputDir = path.join(tempDir, "videos");
  const zipPath = path.join(tempDir, "exported-videos.zip");

  let processedCount = 0;
  let failedCount = 0;

  try {
    // Create temp directories
    await mkdir(outputDir, { recursive: true });

    // Process each video
    for (const video of options.videos) {
      try {
        console.log(`[BatchExport] Processing video: ${video.title}`);
        
        const videoPath = path.join(tempDir, `input-${video.videoId}.mp4`);
        const outputPath = path.join(outputDir, `${sanitizeFilename(video.title)}.mp4`);

        // Download source video
        const videoResponse = await axios.get(video.videoUrl, {
          responseType: "arraybuffer",
        });
        await writeFile(videoPath, Buffer.from(videoResponse.data));

        // Download overlay images
        const overlayPaths: Map<number, string> = new Map();
        for (const ann of video.annotations) {
          if (ann.fileUrl) {
            const overlayPath = path.join(tempDir, `overlay-${video.videoId}-${ann.id}.jpg`);
            try {
              const imgResponse = await axios.get(ann.fileUrl, {
                responseType: "arraybuffer",
              });
              await writeFile(overlayPath, Buffer.from(imgResponse.data));
              overlayPaths.set(ann.id, overlayPath);
            } catch (error) {
              console.warn(`[BatchExport] Failed to download overlay for annotation ${ann.id}`);
            }
          }
        }

        // Generate FFmpeg filter complex
        const filterComplex = generateFilterComplex(video.annotations, overlayPaths);

        // Build FFmpeg command
        const ffmpegCommand = [
          getFFmpegPath(),
          "-i", videoPath,
          ...Array.from(overlayPaths.values()).flatMap(p => ["-i", p]),
          "-filter_complex", filterComplex,
          "-map", "[out]",
          "-map", "0:a?",
          "-c:v", "libx264",
          "-preset", "fast",
          "-crf", "23",
          "-c:a", "copy",
          "-y",
          outputPath
        ].join(" ");

        // Execute FFmpeg
        await execAsync(ffmpegCommand, {
          maxBuffer: 50 * 1024 * 1024,
        });

        if (existsSync(outputPath)) {
          processedCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error(`[BatchExport] Failed to process video ${video.videoId}:`, error);
        failedCount++;
      }
    }

    if (processedCount === 0) {
      throw new Error("No videos were successfully processed");
    }

    // Create ZIP file
    console.log("[BatchExport] Creating ZIP archive...");
    await execAsync(`cd ${outputDir} && zip -r ${zipPath} .`);

    if (!existsSync(zipPath)) {
      throw new Error("Failed to create ZIP file");
    }

    // Upload to S3
    console.log("[BatchExport] Uploading ZIP file...");
    const zipBuffer = await import("fs/promises").then(fs => fs.readFile(zipPath));
    const filename = `exported-videos-${Date.now()}.zip`;
    const fileKey = `exports/${nanoid()}-${filename}`;
    const { url } = await storagePut(fileKey, zipBuffer, "application/zip");

    // Cleanup
    await cleanup(tempDir);

    return {
      success: true,
      url,
      filename,
      processedCount,
      failedCount,
    };
  } catch (error) {
    console.error("[BatchExport] Batch export failed:", error);
    await cleanup(tempDir);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      processedCount,
      failedCount,
    };
  }
}

/**
 * Sanitize filename for safe file system usage
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 100);
}
