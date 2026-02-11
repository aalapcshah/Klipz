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
 */

import { getDb } from "../db";
import * as db from "../db";
import { storagePut, storageGet } from "../storage";
import { resumableUploadSessions, resumableUploadChunks, files, videos } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Track active assembly jobs to prevent duplicates
const activeAssemblies = new Set<string>();

/**
 * Assemble chunks into a single S3 file in the background.
 * This function is fire-and-forget — it logs errors but doesn't throw.
 * 
 * @param sessionToken - The upload session token
 * @param sessionId - The database session ID
 * @param userId - The user who uploaded the file
 * @param fileId - The file record ID to update
 * @param videoId - Optional video record ID to update
 * @param filename - Original filename
 * @param mimeType - File MIME type
 * @param uploadType - 'video' or 'file'
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

      // Read the assembled file and upload to S3
      const assembledBuffer = fs.readFileSync(tmpFile);
      
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const folder = uploadType === 'video' ? 'videos' : 'files';
      const finalFileKey = `user-${userId}/${folder}/${timestamp}-${randomSuffix}-${filename}`;

      console.log(`[BackgroundAssembly] ${sessionToken}: Uploading assembled file to S3 as ${finalFileKey}...`);
      
      const result = await storagePut(finalFileKey, assembledBuffer, mimeType);
      const finalUrl = result.url;

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
