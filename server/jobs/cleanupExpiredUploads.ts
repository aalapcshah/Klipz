/**
 * Cleanup job for expired resumable upload sessions
 * 
 * This job should be run periodically (e.g., every hour) to:
 * 1. Find expired upload sessions
 * 2. Delete associated S3 chunks
 * 3. Remove database records
 * 
 * Can be triggered via:
 * - A cron endpoint (e.g., /api/cron/cleanup-uploads)
 * - A scheduled task in the hosting platform
 */

import { getDb } from "../db";
import { resumableUploadSessions, resumableUploadChunks } from "../../drizzle/schema";
import { eq, lt, and, inArray } from "drizzle-orm";
import { storageDelete } from "../storage";

export interface CleanupResult {
  expiredSessions: number;
  deletedChunks: number;
  errors: string[];
}

export async function cleanupExpiredUploads(): Promise<CleanupResult> {
  const db = await getDb();
  const result: CleanupResult = {
    expiredSessions: 0,
    deletedChunks: 0,
    errors: [],
  };

  if (!db) {
    result.errors.push("Database connection not available");
    return result;
  }

  try {
    const now = new Date();
    
    // Find expired sessions
    const expiredSessions = await db
      .select()
      .from(resumableUploadSessions)
      .where(lt(resumableUploadSessions.expiresAt, now));

    if (expiredSessions.length === 0) {
      console.log("[CleanupJob] No expired sessions found");
      return result;
    }

    console.log(`[CleanupJob] Found ${expiredSessions.length} expired sessions`);
    result.expiredSessions = expiredSessions.length;

    // Process each expired session
    for (const session of expiredSessions) {
      try {
        // Get all chunks for this session
        const chunks = await db
          .select()
          .from(resumableUploadChunks)
          .where(eq(resumableUploadChunks.sessionId, session.id));

        // Delete S3 objects for each chunk
        for (const chunk of chunks) {
          if (chunk.storageKey) {
            try {
              await storageDelete(chunk.storageKey);
              result.deletedChunks++;
            } catch (s3Error) {
              console.error(`[CleanupJob] Failed to delete S3 object ${chunk.storageKey}:`, s3Error);
              result.errors.push(`S3 delete failed: ${chunk.storageKey}`);
            }
          }
        }

        // Delete chunks from database
        await db
          .delete(resumableUploadChunks)
          .where(eq(resumableUploadChunks.sessionId, session.id));

        // Delete session from database
        await db
          .delete(resumableUploadSessions)
          .where(eq(resumableUploadSessions.id, session.id));

        console.log(`[CleanupJob] Cleaned up session ${session.sessionToken}`);
      } catch (sessionError) {
        console.error(`[CleanupJob] Failed to cleanup session ${session.sessionToken}:`, sessionError);
        result.errors.push(`Session cleanup failed: ${session.sessionToken}`);
      }
    }

    console.log(`[CleanupJob] Cleanup complete: ${result.expiredSessions} sessions, ${result.deletedChunks} chunks deleted`);
    return result;
  } catch (error) {
    console.error("[CleanupJob] Cleanup job failed:", error);
    result.errors.push(`Job failed: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
}

// Also cleanup abandoned sessions (no activity for 48 hours)
export async function cleanupAbandonedUploads(): Promise<CleanupResult> {
  const db = await getDb();
  const result: CleanupResult = {
    expiredSessions: 0,
    deletedChunks: 0,
    errors: [],
  };

  if (!db) {
    result.errors.push("Database connection not available");
    return result;
  }

  try {
    const cutoffTime = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
    
    // Find abandoned sessions (paused or active with no recent activity)
    const abandonedSessions = await db
      .select()
      .from(resumableUploadSessions)
      .where(
        and(
          lt(resumableUploadSessions.lastActivityAt, cutoffTime),
          inArray(resumableUploadSessions.status, ["active", "paused"])
        )
      );

    if (abandonedSessions.length === 0) {
      console.log("[CleanupJob] No abandoned sessions found");
      return result;
    }

    console.log(`[CleanupJob] Found ${abandonedSessions.length} abandoned sessions`);
    result.expiredSessions = abandonedSessions.length;

    // Mark as expired first
    for (const session of abandonedSessions) {
      await db
        .update(resumableUploadSessions)
        .set({ status: "expired" })
        .where(eq(resumableUploadSessions.id, session.id));
    }

    // Then run the regular cleanup
    const expiredResult = await cleanupExpiredUploads();
    result.deletedChunks = expiredResult.deletedChunks;
    result.errors.push(...expiredResult.errors);

    return result;
  } catch (error) {
    console.error("[CleanupJob] Abandoned cleanup failed:", error);
    result.errors.push(`Job failed: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
}
