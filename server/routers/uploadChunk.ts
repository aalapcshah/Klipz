import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import * as db from "../db";

// Temporary storage for chunks during upload
const uploadSessions = new Map<string, {
  chunks: Buffer[];
  metadata: {
    filename: string;
    mimeType: string;
    totalSize: number;
    title?: string;
    description?: string;
  };
}>();

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
        throw new Error("Upload session not found or expired");
      }

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
      const fileRecord = await db.createFile({
        userId: ctx.user.id,
        fileKey,
        url,
        filename: session.metadata.filename,
        mimeType: session.metadata.mimeType,
        fileSize: completeFile.length,
        title: session.metadata.title,
        description: session.metadata.description,
      });

      // Clean up session
      uploadSessions.delete(input.sessionId);
      console.log(`[FinalizeUpload] Upload complete, file ID: ${fileRecord.id}`);

      return {
        success: true,
        fileId: fileRecord.id,
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
