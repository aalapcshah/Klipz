import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { callDataApi } from "../_core/dataApi";
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
        // URL parsing failed, try regex
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

// Extract TikTok video ID from URL
function extractTikTokVideoId(url: string): string | null {
  const patterns = [
    /tiktok\.com\/@[^/]+\/video\/(\d+)/,
    /tiktok\.com\/t\/([^/?]+)/,
    /vm\.tiktok\.com\/([^/?]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Extract Instagram post ID from URL
function extractInstagramPostId(url: string): string | null {
  const patterns = [
    /instagram\.com\/p\/([^/?]+)/,
    /instagram\.com\/reel\/([^/?]+)/,
    /instagram\.com\/reels\/([^/?]+)/,
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
            note: "Video thumbnail and metadata will be saved. Due to YouTube's terms of service, full video download is not available.",
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
      const { platform } = detectSocialPlatform(url);

      // For social media URLs, validate differently
      if (platform) {
        return {
          valid: true,
          contentType: "video/mp4",
          fileSize: 0,
          isSupported: true,
          filename: `${platform}-video.mp4`,
          isSocialMedia: true,
          platform,
        };
      }

      try {
        // Make a HEAD request to check the file
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
          isSocialMedia: false,
        };
      } catch (error) {
        return {
          valid: false,
          error: error instanceof Error ? error.message : "Failed to validate URL",
        };
      }
    }),
});

// Handle YouTube video upload - save thumbnail and metadata
async function handleYouTubeUpload(url: string, userId: number, title?: string, description?: string) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid YouTube URL - could not extract video ID",
    });
  }

  console.log(`[UploadFromUrl] Processing YouTube video: ${videoId}`);

  try {
    // Get video info from YouTube API
    const result = await callDataApi("Youtube/get_video_details", {
      query: { id: videoId },
    }) as Record<string, unknown>;

    if (!result || !result.title) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "YouTube video not found or unavailable",
      });
    }

    const thumbnails = result.thumbnails as Array<{url: string; width?: number; height?: number}> | undefined;
    const videoTitle = (result.title as string) || "YouTube Video";
    const videoDescription = (result.description as string) || "";
    
    // Get the highest quality thumbnail
    let thumbnailUrl = thumbnails?.[thumbnails.length - 1]?.url || thumbnails?.[0]?.url;
    
    // If no thumbnail from API, use YouTube's standard thumbnail URL
    if (!thumbnailUrl) {
      thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    }

    // Download the thumbnail
    console.log(`[UploadFromUrl] Downloading YouTube thumbnail: ${thumbnailUrl}`);
    const thumbResponse = await fetch(thumbnailUrl);
    
    if (!thumbResponse.ok) {
      // Try fallback thumbnail URL
      thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      const fallbackResponse = await fetch(thumbnailUrl);
      if (!fallbackResponse.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to download YouTube thumbnail",
        });
      }
    }

    const thumbArrayBuffer = await (await fetch(thumbnailUrl)).arrayBuffer();
    const thumbBuffer = Buffer.from(thumbArrayBuffer);

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
      description: description || `YouTube video: ${url}\n\n${videoDescription}`.substring(0, 1000),
      metadata: {
        platform: "youtube",
        videoId,
        originalUrl: url,
        channelTitle: result.channelTitle,
        duration: result.lengthSeconds,
        viewCount: (result.stats as Record<string, unknown>)?.views,
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

// Handle TikTok video upload
async function handleTikTokUpload(url: string, userId: number, title?: string, description?: string) {
  console.log(`[UploadFromUrl] Processing TikTok video: ${url}`);

  try {
    // Get video info from TikTok API
    const result = await callDataApi("Tiktok/get_video_info", {
      query: { url },
    }) as Record<string, unknown>;

    if (!result || !result.data) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "TikTok video not found or unavailable. The video may be private or deleted.",
      });
    }

    const video = result.data as Record<string, unknown>;
    const videoStats = video.stats as Record<string, unknown> | undefined;
    const videoAuthor = video.author as Record<string, unknown> | undefined;
    const videoTitle = (video.desc as string) || "TikTok Video";
    
    // Get download URL - try multiple sources
    const downloadUrl = (video.playAddr as string) || 
                       (video.downloadAddr as string) || 
                       (video.play as string) ||
                       null;

    if (!downloadUrl) {
      // If no download URL, save the thumbnail instead
      const coverUrl = (video.cover as string) || (video.originCover as string);
      if (coverUrl) {
        console.log(`[UploadFromUrl] TikTok video not downloadable, saving cover image`);
        const coverResponse = await fetch(coverUrl);
        if (coverResponse.ok) {
          const coverBuffer = Buffer.from(await coverResponse.arrayBuffer());
          const safeTitle = videoTitle.replace(/[^a-zA-Z0-9-_\s]/g, "").substring(0, 50).trim() || "tiktok-video";
          const randomSuffix = Math.random().toString(36).substring(2, 10);
          const filename = `${safeTitle}-cover.jpg`;
          const fileKey = `${userId}-tiktok/${filename}-${randomSuffix}`;

          const { url: s3Url } = await storagePut(fileKey, coverBuffer, "image/jpeg");

          return {
            success: true,
            url: s3Url,
            fileKey,
            filename,
            mimeType: "image/jpeg",
            fileSize: coverBuffer.length,
            title: title || videoTitle,
            description: description || `TikTok video: ${url}\n\nNote: Full video download not available for this video.`,
            metadata: {
              platform: "tiktok",
              originalUrl: url,
              author: videoAuthor?.nickname || videoAuthor?.uniqueId,
              viewCount: videoStats?.playCount,
              likeCount: videoStats?.diggCount,
            },
          };
        }
      }
      
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "TikTok video download not available. The video may have download restrictions.",
      });
    }

    // Download the video
    console.log(`[UploadFromUrl] Downloading TikTok video from: ${downloadUrl.substring(0, 100)}...`);
    const videoResponse = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/',
      },
    });

    if (!videoResponse.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Failed to download TikTok video: ${videoResponse.status}`,
      });
    }

    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    
    // Check file size (500MB limit)
    if (videoBuffer.length > 500 * 1024 * 1024) {
      throw new TRPCError({
        code: "PAYLOAD_TOO_LARGE",
        message: "TikTok video exceeds 500MB limit",
      });
    }

    const safeTitle = videoTitle.replace(/[^a-zA-Z0-9-_\s]/g, "").substring(0, 50).trim() || "tiktok-video";
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const filename = `${safeTitle}.mp4`;
    const fileKey = `${userId}-tiktok/${filename}-${randomSuffix}`;

    const { url: s3Url } = await storagePut(fileKey, videoBuffer, "video/mp4");

    console.log(`[UploadFromUrl] TikTok video uploaded: ${s3Url}`);

    return {
      success: true,
      url: s3Url,
      fileKey,
      filename,
      mimeType: "video/mp4",
      fileSize: videoBuffer.length,
      title: title || videoTitle,
      description: description || `TikTok video by @${videoAuthor?.uniqueId || 'unknown'}\n\nOriginal: ${url}`,
      metadata: {
        platform: "tiktok",
        originalUrl: url,
        author: videoAuthor?.nickname || videoAuthor?.uniqueId,
        viewCount: videoStats?.playCount,
        likeCount: videoStats?.diggCount,
        duration: video.duration,
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

// Handle Instagram post upload
async function handleInstagramUpload(url: string, userId: number, title?: string, description?: string) {
  const postId = extractInstagramPostId(url);
  console.log(`[UploadFromUrl] Processing Instagram post: ${postId || url}`);

  try {
    // Try to get post info from Instagram API
    const result = await callDataApi("Instagram/get_post_info", {
      query: { url },
    }) as Record<string, unknown>;

    if (!result || !result.data) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Instagram post not found or unavailable. The post may be private or deleted.",
      });
    }

    const post = result.data as Record<string, unknown>;
    const postCaption = (post.caption as string) || "Instagram Post";
    const mediaUrl = (post.video_url as string) || (post.display_url as string) || (post.thumbnail_url as string);
    const isVideo = !!(post.video_url || post.is_video);

    if (!mediaUrl) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Could not extract media from Instagram post",
      });
    }

    // Download the media
    console.log(`[UploadFromUrl] Downloading Instagram ${isVideo ? 'video' : 'image'}`);
    const mediaResponse = await fetch(mediaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.instagram.com/',
      },
    });

    if (!mediaResponse.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Failed to download Instagram media: ${mediaResponse.status}`,
      });
    }

    const mediaBuffer = Buffer.from(await mediaResponse.arrayBuffer());
    const contentType = isVideo ? "video/mp4" : "image/jpeg";
    const ext = isVideo ? "mp4" : "jpg";

    const safeTitle = postCaption.replace(/[^a-zA-Z0-9-_\s]/g, "").substring(0, 50).trim() || "instagram-post";
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const filename = `${safeTitle}.${ext}`;
    const fileKey = `${userId}-instagram/${filename}-${randomSuffix}`;

    const { url: s3Url } = await storagePut(fileKey, mediaBuffer, contentType);

    console.log(`[UploadFromUrl] Instagram media uploaded: ${s3Url}`);

    return {
      success: true,
      url: s3Url,
      fileKey,
      filename,
      mimeType: contentType,
      fileSize: mediaBuffer.length,
      title: title || (postCaption.substring(0, 100) || "Instagram Post"),
      description: description || `Instagram post: ${url}\n\n${postCaption}`.substring(0, 1000),
      metadata: {
        platform: "instagram",
        postId,
        originalUrl: url,
        isVideo,
        owner: post.owner,
        likeCount: post.like_count,
        commentCount: post.comment_count,
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
