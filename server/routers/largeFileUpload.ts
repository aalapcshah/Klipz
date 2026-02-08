import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import * as db from "../db";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { eq, and, lt } from "drizzle-orm";
import { uploadSessions } from "../../drizzle/schema";

// Configuration for large file uploads
const MAX_FILE_SIZE = 6 * 1024 * 1024 * 1024; // 6 GB
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB chunks for better performance
const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours for large files

// Cleanup expired sessions every 10 minutes
setInterval(async () => {
  try {
    const database = await db.getDb();
    if (!database) return;
    
    const expireTime = new Date(Date.now() - SESSION_TIMEOUT_MS);
    const expired = await database
      .select({ id: uploadSessions.id, tempDir: uploadSessions.tempDir })
      .from(uploadSessions)
      .where(and(
        eq(uploadSessions.uploadType, "large"),
        eq(uploadSessions.status, "active"),
        lt(uploadSessions.lastActivity, expireTime)
      ));
    
    for (const session of expired) {
      // Clean up temp directory
      if (session.tempDir) {
        try {
          if (fs.existsSync(session.tempDir)) {
            fs.rmSync(session.tempDir, { recursive: true, force: true });
          }
        } catch (e) {
          console.error(`[LargeUpload] Failed to clean temp dir for ${session.id}:`, e);
        }
      }
      await database
        .update(uploadSessions)
        .set({ status: "expired" })
        .where(eq(uploadSessions.id, session.id));
      console.log(`[LargeUpload] Cleaned up expired session ${session.id}`);
    }
    
    if (expired.length > 0) {
      console.log(`[LargeUpload] Cleaned up ${expired.length} expired sessions`);
    }
  } catch (e) {
    console.error("[LargeUpload] Cleanup error:", e);
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
      const database = await db.getDb();
      if (!database) throw new Error("Database not available");
      
      const sessionId = `large-${ctx.user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const totalChunks = Math.ceil(input.totalSize / CHUNK_SIZE);
      
      // Create temp directory for this upload
      const tempDir = path.join(os.tmpdir(), `synclips-upload-${sessionId}`);
      fs.mkdirSync(tempDir, { recursive: true });

      // Store session in database
      await database.insert(uploadSessions).values({
        id: sessionId,
        userId: ctx.user.id,
        uploadType: "large",
        filename: input.filename,
        mimeType: input.mimeType,
        totalSize: input.totalSize,
        totalChunks,
        title: input.title,
        description: input.description,
        width: input.width,
        height: input.height,
        receivedChunks: [],
        tempDir,
        status: "active",
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + SESSION_TIMEOUT_MS),
      });

      console.log(`[LargeUpload] Initialized session ${sessionId} for ${input.filename} (${(input.totalSize / (1024 * 1024)).toFixed(1)} MB, ${totalChunks} chunks)`);

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
        throw new Error("Upload session not found or expired. Please start a new upload.");
      }

      if (session.userId !== ctx.user.id) {
        throw new Error("Unauthorized access to upload session");
      }

      // Ensure temp directory exists (may have been cleaned if server restarted)
      if (session.tempDir && !fs.existsSync(session.tempDir)) {
        fs.mkdirSync(session.tempDir, { recursive: true });
      }

      // Decode base64 chunk and write to temp file
      const chunkBuffer = Buffer.from(input.chunkData, "base64");
      const chunkPath = path.join(session.tempDir!, `chunk-${input.chunkIndex.toString().padStart(6, '0')}`);
      
      fs.writeFileSync(chunkPath, chunkBuffer);
      
      // Update received chunks in database
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

      const progress = Math.round((receivedChunks.length / session.totalChunks) * 100);
      
      if (receivedChunks.length % 10 === 0 || receivedChunks.length === session.totalChunks) {
        console.log(
          `[LargeUpload] Session ${input.sessionId}: chunk ${input.chunkIndex + 1}/${session.totalChunks} (${progress}%)`
        );
      }

      return {
        success: true,
        receivedChunks: receivedChunks.length,
        totalChunks: session.totalChunks,
        progress,
      };
    }),

  // Check upload progress
  getUploadProgress: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const database = await db.getDb();
      if (!database) return { found: false, progress: 0, receivedChunks: 0, totalChunks: 0 };
      
      const sessions = await database
        .select()
        .from(uploadSessions)
        .where(eq(uploadSessions.id, input.sessionId));
      
      const session = sessions[0];
      
      if (!session) {
        return { found: false, progress: 0, receivedChunks: 0, totalChunks: 0 };
      }

      const receivedCount = (session.receivedChunks || []).length;
      return {
        found: true,
        progress: Math.round((receivedCount / session.totalChunks) * 100),
        receivedChunks: receivedCount,
        totalChunks: session.totalChunks,
      };
    }),

  // Finalize large upload - combine chunks and upload to S3
  finalizeLargeUpload: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database not available");

      // Extend the HTTP request timeout for finalization (10 minutes)
      // This is critical for large files where S3 upload takes time
      if (ctx.req?.socket) {
        ctx.req.socket.setTimeout(10 * 60 * 1000); // 10 minutes
      }
      if (ctx.res) {
        // Also set response timeout
        (ctx.res as any).setTimeout?.(10 * 60 * 1000);
      }
      
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

      if (session.userId !== ctx.user.id) {
        throw new Error("Unauthorized access to upload session");
      }

      const receivedChunks = session.receivedChunks || [];

      // Verify all chunks received
      if (receivedChunks.length !== session.totalChunks) {
        const receivedSet = new Set(receivedChunks);
        const missing = [];
        for (let i = 0; i < session.totalChunks; i++) {
          if (!receivedSet.has(i)) {
            missing.push(i);
            if (missing.length >= 10) break;
          }
        }
        throw new Error(`Missing chunks: ${missing.join(', ')}${missing.length >= 10 ? '...' : ''}`);
      }

      console.log(`[LargeUpload] Session ${input.sessionId}: combining ${session.totalChunks} chunks`);

      // Combine chunks into a single file using streams to avoid memory issues
      const combinedPath = path.join(session.tempDir!, 'combined');
      const writeStream = fs.createWriteStream(combinedPath);

      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = path.join(session.tempDir!, `chunk-${i.toString().padStart(6, '0')}`);
        
        // Use streaming to read chunks to avoid loading all into memory at once
        await new Promise<void>((resolve, reject) => {
          const readStream = fs.createReadStream(chunkPath);
          readStream.on('error', reject);
          readStream.on('end', () => {
            // Delete chunk after reading to free up disk space
            try { fs.unlinkSync(chunkPath); } catch (e) { /* ignore */ }
            resolve();
          });
          readStream.pipe(writeStream, { end: false });
        });
        
        if ((i + 1) % 10 === 0 || i === session.totalChunks - 1) {
          console.log(`[LargeUpload] Combined ${i + 1}/${session.totalChunks} chunks`);
        }
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end((err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const combinedStats = fs.statSync(combinedPath);
      console.log(`[LargeUpload] Combined file created: ${(combinedStats.size / (1024 * 1024)).toFixed(1)} MB, uploading to S3...`);

      // Read combined file and upload to S3
      // For very large files, read in a single buffer - storagePut uses FormData which handles this
      const completeFile = fs.readFileSync(combinedPath);
      
      // Generate unique file key
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const sanitizedFilename = session.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileKey = `user-${ctx.user.id}/videos/${timestamp}-${randomSuffix}-${sanitizedFilename}`;

      // Upload to S3 with retry logic
      let url: string;
      let retries = 0;
      const maxRetries = 3;
      
      while (true) {
        try {
          const result = await storagePut(fileKey, completeFile, session.mimeType);
          url = result.url;
          break;
        } catch (error: any) {
          retries++;
          console.error(`[LargeUpload] S3 upload attempt ${retries} failed:`, error.message);
          if (retries >= maxRetries) {
            throw new Error(`Failed to upload to S3 after ${maxRetries} attempts: ${error.message}`);
          }
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, retries)));
        }
      }

      console.log(`[LargeUpload] Uploaded to S3: ${fileKey}`);

      // Create file record in database
      const fileId = await db.createFile({
        userId: ctx.user.id,
        fileKey,
        url,
        filename: session.filename,
        mimeType: session.mimeType,
        fileSize: session.totalSize,
        title: session.title,
        description: session.description,
      });

      // Create video record if this is a video file
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
          width: session.width ?? undefined,
          height: session.height ?? undefined,
          exportStatus: 'draft',
        });
        console.log(`[LargeUpload] Created video record, video ID: ${videoId}`);
      }

      // Clean up temp directory
      try {
        if (session.tempDir) {
          fs.rmSync(session.tempDir, { recursive: true, force: true });
        }
      } catch (e) {
        console.error(`[LargeUpload] Failed to clean temp dir:`, e);
      }
      
      // Mark session as completed
      await database
        .update(uploadSessions)
        .set({ status: "completed" })
        .where(eq(uploadSessions.id, input.sessionId));
      
      console.log(`[LargeUpload] Upload complete, file ID: ${fileId}`);

      return {
        success: true,
        fileId,
        videoId,
        url,
        fileKey,
      };
    }),

  // Cancel large upload session
  cancelLargeUpload: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) return { success: true };
      
      const sessions = await database
        .select()
        .from(uploadSessions)
        .where(eq(uploadSessions.id, input.sessionId));
      
      const session = sessions[0];
      
      if (session) {
        // Clean up temp directory
        if (session.tempDir) {
          try {
            if (fs.existsSync(session.tempDir)) {
              fs.rmSync(session.tempDir, { recursive: true, force: true });
            }
          } catch (e) {
            console.error(`[LargeUpload] Failed to clean temp dir:`, e);
          }
        }
        await database
          .update(uploadSessions)
          .set({ status: "cancelled" })
          .where(eq(uploadSessions.id, input.sessionId));
      }
      
      console.log(`[LargeUpload] Session ${input.sessionId} cancelled`);
      return { success: true };
    }),
});
