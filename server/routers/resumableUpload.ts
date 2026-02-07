import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut, storageGet } from "../storage";
import * as db from "../db";
import { getDb } from "../db";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { resumableUploadSessions, resumableUploadChunks } from "../../drizzle/schema";
import { eq, and, lt, sql } from "drizzle-orm";

// Constants
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const SESSION_EXPIRY_HOURS = 24; // Sessions expire after 24 hours of inactivity

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
      };
    }),

  /**
   * Finalize upload - assemble chunks and create file record
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
      
      console.log(`[ResumableUpload] Finalizing session ${input.sessionToken}: assembling ${chunks.length} chunks`);
      
      // Download and combine all chunks
      const chunkBuffers: Buffer[] = [];
      for (const chunk of chunks) {
        try {
          // Get presigned URL and fetch chunk
          const { url } = await storageGet(chunk.storageKey);
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to fetch chunk ${chunk.chunkIndex}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          chunkBuffers.push(Buffer.from(arrayBuffer));
        } catch (error) {
          console.error(`[ResumableUpload] Failed to fetch chunk ${chunk.chunkIndex}:`, error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to assemble chunk ${chunk.chunkIndex}`,
          });
        }
      }
      
      // Combine chunks
      const completeFile = Buffer.concat(chunkBuffers);
      console.log(`[ResumableUpload] Combined file size: ${completeFile.length} bytes`);
      
      // Generate final file key
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const folder = session.uploadType === 'video' ? 'videos' : 'files';
      const finalFileKey = `user-${ctx.user.id}/${folder}/${timestamp}-${randomSuffix}-${session.filename}`;
      
      // Upload final file to S3
      const { url: finalUrl } = await storagePut(finalFileKey, completeFile, session.mimeType);
      
      // Create file record in database
      // createFile returns the insertId directly (a number), not an object
      const metadata = session.metadata as { title?: string; description?: string; collectionId?: number; tags?: string[] } || {};
      const fileId = await db.createFile({
        userId: ctx.user.id,
        fileKey: finalFileKey,
        url: finalUrl,
        filename: session.filename,
        mimeType: session.mimeType,
        fileSize: completeFile.length,
        title: metadata.title,
        description: metadata.description,
      });
      
      // Create video record if this is a video
      let videoId: number | undefined;
      if (session.uploadType === 'video' && session.mimeType.startsWith('video/')) {
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
        .where(eq(resumableUploadSessions.id, session.id));
      
      console.log(`[ResumableUpload] Upload complete: file ID ${fileId}`);
      
      return {
        success: true,
        fileId,
        videoId,
        url: finalUrl,
        fileKey: finalFileKey,
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
        expiresAt: resumableUploadSessions.expiresAt,
        createdAt: resumableUploadSessions.createdAt,
        lastActivityAt: resumableUploadSessions.lastActivityAt,
      })
      .from(resumableUploadSessions)
      .where(
        and(
          eq(resumableUploadSessions.userId, ctx.user.id),
          sql`${resumableUploadSessions.status} IN ('active', 'paused')`
        )
      )
      .orderBy(resumableUploadSessions.lastActivityAt);
    
    // Filter out expired sessions
    const now = new Date();
    const activeSessions = sessions.filter(s => new Date(s.expiresAt) > now);
    
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
});
