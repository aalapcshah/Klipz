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
        // Combine all chunks
        const combinedData = input.chunks.join("");
        const buffer = Buffer.from(combinedData, "base64");

        // Upload to S3
        const { url } = await storagePut(input.fileKey, buffer, input.mimeType);

        // Store file metadata in database via files.create
        // This would be called from the frontend after upload completes
        return {
          fileKey: input.fileKey,
          url,
          success: true,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to complete upload: ${error.message}`,
        });
      }
    }),

  // Upload single chunk
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
