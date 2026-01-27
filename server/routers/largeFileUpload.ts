import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import * as db from "../db";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Configuration for large file uploads
const MAX_FILE_SIZE = 6 * 1024 * 1024 * 1024; // 6 GB
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB chunks for better performance
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour for large files

interface LargeUploadSession {
  tempDir: string;
  metadata: {
    filename: string;
    mimeType: string;
    totalSize: number;
    totalChunks: number;
    title?: string;
    description?: string;
    width?: number;
    height?: number;
  };
  receivedChunks: Set<number>;
  lastActivity: number;
  userId: string;
}

const uploadSessions = new Map<string, LargeUploadSession>();

// Cleanup expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  const entries = Array.from(uploadSessions.entries());
  for (const [sessionId, session] of entries) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      // Clean up temp directory
      try {
        if (fs.existsSync(session.tempDir)) {
          fs.rmSync(session.tempDir, { recursive: true, force: true });
        }
      } catch (e) {
        console.error(`[LargeUpload] Failed to clean temp dir for ${sessionId}:`, e);
      }
      uploadSessions.delete(sessionId);
      cleaned++;
      console.log(`[LargeUpload] Cleaned up expired session ${sessionId}`);
    }
  }
  if (cleaned > 0) {
    console.log(`[LargeUpload] Cleaned up ${cleaned} expired sessions. Active: ${uploadSessions.size}`);
  }
}, 10 * 60 * 1000);

export const largeFileUploadRouter = router({
  // Get upload configuration
  getConfig: protectedProcedure.query(() => {
    return {
      maxFileSize: MAX_FILE_SIZE,
      chunkSize: CHUNK_SIZE,
      maxFileSizeFormatted: "6 GB",
      chunkSizeFormatted: "10 MB",
    };
  }),

  // Initialize large file upload session
  initLargeUpload: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        mimeType: z.string(),
        totalSize: z.number().max(MAX_FILE_SIZE, "File size exceeds 6 GB limit"),
        title: z.string().optional(),
        description: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const sessionId = `large-${ctx.user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const totalChunks = Math.ceil(input.totalSize / CHUNK_SIZE);
      
      // Create temp directory for this upload
      const tempDir = path.join(os.tmpdir(), `synclips-upload-${sessionId}`);
      fs.mkdirSync(tempDir, { recursive: true });

      uploadSessions.set(sessionId, {
        tempDir,
        metadata: {
          filename: input.filename,
          mimeType: input.mimeType,
          totalSize: input.totalSize,
          totalChunks,
          title: input.title,
          description: input.description,
          width: input.width,
          height: input.height,
        },
        receivedChunks: new Set(),
        lastActivity: Date.now(),
        userId: String(ctx.user.id),
      });

      console.log(`[LargeUpload] Initialized session ${sessionId} for ${input.filename} (${(input.totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB, ${totalChunks} chunks)`);

      return {
        sessionId,
        totalChunks,
        chunkSize: CHUNK_SIZE,
      };
    }),

  // Upload a chunk to temp storage
  uploadLargeChunk: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        chunkIndex: z.number(),
        chunkData: z.string(), // base64 encoded chunk
      })
    )
    .mutation(async ({ input, ctx }) => {
      const session = uploadSessions.get(input.sessionId);
      
      if (!session) {
        throw new Error("Upload session not found or expired. Please start a new upload.");
      }

      if (session.userId !== String(ctx.user.id)) {
        throw new Error("Unauthorized access to upload session");
      }

      // Update last activity timestamp
      session.lastActivity = Date.now();

      // Decode base64 chunk and write to temp file
      const chunkBuffer = Buffer.from(input.chunkData, "base64");
      const chunkPath = path.join(session.tempDir, `chunk-${input.chunkIndex.toString().padStart(6, '0')}`);
      
      fs.writeFileSync(chunkPath, chunkBuffer);
      session.receivedChunks.add(input.chunkIndex);

      const progress = Math.round((session.receivedChunks.size / session.metadata.totalChunks) * 100);
      
      console.log(
        `[LargeUpload] Session ${input.sessionId}: chunk ${input.chunkIndex + 1}/${session.metadata.totalChunks} (${progress}%)`
      );

      return {
        success: true,
        receivedChunks: session.receivedChunks.size,
        totalChunks: session.metadata.totalChunks,
        progress,
      };
    }),

  // Check upload progress
  getUploadProgress: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ input, ctx }) => {
      const session = uploadSessions.get(input.sessionId);
      
      if (!session) {
        return { found: false, progress: 0, receivedChunks: 0, totalChunks: 0 };
      }

      return {
        found: true,
        progress: Math.round((session.receivedChunks.size / session.metadata.totalChunks) * 100),
        receivedChunks: session.receivedChunks.size,
        totalChunks: session.metadata.totalChunks,
      };
    }),

  // Finalize large upload - combine chunks and upload to S3
  finalizeLargeUpload: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const session = uploadSessions.get(input.sessionId);
      
      if (!session) {
        throw new Error("Upload session not found or expired");
      }

      if (session.userId !== String(ctx.user.id)) {
        throw new Error("Unauthorized access to upload session");
      }

      // Verify all chunks received
      if (session.receivedChunks.size !== session.metadata.totalChunks) {
        const missing = [];
        for (let i = 0; i < session.metadata.totalChunks; i++) {
          if (!session.receivedChunks.has(i)) {
            missing.push(i);
            if (missing.length >= 10) break; // Limit to first 10 missing
          }
        }
        throw new Error(`Missing chunks: ${missing.join(', ')}${missing.length >= 10 ? '...' : ''}`);
      }

      console.log(`[LargeUpload] Session ${input.sessionId}: combining ${session.metadata.totalChunks} chunks`);

      // Combine chunks into a single file
      const combinedPath = path.join(session.tempDir, 'combined');
      const writeStream = fs.createWriteStream(combinedPath);

      for (let i = 0; i < session.metadata.totalChunks; i++) {
        const chunkPath = path.join(session.tempDir, `chunk-${i.toString().padStart(6, '0')}`);
        const chunkData = fs.readFileSync(chunkPath);
        writeStream.write(chunkData);
        // Delete chunk after reading to free up space
        fs.unlinkSync(chunkPath);
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end((err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });

      console.log(`[LargeUpload] Combined file created, uploading to S3...`);

      // Read combined file and upload to S3
      const completeFile = fs.readFileSync(combinedPath);
      
      // Generate unique file key
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const fileKey = `user-${ctx.user.id}/videos/${timestamp}-${randomSuffix}-${session.metadata.filename}`;

      // Upload to S3
      const { url } = await storagePut(fileKey, completeFile, session.metadata.mimeType);

      console.log(`[LargeUpload] Uploaded to S3: ${fileKey}`);

      // Create file record in database
      const fileRecord = await db.createFile({
        userId: ctx.user.id,
        fileKey,
        url,
        filename: session.metadata.filename,
        mimeType: session.metadata.mimeType,
        fileSize: session.metadata.totalSize,
        title: session.metadata.title,
        description: session.metadata.description,
      });

      // Create video record if this is a video file
      const isVideo = session.metadata.mimeType.startsWith('video/');
      let videoId: number | undefined;
      
      if (isVideo) {
        videoId = await db.createVideo({
          userId: ctx.user.id,
          fileId: fileRecord.id,
          fileKey,
          url,
          filename: session.metadata.filename,
          title: session.metadata.title || session.metadata.filename,
          description: session.metadata.description,
          duration: 0,
          width: session.metadata.width,
          height: session.metadata.height,
          exportStatus: 'draft',
        });
        console.log(`[LargeUpload] Created video record, video ID: ${videoId}`);
      }

      // Clean up temp directory
      try {
        fs.rmSync(session.tempDir, { recursive: true, force: true });
      } catch (e) {
        console.error(`[LargeUpload] Failed to clean temp dir:`, e);
      }
      
      uploadSessions.delete(input.sessionId);
      console.log(`[LargeUpload] Upload complete, file ID: ${fileRecord.id}`);

      return {
        success: true,
        fileId: fileRecord.id,
        videoId,
        url,
        fileKey,
      };
    }),

  // Cancel large upload session
  cancelLargeUpload: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const session = uploadSessions.get(input.sessionId);
      
      if (session) {
        // Clean up temp directory
        try {
          if (fs.existsSync(session.tempDir)) {
            fs.rmSync(session.tempDir, { recursive: true, force: true });
          }
        } catch (e) {
          console.error(`[LargeUpload] Failed to clean temp dir:`, e);
        }
        uploadSessions.delete(input.sessionId);
      }
      
      console.log(`[LargeUpload] Session ${input.sessionId} cancelled`);
      return { success: true };
    }),
});
