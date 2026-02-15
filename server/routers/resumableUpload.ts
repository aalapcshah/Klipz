import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut, storageGet } from "../storage";
import * as db from "../db";
import { getDb } from "../db";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { resumableUploadSessions, resumableUploadChunks } from "../../drizzle/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { assembleChunksInBackground } from "../lib/backgroundAssembly";
import { logTeamActivity } from "../lib/teamActivity";
import { checkTeamStorageAlerts } from "./teams";

// Constants
const DEFAULT_CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunks (kept small to avoid proxy body size limits on deployed sites)
const SESSION_EXPIRY_HOURS = 24; // Sessions expire after 24 hours of inactivity
const SMALL_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB - files below this are assembled synchronously
const ASSEMBLY_BATCH_SIZE = 10; // Process 10 chunks at a time during assembly

/**
 * For large files (>50MB), instead of downloading all chunks and re-uploading as one file
 * (which causes OOM and 503 timeouts), we skip assembly entirely.
 * The file is served via a streaming endpoint that reads chunks from S3 in order.
 * This means finalize for large files is instant — just verify chunks and create the DB record.
 */
async function finalizeLargeFileWithStreaming(
  sessionId: number,
  sessionToken: string,
  userId: number,
  session: {
    filename: string;
    fileSize: number | bigint;
    mimeType: string;
    uploadType: string;
    metadata: any;
  }
): Promise<{ fileId: number; videoId?: number; url: string; fileKey: string }> {
  const drizzle = await getDb();
  if (!drizzle) throw new Error("Database not available");

  const totalSize = Number(session.fileSize);

  // The "file key" for chunk-based files is the session token prefix
  // The actual file is served via /api/files/stream/:sessionToken
  const finalFileKey = `chunked/${sessionToken}/${session.filename}`;
  const finalUrl = `/api/files/stream/${sessionToken}`;

  console.log(`[ResumableUpload] Chunk-streaming finalize for ${sessionToken}: ${(totalSize / 1024 / 1024).toFixed(1)}MB — no re-assembly needed`);

  // Create file record in database
  const metadata = session.metadata as { title?: string; description?: string; collectionId?: number; tags?: string[] } || {};
  const fileId = await db.createFile({
    userId,
    fileKey: finalFileKey,
    url: finalUrl,
    filename: session.filename,
    mimeType: session.mimeType,
    fileSize: totalSize,
    title: metadata.title,
    description: metadata.description,
  });

  // Create video record for any video file (auto-detect video uploads from Files section too)
  let videoId: number | undefined;
  if (session.mimeType.startsWith('video/')) {
    videoId = await db.createVideo({
      userId,
      fileId,
      fileKey: finalFileKey,
      url: finalUrl,
      filename: session.filename,
      title: metadata.title || session.filename,
      description: metadata.description,
      duration: 0,
      exportStatus: 'draft',
    });
    if (session.uploadType !== 'video') {
      console.log(`[ResumableUpload] Auto-detected video file from Files upload: ${session.filename} → video ID ${videoId}`);
    }
  }

  // Update session as completed
  await drizzle
    .update(resumableUploadSessions)
    .set({
      status: 'completed',
      finalFileKey,
      finalFileUrl: finalUrl,
      completedAt: new Date(),
    })
    .where(eq(resumableUploadSessions.id, sessionId));

  console.log(`[ResumableUpload] Chunk-streaming finalize complete for ${sessionToken}: file ID ${fileId}, video ID: ${videoId || 'N/A'}`);

  // Kick off background assembly to create a single S3 file
  // This runs asynchronously — the streaming endpoint works immediately as a fallback
  // Once assembly completes, the file/video records are updated with the direct S3 URL
  assembleChunksInBackground(
    sessionToken,
    sessionId,
    userId,
    fileId,
    videoId,
    session.filename,
    session.mimeType,
    session.uploadType,
  ).catch(err => {
    console.error(`[ResumableUpload] Background assembly error for ${sessionToken}:`, err);
  });

  return { fileId, videoId, url: finalUrl, fileKey: finalFileKey };
}

/**
 * Resumable Upload Router
 * Implements a resumable upload protocol similar to tus.io
 * Chunks are stored in S3 and metadata in the database
 * Allows uploads to resume across browser sessions
 */
export const resumableUploadRouter = router({
  /**
   * Create a new upload session
   * Returns a session token that can be used to resume the upload
   */
  createSession: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        fileSize: z.number().positive(),
        mimeType: z.string(),
        uploadType: z.enum(["video", "file"]),
        chunkSize: z.number().optional(),
        metadata: z.object({
          title: z.string().optional(),
          description: z.string().optional(),
          quality: z.string().optional(),
          collectionId: z.number().optional(),
          tags: z.array(z.string()).optional(),
        }).optional(),
        deviceInfo: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const chunkSize = input.chunkSize || DEFAULT_CHUNK_SIZE;
      const totalChunks = Math.ceil(input.fileSize / chunkSize);
      const sessionToken = nanoid(32);
      const chunkStoragePrefix = `user-${ctx.user.id}/chunks/${sessionToken}`;
      
      // Calculate expiry time (24 hours from now)
      const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
      
      // Create session in database
      const [session] = await drizzle.insert(resumableUploadSessions).values({
        userId: ctx.user.id,
        sessionToken,
        filename: input.filename,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        uploadType: input.uploadType,
        chunkSize,
        totalChunks,
        chunkStoragePrefix,
        metadata: input.metadata || {},
        deviceInfo: input.deviceInfo || null,
        expiresAt,
      }).$returningId();
      
      // Pre-create chunk records for tracking
      const chunkRecords = Array.from({ length: totalChunks }, (_, i) => ({
        sessionId: session.id,
        chunkIndex: i,
        chunkSize: i === totalChunks - 1 
          ? input.fileSize - (i * chunkSize) // Last chunk may be smaller
          : chunkSize,
        storageKey: `${chunkStoragePrefix}/chunk-${i.toString().padStart(5, '0')}`,
        status: 'pending' as const,
      }));
      
      if (chunkRecords.length > 0) {
        await drizzle.insert(resumableUploadChunks).values(chunkRecords);
      }
      
      console.log(`[ResumableUpload] Created session ${sessionToken} for ${input.filename} (${totalChunks} chunks)`);
      
      return {
        sessionToken,
        chunkSize,
        totalChunks,
        expiresAt: expiresAt.toISOString(),
      };
    }),

  /**
   * Get session status - used to resume uploads
   * Returns which chunks have been uploaded
   */
  getSessionStatus: protectedProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ ctx, input }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      // Find session
      const [session] = await drizzle
        .select()
        .from(resumableUploadSessions)
        .where(
          and(
            eq(resumableUploadSessions.sessionToken, input.sessionToken),
            eq(resumableUploadSessions.userId, ctx.user.id)
          )
        );
      
      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Upload session not found",
        });
      }
      
      // Check if session is expired
      if (session.status === 'expired' || new Date(session.expiresAt) < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Upload session has expired. Please start a new upload.",
        });
      }
      
      // Get chunk statuses
      const chunks = await drizzle
        .select({
          chunkIndex: resumableUploadChunks.chunkIndex,
          status: resumableUploadChunks.status,
          chunkSize: resumableUploadChunks.chunkSize,
        })
        .from(resumableUploadChunks)
        .where(eq(resumableUploadChunks.sessionId, session.id))
        .orderBy(resumableUploadChunks.chunkIndex);
      
      const uploadedChunks = chunks.filter(c => c.status === 'uploaded' || c.status === 'verified');
      const uploadedBytes = uploadedChunks.reduce((sum, c) => sum + c.chunkSize, 0);
      
      return {
        sessionToken: session.sessionToken,
        filename: session.filename,
        fileSize: session.fileSize,
        mimeType: session.mimeType,
        uploadType: session.uploadType,
        status: session.status,
        totalChunks: session.totalChunks,
        uploadedChunks: uploadedChunks.length,
        uploadedBytes,
        chunkSize: session.chunkSize,
        chunks: chunks.map(c => ({
          index: c.chunkIndex,
          status: c.status,
        })),
        metadata: session.metadata,
        expiresAt: session.expiresAt,
      };
    }),

  /**
   * Upload a single chunk
   * Stores the chunk in S3 and updates the database
   */
  uploadChunk: protectedProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        chunkIndex: z.number().min(0),
        chunkData: z.string(), // base64 encoded
        checksum: z.string().optional(), // MD5 hash for verification
      })
    )
    .mutation(async ({ ctx, input }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      // Find session
      const [session] = await drizzle
        .select()
        .from(resumableUploadSessions)
        .where(
          and(
            eq(resumableUploadSessions.sessionToken, input.sessionToken),
            eq(resumableUploadSessions.userId, ctx.user.id)
          )
        );
      
      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Upload session not found",
        });
      }
      
      if (session.status !== 'active' && session.status !== 'paused') {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot upload to session with status: ${session.status}`,
        });
      }
      
      // Find chunk record
      const [chunk] = await drizzle
        .select()
        .from(resumableUploadChunks)
        .where(
          and(
            eq(resumableUploadChunks.sessionId, session.id),
            eq(resumableUploadChunks.chunkIndex, input.chunkIndex)
          )
        );
      
      if (!chunk) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Chunk ${input.chunkIndex} not found`,
        });
      }
      
      // Decode and upload chunk to S3
      const chunkBuffer = Buffer.from(input.chunkData, "base64");

      // Verify checksum if provided
      if (input.checksum) {
        const crypto = await import('crypto');
        const serverChecksum = crypto.createHash('sha256').update(chunkBuffer).digest('hex');
        if (serverChecksum !== input.checksum) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Chunk ${input.chunkIndex} integrity check failed: expected ${input.checksum}, got ${serverChecksum}`,
          });
        }
      }

      await storagePut(chunk.storageKey, chunkBuffer, "application/octet-stream");
      
      // Update chunk status
      await drizzle
        .update(resumableUploadChunks)
        .set({
          status: 'uploaded',
          checksum: input.checksum,
          uploadedAt: new Date(),
        })
        .where(eq(resumableUploadChunks.id, chunk.id));
      
      // Update session progress
      const uploadedCount = await drizzle
        .select({ count: sql<number>`count(*)` })
        .from(resumableUploadChunks)
        .where(
          and(
            eq(resumableUploadChunks.sessionId, session.id),
            eq(resumableUploadChunks.status, 'uploaded')
          )
        );
      
      const newUploadedChunks = Number(uploadedCount[0]?.count || 0);
      const newUploadedBytes = Number(session.uploadedBytes) + chunkBuffer.length;
      
      // Extend session expiry on activity
      const newExpiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
      
      await drizzle
        .update(resumableUploadSessions)
        .set({
          uploadedChunks: newUploadedChunks,
          uploadedBytes: newUploadedBytes,
          lastActivityAt: new Date(),
          expiresAt: newExpiresAt,
          status: 'active',
        })
        .where(eq(resumableUploadSessions.id, session.id));
      
      console.log(`[ResumableUpload] Session ${input.sessionToken}: chunk ${input.chunkIndex + 1}/${session.totalChunks} uploaded`);
      
      return {
        success: true,
        chunkIndex: input.chunkIndex,
        uploadedChunks: newUploadedChunks,
        totalChunks: session.totalChunks,
        uploadedBytes: newUploadedBytes,
        fileSize: Number(session.fileSize),
        checksumVerified: !!input.checksum,
      };
    }),

  /**
   * Finalize upload - assemble chunks and create file record
   * For small files (<50MB): assembles synchronously and returns the result
   * For large files (>=50MB): starts background assembly and returns immediately
   *   Client should poll getFinalizeStatus to check completion
   */
  finalizeUpload: protectedProcedure
    .input(z.object({ sessionToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      // Find session
      const [session] = await drizzle
        .select()
        .from(resumableUploadSessions)
        .where(
          and(
            eq(resumableUploadSessions.sessionToken, input.sessionToken),
            eq(resumableUploadSessions.userId, ctx.user.id)
          )
        );
      
      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Upload session not found",
        });
      }

      // If already finalizing, return status (idempotent)
      if (session.status === 'finalizing') {
        return {
          success: true,
          async: true,
          message: "Assembly is already in progress. Poll getFinalizeStatus for updates.",
        };
      }

      // If already completed, return the result
      if (session.status === 'completed') {
        return {
          success: true,
          async: false,
          fileKey: session.finalFileKey,
          url: session.finalFileUrl,
        };
      }
      
      // Verify all chunks are uploaded
      const chunks = await drizzle
        .select()
        .from(resumableUploadChunks)
        .where(eq(resumableUploadChunks.sessionId, session.id))
        .orderBy(resumableUploadChunks.chunkIndex);
      
      const pendingChunks = chunks.filter(c => c.status !== 'uploaded' && c.status !== 'verified');
      if (pendingChunks.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot finalize: ${pendingChunks.length} chunks are still pending`,
        });
      }
      
      console.log(`[ResumableUpload] Finalizing session ${input.sessionToken}: ${chunks.length} chunks, ${(Number(session.fileSize) / 1024 / 1024).toFixed(1)}MB`);
      
      // Update session status to 'finalizing'
      await drizzle
        .update(resumableUploadSessions)
        .set({ status: 'finalizing', lastActivityAt: new Date() })
        .where(eq(resumableUploadSessions.id, session.id));

      const totalSize = Number(session.fileSize);

      // For small files, assemble synchronously (fast enough to not timeout)
      if (totalSize <= SMALL_FILE_THRESHOLD) {
        try {
          const chunkBuffers: Buffer[] = [];
          for (const chunk of chunks) {
            // Retry chunk download up to 3 times with exponential backoff
            let lastError: Error | null = null;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const { url } = await storageGet(chunk.storageKey);
                const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
                if (!response.ok) throw new Error(`HTTP ${response.status} fetching chunk ${chunk.chunkIndex}`);
                const arrayBuffer = await response.arrayBuffer();
                chunkBuffers.push(Buffer.from(arrayBuffer));
                lastError = null;
                break;
              } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                if (attempt < 2) {
                  const delay = Math.pow(2, attempt) * 1000; // 1s, 2s
                  console.warn(`[ResumableUpload] Chunk ${chunk.chunkIndex} fetch attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError.message);
                  await new Promise(r => setTimeout(r, delay));
                }
              }
            }
            if (lastError) throw new Error(`Failed to fetch chunk ${chunk.chunkIndex} after 3 attempts: ${lastError.message}`);
          }
          const completeFile = Buffer.concat(chunkBuffers);

          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          const folder = session.uploadType === 'video' ? 'videos' : 'files';
          const finalFileKey = `user-${ctx.user.id}/${folder}/${timestamp}-${randomSuffix}-${session.filename}`;

          // Retry S3 upload up to 3 times
          let result: { url: string; key: string };
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              result = await storagePut(finalFileKey, completeFile, session.mimeType);
              break;
            } catch (err) {
              if (attempt === 2) throw err;
              const delay = Math.pow(2, attempt) * 1000;
              console.warn(`[ResumableUpload] storagePut attempt ${attempt + 1} failed, retrying in ${delay}ms`);
              await new Promise(r => setTimeout(r, delay));
            }
          }
          const finalUrl = result!.url;

          // Create file record
          const metadata = session.metadata as { title?: string; description?: string; collectionId?: number; tags?: string[] } || {};
          const fileId = await db.createFile({
            userId: ctx.user.id,
            fileKey: finalFileKey,
            url: finalUrl,
            filename: session.filename,
            mimeType: session.mimeType,
            fileSize: totalSize,
            title: metadata.title,
            description: metadata.description,
          });

          // Create video record for any video file (auto-detect video uploads from Files section too)
          let videoId: number | undefined;
          if (session.mimeType.startsWith('video/')) {
            videoId = await db.createVideo({
              userId: ctx.user.id,
              fileId,
              fileKey: finalFileKey,
              url: finalUrl,
              filename: session.filename,
              title: metadata.title || session.filename,
              description: metadata.description,
              duration: 0,
              exportStatus: 'draft',
            });
            if (session.uploadType !== 'video') {
              console.log(`[ResumableUpload] Auto-detected video file from Files upload: ${session.filename} → video ID ${videoId}`);
            }

            // Extract video metadata (duration, resolution) via FFprobe in the background
            import('../lib/ffprobe').then(({ extractVideoMetadata }) => {
              extractVideoMetadata(finalUrl).then(async (meta) => {
                if (meta && videoId) {
                  const updates: any = {};
                  if (meta.duration > 0) updates.duration = meta.duration;
                  if (meta.width) updates.width = meta.width;
                  if (meta.height) updates.height = meta.height;
                  if (Object.keys(updates).length > 0) {
                    await db.updateVideo(videoId, updates);
                    console.log(`[ResumableUpload] FFprobe metadata for video ${videoId}: ${meta.duration}s, ${meta.width}x${meta.height}`);
                  }
                }
              }).catch(err => console.error(`[ResumableUpload] FFprobe failed for video ${videoId}:`, err));
            });
          }

          await drizzle
            .update(resumableUploadSessions)
            .set({
              status: 'completed',
              finalFileKey,
              finalFileUrl: finalUrl,
              completedAt: new Date(),
            })
            .where(eq(resumableUploadSessions.id, session.id));

          console.log(`[ResumableUpload] Sync finalize complete: file ID ${fileId}, video ID: ${videoId || 'N/A'}`);

          // Log team activity and check storage alerts if user belongs to a team
          if (ctx.user.teamId) {
            logTeamActivity({
              teamId: ctx.user.teamId,
              actorId: ctx.user.id,
              actorName: ctx.user.name || null,
              type: "file_uploaded",
              details: { filename: session.filename },
            }).catch(() => {}); // fire-and-forget
            checkTeamStorageAlerts(ctx.user.teamId).catch(() => {});
          }

          return {
            success: true,
            async: false,
            fileId,
            videoId,
            url: finalUrl,
            fileKey: finalFileKey,
          };
        } catch (error) {
          console.error(`[ResumableUpload] Sync finalize failed:`, error);
          // Reset to active so client can retry
          await drizzle
            .update(resumableUploadSessions)
            .set({ status: 'active', lastActivityAt: new Date() })
            .where(eq(resumableUploadSessions.id, session.id));
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Assembly failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }

      // For large files, use chunk-streaming approach — no re-assembly needed
      // The file is served via /api/files/stream/:sessionToken which reads chunks from S3 in order
      try {
        const result = await finalizeLargeFileWithStreaming(session.id, session.sessionToken, ctx.user.id, {
          filename: session.filename,
          fileSize: session.fileSize,
          mimeType: session.mimeType,
          uploadType: session.uploadType,
          metadata: session.metadata,
        });

        // Log team activity and check storage alerts if user belongs to a team
        if (ctx.user.teamId) {
          logTeamActivity({
            teamId: ctx.user.teamId,
            actorId: ctx.user.id,
            actorName: ctx.user.name || null,
            type: "file_uploaded",
            details: { filename: session.filename },
          }).catch(() => {}); // fire-and-forget
          checkTeamStorageAlerts(ctx.user.teamId).catch(() => {});
        }

        return {
          success: true,
          fileId: result.fileId,
          videoId: result.videoId,
          url: result.url,
          fileKey: result.fileKey,
        };
      } catch (error) {
        console.error(`[ResumableUpload] Chunk-streaming finalize failed:`, error);
        // Reset to active so client can retry
        await drizzle
          .update(resumableUploadSessions)
          .set({ status: 'active', lastActivityAt: new Date() })
          .where(eq(resumableUploadSessions.id, session.id));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Finalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Check the status of a background finalization
   * Client polls this after finalizeUpload returns async: true
   */
  getFinalizeStatus: protectedProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ ctx, input }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [session] = await drizzle
        .select()
        .from(resumableUploadSessions)
        .where(
          and(
            eq(resumableUploadSessions.sessionToken, input.sessionToken),
            eq(resumableUploadSessions.userId, ctx.user.id)
          )
        );

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Upload session not found" });
      }

      if (session.status === 'completed') {
        return {
          status: 'completed' as const,
          fileKey: session.finalFileKey,
          url: session.finalFileUrl,
        };
      }

      if (session.status === 'finalizing') {
        // Check if stuck in finalizing for more than 5 minutes
        const STALE_FINALIZING_MS = 5 * 60 * 1000;
        const lastActivity = session.lastActivityAt ? new Date(session.lastActivityAt).getTime() : 0;
        if (Date.now() - lastActivity > STALE_FINALIZING_MS) {
          // Auto-recover: reset to active so client can retry
          console.log(`[ResumableUpload] getFinalizeStatus: auto-recovering stale session ${input.sessionToken}`);
          await drizzle
            .update(resumableUploadSessions)
            .set({ status: 'active', lastActivityAt: new Date() })
            .where(eq(resumableUploadSessions.id, session.id));
          return {
            status: 'failed' as const,
            message: "Assembly timed out. Please retry.",
          };
        }
        return {
          status: 'finalizing' as const,
          message: "File assembly in progress...",
        };
      }

      // If status is 'active', the assembly failed and was reset
      if (session.status === 'active') {
        return {
          status: 'failed' as const,
          message: "Assembly failed. You can retry finalization.",
        };
      }

      return {
        status: session.status as string,
      };
    }),

  /**
   * Pause an upload session
   */
  pauseSession: protectedProcedure
    .input(z.object({ sessionToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      await drizzle
        .update(resumableUploadSessions)
        .set({ status: 'paused', lastActivityAt: new Date() })
        .where(
          and(
            eq(resumableUploadSessions.sessionToken, input.sessionToken),
            eq(resumableUploadSessions.userId, ctx.user.id)
          )
        );
      
      return { success: true };
    }),

  /**
   * Cancel and delete an upload session
   */
  cancelSession: protectedProcedure
    .input(z.object({ sessionToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      // No background assembly to cancel — large files use chunk-streaming

      // Find session
      const [session] = await drizzle
        .select()
        .from(resumableUploadSessions)
        .where(
          and(
            eq(resumableUploadSessions.sessionToken, input.sessionToken),
            eq(resumableUploadSessions.userId, ctx.user.id)
          )
        );
      
      if (session) {
        // Delete chunks
        await drizzle
          .delete(resumableUploadChunks)
          .where(eq(resumableUploadChunks.sessionId, session.id));
        
        // Delete session
        await drizzle
          .delete(resumableUploadSessions)
          .where(eq(resumableUploadSessions.id, session.id));
        
        // TODO: Delete chunk files from S3 (background job)
      }
      
      console.log(`[ResumableUpload] Session ${input.sessionToken} cancelled`);
      return { success: true };
    }),

  /**
   * List active upload sessions for the current user
   * Used to show resumable uploads on page load
   */
  listActiveSessions: protectedProcedure.query(async ({ ctx }) => {
    const drizzle = await getDb();
    if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    
    const sessions = await drizzle
      .select({
        sessionToken: resumableUploadSessions.sessionToken,
        filename: resumableUploadSessions.filename,
        fileSize: resumableUploadSessions.fileSize,
        mimeType: resumableUploadSessions.mimeType,
        uploadType: resumableUploadSessions.uploadType,
        status: resumableUploadSessions.status,
        totalChunks: resumableUploadSessions.totalChunks,
        uploadedChunks: resumableUploadSessions.uploadedChunks,
        uploadedBytes: resumableUploadSessions.uploadedBytes,
        metadata: resumableUploadSessions.metadata,
        thumbnailUrl: resumableUploadSessions.thumbnailUrl,
        deviceInfo: resumableUploadSessions.deviceInfo,
        expiresAt: resumableUploadSessions.expiresAt,
        createdAt: resumableUploadSessions.createdAt,
        lastActivityAt: resumableUploadSessions.lastActivityAt,
      })
      .from(resumableUploadSessions)
      .where(
        and(
          eq(resumableUploadSessions.userId, ctx.user.id),
          sql`${resumableUploadSessions.status} IN ('active', 'paused', 'finalizing')`
        )
      )
      .orderBy(resumableUploadSessions.lastActivityAt);
    
    // Filter out expired sessions (but keep finalizing ones)
    const now = new Date();
    const activeSessions = sessions.filter(s => 
      s.status === 'finalizing' || new Date(s.expiresAt) > now
    );

    // Auto-recover sessions stuck in 'finalizing' for more than 5 minutes
    // These are sessions where the server crashed or timed out during assembly
    const STALE_FINALIZING_MS = 5 * 60 * 1000; // 5 minutes
    const staleSessions = activeSessions.filter(
      s => s.status === 'finalizing' && s.lastActivityAt && 
        (now.getTime() - new Date(s.lastActivityAt).getTime()) > STALE_FINALIZING_MS
    );
    
    if (staleSessions.length > 0) {
      console.log(`[ResumableUpload] Auto-recovering ${staleSessions.length} stale finalizing sessions`);
      const staleTokens = staleSessions.map(s => s.sessionToken);
      // Reset stale finalizing sessions to 'active' so client can retry
      await drizzle
        .update(resumableUploadSessions)
        .set({ status: 'active', lastActivityAt: now })
        .where(
          and(
            eq(resumableUploadSessions.userId, ctx.user.id),
            sql`${resumableUploadSessions.sessionToken} IN (${sql.join(staleTokens.map(t => sql`${t}`), sql`, `)})`
          )
        );
      // Update the in-memory list to reflect the reset
      for (const s of activeSessions) {
        if (staleTokens.includes(s.sessionToken)) {
          (s as any).status = 'active';
        }
      }
    }
    
    return activeSessions;
  }),

  /**
   * Clean up expired sessions (admin/cron job)
   */
  cleanupExpiredSessions: protectedProcedure.mutation(async () => {
    const drizzle = await getDb();
    if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    
    const now = new Date();
    
    // Find expired sessions
    const expiredSessions = await drizzle
      .select({ id: resumableUploadSessions.id })
      .from(resumableUploadSessions)
      .where(
        and(
          lt(resumableUploadSessions.expiresAt, now),
          sql`${resumableUploadSessions.status} IN ('active', 'paused')`
        )
      );
    
    // Mark as expired
    if (expiredSessions.length > 0) {
      await drizzle
        .update(resumableUploadSessions)
        .set({ status: 'expired' })
        .where(lt(resumableUploadSessions.expiresAt, now));
      
      console.log(`[ResumableUpload] Marked ${expiredSessions.length} sessions as expired`);
    }
    
    return { cleanedCount: expiredSessions.length };
  }),

  /**
   * Save a thumbnail for a resumable upload session
   * Called by the client after generating a thumbnail from the video file
   */
  saveThumbnail: protectedProcedure
    .input(z.object({
      sessionToken: z.string(),
      thumbnailBase64: z.string(), // base64-encoded image data (data:image/jpeg;base64,...)
    }))
    .mutation(async ({ ctx, input }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Verify session belongs to user
      const [session] = await drizzle
        .select({ id: resumableUploadSessions.id })
        .from(resumableUploadSessions)
        .where(
          and(
            eq(resumableUploadSessions.sessionToken, input.sessionToken),
            eq(resumableUploadSessions.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Upload session not found" });
      }

      try {
        // Extract the base64 data (remove data:image/jpeg;base64, prefix)
        const base64Data = input.thumbnailBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Upload thumbnail to S3
        const thumbnailKey = `upload-thumbnails/${ctx.user.id}/${input.sessionToken}-thumb.jpg`;
        const { url } = await storagePut(thumbnailKey, buffer, 'image/jpeg');

        // Update session with thumbnail URL
        await drizzle
          .update(resumableUploadSessions)
          .set({ thumbnailUrl: url })
          .where(eq(resumableUploadSessions.id, session.id));

        return { thumbnailUrl: url };
      } catch (error) {
        console.error('[ResumableUpload] Failed to save thumbnail:', error);
        // Non-critical - don't fail the upload
        return { thumbnailUrl: null };
      }
    }),
});
