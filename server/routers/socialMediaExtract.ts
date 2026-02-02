import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { callDataApi } from "../_core/dataApi";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";

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

export const socialMediaExtractRouter = router({
  // Get YouTube video info
  getYouTubeVideoInfo: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      const videoId = extractYouTubeVideoId(input.url);
      if (!videoId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid YouTube URL - could not extract video ID",
        });
      }

      try {
        // Use YouTube Data API to get video details
        const result = await callDataApi("Youtube/get_video_details", {
          query: { id: videoId },
        }) as Record<string, unknown>;

        if (!result || !result.title) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Video not found or unavailable",
          });
        }

        const stats = result.stats as Record<string, unknown> | undefined;
        const thumbnails = result.thumbnails as Array<{url: string}> | undefined;

        return {
          platform: "youtube" as const,
          videoId,
          title: (result.title as string) || "Untitled",
          description: (result.description as string) || "",
          thumbnail: thumbnails?.[0]?.url || null,
          duration: (result.lengthSeconds as number) || 0,
          author: (result.channelTitle as string) || "Unknown",
          authorUrl: result.channelId ? `https://youtube.com/channel/${result.channelId}` : null,
          viewCount: (stats?.views as number) || 0,
          publishedAt: (result.publishedTimeText as string) || null,
          // Note: Direct download URL not available through official API
          // Users would need to use the video URL directly
          downloadAvailable: false,
          downloadNote: "YouTube videos cannot be directly downloaded due to terms of service. You can save the video link for reference.",
        };
      } catch (error) {
        console.error("[YouTube] Error fetching video info:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch YouTube video information",
        });
      }
    }),

  // Get TikTok video info
  getTikTokVideoInfo: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      try {
        // Search for the video using the URL
        const result = await callDataApi("Tiktok/get_video_info", {
          query: { url: input.url },
        }) as Record<string, unknown>;

        if (!result || !result.data) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "TikTok video not found or unavailable",
          });
        }

        const video = result.data as Record<string, unknown>;
        const videoStats = video.stats as Record<string, unknown> | undefined;
        const videoAuthor = video.author as Record<string, unknown> | undefined;
        
        return {
          platform: "tiktok" as const,
          videoId: (video.id as string) || extractTikTokVideoId(input.url),
          title: (video.desc as string) || "Untitled",
          description: (video.desc as string) || "",
          thumbnail: (video.cover as string) || (video.originCover as string) || null,
          duration: (video.duration as number) || 0,
          author: (videoAuthor?.nickname as string) || (videoAuthor?.uniqueId as string) || "Unknown",
          authorUrl: videoAuthor?.uniqueId ? `https://tiktok.com/@${videoAuthor.uniqueId}` : null,
          viewCount: (videoStats?.playCount as number) || 0,
          likeCount: (videoStats?.diggCount as number) || 0,
          commentCount: (videoStats?.commentCount as number) || 0,
          shareCount: (videoStats?.shareCount as number) || 0,
          // TikTok video download URL (watermarked)
          downloadUrl: (video.playAddr as string) || (video.downloadAddr as string) || null,
          downloadAvailable: !!(video.playAddr || video.downloadAddr),
          downloadNote: video.playAddr ? "Video available for download (may include watermark)" : "Download not available for this video",
        };
      } catch (error) {
        console.error("[TikTok] Error fetching video info:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch TikTok video information",
        });
      }
    }),

  // Download and save social media content
  downloadSocialMedia: protectedProcedure
    .input(z.object({
      url: z.string().url(),
      platform: z.enum(["youtube", "tiktok", "instagram", "twitter", "facebook", "vimeo"]),
      downloadUrl: z.string().url().optional(),
      title: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { url, platform, downloadUrl, title } = input;

      // If no direct download URL, we can't download
      if (!downloadUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Direct download is not available for ${platform}. The video link has been saved for reference.`,
        });
      }

      try {
        console.log(`[SocialMedia] Downloading from ${platform}: ${downloadUrl}`);
        
        const response = await fetch(downloadUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': url,
          },
        });

        if (!response.ok) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Failed to download: ${response.status} ${response.statusText}`,
          });
        }

        const contentType = response.headers.get("content-type") || "video/mp4";
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Check file size (500MB limit for videos)
        const maxSize = 500 * 1024 * 1024;
        if (buffer.length > maxSize) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: "Video file exceeds 500MB limit",
          });
        }

        // Generate filename
        const ext = contentType.includes("video") ? "mp4" : "jpg";
        const safeTitle = (title || `${platform}-video`).replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 50);
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const filename = `${safeTitle}-${Date.now()}.${ext}`;
        const fileKey = `${ctx.user.id}-social/${platform}/${filename}-${randomSuffix}`;

        // Upload to S3
        const { url: s3Url } = await storagePut(fileKey, buffer, contentType);

        console.log(`[SocialMedia] Upload complete: ${s3Url}`);

        return {
          success: true,
          url: s3Url,
          fileKey,
          filename,
          mimeType: contentType,
          fileSize: buffer.length,
          platform,
          originalUrl: url,
        };
      } catch (error) {
        console.error("[SocialMedia] Download error:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to download from ${platform}: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Batch process multiple URLs
  batchExtractInfo: protectedProcedure
    .input(z.object({
      urls: z.array(z.string().url()).max(20),
    }))
    .mutation(async ({ input }) => {
      const results = await Promise.allSettled(
        input.urls.map(async (url) => {
          // Detect platform
          const urlLower = url.toLowerCase();
          
          if (urlLower.includes("youtube.com") || urlLower.includes("youtu.be")) {
            const videoId = extractYouTubeVideoId(url);
            if (videoId) {
              try {
                const result = await callDataApi("Youtube/get_video_details", {
                  query: { id: videoId },
                }) as Record<string, unknown>;
                return {
                  url,
                  platform: "youtube" as const,
                  success: true,
                  title: (result?.title as string) || "Untitled",
                  thumbnail: ((result?.thumbnails as Array<{url: string}>)?.[0]?.url) || null,
                  duration: (result?.lengthSeconds as number) || 0,
                };
              } catch {
                return { url, platform: "youtube" as const, success: false, error: "Failed to fetch info" };
              }
            }
          }
          
          if (urlLower.includes("tiktok.com")) {
            try {
              const result = await callDataApi("Tiktok/get_video_info", {
                query: { url },
              }) as Record<string, unknown>;
              const data = result?.data as Record<string, unknown> | undefined;
              return {
                url,
                platform: "tiktok" as const,
                success: true,
                title: (data?.desc as string) || "Untitled",
                thumbnail: (data?.cover as string) || null,
                duration: (data?.duration as number) || 0,
              };
            } catch {
              return { url, platform: "tiktok" as const, success: false, error: "Failed to fetch info" };
            }
          }
          
          // For other platforms, return basic info
          return {
            url,
            platform: "unknown" as const,
            success: true,
            title: new URL(url).hostname,
            thumbnail: null,
            duration: 0,
          };
        })
      );

      return results.map((result, index) => {
        if (result.status === "fulfilled") {
          return result.value;
        }
        return {
          url: input.urls[index],
          platform: "unknown" as const,
          success: false,
          error: result.reason?.message || "Unknown error",
        };
      });
    }),
});
