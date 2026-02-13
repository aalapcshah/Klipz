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
 * Memory management: Chunks are downloaded one at a time to a temp file on disk,
 * then the assembled file is uploaded to S3. For files up to ~200MB this works
 * with a single storagePut call. For larger files, the assembly is still attempted
 * but may fail if the storage proxy has a body size limit — in that case the
 * streaming endpoint continues to serve as fallback.
 */

import { getDb } from "../db";
import * as db from "../db";
import { storagePut, storageGet } from "../storage";
import { resumableUploadSessions, resumableUploadChunks, files, videos } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { generateVideoThumbnail } from "./videoThumbnail";
import { ENV } from "../_core/env";

// Track active assembly jobs to prevent duplicates
const activeAssemblies = new Set<string>();

// Max file size we'll attempt to assemble (2GB)
// Files up to 200MB use in-memory storagePut.
// Files 200MB-2GB use curl to stream from disk (avoids OOM).
const MAX_ASSEMBLY_SIZE = 2 * 1024 * 1024 * 1024;
const MEMORY_UPLOAD_LIMIT = 200 * 1024 * 1024; // 200MB

/**
 * Upload a file from disk to S3 using curl (streams from disk, avoids OOM for large files).
 */
function storagePutViaCurl(key: string, filePath: string, contentType: string): string {
  const normalizedKey = key.replace(/^\/+/, "");
  const baseUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
  const uploadUrl = `${baseUrl}/v1/storage/upload?path=${encodeURIComponent(normalizedKey)}`;
  const fileName = normalizedKey.split("/").pop() || "file";

  const result = execSync(
    `curl -s -X POST "${uploadUrl}" ` +
    `-H "Authorization: Bearer ${ENV.forgeApiKey}" ` +
    `-F "file=@${filePath};type=${contentType};filename=${fileName}" ` +
    `--max-time 600`,
    { maxBuffer: 10 * 1024 * 1024, timeout: 600000 }
  );

  const parsed = JSON.parse(result.toString());
  if (!parsed.url) {
    throw new Error(`storagePutViaCurl: No URL in response: ${result.toString().substring(0, 200)}`);
  }
  return parsed.url;
}

/**
 * Assemble chunks into a single S3 file in the background.
 * This function is fire-and-forget — it logs errors but doesn't throw.
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

    // Create a temporary file to assemble chunks
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `assembly-${sessionToken}-${Date.now()}`);
    const writeStream = fs.createWriteStream(tmpFile);

    let totalBytesWritten = 0;

    try {
      // Download and write chunks one at a time to minimize memory usage
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const { url } = await storageGet(chunk.storageKey);
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch chunk ${i}: HTTP ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        
        await new Promise<void>((resolve, reject) => {
          const canContinue = writeStream.write(buffer, (err) => {
            if (err) reject(err);
          });
          if (!canContinue) {
            writeStream.once("drain", resolve);
          } else {
            resolve();
          }
        });

        totalBytesWritten += buffer.length;

        // Log progress every 20 chunks
        if ((i + 1) % 20 === 0 || i === chunks.length - 1) {
          const progressPct = ((i + 1) / chunks.length * 100).toFixed(1);
          console.log(`[BackgroundAssembly] ${sessionToken}: ${progressPct}% (${i + 1}/${chunks.length} chunks, ${(totalBytesWritten / 1024 / 1024).toFixed(1)}MB)`);
        }
      }

      // Close the write stream
      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.on("error", reject);
      });

      console.log(`[BackgroundAssembly] ${sessionToken}: All chunks written to temp file (${(totalBytesWritten / 1024 / 1024).toFixed(1)}MB)`);

      // Check if the file is too large to assemble
      if (totalBytesWritten > MAX_ASSEMBLY_SIZE) {
        console.warn(`[BackgroundAssembly] ${sessionToken}: File is ${(totalBytesWritten / 1024 / 1024).toFixed(1)}MB, exceeding ${MAX_ASSEMBLY_SIZE / 1024 / 1024}MB limit. Skipping S3 upload — streaming endpoint will continue to serve this file.`);
        return;
      }

      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const folder = uploadType === 'video' ? 'videos' : 'files';
      const finalFileKey = `user-${userId}/${folder}/${timestamp}-${randomSuffix}-${filename}`;

      console.log(`[BackgroundAssembly] ${sessionToken}: Uploading assembled file to S3 as ${finalFileKey} (${(totalBytesWritten / 1024 / 1024).toFixed(1)}MB)...`);

      let finalUrl: string;

      if (totalBytesWritten <= MEMORY_UPLOAD_LIMIT) {
        // Small files: use in-memory storagePut
        const assembledBuffer = fs.readFileSync(tmpFile);
        const result = await storagePut(finalFileKey, assembledBuffer, mimeType);
        finalUrl = result.url;
      } else {
        // Large files: use curl to stream from disk (avoids OOM)
        console.log(`[BackgroundAssembly] ${sessionToken}: Using curl for large file upload...`);
        finalUrl = storagePutViaCurl(finalFileKey, tmpFile, mimeType);
      }

      console.log(`[BackgroundAssembly] ${sessionToken}: S3 upload complete. URL: ${finalUrl.substring(0, 80)}...`);

      // Update the file record with the direct S3 URL
      await db.updateFile(fileId, {
        fileKey: finalFileKey,
        url: finalUrl,
      });

      // Update the video record if it exists
      if (videoId) {
        await db.updateVideo(videoId, {
          fileKey: finalFileKey,
          url: finalUrl,
        });
      }

      // Update the session with the final S3 URL
      // This makes the streaming endpoint redirect to S3 instead of streaming chunks
      await drizzle
        .update(resumableUploadSessions)
        .set({
          finalFileKey,
          finalFileUrl: finalUrl,
        })
        .where(eq(resumableUploadSessions.id, sessionId));

      // Generate video thumbnail if this is a video file
      if (mimeType.startsWith('video/')) {
        try {
          const thumbnail = await generateVideoThumbnail(finalUrl, {
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

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[BackgroundAssembly] ✅ ${sessionToken}: Assembly complete in ${elapsed}s. File ${fileId} now served from S3 directly.`);

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
        // Check for video record
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
