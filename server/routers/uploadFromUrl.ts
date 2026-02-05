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
      try {
        videoId = new URL(url).searchParams.get("v") || undefined;
      } catch {
        const match = url.match(/[?&]v=([^&]+)/);
        videoId = match ? match[1] : undefined;
      }
    } else if (urlLower.includes("/shorts/")) {
      const match = url.match(/\/shorts\/([^/?]+)/);
      videoId = match ? match[1] : undefined;
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

// Extract YouTube video ID from URL
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
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
      const { platform } = detectSocialPlatform(url);

      try {
        // Handle social media URLs differently
        if (platform === "youtube") {
          return await handleYouTubeUpload(url, ctx.user.id, title, description);
        } else if (platform === "tiktok") {
          return await handleTikTokUpload(url, ctx.user.id, title, description);
        } else if (platform === "instagram") {
          return await handleInstagramUpload(url, ctx.user.id, title, description);
        } else if (platform === "vimeo") {
          return await handleVimeoUpload(url, ctx.user.id, title, description);
        }

        // For regular URLs, fetch directly
        console.log(`[UploadFromUrl] Fetching file from: ${url}`);
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
          const urlPath = new URL(url).pathname;
          const urlFilename = urlPath.split("/").pop();
          if (urlFilename && urlFilename.includes(".")) {
            finalFilename = urlFilename;
          } else {
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
            note: "Video thumbnail and metadata will be saved.",
          },
          instagram: {
            name: "Instagram",
            icon: "instagram",
            color: "#E4405F",
            supportsDownload: true,
            note: "Post thumbnail will be saved with link to original.",
          },
          twitter: {
            name: "Twitter/X",
            icon: "twitter",
            color: "#1DA1F2",
            supportsDownload: false,
            note: "Twitter content extraction is limited.",
          },
          linkedin: {
            name: "LinkedIn",
            icon: "linkedin",
            color: "#0A66C2",
            supportsDownload: false,
            note: "LinkedIn content extraction is limited.",
          },
          tiktok: {
            name: "TikTok",
            icon: "tiktok",
            color: "#000000",
            supportsDownload: true,
            note: "Video thumbnail will be saved with link to original.",
          },
          facebook: {
            name: "Facebook",
            icon: "facebook",
            color: "#1877F2",
            supportsDownload: false,
            note: "Facebook content extraction is limited.",
          },
          vimeo: {
            name: "Vimeo",
            icon: "vimeo",
            color: "#1AB7EA",
            supportsDownload: true,
            note: "Video thumbnail and metadata will be saved.",
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
      const { platform } = detectSocialPlatform(url);

      // For social media URLs, validate differently
      if (platform) {
        return {
          valid: true,
          contentType: "image/jpeg",
          fileSize: 0,
          isSupported: true,
          filename: `${platform}-content.jpg`,
          isSocialMedia: true,
          platform,
        };
      }

      try {
        const response = await fetch(url, {
          method: "HEAD",
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        if (!response.ok) {
          return {
            valid: false,
            error: `URL returned status ${response.status}`,
          };
        }

        const contentType = response.headers.get("content-type") || "application/octet-stream";
        const contentLength = response.headers.get("content-length");
        const fileSize = contentLength ? parseInt(contentLength, 10) : 0;

        // Check if it's a supported file type
        const supportedTypes = [
          "image/", "video/", "audio/", "application/pdf",
          "application/msword", "application/vnd.openxmlformats",
          "text/", "application/json",
        ];
        const isSupported = supportedTypes.some(type => contentType.startsWith(type));

        // Try to extract filename from URL
        let filename = "downloaded-file";
        try {
          const urlPath = new URL(url).pathname;
          const urlFilename = urlPath.split("/").pop();
          if (urlFilename && urlFilename.includes(".")) {
            filename = urlFilename;
          }
        } catch {
          // Ignore URL parsing errors
        }

        return {
          valid: true,
          contentType,
          fileSize,
          isSupported,
          filename,
          isSocialMedia: false,
        };
      } catch (error) {
        return {
          valid: false,
          error: `Failed to validate URL: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    }),
});

// Handle YouTube video upload using oEmbed API
async function handleYouTubeUpload(url: string, userId: number, title?: string, description?: string) {
  console.log(`[UploadFromUrl] Processing YouTube video: ${url}`);

  try {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Could not extract YouTube video ID from URL",
      });
    }

    // Use YouTube oEmbed API (public, no auth required)
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    console.log(`[UploadFromUrl] Fetching oEmbed data from: ${oembedUrl}`);
    
    const oembedResponse = await fetch(oembedUrl);
    
    let videoTitle = `YouTube Video ${videoId}`;
    let authorName = "";
    let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    
    if (oembedResponse.ok) {
      const oembedData = await oembedResponse.json() as Record<string, unknown>;
      videoTitle = (oembedData.title as string) || videoTitle;
      authorName = (oembedData.author_name as string) || "";
      // oEmbed provides thumbnail_url but we'll use the higher quality version
    }

    // Try to download the thumbnail
    console.log(`[UploadFromUrl] Downloading YouTube thumbnail: ${thumbnailUrl}`);
    let thumbResponse = await fetch(thumbnailUrl);
    
    // Fallback to lower quality if maxres not available
    if (!thumbResponse.ok) {
      thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      thumbResponse = await fetch(thumbnailUrl);
    }
    
    if (!thumbResponse.ok) {
      thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
      thumbResponse = await fetch(thumbnailUrl);
    }

    if (!thumbResponse.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Failed to download YouTube thumbnail. The video may be private or unavailable.",
      });
    }

    const thumbBuffer = Buffer.from(await thumbResponse.arrayBuffer());

    // Generate filename and upload
    const safeTitle = videoTitle.replace(/[^a-zA-Z0-9-_\s]/g, "").substring(0, 50).trim() || "youtube-video";
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const filename = `${safeTitle}-thumbnail.jpg`;
    const fileKey = `${userId}-youtube/${filename}-${randomSuffix}`;

    const { url: s3Url } = await storagePut(fileKey, thumbBuffer, "image/jpeg");

    console.log(`[UploadFromUrl] YouTube thumbnail uploaded: ${s3Url}`);

    return {
      success: true,
      url: s3Url,
      fileKey,
      filename,
      mimeType: "image/jpeg",
      fileSize: thumbBuffer.length,
      title: title || videoTitle,
      description: description || `YouTube video by ${authorName}\n\nOriginal URL: ${url}`,
      metadata: {
        platform: "youtube",
        videoId,
        originalUrl: url,
        authorName,
      },
    };
  } catch (error) {
    console.error("[UploadFromUrl] YouTube error:", error);
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to process YouTube video: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

// Handle TikTok video upload - save reference with placeholder
async function handleTikTokUpload(url: string, userId: number, title?: string, description?: string) {
  console.log(`[UploadFromUrl] Processing TikTok video: ${url}`);

  try {
    // TikTok doesn't have a public oEmbed API that works reliably
    // We'll create a reference file with the URL
    
    // Try to extract username and video ID from URL
    let username = "";
    let videoId = "";
    
    const userMatch = url.match(/tiktok\.com\/@([^/]+)/);
    if (userMatch) {
      username = userMatch[1];
    }
    
    const videoMatch = url.match(/\/video\/(\d+)/);
    if (videoMatch) {
      videoId = videoMatch[1];
    }

    // Create a simple reference image with the TikTok logo colors
    // Since we can't download the actual video, we'll save metadata
    const referenceContent = JSON.stringify({
      platform: "tiktok",
      originalUrl: url,
      username,
      videoId,
      savedAt: new Date().toISOString(),
      note: "TikTok video reference - open original URL to view content",
    }, null, 2);

    const buffer = Buffer.from(referenceContent, "utf-8");
    const safeTitle = title || `TikTok-${username || videoId || Date.now()}`;
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const filename = `${safeTitle.replace(/[^a-zA-Z0-9-_\s]/g, "").substring(0, 50)}.json`;
    const fileKey = `${userId}-tiktok/${filename}-${randomSuffix}`;

    const { url: s3Url } = await storagePut(fileKey, buffer, "application/json");

    console.log(`[UploadFromUrl] TikTok reference saved: ${s3Url}`);

    return {
      success: true,
      url: s3Url,
      fileKey,
      filename,
      mimeType: "application/json",
      fileSize: buffer.length,
      title: title || `TikTok video by @${username || "unknown"}`,
      description: description || `TikTok video reference\n\nOriginal URL: ${url}\n\nNote: Open the original URL to view the video content.`,
      metadata: {
        platform: "tiktok",
        originalUrl: url,
        username,
        videoId,
      },
    };
  } catch (error) {
    console.error("[UploadFromUrl] TikTok error:", error);
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to process TikTok video: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

// Handle Instagram post upload - save reference
async function handleInstagramUpload(url: string, userId: number, title?: string, description?: string) {
  console.log(`[UploadFromUrl] Processing Instagram post: ${url}`);

  try {
    // Try Instagram oEmbed API
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`;
    console.log(`[UploadFromUrl] Fetching Instagram oEmbed: ${oembedUrl}`);
    
    let postTitle = "Instagram Post";
    let authorName = "";
    let thumbnailUrl = "";
    
    try {
      const oembedResponse = await fetch(oembedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      if (oembedResponse.ok) {
        const oembedData = await oembedResponse.json() as Record<string, unknown>;
        postTitle = (oembedData.title as string) || postTitle;
        authorName = (oembedData.author_name as string) || "";
        thumbnailUrl = (oembedData.thumbnail_url as string) || "";
      }
    } catch (e) {
      console.log("[UploadFromUrl] Instagram oEmbed failed, continuing with reference only");
    }

    // If we got a thumbnail, download it
    if (thumbnailUrl) {
      try {
        const thumbResponse = await fetch(thumbnailUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        
        if (thumbResponse.ok) {
          const thumbBuffer = Buffer.from(await thumbResponse.arrayBuffer());
          const safeTitle = postTitle.replace(/[^a-zA-Z0-9-_\s]/g, "").substring(0, 50).trim() || "instagram-post";
          const randomSuffix = Math.random().toString(36).substring(2, 10);
          const filename = `${safeTitle}.jpg`;
          const fileKey = `${userId}-instagram/${filename}-${randomSuffix}`;

          const { url: s3Url } = await storagePut(fileKey, thumbBuffer, "image/jpeg");

          console.log(`[UploadFromUrl] Instagram thumbnail uploaded: ${s3Url}`);

          return {
            success: true,
            url: s3Url,
            fileKey,
            filename,
            mimeType: "image/jpeg",
            fileSize: thumbBuffer.length,
            title: title || postTitle,
            description: description || `Instagram post by @${authorName}\n\nOriginal URL: ${url}`,
            metadata: {
              platform: "instagram",
              originalUrl: url,
              authorName,
            },
          };
        }
      } catch (e) {
        console.log("[UploadFromUrl] Instagram thumbnail download failed");
      }
    }

    // Fallback: save as reference
    const referenceContent = JSON.stringify({
      platform: "instagram",
      originalUrl: url,
      authorName,
      title: postTitle,
      savedAt: new Date().toISOString(),
      note: "Instagram post reference - open original URL to view content",
    }, null, 2);

    const buffer = Buffer.from(referenceContent, "utf-8");
    const safeTitle = title || `Instagram-${authorName || Date.now()}`;
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const filename = `${safeTitle.replace(/[^a-zA-Z0-9-_\s]/g, "").substring(0, 50)}.json`;
    const fileKey = `${userId}-instagram/${filename}-${randomSuffix}`;

    const { url: s3Url } = await storagePut(fileKey, buffer, "application/json");

    return {
      success: true,
      url: s3Url,
      fileKey,
      filename,
      mimeType: "application/json",
      fileSize: buffer.length,
      title: title || postTitle,
      description: description || `Instagram post reference\n\nOriginal URL: ${url}\n\nNote: Open the original URL to view the content.`,
      metadata: {
        platform: "instagram",
        originalUrl: url,
        authorName,
      },
    };
  } catch (error) {
    console.error("[UploadFromUrl] Instagram error:", error);
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to process Instagram post: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

// Handle Vimeo video upload using oEmbed API
async function handleVimeoUpload(url: string, userId: number, title?: string, description?: string) {
  console.log(`[UploadFromUrl] Processing Vimeo video: ${url}`);

  try {
    // Use Vimeo oEmbed API (public, no auth required)
    const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
    console.log(`[UploadFromUrl] Fetching Vimeo oEmbed: ${oembedUrl}`);
    
    const oembedResponse = await fetch(oembedUrl);
    
    if (!oembedResponse.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Failed to fetch Vimeo video info. The video may be private or unavailable.",
      });
    }
    
    const oembedData = await oembedResponse.json() as Record<string, unknown>;
    const videoTitle = (oembedData.title as string) || "Vimeo Video";
    const authorName = (oembedData.author_name as string) || "";
    const thumbnailUrl = (oembedData.thumbnail_url as string) || "";
    const videoId = (oembedData.video_id as number)?.toString() || "";

    if (!thumbnailUrl) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Could not get Vimeo video thumbnail",
      });
    }

    // Download the thumbnail
    const thumbResponse = await fetch(thumbnailUrl);
    if (!thumbResponse.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Failed to download Vimeo thumbnail",
      });
    }

    const thumbBuffer = Buffer.from(await thumbResponse.arrayBuffer());

    // Generate filename and upload
    const safeTitle = videoTitle.replace(/[^a-zA-Z0-9-_\s]/g, "").substring(0, 50).trim() || "vimeo-video";
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const filename = `${safeTitle}-thumbnail.jpg`;
    const fileKey = `${userId}-vimeo/${filename}-${randomSuffix}`;

    const { url: s3Url } = await storagePut(fileKey, thumbBuffer, "image/jpeg");

    console.log(`[UploadFromUrl] Vimeo thumbnail uploaded: ${s3Url}`);

    return {
      success: true,
      url: s3Url,
      fileKey,
      filename,
      mimeType: "image/jpeg",
      fileSize: thumbBuffer.length,
      title: title || videoTitle,
      description: description || `Vimeo video by ${authorName}\n\nOriginal URL: ${url}`,
      metadata: {
        platform: "vimeo",
        videoId,
        originalUrl: url,
        authorName,
      },
    };
  } catch (error) {
    console.error("[UploadFromUrl] Vimeo error:", error);
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to process Vimeo video: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}
