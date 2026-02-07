import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import * as db from "../db";

// Temporary storage for chunks during upload
// Sessions expire after 30 minutes of inactivity
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface UploadSession {
  chunks: Buffer[];
  metadata: {
    filename: string;
    mimeType: string;
    totalSize: number;
    title?: string;
    description?: string;
  };
  lastActivity: number;
  userId: string;
}

const uploadSessions = new Map<string, UploadSession>();

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  const entries = Array.from(uploadSessions.entries());
  for (const [sessionId, session] of entries) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      uploadSessions.delete(sessionId);
      cleaned++;
      console.log(`[UploadSession] Cleaned up expired session ${sessionId}`);
    }
  }
  if (cleaned > 0) {
    console.log(`[UploadSession] Cleaned up ${cleaned} expired sessions. Active sessions: ${uploadSessions.size}`);
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
      const sessionId = `${ctx.user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      uploadSessions.set(sessionId, {
        chunks: [],
        metadata: {
          filename: input.filename,
          mimeType: input.mimeType,
          totalSize: input.totalSize,
          title: input.title,
          description: input.description,
        },
        lastActivity: Date.now(),
        userId: String(ctx.user.id),
      });

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
      const session = uploadSessions.get(input.sessionId);
      
      if (!session) {
        throw new Error("Upload session not found or expired. Please start a new upload.");
      }

      // Update last activity timestamp
      session.lastActivity = Date.now();

      // Decode base64 chunk
      const chunkBuffer = Buffer.from(input.chunkData, "base64");
      session.chunks[input.chunkIndex] = chunkBuffer;

      console.log(
        `[UploadChunk] Session ${input.sessionId}: received chunk ${input.chunkIndex + 1}/${input.totalChunks} (${chunkBuffer.length} bytes)`
      );

      return {
        success: true,
        receivedChunks: session.chunks.filter(Boolean).length,
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
      const session = uploadSessions.get(input.sessionId);
      
      if (!session) {
        throw new Error("Upload session not found or expired");
      }

      console.log(`[FinalizeUpload] Session ${input.sessionId}: combining ${session.chunks.length} chunks`);

      // Combine all chunks
      const completeFile = Buffer.concat(session.chunks);
      
      console.log(`[FinalizeUpload] Combined file size: ${completeFile.length} bytes`);

      // Generate unique file key
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const fileKey = `user-${ctx.user.id}/videos/${timestamp}-${randomSuffix}-${session.metadata.filename}`;

      // Upload to S3
      console.log(`[FinalizeUpload] Uploading to S3: ${fileKey}`);
      const { url } = await storagePut(fileKey, completeFile, session.metadata.mimeType);

      // Create file record in database
      // createFile returns the insertId directly (a number), not an object
      const fileId = await db.createFile({
        userId: ctx.user.id,
        fileKey,
        url,
        filename: session.metadata.filename,
        mimeType: session.metadata.mimeType,
        fileSize: completeFile.length,
        title: session.metadata.title,
        description: session.metadata.description,
      });

      // Also create a video record if this is a video file
      const isVideo = session.metadata.mimeType.startsWith('video/');
      let videoId: number | undefined;
      
      if (isVideo) {
        videoId = await db.createVideo({
          userId: ctx.user.id,
          fileId,
          fileKey,
          url,
          filename: session.metadata.filename,
          title: session.metadata.title || session.metadata.filename,
          description: session.metadata.description,
          duration: 0, // Duration will be extracted on client or updated later
          exportStatus: 'draft',
        });
        console.log(`[FinalizeUpload] Created video record, video ID: ${videoId}`);
      }

      // Clean up session
      uploadSessions.delete(input.sessionId);
      console.log(`[FinalizeUpload] Upload complete, file ID: ${fileId}`);

      return {
        success: true,
        fileId,
        videoId,
        url,
        fileKey,
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
      uploadSessions.delete(input.sessionId);
      console.log(`[CancelUpload] Session ${input.sessionId} cancelled`);
      return { success: true };
    }),
});
