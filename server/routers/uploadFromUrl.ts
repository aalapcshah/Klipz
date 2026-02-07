import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";
import { YoutubeTranscript } from "youtube-transcript";
import { transcribeAudio } from "../_core/voiceTranscription";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { ENV } from "../_core/env";

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

// Fetch YouTube transcript using youtube-transcript package
async function fetchYouTubeTranscript(videoId: string): Promise<{ transcript: string; segments: Array<{ text: string; offset: number; duration: number }> } | null> {
  try {
    console.log(`[YouTube] Fetching transcript for video: ${videoId}`);
    
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
    
    if (!transcriptItems || transcriptItems.length === 0) {
      console.log(`[YouTube] No transcript available for video: ${videoId}`);
      return null;
    }
    
    // Convert to our format
    const segments = transcriptItems.map(item => ({
      text: item.text,
      offset: item.offset,
      duration: item.duration,
    }));
    
    // Create full transcript text with timestamps
    const transcriptLines = transcriptItems.map(item => {
      const seconds = Math.floor(item.offset / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      const timestamp = `[${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}]`;
      return `${timestamp} ${item.text}`;
    });
    
    const transcript = transcriptLines.join('\n');
    
    console.log(`[YouTube] Transcript fetched: ${transcriptItems.length} segments, ${transcript.length} characters`);
    
    return { transcript, segments };
  } catch (error) {
    console.log(`[YouTube] Transcript fetch error:`, error);
    return null;
  }
}

// Get YouTube video metadata using oEmbed
async function getYouTubeMetadata(videoId: string): Promise<{ title: string; author: string; thumbnailUrl: string; authorUrl?: string } | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oembedUrl);
    
    if (!response.ok) {
      console.log(`[YouTube] oEmbed failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json() as Record<string, unknown>;
    
    // Try multiple thumbnail sizes - maxresdefault doesn't exist for all videos
    const thumbnailUrl = await findBestYouTubeThumbnail(videoId);
    
    return {
      title: (data.title as string) || "YouTube Video",
      author: (data.author_name as string) || "Unknown",
      authorUrl: (data.author_url as string) || undefined,
      thumbnailUrl,
    };
  } catch (error) {
    console.log(`[YouTube] oEmbed error:`, error);
    return null;
  }
}

// Try multiple YouTube thumbnail sizes to find one that works
async function findBestYouTubeThumbnail(videoId: string): Promise<string> {
  const sizes = [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/default.jpg`,
  ];
  
  for (const url of sizes) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        const contentLength = response.headers.get('content-length');
        // YouTube returns a small placeholder for non-existent maxresdefault
        if (contentLength && parseInt(contentLength) > 2000) {
          console.log(`[YouTube] Found thumbnail: ${url} (${contentLength} bytes)`);
          return url;
        }
      }
    } catch {
      // Try next size
    }
  }
  
  // Fallback to hqdefault which always exists
  console.log(`[YouTube] Using fallback hqdefault thumbnail`);
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

// Fetch TikTok/Instagram content info using RapidAPI - extracts caption and metadata
interface SocialMediaInfo {
  caption: string;
  author: string;
  authorUsername: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  stats?: {
    likes: number;
    comments: number;
    shares: number;
    plays: number;
  };
  hashtags: string[];
  createTime?: string;
}

async function fetchSocialMediaInfo(url: string): Promise<SocialMediaInfo | null> {
  const apiKey = ENV.rapidApiKey;
  if (!apiKey) {
    console.log(`[TikTokAPI] No RapidAPI key configured`);
    return null;
  }

  try {
    console.log(`[TikTokAPI] Fetching info for: ${url}`);
    
    // Use the new TikTok Scraper API (tiktok-scraper7)
    const response = await fetch(`https://tiktok-scraper7.p.rapidapi.com/?url=${encodeURIComponent(url)}`, {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": "tiktok-scraper7.p.rapidapi.com",
      },
    });

    if (!response.ok) {
      console.log(`[TikTokAPI] API returned ${response.status}`);
      return null;
    }

    const data = await response.json() as Record<string, unknown>;
    console.log(`[TikTokAPI] Response received, parsing data...`);
    
    // The new API returns data directly in data.data
    const videoData = data.data as Record<string, unknown> | undefined;
    
    if (videoData && videoData.title !== undefined) {
      console.log(`[TikTokAPI] Found video data, extracting info...`);
      
      const author = videoData.author as Record<string, unknown> | undefined;
      const musicInfo = videoData.music_info as Record<string, unknown> | undefined;
      
      // Extract hashtags from title
      const hashtags: string[] = [];
      const title = (videoData.title as string) || "";
      const hashtagMatches = title.match(/#[\w]+/g);
      if (hashtagMatches) {
        hashtags.push(...hashtagMatches.map(h => h.substring(1)));
      }
      
      // Extract create time
      let createTime: string | undefined;
      if (videoData.create_time) {
        createTime = new Date((videoData.create_time as number) * 1000).toISOString();
      }
      
      const result: SocialMediaInfo = {
        caption: title,
        author: (author?.nickname as string) || "",
        authorUsername: (author?.unique_id as string) || "",
        videoUrl: (videoData.play as string) || (videoData.hdplay as string),
        thumbnailUrl: (videoData.cover as string) || (videoData.origin_cover as string),
        stats: {
          likes: (videoData.digg_count as number) || 0,
          comments: (videoData.comment_count as number) || 0,
          shares: (videoData.share_count as number) || 0,
          plays: (videoData.play_count as number) || 0,
        },
        hashtags,
        createTime,
      };
      
      console.log(`[TikTokAPI] Extracted caption: "${result.caption.substring(0, 100)}..."`);
      console.log(`[TikTokAPI] Author: @${result.authorUsername} (${result.author})`);
      console.log(`[TikTokAPI] Hashtags: ${result.hashtags.length}`);
      console.log(`[TikTokAPI] Stats: ${result.stats?.likes} likes, ${result.stats?.plays} plays`);
      if (result.videoUrl) {
        console.log(`[TikTokAPI] Video URL available`);
      }
      
      return result;
    }
    
    console.log(`[TikTokAPI] No video data found in response`);
    return null;
  } catch (error) {
    console.log(`[TikTokAPI] Error:`, error);
    return null;
  }
}

// Extract Instagram shortcode from URL
function extractInstagramShortcode(url: string): string | null {
  const patterns = [
    /instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Fetch Instagram content info using RapidAPI (instagram120 API)
async function fetchInstagramInfo(url: string): Promise<SocialMediaInfo | null> {
  const apiKey = ENV.rapidApiKey;
  console.log(`[InstagramAPI] Starting fetchInstagramInfo for URL: ${url}`);
  console.log(`[InstagramAPI] API Key available: ${apiKey ? 'YES (length: ' + apiKey.length + ')' : 'NO'}`);
  if (!apiKey) {
    console.log(`[InstagramAPI] No RapidAPI key configured`);
    return null;
  }

  const shortcode = extractInstagramShortcode(url);
  if (!shortcode) {
    console.log(`[InstagramAPI] Could not extract shortcode from URL: ${url}`);
    return null;
  }

  try {
    console.log(`[InstagramAPI] Fetching info for shortcode: ${shortcode}`);
    
    const response = await fetch('https://instagram120.p.rapidapi.com/api/instagram/mediaByShortcode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': 'instagram120.p.rapidapi.com',
        'x-rapidapi-key': apiKey,
      },
      body: JSON.stringify({ shortcode }),
    });

    if (!response.ok) {
      console.log(`[InstagramAPI] API returned ${response.status}`);
      return null;
    }

    const data = await response.json() as Array<Record<string, unknown>>;
    console.log(`[InstagramAPI] Response received, parsing data...`);
    console.log(`[InstagramAPI] Response has ${Array.isArray(data) ? data.length : 0} items`);
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.log(`[InstagramAPI] No data in response`);
      return null;
    }

    // For carousel posts, the caption may be on any item in the array
    // We need to find the item with the longest/non-empty caption
    let bestCaption = "";
    let bestMeta: Record<string, unknown> | undefined;
    let bestItem: Record<string, unknown> | undefined;
    
    for (const item of data) {
      const meta = item.meta as Record<string, unknown> | undefined;
      if (meta) {
        const caption = (meta.title as string) || "";
        console.log(`[InstagramAPI] Item caption length: ${caption.length}`);
        if (caption.length > bestCaption.length) {
          bestCaption = caption;
          bestMeta = meta;
          bestItem = item;
        }
        // Also capture meta if we haven't found one yet (for stats)
        if (!bestMeta) {
          bestMeta = meta;
          bestItem = item;
        }
      }
    }
    
    // Use the first item if no caption was found
    if (!bestItem) {
      bestItem = data[0];
      bestMeta = bestItem.meta as Record<string, unknown> | undefined;
    }
    
    if (!bestMeta) {
      console.log(`[InstagramAPI] No meta data in any response item`);
      return null;
    }

    const caption = bestCaption || (bestMeta.title as string) || "";
    console.log(`[InstagramAPI] Best caption found: "${caption.substring(0, 100)}..."`);
    
    const hashtagMatches = caption.match(/#[\w]+/g) || [];
    const hashtags = hashtagMatches.map(tag => tag.substring(1));
    
    const urls = bestItem.urls as Array<Record<string, unknown>> | undefined;
    let videoUrl: string | undefined;
    if (urls && urls.length > 0) {
      videoUrl = urls[0].url as string;
    }
    
    const thumbnailUrl = bestItem.pictureUrl as string | undefined;
    
    let createTime: string | undefined;
    if (bestMeta.takenAt) {
      createTime = new Date((bestMeta.takenAt as number) * 1000).toISOString();
    }
    
    const result: SocialMediaInfo = {
      caption,
      author: (bestMeta.username as string) || "",
      authorUsername: (bestMeta.username as string) || "",
      videoUrl,
      thumbnailUrl,
      stats: {
        likes: (bestMeta.likeCount as number) || 0,
        comments: (bestMeta.commentCount as number) || 0,
        shares: 0,
        plays: 0,
      },
      hashtags,
      createTime,
    };
    
    console.log(`[InstagramAPI] Extracted caption: "${result.caption.substring(0, 100)}..."`);    console.log(`[InstagramAPI] ThumbnailUrl: ${result.thumbnailUrl || 'NOT FOUND'}`);
    console.log(`[InstagramAPI] Author: @${result.authorUsername}`);
    if (result.videoUrl) {
      console.log(`[InstagramAPI] Video URL available`);
    }
    
    return result;
  } catch (error) {
    console.log(`[InstagramAPI] Error:`, error);
    return null;
  }
}

// Download video using GoDownloader API (RapidAPI) - for Pro subscribers
async function downloadWithGoDownloader(url: string): Promise<{ videoUrl: string; title?: string; author?: string } | null> {
  // Use the new fetchSocialMediaInfo function
  const info = await fetchSocialMediaInfo(url);
  if (info && info.videoUrl) {
    return {
      videoUrl: info.videoUrl,
      title: info.caption,
      author: info.authorUsername || info.author,
    };
  }
  return null;
}

// Download video from URL
async function downloadVideoFromUrl(videoUrl: string): Promise<Buffer | null> {
  try {
    console.log(`[Download] Downloading video from: ${videoUrl.substring(0, 100)}...`);
    
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    
    if (!response.ok) {
      console.log(`[Download] Failed: ${response.status}`);
      return null;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Check if we got actual video content
    if (buffer.length < 10000) {
      console.log(`[Download] Content too small (${buffer.length} bytes), likely an error`);
      return null;
    }
    
    console.log(`[Download] Successfully downloaded ${buffer.length} bytes`);
    return buffer;
  } catch (error) {
    console.log(`[Download] Error:`, error);
    return null;
  }
}

// Transcribe video using speech-to-text
async function transcribeVideo(videoBuffer: Buffer, userId: number, platform: string): Promise<string | null> {
  try {
    console.log(`[Transcribe] Starting transcription for ${platform} video (${videoBuffer.length} bytes)`);
    
    // Upload video to S3 temporarily for transcription
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const tempFileKey = `${userId}-temp/${platform}-video-${randomSuffix}.mp4`;
    
    const { url: tempUrl } = await storagePut(tempFileKey, videoBuffer, "video/mp4");
    console.log(`[Transcribe] Uploaded temp video to: ${tempUrl}`);
    
    // Transcribe the audio
    const result = await transcribeAudio({
      audioUrl: tempUrl,
      prompt: `Transcribe this ${platform} video`,
    });
    
    if ("error" in result) {
      console.log(`[Transcribe] Transcription error:`, result.error);
      return null;
    }
    
    console.log(`[Transcribe] Transcription successful: ${result.text.length} characters`);
    return result.text;
  } catch (error) {
    console.log(`[Transcribe] Error:`, error);
    return null;
  }
}

// Download thumbnail and upload to S3 for permanent storage
async function uploadThumbnailToS3(thumbnailUrl: string, platform: string, userId: number): Promise<string | null> {
  console.log(`[ThumbnailUpload] Downloading thumbnail from CDN...`);
  try {
    const imageResponse = await fetch(thumbnailUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': platform === 'instagram' ? 'https://www.instagram.com/' : 'https://www.tiktok.com/'
      }
    });
    
    if (!imageResponse.ok) {
      console.log(`[ThumbnailUpload] Failed to download: ${imageResponse.status}`);
      return null;
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const fileKey = `${userId}-thumbnails/${platform}-${randomSuffix}.${extension}`;
    
    const { url: s3Url } = await storagePut(fileKey, Buffer.from(imageBuffer), contentType);
    console.log(`[ThumbnailUpload] Uploaded to S3: ${s3Url}`);
    return s3Url;
  } catch (error) {
    console.log(`[ThumbnailUpload] Error:`, error);
    return null;
  }
}

// Analyze thumbnail image using AI vision
async function analyzeThumbnail(thumbnailUrl: string, platform: string): Promise<string | null> {
  console.log(`[ThumbnailAnalysis] STARTING thumbnail analysis for ${platform}`);
  console.log(`[ThumbnailAnalysis] URL: ${thumbnailUrl}`);
  try {
    // Download the image first since Instagram CDN URLs expire quickly
    console.log(`[ThumbnailAnalysis] Downloading image...`);
    const imageResponse = await fetch(thumbnailUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': platform === 'instagram' ? 'https://www.instagram.com/' : 'https://www.tiktok.com/'
      }
    });
    
    if (!imageResponse.ok) {
      console.log(`[ThumbnailAnalysis] Failed to download image: ${imageResponse.status}`);
      return null;
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const dataUrl = `data:${contentType};base64,${base64Image}`;
    
    console.log(`[ThumbnailAnalysis] Image downloaded: ${imageBuffer.byteLength} bytes, type: ${contentType}`);
    console.log(`[ThumbnailAnalysis] Calling invokeLLM with base64 image...`);
    
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert at analyzing social media content. Describe what you see in this ${platform} post image/thumbnail in detail. Focus on:
1. Main subjects (people, objects, text overlays)
2. Setting/location
3. Actions or activities shown
4. Visual style (colors, composition)
5. Any text visible in the image
6. Mood/tone of the content

Be concise but thorough. If there's text in the image, transcribe it exactly.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this ${platform} post thumbnail/image:`
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
                detail: "high"
              }
            }
          ]
        }
      ]
    });
    
    const analysis = response.choices[0]?.message?.content;
    if (typeof analysis === "string" && analysis.length > 0) {
      console.log(`[ThumbnailAnalysis] Analysis complete: ${analysis.length} characters`);
      return analysis;
    }
    
    console.log(`[ThumbnailAnalysis] No analysis returned`);
    return null;
  } catch (error) {
    console.log(`[ThumbnailAnalysis] Error:`, error);
    return null;
  }
}

// Check if user has Pro subscription
async function isProSubscriber(userId: number): Promise<boolean> {
  const user = await db.getUserById(userId);
  if (!user) return false;
  
  // Admin always has access
  if (user.role === "admin") return true;
  
  // Check subscription tier (pro or trial)
  const tier = user.subscriptionTier || "free";
  if (tier === "pro" || tier === "trial") {
    // Check if subscription is still valid
    if (user.subscriptionExpiresAt && user.subscriptionExpiresAt < new Date()) {
      return false;
    }
    return true;
  }
  
  return false;
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
      const { platform, videoId } = detectSocialPlatform(url);

      try {
        // Handle YouTube URLs - fetch transcript
        if (platform === "youtube" && videoId) {
          return await handleYouTubeUpload(url, videoId, ctx.user.id, title, description);
        }
        
        // Handle TikTok and Instagram - try to download and transcribe (Pro feature)
        if (platform === "tiktok" || platform === "instagram") {
          return await handleSocialMediaWithTranscription(url, platform, ctx.user.id, title, description);
        }
        
        // Handle Twitter - save as reference
        if (platform === "twitter") {
          return await handleSocialMediaReference(url, platform, ctx.user.id, title, description);
        }
        
        // Handle Vimeo
        if (platform === "vimeo") {
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
          try {
            const urlPath = new URL(url).pathname;
            finalFilename = urlPath.split("/").pop() || `downloaded-${Date.now()}`;
          } catch {
            finalFilename = `downloaded-${Date.now()}`;
          }
        }

        // Add extension based on content type if missing
        if (!finalFilename.includes(".")) {
          const ext = contentType.split("/")[1]?.split(";")[0] || "bin";
          finalFilename = `${finalFilename}.${ext}`;
        }

        // Download file
        const buffer = Buffer.from(await response.arrayBuffer());

        // Upload to S3
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `${ctx.user.id}-files/${finalFilename}-${randomSuffix}`;

        const { url: s3Url } = await storagePut(fileKey, buffer, contentType);

        console.log(`[UploadFromUrl] File uploaded: ${s3Url}`);

        return {
          success: true,
          url: s3Url,
          fileKey,
          filename: finalFilename,
          mimeType: contentType,
          fileSize: buffer.length,
          title: title || finalFilename,
          description,
        };
      } catch (error) {
        console.error("[UploadFromUrl] Error:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to process URL: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Get social media platform info
  getSocialMediaInfo: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { url } = input;
      const { platform, videoId } = detectSocialPlatform(url);
      const isPro = await isProSubscriber(ctx.user.id);

      return {
        platform,
        videoId,
        isPro,
        platformInfo: platform ? {
          youtube: {
            name: "YouTube",
            icon: "youtube",
            color: "#FF0000",
            supportsDownload: true,
            note: "Video transcript will be extracted (if available) or saved as thumbnail.",
          },
          instagram: {
            name: "Instagram",
            icon: "instagram",
            color: "#E4405F",
            supportsDownload: true,
            note: isPro 
              ? "Caption, metadata, and audio transcript will be extracted (Pro feature)."
              : "Caption and metadata will be extracted. Upgrade to Pro for audio transcription.",
          },
          tiktok: {
            name: "TikTok",
            icon: "tiktok",
            color: "#000000",
            supportsDownload: true,
            note: isPro
              ? "Caption, metadata, and audio transcript will be extracted (Pro feature)."
              : "Caption and metadata will be extracted. Upgrade to Pro for audio transcription.",
          },
          twitter: {
            name: "Twitter/X",
            icon: "twitter",
            color: "#1DA1F2",
            supportsDownload: false,
            note: "Twitter content will be saved as a reference link.",
          },
          linkedin: {
            name: "LinkedIn",
            icon: "linkedin",
            color: "#0A66C2",
            supportsDownload: false,
            note: "LinkedIn content will be saved as a reference link.",
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
          contentType: platform === "youtube" || platform === "tiktok" || platform === "instagram" ? "text/plain" : "application/json",
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

// Handle YouTube upload - save thumbnail as image file with embedded video metadata
async function handleYouTubeUpload(
  url: string,
  videoId: string,
  userId: number,
  title?: string,
  description?: string
) {
  console.log(`[UploadFromUrl] Processing YouTube video: ${url} (ID: ${videoId})`);

  // Get video metadata
  const metadata = await getYouTubeMetadata(videoId);
  const videoTitle = metadata?.title || "YouTube Video";
  const authorName = metadata?.author || "Unknown";

  // Try to fetch transcript
  const transcriptResult = await fetchYouTubeTranscript(videoId);
  const transcript = transcriptResult?.transcript || null;

  // Always try to download and upload thumbnail to S3 as the primary file
  let thumbnailBuffer: Buffer | null = null;
  let thumbnailS3Url: string | undefined;
  let thumbnailFileKey: string | undefined;
  let thumbnailFileSize = 0;

  if (metadata?.thumbnailUrl) {
    try {
      const thumbResponse = await fetch(metadata.thumbnailUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Klipz/1.0)' },
      });
      if (thumbResponse.ok) {
        thumbnailBuffer = Buffer.from(await thumbResponse.arrayBuffer());
        if (thumbnailBuffer.length > 1000) {
          const randomSuffix = Math.random().toString(36).substring(2, 10);
          thumbnailFileKey = `${userId}-youtube/youtube-${videoId}-${randomSuffix}.jpg`;
          const thumbResult = await storagePut(thumbnailFileKey, thumbnailBuffer, "image/jpeg");
          thumbnailS3Url = thumbResult.url;
          thumbnailFileSize = thumbnailBuffer.length;
          console.log(`[UploadFromUrl] YouTube thumbnail uploaded to S3: ${thumbnailS3Url}`);
        } else {
          thumbnailBuffer = null;
        }
      }
    } catch (error) {
      console.log(`[UploadFromUrl] Thumbnail download failed:`, error);
    }
  }

  // Build description with video info
  const descParts: string[] = [];
  if (videoTitle) descParts.push(videoTitle);
  descParts.push(`Video by ${authorName}`);
  if (metadata?.authorUrl) descParts.push(`Channel: ${metadata.authorUrl}`);
  descParts.push(`Original URL: ${url}`);
  if (transcript) {
    descParts.push(`\n--- Transcript ---\n${transcript}`);
  }

  const safeTitle = (title || videoTitle)
    .replace(/[^a-zA-Z0-9-_\s]/g, "")
    .substring(0, 50)
    .trim() || "youtube-video";

  // If we got a thumbnail, save as image file (much better UX)
  if (thumbnailS3Url && thumbnailFileKey) {
    const filename = `${safeTitle}.jpg`;
    console.log(`[UploadFromUrl] YouTube saved as thumbnail image: ${thumbnailS3Url}`);

    return {
      success: true,
      url: thumbnailS3Url,
      fileKey: thumbnailFileKey,
      filename,
      mimeType: "image/jpeg",
      fileSize: thumbnailFileSize,
      title: title || videoTitle,
      description: description || descParts.join('\n'),
      metadata: {
        platform: "youtube",
        originalUrl: url,
        videoId,
        authorName,
        authorUrl: metadata?.authorUrl,
        hasTranscript: !!transcript,
        thumbnailUrl: thumbnailS3Url,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
      },
    };
  }

  // Fallback: no thumbnail available - save as JSON reference
  console.log(`[UploadFromUrl] No thumbnail available, saving as reference`);
  const referenceContent = JSON.stringify({
    platform: "youtube",
    originalUrl: url,
    videoId,
    title: videoTitle,
    author: authorName,
    authorUrl: metadata?.authorUrl,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    hasTranscript: !!transcript,
    transcript: transcript || undefined,
    savedAt: new Date().toISOString(),
  }, null, 2);

  const buffer = Buffer.from(referenceContent, "utf-8");
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const filename = `${safeTitle}.json`;
  const fileKey = `${userId}-youtube/${filename}-${randomSuffix}`;

  const { url: s3Url } = await storagePut(fileKey, buffer, "application/json");

  console.log(`[UploadFromUrl] YouTube reference file uploaded: ${s3Url}`);

  return {
    success: true,
    url: s3Url,
    fileKey,
    filename,
    mimeType: "application/json",
    fileSize: buffer.length,
    title: title || videoTitle,
    description: description || descParts.join('\n'),
    metadata: {
      platform: "youtube",
      originalUrl: url,
      videoId,
      authorName,
      authorUrl: metadata?.authorUrl,
      hasTranscript: !!transcript,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
    },
  };
}

// Handle TikTok and Instagram - extract caption and optionally transcribe audio (Pro feature)
async function handleSocialMediaWithTranscription(
  url: string,
  platform: "tiktok" | "instagram",
  userId: number,
  title?: string,
  description?: string
) {
  console.log(`[UploadFromUrl] Processing ${platform} content: ${url}`);

  // Extract username/ID from URL
  let username = "";
  let contentId = "";
  
  if (platform === "tiktok") {
    const userMatch = url.match(/@([^/]+)/);
    username = userMatch ? userMatch[1] : "";
    const idMatch = url.match(/video\/(\d+)/);
    contentId = idMatch ? idMatch[1] : "";
  } else if (platform === "instagram") {
    const idMatch = url.match(/\/(?:p|reel|reels)\/([^/?]+)/);
    contentId = idMatch ? idMatch[1] : "";
  }

  const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);

  // Check if user has Pro subscription
  const isPro = await isProSubscriber(userId);
  console.log(`[UploadFromUrl] User ${userId} isPro: ${isPro}`);
  
  // First, try to fetch caption and metadata from the appropriate API
  console.log(`[UploadFromUrl] Fetching ${platform} content info...`);
  
  // Use different APIs for TikTok vs Instagram
  let socialInfo: SocialMediaInfo | null = null;
  if (platform === "instagram") {
    socialInfo = await fetchInstagramInfo(url);
  } else {
    socialInfo = await fetchSocialMediaInfo(url);
  }
  
  if (socialInfo) {
    const hasCaption = !!socialInfo.caption;
    console.log(`[UploadFromUrl] Got data from API. Caption: ${hasCaption ? `"${socialInfo.caption.substring(0, 100)}..."` : "(empty)"}`);
    
    // Update username from API response if available
    if (socialInfo.authorUsername) {
      username = socialInfo.authorUsername;
    }
    
    // Build the content document with caption
    let contentSections: string[] = [];
    
    // Header
    contentSections.push(`${platformName} Content`);
    contentSections.push("=".repeat(platformName.length + 8));
    contentSections.push("");
    contentSections.push(`Platform: ${platformName}`);
    if (socialInfo.author || username) {
      contentSections.push(`Creator: ${socialInfo.author} (@${username})`);
    }
    if (contentId) {
      contentSections.push(`Content ID: ${contentId}`);
    }
    contentSections.push(`URL: ${url}`);
    if (socialInfo.createTime) {
      contentSections.push(`Posted: ${socialInfo.createTime}`);
    }
    contentSections.push(`Extracted: ${new Date().toISOString()}`);
    
    // Stats
    if (socialInfo.stats) {
      contentSections.push("");
      contentSections.push("--- Stats ---");
      contentSections.push(`Likes: ${socialInfo.stats.likes.toLocaleString()}`);
      contentSections.push(`Comments: ${socialInfo.stats.comments.toLocaleString()}`);
      contentSections.push(`Shares: ${socialInfo.stats.shares.toLocaleString()}`);
      contentSections.push(`Plays: ${socialInfo.stats.plays.toLocaleString()}`);
    }
    
    // Caption
    contentSections.push("");
    contentSections.push("=".repeat(platformName.length + 8));
    contentSections.push("CAPTION");
    contentSections.push("=".repeat(platformName.length + 8));
    contentSections.push("");
    contentSections.push(socialInfo.caption);
    
    // Hashtags
    if (socialInfo.hashtags.length > 0) {
      contentSections.push("");
      contentSections.push("--- Hashtags ---");
      contentSections.push(socialInfo.hashtags.map(h => `#${h}`).join(" "));
    }
    
    // Upload thumbnail to S3 for permanent storage (do this for ALL users, not just Pro)
    let permanentThumbnailUrl: string | null = null;
    if (socialInfo.thumbnailUrl) {
      console.log(`[UploadFromUrl] Uploading thumbnail to S3 for permanent storage...`);
      permanentThumbnailUrl = await uploadThumbnailToS3(socialInfo.thumbnailUrl, platform, userId);
    }
    
    // For Pro users, analyze thumbnail image and try to get audio transcript
    let thumbnailAnalysis: string | null = null;
    let audioTranscript: string | null = null;
    
    if (isPro) {
      console.log(`[UploadFromUrl] *** PRO USER DETECTED ***`);
      console.log(`[UploadFromUrl] thumbnailUrl: ${socialInfo.thumbnailUrl || 'NOT AVAILABLE'}`);
      console.log(`[UploadFromUrl] videoUrl: ${socialInfo.videoUrl || 'NOT AVAILABLE'}`);
      // Analyze thumbnail image if available
      if (socialInfo.thumbnailUrl) {
        console.log(`[UploadFromUrl] Pro user - analyzing thumbnail image: ${socialInfo.thumbnailUrl.substring(0, 100)}...`);
        thumbnailAnalysis = await analyzeThumbnail(socialInfo.thumbnailUrl, platform);
        if (thumbnailAnalysis) {
          console.log(`[UploadFromUrl] Thumbnail analysis successful`);
          contentSections.push("");
          contentSections.push("=".repeat(platformName.length + 8));
          contentSections.push("VISUAL ANALYSIS (AI)");
          contentSections.push("=".repeat(platformName.length + 8));
          contentSections.push("");
          contentSections.push(thumbnailAnalysis);
        }
      }
      
      // Try to get audio transcript if video URL available
      if (socialInfo.videoUrl) {
        console.log(`[UploadFromUrl] Pro user - attempting audio transcription...`);
        
        const videoBuffer = await downloadVideoFromUrl(socialInfo.videoUrl);
        if (videoBuffer) {
          audioTranscript = await transcribeVideo(videoBuffer, userId, platform);
          if (audioTranscript) {
            console.log(`[UploadFromUrl] Audio transcription successful`);
            contentSections.push("");
            contentSections.push("=".repeat(platformName.length + 8));
            contentSections.push("AUDIO TRANSCRIPT");
            contentSections.push("=".repeat(platformName.length + 8));
            contentSections.push("");
            contentSections.push(audioTranscript);
          }
        }
      }
    }
    
    const fullContent = contentSections.join("\n");
    const buffer = Buffer.from(fullContent, "utf-8");
    
    const safeTitle = (title || `${platformName} ${username ? `by @${username}` : "video"}`)
      .replace(/[^a-zA-Z0-9-_\s@]/g, "")
      .substring(0, 50)
      .trim();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const filename = `${safeTitle}-content.txt`;
    const fileKey = `${userId}-${platform}/${filename}-${randomSuffix}`;

    const { url: s3Url } = await storagePut(fileKey, buffer, "text/plain");

    console.log(`[UploadFromUrl] ${platformName} content saved: ${s3Url}`);

    return {
      success: true,
      url: s3Url,
      fileKey,
      filename,
      mimeType: "text/plain",
      fileSize: buffer.length,
      title: title || `${platformName} ${username ? `by @${username}` : "video"}`,
      description: description || `${platformName} content\n\n${socialInfo.author ? `Creator: ${socialInfo.author} (@${username})\n` : ""}Original URL: ${url}${socialInfo.caption ? `\n\n--- Caption ---\n${socialInfo.caption}` : ""}${thumbnailAnalysis ? `\n\n--- Visual Analysis (AI) ---\n${thumbnailAnalysis}` : ''}`,
      metadata: {
        platform,
        originalUrl: url,
        username,
        contentId,
        hasCaption,
        hasThumbnailAnalysis: !!thumbnailAnalysis,
        hasAudioTranscript: !!audioTranscript,
        stats: socialInfo.stats,
        hashtags: socialInfo.hashtags,
        isPro,
        thumbnailUrl: permanentThumbnailUrl || socialInfo.thumbnailUrl || null,
      },
    };
  }
  
  // If caption extraction failed but user is Pro, try video download + transcription
  if (isPro) {
    console.log(`[UploadFromUrl] Caption extraction failed, trying video download for Pro user...`);
    
    const downloadInfo = await downloadWithGoDownloader(url);
    
    if (downloadInfo && downloadInfo.videoUrl) {
      const videoBuffer = await downloadVideoFromUrl(downloadInfo.videoUrl);
      
      if (videoBuffer) {
        const transcript = await transcribeVideo(videoBuffer, userId, platform);
        
        if (transcript) {
          const videoAuthor = downloadInfo.author || username || "Unknown";
          
          const transcriptContent = `${platformName} Video Transcript
${"=".repeat(platformName.length + 17)}

Platform: ${platformName}
${videoAuthor ? `Creator: @${videoAuthor}\n` : ""}${contentId ? `Content ID: ${contentId}\n` : ""}URL: ${url}
Extracted: ${new Date().toISOString()}
Method: Speech-to-text transcription (Pro feature)

${"=".repeat(platformName.length + 17)}
TRANSCRIPT
${"=".repeat(platformName.length + 17)}

${transcript}
`;

          const buffer = Buffer.from(transcriptContent, "utf-8");
          const safeTitle = (title || `${platformName} ${username ? `by @${username}` : "video"}`)
            .replace(/[^a-zA-Z0-9-_\s@]/g, "")
            .substring(0, 50)
            .trim();
          const randomSuffix = Math.random().toString(36).substring(2, 10);
          const filename = `${safeTitle}-transcript.txt`;
          const fileKey = `${userId}-${platform}/${filename}-${randomSuffix}`;

          const { url: s3Url } = await storagePut(fileKey, buffer, "text/plain");

          return {
            success: true,
            url: s3Url,
            fileKey,
            filename,
            mimeType: "text/plain",
            fileSize: buffer.length,
            title: title || `${platformName} ${username ? `by @${username}` : "video"} - Transcript`,
            description: description || `${platformName} video transcript\n\n${username ? `Creator: @${username}\n` : ""}Original URL: ${url}`,
            metadata: {
              platform,
              originalUrl: url,
              username,
              contentId,
              hasCaption: false,
              hasAudioTranscript: true,
              isPro: true,
            },
          };
        }
      }
    }
  }

  // Fallback: save as reference if everything failed
  console.log(`[UploadFromUrl] All extraction methods failed, saving as reference`);
  return await handleSocialMediaReference(url, platform, userId, title, description, !isPro);
}

// Handle other social media URLs - save as reference
async function handleSocialMediaReference(
  url: string,
  platform: SocialPlatform,
  userId: number,
  title?: string,
  description?: string,
  showUpgradeNote: boolean = false
) {
  console.log(`[UploadFromUrl] Processing ${platform} content as reference: ${url}`);

  // Extract username/ID from URL if possible
  let username = "";
  let contentId = "";
  
  if (platform === "tiktok") {
    const userMatch = url.match(/@([^/]+)/);
    username = userMatch ? userMatch[1] : "";
    const idMatch = url.match(/video\/(\d+)/);
    contentId = idMatch ? idMatch[1] : "";
  } else if (platform === "instagram") {
    const idMatch = url.match(/\/(?:p|reel|reels)\/([^/?]+)/);
    contentId = idMatch ? idMatch[1] : "";
  } else if (platform === "twitter") {
    const userMatch = url.match(/(?:twitter\.com|x\.com)\/([^/]+)/);
    username = userMatch ? userMatch[1] : "";
    const idMatch = url.match(/status\/(\d+)/);
    contentId = idMatch ? idMatch[1] : "";
  }

  const upgradeNote = showUpgradeNote 
    ? "\n\nUpgrade to Pro to download and transcribe videos automatically!"
    : "";

  const referenceContent = JSON.stringify({
    platform,
    originalUrl: url,
    username,
    contentId,
    title: title || `${platform} content`,
    savedAt: new Date().toISOString(),
    note: `${platform} content reference - open original URL to view content.${upgradeNote}`,
  }, null, 2);

  const buffer = Buffer.from(referenceContent, "utf-8");
  const platformName = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : "Social";
  const safeTitle = (title || `${platformName} ${username ? `by ${username}` : "content"}`)
    .replace(/[^a-zA-Z0-9-_\s@]/g, "")
    .substring(0, 50)
    .trim();
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const filename = `${safeTitle}.json`;
  const fileKey = `${userId}-${platform}/${filename}-${randomSuffix}`;

  const { url: s3Url } = await storagePut(fileKey, buffer, "application/json");

  console.log(`[UploadFromUrl] ${platform} reference saved: ${s3Url}`);

  return {
    success: true,
    url: s3Url,
    fileKey,
    filename,
    mimeType: "application/json",
    fileSize: buffer.length,
    title: title || `${platformName} ${username ? `video by @${username}` : "content"}`,
    description: description || `${platformName} content reference\n\nOriginal URL: ${url}${upgradeNote}`,
    metadata: {
      platform,
      originalUrl: url,
      username,
      contentId,
      isReferenceOnly: true,
    },
  };
}

// Handle Vimeo video upload using oEmbed API
async function handleVimeoUpload(
  url: string,
  userId: number,
  title?: string,
  description?: string
) {
  console.log(`[UploadFromUrl] Processing Vimeo video: ${url}`);

  try {
    // Get video metadata from oEmbed
    const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl);
    
    if (!response.ok) {
      throw new Error(`Vimeo oEmbed failed: ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const videoTitle = (data.title as string) || "Vimeo Video";
    const authorName = (data.author_name as string) || "Unknown";
    const thumbnailUrl = data.thumbnail_url as string;

    if (thumbnailUrl) {
      // Download thumbnail
      const thumbResponse = await fetch(thumbnailUrl);
      if (thumbResponse.ok) {
        const thumbBuffer = Buffer.from(await thumbResponse.arrayBuffer());
        
        const safeTitle = (title || videoTitle)
          .replace(/[^a-zA-Z0-9-_\s]/g, "")
          .substring(0, 50)
          .trim() || "vimeo-thumbnail";
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const filename = `${safeTitle}.jpg`;
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
          description: description || `Vimeo video by ${authorName}\nOriginal URL: ${url}`,
          metadata: {
            platform: "vimeo",
            originalUrl: url,
            authorName,
          },
        };
      }
    }

    // Fallback: save as reference
    const referenceContent = JSON.stringify({
      platform: "vimeo",
      originalUrl: url,
      title: videoTitle,
      author: authorName,
      savedAt: new Date().toISOString(),
    }, null, 2);

    const buffer = Buffer.from(referenceContent, "utf-8");
    const safeTitle = (title || videoTitle)
      .replace(/[^a-zA-Z0-9-_\s]/g, "")
      .substring(0, 50)
      .trim() || "vimeo-reference";
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const filename = `${safeTitle}.json`;
    const fileKey = `${userId}-vimeo/${filename}-${randomSuffix}`;

    const { url: s3Url } = await storagePut(fileKey, buffer, "application/json");

    return {
      success: true,
      url: s3Url,
      fileKey,
      filename,
      mimeType: "application/json",
      fileSize: buffer.length,
      title: title || videoTitle,
      description: description || `Vimeo video reference\n\nVideo: ${videoTitle}\nAuthor: ${authorName}\nOriginal URL: ${url}`,
      metadata: {
        platform: "vimeo",
        originalUrl: url,
        authorName,
        isReferenceOnly: true,
      },
    };
  } catch (error) {
    console.error(`[UploadFromUrl] Vimeo processing error:`, error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to process Vimeo URL: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}
