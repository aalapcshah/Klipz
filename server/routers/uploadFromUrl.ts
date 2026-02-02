import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";

export const uploadFromUrlRouter = router({
  // Fetch file from URL and upload to S3
  uploadFromUrl: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
        filename: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { url, filename, title, description } = input;

      try {
        // Fetch the file from the URL
        console.log(`[UploadFromUrl] Fetching file from: ${url}`);
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MetaClips/1.0)',
          },
        });

        if (!response.ok) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Failed to fetch file from URL: ${response.status} ${response.statusText}`,
          });
        }

        // Get content type and size
        const contentType = response.headers.get("content-type") || "application/octet-stream";
        const contentLength = response.headers.get("content-length");
        const fileSize = contentLength ? parseInt(contentLength, 10) : 0;

        // Check file size limit (100MB)
        const maxSize = 100 * 1024 * 1024;
        if (fileSize > maxSize) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: `File size exceeds maximum allowed size of 100MB`,
          });
        }

        // Determine filename
        let finalFilename = filename;
        if (!finalFilename) {
          // Try to extract from URL
          const urlPath = new URL(url).pathname;
          const urlFilename = urlPath.split("/").pop();
          if (urlFilename && urlFilename.includes(".")) {
            finalFilename = urlFilename;
          } else {
            // Generate a filename based on content type
            const ext = contentType.split("/")[1]?.split(";")[0] || "bin";
            finalFilename = `downloaded-${Date.now()}.${ext}`;
          }
        }

        // Get file data as buffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate unique file key
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `${ctx.user.id}-files/${finalFilename}-${randomSuffix}`;

        // Upload to S3
        console.log(`[UploadFromUrl] Uploading to S3: ${fileKey}`);
        const { url: s3Url } = await storagePut(fileKey, buffer, contentType);

        console.log(`[UploadFromUrl] Upload complete: ${s3Url}`);

        return {
          success: true,
          url: s3Url,
          fileKey,
          filename: finalFilename,
          mimeType: contentType,
          fileSize: buffer.length,
          title: title || finalFilename.replace(/\.[^/.]+$/, ""),
          description: description || "",
        };
      } catch (error) {
        console.error("[UploadFromUrl] Error:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to upload file from URL: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Validate URL before uploading
  validateUrl: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
      })
    )
    .mutation(async ({ input }) => {
      const { url } = input;

      try {
        // Make a HEAD request to check the file
        const response = await fetch(url, {
          method: "HEAD",
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MetaClips/1.0)',
          },
        });

        if (!response.ok) {
          return {
            valid: false,
            error: `URL returned status ${response.status}`,
          };
        }

        const contentType = response.headers.get("content-type") || "unknown";
        const contentLength = response.headers.get("content-length");
        const fileSize = contentLength ? parseInt(contentLength, 10) : 0;

        // Check if it's a supported file type
        const supportedTypes = [
          "image/",
          "video/",
          "audio/",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument",
          "text/",
        ];

        const isSupported = supportedTypes.some((type) => contentType.startsWith(type));

        return {
          valid: true,
          contentType,
          fileSize,
          isSupported,
          filename: new URL(url).pathname.split("/").pop() || "unknown",
        };
      } catch (error) {
        return {
          valid: false,
          error: error instanceof Error ? error.message : "Failed to validate URL",
        };
      }
    }),
});
