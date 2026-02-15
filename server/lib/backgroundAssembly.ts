/**
 * Background Assembly Module
 * 
 * After a large file's chunks are uploaded and finalization creates the DB record
 * (with a streaming URL for immediate access), this module assembles the chunks
 * into a single S3 file in the background.
 * 
 * Once assembly is complete, the file/video records are updated with the direct S3 URL,
 * which natively supports Range requests for proper video playback.
 * 
 * The streaming endpoint (/api/files/stream/:sessionToken) checks finalFileUrl
 * and redirects to S3 when available, so the transition is seamless.
 * 
 * Assembly strategy:
 * - Files ≤200MB: in-memory storagePut (fast, simple)
 * - Files 200MB–2GB: streaming curl upload with dynamic timeout based on file size
 *   Uses spawn (non-blocking) instead of execSync to avoid blocking the event loop
 *   Timeout scales: 10 minutes base + 5 minutes per 100MB over 200MB
 * - Files >2GB: skipped (streaming endpoint continues to serve)
 * 
 * Progress tracking:
 * - assemblyPhase: idle → downloading → uploading → generating_thumbnail → complete/failed
 * - assemblyProgress / assemblyTotalChunks: chunk-level progress during download phase
 * - assemblyStartedAt: timestamp when assembly began
 * - All progress is written to the resumableUploadSessions table for UI polling
 */

import { getDb } from "../db";
import * as db from "../db";
import { storagePut, storageGet } from "../storage";
import { resumableUploadSessions, resumableUploadChunks, files, videos } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import { generateVideoThumbnail } from "./videoThumbnail";
import { ENV } from "../_core/env";
import { sendActivityEmail } from "../_core/activityEmailNotifications";

// Track active assembly jobs to prevent duplicates
const activeAssemblies = new Set<string>();

// Max file size we'll attempt to assemble (2GB)
// Files up to 200MB use in-memory storagePut.
// Files 200MB-2GB use curl to stream from disk (avoids OOM).
const MAX_ASSEMBLY_SIZE = 2 * 1024 * 1024 * 1024;
const MEMORY_UPLOAD_LIMIT = 200 * 1024 * 1024; // 200MB

// How often to write progress to DB (every N chunks)
const PROGRESS_DB_WRITE_INTERVAL = 5;

/**
 * Calculate dynamic timeout based on file size.
 * Base: 600s (10 min) for files up to 200MB
 * Scale: +300s (5 min) per additional 100MB
 * Example: 700MB file → 600 + (500/100)*300 = 600 + 1500 = 2100s (35 min)
 * Cap: 3600s (1 hour)
 */
function calculateTimeout(fileSizeBytes: number): number {
  const BASE_TIMEOUT = 600; // 10 minutes
  const EXTRA_PER_100MB = 300; // 5 minutes per 100MB over threshold
  const MAX_TIMEOUT = 3600; // 1 hour cap
  
  if (fileSizeBytes <= MEMORY_UPLOAD_LIMIT) {
    return BASE_TIMEOUT;
  }
  
  const excessBytes = fileSizeBytes - MEMORY_UPLOAD_LIMIT;
  const excess100MBChunks = Math.ceil(excessBytes / (100 * 1024 * 1024));
  const timeout = BASE_TIMEOUT + (excess100MBChunks * EXTRA_PER_100MB);
  
  return Math.min(timeout, MAX_TIMEOUT);
}

/**
 * Update assembly progress in the database.
 * Non-throwing — logs errors but doesn't interrupt assembly.
 */
async function updateAssemblyProgress(
  sessionId: number,
  update: {
    assemblyPhase?: "idle" | "downloading" | "uploading" | "generating_thumbnail" | "complete" | "failed";
    assemblyProgress?: number;
    assemblyTotalChunks?: number;
    assemblyStartedAt?: Date;
  },
): Promise<void> {
  try {
    const drizzle = await getDb();
    if (!drizzle) return;
    await drizzle
      .update(resumableUploadSessions)
      .set(update)
      .where(eq(resumableUploadSessions.id, sessionId));
  } catch (err) {
    console.warn(`[BackgroundAssembly] Failed to update progress for session ${sessionId}:`, err);
  }
}

/**
 * Upload a file from disk to S3 using curl (streams from disk, avoids OOM for large files).
 * Uses spawn (non-blocking) instead of execSync to avoid blocking the event loop.
 * Dynamic timeout based on file size.
 */
function storagePutViaCurl(
  key: string,
  filePath: string,
  contentType: string,
  fileSizeBytes: number,
  onProgress?: (message: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const normalizedKey = key.replace(/^\/+/, "");
    const baseUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
    const uploadUrl = `${baseUrl}/v1/storage/upload?path=${encodeURIComponent(normalizedKey)}`;
    const fileName = normalizedKey.split("/").pop() || "file";
    const timeoutSeconds = calculateTimeout(fileSizeBytes);
    const sizeMB = (fileSizeBytes / 1024 / 1024).toFixed(1);

    onProgress?.(`Starting curl upload of ${sizeMB}MB with ${timeoutSeconds}s timeout...`);

    const curlProcess = spawn("curl", [
      "-s",
      "-X", "POST",
      uploadUrl,
      "-H", `Authorization: Bearer ${ENV.forgeApiKey}`,
      "-F", `file=@${filePath};type=${contentType};filename=${fileName}`,
      "--max-time", String(timeoutSeconds),
      "--progress-bar",
    ], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let lastProgressLog = Date.now();

    curlProcess.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    curlProcess.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
      const now = Date.now();
      if (now - lastProgressLog > 30000) {
        lastProgressLog = now;
        onProgress?.(`Upload in progress... (${sizeMB}MB file)`);
      }
    });

    const nodeTimeout = setTimeout(() => {
      curlProcess.kill("SIGTERM");
      reject(new Error(
        `storagePutViaCurl: Node.js safety timeout after ${timeoutSeconds + 60}s ` +
        `for ${sizeMB}MB file. curl stderr: ${stderr.substring(0, 500)}`
      ));
    }, (timeoutSeconds + 60) * 1000);

    curlProcess.on("close", (code) => {
      clearTimeout(nodeTimeout);

      if (code !== 0) {
        reject(new Error(
          `storagePutViaCurl: curl exited with code ${code} for ${sizeMB}MB file. ` +
          `stderr: ${stderr.substring(0, 500)}`
        ));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        if (!parsed.url) {
          reject(new Error(
            `storagePutViaCurl: No URL in response: ${stdout.substring(0, 200)}`
          ));
          return;
        }
        onProgress?.(`Upload complete for ${sizeMB}MB file`);
        resolve(parsed.url);
      } catch (parseError) {
        reject(new Error(
          `storagePutViaCurl: Failed to parse response for ${sizeMB}MB file. ` +
          `stdout: ${stdout.substring(0, 200)}, stderr: ${stderr.substring(0, 200)}`
        ));
      }
    });

    curlProcess.on("error", (err) => {
      clearTimeout(nodeTimeout);
      reject(new Error(`storagePutViaCurl: spawn error: ${err.message}`));
    });
  });
}

/**
 * Assemble chunks into a single S3 file in the background.
 * This function is fire-and-forget — it logs errors but doesn't throw.
 * Progress is written to the database for UI polling.
 */
export async function assembleChunksInBackground(
  sessionToken: string,
  sessionId: number,
  userId: number,
  fileId: number,
  videoId: number | undefined,
  filename: string,
  mimeType: string,
  uploadType: string,
): Promise<void> {
  // Prevent duplicate assemblies
  if (activeAssemblies.has(sessionToken)) {
    console.log(`[BackgroundAssembly] Already assembling ${sessionToken}, skipping`);
    return;
  }

  activeAssemblies.add(sessionToken);
  const startTime = Date.now();

  try {
    console.log(`[BackgroundAssembly] Starting assembly for ${sessionToken} (file: ${filename})`);

    const drizzle = await getDb();
    if (!drizzle) {
      console.error(`[BackgroundAssembly] Database not available for ${sessionToken}`);
      return;
    }

    // Get all chunks ordered by index
    const chunks = await drizzle
      .select()
      .from(resumableUploadChunks)
      .where(eq(resumableUploadChunks.sessionId, sessionId))
      .orderBy(resumableUploadChunks.chunkIndex);

    if (chunks.length === 0) {
      console.error(`[BackgroundAssembly] No chunks found for ${sessionToken}`);
      return;
    }

    // Initialize progress tracking in DB
    await updateAssemblyProgress(sessionId, {
      assemblyPhase: "downloading",
      assemblyProgress: 0,
      assemblyTotalChunks: chunks.length,
      assemblyStartedAt: new Date(),
    });

    // Create a temporary file to assemble chunks
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `assembly-${sessionToken}-${Date.now()}`);
    const writeStream = fs.createWriteStream(tmpFile);

    let totalBytesWritten = 0;

    try {
      // Download and write chunks one at a time to minimize memory usage
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Retry each chunk download up to 3 times
        let chunkBuffer: Buffer | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const { url } = await storageGet(chunk.storageKey);
            const response = await fetch(url);
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }

            chunkBuffer = Buffer.from(await response.arrayBuffer());
            break; // Success
          } catch (chunkError: any) {
            console.warn(
              `[BackgroundAssembly] ${sessionToken}: Chunk ${i} download attempt ${attempt}/3 failed: ${chunkError.message}`
            );
            if (attempt === 3) {
              throw new Error(`Failed to download chunk ${i} after 3 attempts: ${chunkError.message}`);
            }
            await new Promise(r => setTimeout(r, attempt * 2500));
          }
        }

        if (!chunkBuffer) {
          throw new Error(`Chunk ${i} buffer is null after retries`);
        }

        await new Promise<void>((resolve, reject) => {
          const canContinue = writeStream.write(chunkBuffer!, (err) => {
            if (err) reject(err);
          });
          if (!canContinue) {
            writeStream.once("drain", resolve);
          } else {
            resolve();
          }
        });

        totalBytesWritten += chunkBuffer.length;

        // Update progress in DB periodically (every PROGRESS_DB_WRITE_INTERVAL chunks or at the end)
        if ((i + 1) % PROGRESS_DB_WRITE_INTERVAL === 0 || i === chunks.length - 1) {
          await updateAssemblyProgress(sessionId, {
            assemblyProgress: i + 1,
          });
        }

        // Log progress every 20 chunks or at the end
        if ((i + 1) % 20 === 0 || i === chunks.length - 1) {
          const progressPct = ((i + 1) / chunks.length * 100).toFixed(1);
          const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(0);
          const speedMBps = totalBytesWritten / 1024 / 1024 / (Number(elapsedSec) || 1);
          console.log(
            `[BackgroundAssembly] ${sessionToken}: ${progressPct}% ` +
            `(${i + 1}/${chunks.length} chunks, ${(totalBytesWritten / 1024 / 1024).toFixed(1)}MB, ` +
            `${elapsedSec}s elapsed, ${speedMBps.toFixed(1)}MB/s)`
          );
        }
      }

      // Close the write stream
      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.on("error", reject);
      });

      const downloadElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[BackgroundAssembly] ${sessionToken}: All ${chunks.length} chunks written to temp file ` +
        `(${(totalBytesWritten / 1024 / 1024).toFixed(1)}MB) in ${downloadElapsed}s`
      );

      // Check if the file is too large to assemble
      if (totalBytesWritten > MAX_ASSEMBLY_SIZE) {
        console.warn(
          `[BackgroundAssembly] ${sessionToken}: File is ${(totalBytesWritten / 1024 / 1024).toFixed(1)}MB, ` +
          `exceeding ${MAX_ASSEMBLY_SIZE / 1024 / 1024}MB limit. Skipping S3 upload — ` +
          `streaming endpoint will continue to serve this file.`
        );
        await updateAssemblyProgress(sessionId, { assemblyPhase: "failed" });
        return;
      }

      // Phase: Uploading
      await updateAssemblyProgress(sessionId, { assemblyPhase: "uploading" });

      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const folder = uploadType === 'video' ? 'videos' : 'files';
      const finalFileKey = `user-${userId}/${folder}/${timestamp}-${randomSuffix}-${filename}`;
      const timeoutSec = calculateTimeout(totalBytesWritten);

      console.log(
        `[BackgroundAssembly] ${sessionToken}: Uploading assembled file to S3 as ${finalFileKey} ` +
        `(${(totalBytesWritten / 1024 / 1024).toFixed(1)}MB, timeout: ${timeoutSec}s)...`
      );

      let finalUrl: string = '';
      const uploadStartTime = Date.now();

      if (totalBytesWritten <= MEMORY_UPLOAD_LIMIT) {
        const assembledBuffer = fs.readFileSync(tmpFile);
        const result = await storagePut(finalFileKey, assembledBuffer, mimeType);
        finalUrl = result.url;
      } else {
        console.log(
          `[BackgroundAssembly] ${sessionToken}: Using streaming curl upload ` +
          `(${(totalBytesWritten / 1024 / 1024).toFixed(1)}MB, timeout: ${timeoutSec}s)...`
        );
        
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            finalUrl = await storagePutViaCurl(
              finalFileKey,
              tmpFile,
              mimeType,
              totalBytesWritten,
              (msg) => console.log(`[BackgroundAssembly] ${sessionToken}: ${msg}`),
            );
            lastError = null;
            break;
          } catch (uploadError: any) {
            lastError = uploadError;
            console.warn(
              `[BackgroundAssembly] ${sessionToken}: Upload attempt ${attempt}/2 failed: ${uploadError.message}`
            );
            if (attempt < 2) {
              console.log(`[BackgroundAssembly] ${sessionToken}: Waiting 10s before retry...`);
              await new Promise(r => setTimeout(r, 10000));
            }
          }
        }

        if (lastError) {
          throw lastError;
        }
      }

      const uploadElapsed = ((Date.now() - uploadStartTime) / 1000).toFixed(1);
      console.log(
        `[BackgroundAssembly] ${sessionToken}: S3 upload complete in ${uploadElapsed}s. ` +
        `URL: ${finalUrl!.substring(0, 80)}...`
      );

      // Update the file record with the direct S3 URL
      await db.updateFile(fileId, {
        fileKey: finalFileKey,
        url: finalUrl!,
      });

      // Update the video record if it exists
      if (videoId) {
        await db.updateVideo(videoId, {
          fileKey: finalFileKey,
          url: finalUrl!,
        });
      }

      // Update the session with the final S3 URL
      await drizzle
        .update(resumableUploadSessions)
        .set({
          finalFileKey,
          finalFileUrl: finalUrl!,
        })
        .where(eq(resumableUploadSessions.id, sessionId));

      // Phase: Extract video metadata via FFprobe (for video files)
      if (mimeType.startsWith('video/') && videoId) {
        try {
          const { extractVideoMetadata } = await import('./ffprobe');
          const meta = await extractVideoMetadata(finalUrl!);
          if (meta) {
            const updates: any = {};
            if (meta.duration > 0) updates.duration = meta.duration;
            if (meta.width) updates.width = meta.width;
            if (meta.height) updates.height = meta.height;
            if (Object.keys(updates).length > 0) {
              await db.updateVideo(videoId, updates);
              console.log(
                `[BackgroundAssembly] ${sessionToken}: FFprobe metadata for video ${videoId}: ` +
                `${meta.duration}s, ${meta.width}x${meta.height}, codec=${meta.codec}`
              );
            }
          }
        } catch (probeErr) {
          console.warn(`[BackgroundAssembly] ${sessionToken}: FFprobe metadata extraction failed (non-fatal):`, probeErr);
        }
      }

      // Phase: Generating thumbnail (for video files)
      if (mimeType.startsWith('video/')) {
        await updateAssemblyProgress(sessionId, { assemblyPhase: "generating_thumbnail" });
        try {
          const thumbnail = await generateVideoThumbnail(finalUrl!, {
            userId,
            filename,
            seekTime: 1,
            width: 640,
          });
          if (thumbnail) {
            await db.updateFile(fileId, {
              thumbnailUrl: thumbnail.url,
              thumbnailKey: thumbnail.key,
            });
            if (videoId) {
              await db.updateVideo(videoId, {
                thumbnailUrl: thumbnail.url,
                thumbnailKey: thumbnail.key,
              });
            }
            console.log(`[BackgroundAssembly] ${sessionToken}: Video thumbnail generated and saved`);
          }
        } catch (thumbError) {
          console.warn(`[BackgroundAssembly] ${sessionToken}: Thumbnail generation failed (non-fatal):`, thumbError);
        }
      }

      // Phase: Auto-trigger HLS transcoding for video files
      if (mimeType.startsWith('video/') && videoId && finalUrl && finalUrl.startsWith('http')) {
        try {
          const { queueAutoHls } = await import('./autoHls');
          // Get latest video metadata (FFprobe may have updated width/height above)
          const latestVideo = await db.getVideoById(videoId);
          queueAutoHls(videoId, finalUrl, {
            sourceWidth: (latestVideo as any)?.width || null,
            sourceHeight: (latestVideo as any)?.height || null,
            filename,
            userId,
            delay: 2000, // Short delay since FFprobe already ran
          });
          console.log(`[BackgroundAssembly] ${sessionToken}: Auto-HLS queued for video ${videoId}`);
        } catch (hlsErr) {
          console.warn(`[BackgroundAssembly] ${sessionToken}: Auto-HLS queue failed (non-fatal):`, hlsErr);
        }
      }

      // Phase: Complete
      await updateAssemblyProgress(sessionId, { assemblyPhase: "complete" });

      const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[BackgroundAssembly] ✅ ${sessionToken}: Assembly complete in ${totalElapsed}s. ` +
        `File ${fileId} now served from S3 directly.`
      );

      // Send "processing complete" notification to the user
      try {
        const sizeMB = (totalBytesWritten / 1024 / 1024).toFixed(1);
        await sendActivityEmail({
          userId,
          activityType: "upload",
          title: `File Processing Complete: ${filename}`,
          content: `Your file "${filename}" (${sizeMB} MB) has finished processing and is now ready for transcription, captioning, and AI analysis. Processing took ${totalElapsed} seconds.`,
          details: `File size: ${sizeMB} MB, Processing time: ${totalElapsed}s, Chunks: ${chunks.length}`,
          fileId,
          fileName: filename,
        });
        console.log(`[BackgroundAssembly] ${sessionToken}: Processing complete notification sent to user ${userId}`);
      } catch (notifError) {
        console.warn(`[BackgroundAssembly] ${sessionToken}: Failed to send processing complete notification (non-fatal):`, notifError);
      }

    } finally {
      // Clean up temp file
      try {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile);
        }
      } catch (e) {
        console.warn(`[BackgroundAssembly] Failed to clean up temp file: ${tmpFile}`);
      }
    }

  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[BackgroundAssembly] ❌ ${sessionToken}: Assembly failed after ${elapsed}s:`, error);
    // Mark as failed in DB
    await updateAssemblyProgress(sessionId, { assemblyPhase: "failed" });
    // Don't throw — this is a background job. The streaming endpoint still works as fallback.
  } finally {
    activeAssemblies.delete(sessionToken);
  }
}

/**
 * Check if a session's file has been assembled (has a direct S3 URL)
 */
export function isAssemblyInProgress(sessionToken: string): boolean {
  return activeAssemblies.has(sessionToken);
}

/**
 * Get the calculated timeout for a given file size (exported for testing).
 */
export { calculateTimeout };

/**
 * Scan for any completed upload sessions that still use streaming URLs
 * and trigger background assembly for them. Called on server startup.
 */
export async function assembleAllPendingSessions(): Promise<void> {
  try {
    const drizzle = await getDb();
    if (!drizzle) return;

    // Find completed sessions that still use streaming URLs and have corresponding file records
    const pendingSessions = await drizzle
      .select({
        sessionId: resumableUploadSessions.id,
        sessionToken: resumableUploadSessions.sessionToken,
        filename: resumableUploadSessions.filename,
        mimeType: resumableUploadSessions.mimeType,
        fileSize: resumableUploadSessions.fileSize,
        uploadType: resumableUploadSessions.uploadType,
        userId: resumableUploadSessions.userId,
      })
      .from(resumableUploadSessions)
      .where(
        and(
          eq(resumableUploadSessions.status, "completed"),
        )
      );

    // Filter to only those that still use streaming URLs
    const needsAssembly = [];
    for (const session of pendingSessions) {
      const streamUrl = `/api/files/stream/${session.sessionToken}`;
      const [fileRecord] = await drizzle
        .select({ id: files.id, url: files.url })
        .from(files)
        .where(eq(files.url, streamUrl))
        .limit(1);

      if (fileRecord) {
        const [videoRecord] = await drizzle
          .select({ id: videos.id })
          .from(videos)
          .where(eq(videos.fileId, fileRecord.id))
          .limit(1);

        needsAssembly.push({
          ...session,
          fileId: fileRecord.id,
          videoId: videoRecord?.id,
        });
      }
    }

    if (needsAssembly.length === 0) {
      console.log(`[BackgroundAssembly] No pending sessions need assembly`);
      return;
    }

    console.log(`[BackgroundAssembly] Found ${needsAssembly.length} sessions needing assembly`);

    // Process them sequentially to avoid memory pressure
    for (const session of needsAssembly) {
      const sizeMB = Number(session.fileSize) / 1024 / 1024;
      if (sizeMB > MAX_ASSEMBLY_SIZE / 1024 / 1024) {
        console.log(`[BackgroundAssembly] Skipping ${session.filename} (${sizeMB.toFixed(1)}MB > ${MAX_ASSEMBLY_SIZE / 1024 / 1024}MB limit)`);
        continue;
      }

      await assembleChunksInBackground(
        session.sessionToken,
        session.sessionId,
        session.userId,
        session.fileId,
        session.videoId,
        session.filename,
        session.mimeType,
        session.uploadType,
      );
    }
  } catch (error) {
    console.error(`[BackgroundAssembly] Error scanning for pending sessions:`, error);
  }
}
