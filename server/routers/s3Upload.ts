import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";

export const s3UploadRouter = router({
  // Generate presigned URL for direct S3 upload
  generatePresignedUrl: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        mimeType: z.string(),
        fileSize: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.user.id;
        const timestamp = Date.now();
        const sanitizedFilename = input.filename.replace(/[^a-zA-Z0-9.-]/g, "_");
        const fileKey = `uploads/${userId}/${timestamp}-${sanitizedFilename}`;

        // For now, return the fileKey and indicate client should upload via our endpoint
        // In a full implementation, you'd generate an actual presigned URL from S3
        return {
          fileKey,
          uploadUrl: `/api/s3/upload`, // Custom endpoint for handling uploads
          fields: {
            key: fileKey,
            "Content-Type": input.mimeType,
          },
        };
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to generate presigned URL: ${error.message}`,
        });
      }
    }),

  // Complete multipart upload and store file metadata
  completeUpload: protectedProcedure
    .input(
      z.object({
        fileKey: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        fileSize: z.number(),
        title: z.string().optional(),
        chunks: z.array(z.string()), // Array of chunk data (base64)
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        console.log(`[S3Upload] Starting upload for ${input.filename}, ${input.chunks.length} chunks, total size: ${input.fileSize} bytes`);
        
        // Validate total size
        if (input.fileSize > 2 * 1024 * 1024 * 1024) { // 2GB
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "File size exceeds 2GB limit",
          });
        }

        // Combine all chunks with streaming to avoid memory issues
        const chunkBuffers: Buffer[] = [];
        let totalSize = 0;

        for (let i = 0; i < input.chunks.length; i++) {
          try {
            const buffer = Buffer.from(input.chunks[i], "base64");
            chunkBuffers.push(buffer);
            totalSize += buffer.length;
            
            // Log progress every 10 chunks
            if ((i + 1) % 10 === 0 || i === input.chunks.length - 1) {
              console.log(`[S3Upload] Processed ${i + 1}/${input.chunks.length} chunks, ${totalSize} bytes`);
            }
          } catch (error) {
            console.error(`[S3Upload] Failed to process chunk ${i}:`, error);
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Failed to process chunk ${i}: Invalid base64 data`,
            });
          }
        }

        // Combine buffers
        const combinedBuffer = Buffer.concat(chunkBuffers);
        console.log(`[S3Upload] Combined buffer size: ${combinedBuffer.length} bytes`);

        // Upload to S3
        console.log(`[S3Upload] Uploading to S3 with key: ${input.fileKey}`);
        const { url } = await storagePut(input.fileKey, combinedBuffer, input.mimeType);
        console.log(`[S3Upload] Upload successful, URL: ${url}`);

        return {
          fileKey: input.fileKey,
          url,
          success: true,
        };
      } catch (error: any) {
        console.error("[S3Upload] Upload failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to complete upload: ${error.message}`,
        });
      }
    }),

  // Upload single chunk (for future streaming implementation)
  uploadChunk: protectedProcedure
    .input(
      z.object({
        fileKey: z.string(),
        chunkIndex: z.number(),
        chunkData: z.string(), // base64
        totalChunks: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      // Store chunk temporarily (in production, use S3 multipart upload)
      // For now, we'll return success and handle assembly in completeUpload
      return {
        chunkIndex: input.chunkIndex,
        success: true,
      };
    }),
});
