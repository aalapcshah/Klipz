import { getDb } from "../db";
import { files, enrichmentJobs } from "../../drizzle/schema";
import { eq, and, inArray, sql, isNull, or } from "drizzle-orm";
import { invokeLLM } from "./llm";
import { resolveFileUrl } from "../lib/resolveFileUrl";

const BATCH_SIZE = 5; // Process 5 files at a time
const MAX_RETRIES = 3;

/**
 * Enrich a single file with AI-generated metadata using deep content analysis.
 * For images: uses vision API to analyze actual visual content
 * For videos: uses file_url to analyze actual video content
 * For audio: uses file_url to analyze actual audio content
 * Falls back to text-based analysis only for unsupported file types.
 */
async function enrichSingleFile(fileId: number, userId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    if (!db) return { success: false, error: "Database not available" };
    
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.userId, userId)));

    if (!file) {
      return { success: false, error: "File not found" };
    }

    // Update status to processing
    await db
      .update(files)
      .set({ enrichmentStatus: "processing" })
      .where(eq(files.id, fileId));

    // Resolve the file URL to a publicly accessible URL
    let accessibleUrl: string;
    try {
      accessibleUrl = await resolveFileUrl(file);
      console.log(`[BackgroundEnrichment] Resolved URL for file ${fileId}: ${accessibleUrl.substring(0, 80)}...`);
    } catch (urlError) {
      console.error(`[BackgroundEnrichment] Failed to resolve URL for file ${fileId}:`, urlError);
      // Fall back to the raw URL
      accessibleUrl = file.url;
    }

    let aiAnalysis = "";
    let enrichmentData: { title?: string; description?: string; keywords?: string[] } = {};

    const jsonResponseInstruction = `\n\nIMPORTANT: Format your response as JSON:\n{\n  "title": "A concise title (max 100 chars)",\n  "description": "A detailed 2-3 sentence description based on your analysis of the ACTUAL content",\n  "keywords": ["keyword1", "keyword2", ...up to 10 relevant keywords]\n}`;

    if (file.mimeType.startsWith("image/")) {
      // Deep analysis of images with actual image content
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are an expert AI assistant that performs deep visual analysis of images. Examine the image carefully and describe what you actually see. Do NOT just guess from the filename.",
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: accessibleUrl,
                },
              },
              {
                type: "text",
                text: `Analyze this image deeply. Filename: ${file.filename}. Describe what you ACTUALLY see in the image — objects, people, text, colors, composition, context, and purpose. Do NOT just guess from the filename.${jsonResponseInstruction}`,
              },
            ],
          },
        ],
      });
      const content = response.choices[0]?.message?.content;
      aiAnalysis = typeof content === 'string' ? content : '';
    } else if (file.mimeType.startsWith("video/")) {
      // Deep analysis of videos with actual video content
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are an expert AI assistant that performs deep visual and audio analysis of videos. Watch the video carefully and describe what you actually see and hear. Do NOT just guess from the filename.",
          },
          {
            role: "user",
            content: [
              {
                type: "file_url" as const,
                file_url: {
                  url: accessibleUrl,
                  mime_type: (file.mimeType || "video/mp4") as any,
                },
              },
              {
                type: "text" as const,
                text: `Analyze this video deeply. Filename: ${file.filename}. Watch the video and describe what ACTUALLY happens — scenes, people, actions, spoken words, locations, objects, and the overall topic. Do NOT just guess from the filename.${jsonResponseInstruction}`,
              },
            ],
          },
        ],
      });
      const content = response.choices[0]?.message?.content;
      aiAnalysis = typeof content === 'string' ? content : '';
    } else if (file.mimeType.startsWith("audio/")) {
      // Deep analysis of audio with actual audio content
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are an expert AI assistant that performs deep analysis of audio files. Listen carefully and describe what you actually hear. Do NOT just guess from the filename.",
          },
          {
            role: "user",
            content: [
              {
                type: "file_url" as const,
                file_url: {
                  url: accessibleUrl,
                  mime_type: (file.mimeType || "audio/mpeg") as any,
                },
              },
              {
                type: "text" as const,
                text: `Analyze this audio file deeply. Filename: ${file.filename}. Listen and describe what you ACTUALLY hear — speech, music, sounds, topics discussed, and context. Do NOT just guess from the filename.${jsonResponseInstruction}`,
              },
            ],
          },
        ],
      });
      const content = response.choices[0]?.message?.content;
      aiAnalysis = typeof content === 'string' ? content : '';
    } else {
      // For other file types, use text-based analysis with available context
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are an AI assistant that analyzes files and provides metadata based on available information." },
          {
            role: "user",
            content: `Analyze this file based on available context:\n- Filename: ${file.filename}\n- Type: ${file.mimeType}\n- Current title: ${file.title || "None"}\n- Current description: ${file.description || "None"}\n\nProvide analysis based on what you can infer.${jsonResponseInstruction}`,
          },
        ],
      });
      const content = response.choices[0]?.message?.content;
      aiAnalysis = typeof content === 'string' ? content : '';
    }

    // Parse the JSON response
    try {
      const jsonMatch = aiAnalysis.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        enrichmentData = JSON.parse(jsonMatch[0]);
      }
    } catch {
      enrichmentData = { description: aiAnalysis };
    }

    // Update the file with enrichment data
    await db
      .update(files)
      .set({
        enrichmentStatus: "completed",
        enrichedAt: new Date(),
        aiAnalysis: enrichmentData.description || aiAnalysis,
        extractedKeywords: enrichmentData.keywords || [],
        qualityScore: 75,
      })
      .where(eq(files.id, fileId));

    return { success: true };
  } catch (error) {
    console.error(`[BackgroundEnrichment] Error enriching file ${fileId}:`, error);
    
    const dbForError = await getDb();
    if (dbForError) {
      await dbForError
        .update(files)
        .set({ enrichmentStatus: "failed" })
        .where(eq(files.id, fileId));
    }

    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Process pending files for all users (background job)
 */
export async function processBackgroundEnrichment(): Promise<{ processed: number; failed: number; errors: string[] }> {
  const result = { processed: 0, failed: 0, errors: [] as string[] };
  
  try {
    const db = await getDb();
    if (!db) {
      result.errors.push("Database not available");
      return result;
    }

    // Get pending files grouped by user (limit to BATCH_SIZE total)
    const pendingFiles = await db
      .select({
        id: files.id,
        userId: files.userId,
      })
      .from(files)
      .where(eq(files.enrichmentStatus, "pending"))
      .limit(BATCH_SIZE);

    if (pendingFiles.length === 0) {
      console.log("[BackgroundEnrichment] No pending files to process");
      return result;
    }

    console.log(`[BackgroundEnrichment] Processing ${pendingFiles.length} pending files`);

    // Process each file
    for (const file of pendingFiles) {
      const enrichResult = await enrichSingleFile(file.id, file.userId);
      
      if (enrichResult.success) {
        result.processed++;
      } else {
        result.failed++;
        if (enrichResult.error) {
          result.errors.push(`File ${file.id}: ${enrichResult.error}`);
        }
      }
    }

    console.log(`[BackgroundEnrichment] Completed: ${result.processed} processed, ${result.failed} failed`);
    return result;
  } catch (error) {
    console.error("[BackgroundEnrichment] Error:", error);
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
    return result;
  }
}

/**
 * Retry failed enrichments for a specific user
 */
export async function retryFailedEnrichments(userId: number): Promise<{ retried: number; fileIds: number[] }> {
  const result = { retried: 0, fileIds: [] as number[] };
  
  try {
    const db = await getDb();
    if (!db) return result;

    // Get failed files for this user
    const failedFiles = await db
      .select({ id: files.id })
      .from(files)
      .where(and(
        eq(files.userId, userId),
        eq(files.enrichmentStatus, "failed")
      ));

    if (failedFiles.length === 0) {
      return result;
    }

    // Reset status to pending for retry
    const fileIds = failedFiles.map(f => f.id);
    await db
      .update(files)
      .set({ enrichmentStatus: "pending" })
      .where(inArray(files.id, fileIds));

    result.retried = fileIds.length;
    result.fileIds = fileIds;

    console.log(`[BackgroundEnrichment] Reset ${fileIds.length} failed files to pending for user ${userId}`);
    return result;
  } catch (error) {
    console.error("[BackgroundEnrichment] Error retrying failed enrichments:", error);
    return result;
  }
}

/**
 * Get enrichment statistics for a user
 */
export async function getEnrichmentStats(userId: number): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  try {
    const db = await getDb();
    if (!db) return { pending: 0, processing: 0, completed: 0, failed: 0 };

    const stats = await db
      .select({
        status: files.enrichmentStatus,
        count: sql<number>`count(*)`,
      })
      .from(files)
      .where(eq(files.userId, userId))
      .groupBy(files.enrichmentStatus);

    const result = { pending: 0, processing: 0, completed: 0, failed: 0 };
    for (const stat of stats) {
      if (stat.status === "pending") result.pending = Number(stat.count);
      else if (stat.status === "processing") result.processing = Number(stat.count);
      else if (stat.status === "completed") result.completed = Number(stat.count);
      else if (stat.status === "failed") result.failed = Number(stat.count);
    }

    return result;
  } catch (error) {
    console.error("[BackgroundEnrichment] Error getting stats:", error);
    return { pending: 0, processing: 0, completed: 0, failed: 0 };
  }
}
