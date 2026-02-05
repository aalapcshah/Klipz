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

// Cobalt API for video downloads
// Using public cobalt instances - note: these may have rate limits
const COBALT_INSTANCES = [
  "https://api.cobalt.tools",
  "https://cobalt-api.hyper.lol",
];

interface CobaltResponse {
  status: "tunnel" | "redirect" | "picker" | "error" | "local-processing";
  url?: string;
  filename?: string;
  picker?: Array<{ type: string; url: string; thumb?: string }>;
  error?: { code: string; context?: Record<string, unknown> };
}

async function downloadWithCobalt(url: string): Promise<{ downloadUrl: string; filename: string; isVideo: boolean } | null> {
  for (const instance of COBALT_INSTANCES) {
    try {
      console.log(`[Cobalt] Trying instance: ${instance}`);
      
      const response = await fetch(`${instance}/`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "User-Agent": "Klipz/1.0",
        },
        body: JSON.stringify({
          url,
          videoQuality: "720",
          filenameStyle: "pretty",
          downloadMode: "auto",
        }),
      });

      if (!response.ok) {
        console.log(`[Cobalt] Instance ${instance} returned ${response.status}`);
        continue;
      }

      const data = await response.json() as CobaltResponse;
      console.log(`[Cobalt] Response status: ${data.status}`);

      if (data.status === "tunnel" || data.status === "redirect") {
        if (data.url) {
          return {
            downloadUrl: data.url,
            filename: data.filename || `video-${Date.now()}.mp4`,
            isVideo: true,
          };
        }
      } else if (data.status === "picker" && data.picker && data.picker.length > 0) {
        // For picker responses, get the first video
        const videoItem = data.picker.find(item => item.type === "video") || data.picker[0];
        if (videoItem?.url) {
          return {
            downloadUrl: videoItem.url,
            filename: `video-${Date.now()}.mp4`,
            isVideo: videoItem.type === "video",
          };
        }
      } else if (data.status === "error") {
        console.log(`[Cobalt] Error from ${instance}:`, data.error);
      }
    } catch (error) {
      console.log(`[Cobalt] Error with instance ${instance}:`, error);
    }
  }
  
  return null;
}

async function downloadVideoFromUrl(downloadUrl: string, maxSizeMB: number = 100): Promise<Buffer | null> {
  try {
    console.log(`[Download] Fetching video from: ${downloadUrl.substring(0, 100)}...`);
    
    const response = await fetch(downloadUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      console.log(`[Download] Failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024);
      if (sizeInMB > maxSizeMB) {
        console.log(`[Download] File too large: ${sizeInMB.toFixed(2)}MB > ${maxSizeMB}MB`);
        return null;
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Check actual size
    const actualSizeMB = buffer.length / (1024 * 1024);
    if (actualSizeMB > maxSizeMB) {
      console.log(`[Download] Downloaded file too large: ${actualSizeMB.toFixed(2)}MB`);
      return null;
    }

    console.log(`[Download] Success: ${actualSizeMB.toFixed(2)}MB`);
    return buffer;
  } catch (error) {
    console.log(`[Download] Error:`, error);
    return null;
  }
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
        // Handle social media URLs with cobalt
        if (platform === "youtube" || platform === "tiktok" || platform === "instagram" || platform === "twitter") {
          return await handleSocialMediaUpload(url, platform, ctx.user.id, title, description);
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
            note: "Video will be downloaded (up to 100MB).",
          },
          instagram: {
            name: "Instagram",
            icon: "instagram",
            color: "#E4405F",
            supportsDownload: true,
            note: "Video/image will be downloaded.",
          },
          twitter: {
            name: "Twitter/X",
            icon: "twitter",
            color: "#1DA1F2",
            supportsDownload: true,
            note: "Video/image will be downloaded.",
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
            note: "Video will be downloaded (up to 100MB).",
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
          contentType: platform === "youtube" || platform === "tiktok" ? "video/mp4" : "image/jpeg",
          fileSize: 0,
          isSupported: true,
          filename: `${platform}-content`,
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

// Unified handler for social media uploads using cobalt
async function handleSocialMediaUpload(
  url: string, 
  platform: SocialPlatform, 
  userId: number, 
  title?: string, 
  description?: string
) {
  console.log(`[UploadFromUrl] Processing ${platform} content: ${url}`);

  try {
    // Try to download using cobalt
    const cobaltResult = await downloadWithCobalt(url);
    
    if (cobaltResult) {
      console.log(`[UploadFromUrl] Cobalt returned download URL, fetching video...`);
      
      const videoBuffer = await downloadVideoFromUrl(cobaltResult.downloadUrl);
      
      if (videoBuffer) {
        // Successfully downloaded video
        const safeTitle = (title || cobaltResult.filename || `${platform}-video`)
          .replace(/[^a-zA-Z0-9-_\s]/g, "")
          .substring(0, 50)
          .trim();
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const extension = cobaltResult.isVideo ? "mp4" : "jpg";
        const filename = `${safeTitle}.${extension}`;
        const fileKey = `${userId}-${platform}/${filename}-${randomSuffix}`;
        const mimeType = cobaltResult.isVideo ? "video/mp4" : "image/jpeg";

        const { url: s3Url } = await storagePut(fileKey, videoBuffer, mimeType);

        console.log(`[UploadFromUrl] ${platform} video uploaded: ${s3Url}`);

        return {
          success: true,
          url: s3Url,
          fileKey,
          filename,
          mimeType,
          fileSize: videoBuffer.length,
          title: title || safeTitle,
          description: description || `Downloaded from ${platform}\n\nOriginal URL: ${url}`,
          metadata: {
            platform,
            originalUrl: url,
            downloadedAt: new Date().toISOString(),
          },
        };
      }
    }

    // Fallback: save as reference if cobalt fails
    console.log(`[UploadFromUrl] Cobalt download failed, saving as reference`);
    return await saveAsReference(url, platform, userId, title, description);
    
  } catch (error) {
    console.error(`[UploadFromUrl] ${platform} error:`, error);
    
    // Fallback to reference on any error
    try {
      return await saveAsReference(url, platform, userId, title, description);
    } catch (fallbackError) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to process ${platform} content: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }
}

// Save social media URL as a reference file
async function saveAsReference(
  url: string,
  platform: SocialPlatform,
  userId: number,
  title?: string,
  description?: string
) {
  // Try to get metadata for YouTube
  let videoTitle = `${platform} content`;
  let authorName = "";
  let thumbnailUrl: string | null = null;

  if (platform === "youtube") {
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      // Try oEmbed for metadata
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const oembedResponse = await fetch(oembedUrl);
        if (oembedResponse.ok) {
          const oembedData = await oembedResponse.json() as Record<string, unknown>;
          videoTitle = (oembedData.title as string) || videoTitle;
          authorName = (oembedData.author_name as string) || "";
        }
      } catch {
        // Ignore oEmbed errors
      }
      thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    }
  }

  // Try to download thumbnail if available
  if (thumbnailUrl) {
    try {
      let thumbResponse = await fetch(thumbnailUrl);
      
      // Fallback to lower quality thumbnails
      if (!thumbResponse.ok && platform === "youtube") {
        const videoId = extractYouTubeVideoId(url);
        if (videoId) {
          thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
          thumbResponse = await fetch(thumbnailUrl);
          if (!thumbResponse.ok) {
            thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
            thumbResponse = await fetch(thumbnailUrl);
          }
        }
      }

      if (thumbResponse.ok) {
        const thumbBuffer = Buffer.from(await thumbResponse.arrayBuffer());
        const safeTitle = (title || videoTitle).replace(/[^a-zA-Z0-9-_\s]/g, "").substring(0, 50).trim() || `${platform}-thumbnail`;
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const filename = `${safeTitle}-thumbnail.jpg`;
        const fileKey = `${userId}-${platform}/${filename}-${randomSuffix}`;

        const { url: s3Url } = await storagePut(fileKey, thumbBuffer, "image/jpeg");

        return {
          success: true,
          url: s3Url,
          fileKey,
          filename,
          mimeType: "image/jpeg",
          fileSize: thumbBuffer.length,
          title: title || videoTitle,
          description: description || `${platform} content by ${authorName}\n\nOriginal URL: ${url}\n\nNote: Thumbnail only - video download was not available.`,
          metadata: {
            platform,
            originalUrl: url,
            authorName,
            isThumbnailOnly: true,
          },
        };
      }
    } catch {
      // Continue to JSON reference fallback
    }
  }

  // Final fallback: save as JSON reference
  const referenceContent = JSON.stringify({
    platform,
    originalUrl: url,
    title: title || videoTitle,
    savedAt: new Date().toISOString(),
    note: `${platform} content reference - open original URL to view content`,
  }, null, 2);

  const buffer = Buffer.from(referenceContent, "utf-8");
  const safeTitle = (title || `${platform}-reference`).replace(/[^a-zA-Z0-9-_\s]/g, "").substring(0, 50);
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const filename = `${safeTitle}.json`;
  const fileKey = `${userId}-${platform}/${filename}-${randomSuffix}`;

  const { url: s3Url } = await storagePut(fileKey, buffer, "application/json");

  return {
    success: true,
    url: s3Url,
    fileKey,
    filename,
    mimeType: "application/json",
    fileSize: buffer.length,
    title: title || `${platform} content reference`,
    description: description || `${platform} content reference\n\nOriginal URL: ${url}\n\nNote: Open the original URL to view the content.`,
    metadata: {
      platform,
      originalUrl: url,
      isReferenceOnly: true,
    },
  };
}

// Handle Vimeo video upload using oEmbed API
async function handleVimeoUpload(url: string, userId: number, title?: string, description?: string) {
  console.log(`[UploadFromUrl] Processing Vimeo video: ${url}`);

  try {
    // Use Vimeo oEmbed API
    const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
    console.log(`[UploadFromUrl] Fetching Vimeo oEmbed: ${oembedUrl}`);
    
    const oembedResponse = await fetch(oembedUrl);
    
    let videoTitle = "Vimeo Video";
    let authorName = "";
    let thumbnailUrl = "";
    
    if (oembedResponse.ok) {
      const oembedData = await oembedResponse.json() as Record<string, unknown>;
      videoTitle = (oembedData.title as string) || videoTitle;
      authorName = (oembedData.author_name as string) || "";
      thumbnailUrl = (oembedData.thumbnail_url as string) || "";
    }

    if (!thumbnailUrl) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Could not get Vimeo video thumbnail. The video may be private or unavailable.",
      });
    }

    // Download thumbnail
    console.log(`[UploadFromUrl] Downloading Vimeo thumbnail: ${thumbnailUrl}`);
    const thumbResponse = await fetch(thumbnailUrl);
    
    if (!thumbResponse.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Failed to download Vimeo thumbnail.",
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
