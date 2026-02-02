import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";

// Social media platform detection
type SocialPlatform = "youtube" | "instagram" | "twitter" | "linkedin" | "tiktok" | "facebook" | "vimeo" | null;

function detectSocialPlatform(url: string): { platform: SocialPlatform; videoId?: string } {
  const urlLower = url.toLowerCase();
  
  // YouTube
  if (urlLower.includes("youtube.com") || urlLower.includes("youtu.be")) {
    let videoId: string | undefined;
    if (urlLower.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1]?.split("?")[0];
    } else if (urlLower.includes("v=")) {
      videoId = new URL(url).searchParams.get("v") || undefined;
    }
    return { platform: "youtube", videoId };
  }
  
  // Instagram
  if (urlLower.includes("instagram.com")) {
    return { platform: "instagram" };
  }
  
  // Twitter/X
  if (urlLower.includes("twitter.com") || urlLower.includes("x.com")) {
    return { platform: "twitter" };
  }
  
  // LinkedIn
  if (urlLower.includes("linkedin.com")) {
    return { platform: "linkedin" };
  }
  
  // TikTok
  if (urlLower.includes("tiktok.com")) {
    return { platform: "tiktok" };
  }
  
  // Facebook
  if (urlLower.includes("facebook.com") || urlLower.includes("fb.watch")) {
    return { platform: "facebook" };
  }
  
  // Vimeo
  if (urlLower.includes("vimeo.com")) {
    return { platform: "vimeo" };
  }
  
  return { platform: null };
}

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

  // Detect social media platform from URL
  detectPlatform: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
      })
    )
    .mutation(async ({ input }) => {
      const { url } = input;
      const { platform, videoId } = detectSocialPlatform(url);
      
      return {
        platform,
        videoId,
        isSocialMedia: platform !== null,
        platformInfo: platform ? {
          youtube: {
            name: "YouTube",
            icon: "youtube",
            color: "#FF0000",
            supportsDownload: true,
            note: "Video will be downloaded from YouTube",
          },
          instagram: {
            name: "Instagram",
            icon: "instagram",
            color: "#E4405F",
            supportsDownload: true,
            note: "Post content will be extracted from Instagram",
          },
          twitter: {
            name: "Twitter/X",
            icon: "twitter",
            color: "#1DA1F2",
            supportsDownload: true,
            note: "Media will be extracted from the tweet",
          },
          linkedin: {
            name: "LinkedIn",
            icon: "linkedin",
            color: "#0A66C2",
            supportsDownload: false,
            note: "LinkedIn content extraction is limited",
          },
          tiktok: {
            name: "TikTok",
            icon: "tiktok",
            color: "#000000",
            supportsDownload: true,
            note: "Video will be downloaded from TikTok",
          },
          facebook: {
            name: "Facebook",
            icon: "facebook",
            color: "#1877F2",
            supportsDownload: true,
            note: "Video/image will be extracted from Facebook",
          },
          vimeo: {
            name: "Vimeo",
            icon: "vimeo",
            color: "#1AB7EA",
            supportsDownload: true,
            note: "Video will be downloaded from Vimeo",
          },
        }[platform] : null,
      };
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
