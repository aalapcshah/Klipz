import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import * as db from "../db";
import { eq, and, lt } from "drizzle-orm";
import { uploadSessions } from "../../drizzle/schema";

// Session timeout for regular uploads
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour (increased from 30 min)

// In-memory chunk buffer - chunks are too large to store in DB
// But session metadata is in DB so it survives restarts
// If server restarts, chunks are lost but session can be resumed via resumable upload
const chunkBuffers = new Map<string, Buffer[]>();

// Cleanup expired sessions every 5 minutes
setInterval(async () => {
  try {
    const database = await db.getDb();
    if (!database) return;
    
    const expireTime = new Date(Date.now() - SESSION_TIMEOUT_MS);
    const expired = await database
      .select({ id: uploadSessions.id })
      .from(uploadSessions)
      .where(and(
        eq(uploadSessions.uploadType, "regular"),
        eq(uploadSessions.status, "active"),
        lt(uploadSessions.lastActivity, expireTime)
      ));
    
    for (const session of expired) {
      chunkBuffers.delete(session.id);
      await database
        .update(uploadSessions)
        .set({ status: "expired" })
        .where(eq(uploadSessions.id, session.id));
      console.log(`[UploadSession] Cleaned up expired session ${session.id}`);
    }
    
    if (expired.length > 0) {
      console.log(`[UploadSession] Cleaned up ${expired.length} expired sessions`);
    }
  } catch (e) {
    // Silently handle cleanup errors
  }
}, 5 * 60 * 1000);

export const uploadChunkRouter = router({
  // Initialize upload session
  initUpload: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        mimeType: z.string(),
        totalSize: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database not available");
      
      const sessionId = `${ctx.user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const totalChunks = Math.ceil(input.totalSize / (5 * 1024 * 1024)); // 5MB chunks
      
      // Store session in database
      await database.insert(uploadSessions).values({
        id: sessionId,
        userId: ctx.user.id,
        uploadType: "regular",
        filename: input.filename,
        mimeType: input.mimeType,
        totalSize: input.totalSize,
        totalChunks,
        title: input.title,
        description: input.description,
        receivedChunks: [],
        status: "active",
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + SESSION_TIMEOUT_MS),
      });
      
      // Initialize in-memory chunk buffer
      chunkBuffers.set(sessionId, []);

      console.log(`[UploadSession] Initialized session ${sessionId} for ${input.filename} (${input.totalSize} bytes)`);

      return { sessionId };
    }),

  // Upload a chunk
  uploadChunk: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        chunkIndex: z.number(),
        chunkData: z.string(), // base64 encoded chunk
        totalChunks: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database not available");
      
      // Check session exists in database
      const sessions = await database
        .select()
        .from(uploadSessions)
        .where(and(
          eq(uploadSessions.id, input.sessionId),
          eq(uploadSessions.status, "active")
        ));
      
      const session = sessions[0];
      
      if (!session) {
        throw new Error("Upload session not found or expired. Please start a new upload.");
      }

      // Decode base64 chunk
      const chunkBuffer = Buffer.from(input.chunkData, "base64");
      
      // Get or initialize chunk buffer
      if (!chunkBuffers.has(input.sessionId)) {
        chunkBuffers.set(input.sessionId, []);
      }
      const chunks = chunkBuffers.get(input.sessionId)!;
      chunks[input.chunkIndex] = chunkBuffer;

      // Update session in database
      const receivedChunks = [...(session.receivedChunks || [])];
      if (!receivedChunks.includes(input.chunkIndex)) {
        receivedChunks.push(input.chunkIndex);
      }
      
      await database
        .update(uploadSessions)
        .set({ 
          receivedChunks,
          lastActivity: new Date(),
        })
        .where(eq(uploadSessions.id, input.sessionId));

      if (input.chunkIndex % 10 === 0 || input.chunkIndex === input.totalChunks - 1) {
        console.log(
          `[UploadChunk] Session ${input.sessionId}: received chunk ${input.chunkIndex + 1}/${input.totalChunks} (${chunkBuffer.length} bytes)`
        );
      }

      return {
        success: true,
        receivedChunks: receivedChunks.length,
        totalChunks: input.totalChunks,
      };
    }),

  // Finalize upload - combine chunks and upload to S3
  finalizeUpload: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database not available");
      
      const sessions = await database
        .select()
        .from(uploadSessions)
        .where(and(
          eq(uploadSessions.id, input.sessionId),
          eq(uploadSessions.status, "active")
        ));
      
      const session = sessions[0];
      
      if (!session) {
        throw new Error("Upload session not found or expired");
      }

      const chunks = chunkBuffers.get(input.sessionId);
      if (!chunks || chunks.filter(Boolean).length === 0) {
        throw new Error("No chunks found in memory. The server may have restarted during upload. Please try uploading again.");
      }

      console.log(`[FinalizeUpload] Session ${input.sessionId}: combining ${chunks.length} chunks`);

      // Combine all chunks
      const completeFile = Buffer.concat(chunks.filter(Boolean));
      
      console.log(`[FinalizeUpload] Combined file size: ${completeFile.length} bytes`);

      // Generate unique file key
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const fileKey = `user-${ctx.user.id}/videos/${timestamp}-${randomSuffix}-${session.filename}`;

      // Upload to S3
      console.log(`[FinalizeUpload] Uploading to S3: ${fileKey}`);
      const { url } = await storagePut(fileKey, completeFile, session.mimeType);

      // Create file record in database
      const fileId = await db.createFile({
        userId: ctx.user.id,
        fileKey,
        url,
        filename: session.filename,
        mimeType: session.mimeType,
        fileSize: completeFile.length,
        title: session.title,
        description: session.description,
      });

      // Also create a video record if this is a video file
      const isVideo = session.mimeType.startsWith('video/');
      let videoId: number | undefined;
      
      if (isVideo) {
        videoId = await db.createVideo({
          userId: ctx.user.id,
          fileId,
          fileKey,
          url,
          filename: session.filename,
          title: session.title || session.filename,
          description: session.description,
          duration: 0,
          exportStatus: 'draft',
        });
        console.log(`[FinalizeUpload] Created video record, video ID: ${videoId}`);
      }

      // Clean up
      chunkBuffers.delete(input.sessionId);
      await database
        .update(uploadSessions)
        .set({ status: "completed" })
        .where(eq(uploadSessions.id, input.sessionId));
      
      console.log(`[FinalizeUpload] Upload complete, file ID: ${fileId}`);

      return {
        success: true,
        fileId,
        videoId,
        url,
        fileKey,
      };
    }),

  // Get session status - used for resume after failure
  getSessionStatus: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database not available");
      
      const sessions = await database
        .select()
        .from(uploadSessions)
        .where(and(
          eq(uploadSessions.id, input.sessionId),
          eq(uploadSessions.userId, ctx.user.id)
        ));
      
      const session = sessions[0];
      
      if (!session) {
        return { exists: false as const };
      }

      // Check if chunks are still in memory
      const hasChunksInMemory = chunkBuffers.has(input.sessionId);
      const memoryChunks = hasChunksInMemory 
        ? chunkBuffers.get(input.sessionId)!.filter(Boolean).length 
        : 0;

      return {
        exists: true as const,
        status: session.status,
        receivedChunks: session.receivedChunks || [],
        totalChunks: session.totalChunks,
        totalSize: session.totalSize,
        filename: session.filename,
        hasChunksInMemory,
        memoryChunks,
        // Can resume if session is active and chunks are in memory
        canResume: session.status === 'active' && hasChunksInMemory,
      };
    }),

  // Cancel upload session
  cancelUpload: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const database = await db.getDb();
      
      chunkBuffers.delete(input.sessionId);
      
      if (database) {
        await database
          .update(uploadSessions)
          .set({ status: "cancelled" })
          .where(eq(uploadSessions.id, input.sessionId));
      }
      
      console.log(`[CancelUpload] Session ${input.sessionId} cancelled`);
      return { success: true };
    }),
});
