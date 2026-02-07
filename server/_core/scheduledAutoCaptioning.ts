import { getDb } from "../db";
import { visualCaptions, files } from "../../drizzle/schema";
import { eq, and, sql, notInArray, isNull } from "drizzle-orm";
import { invokeLLM } from "./llm";
import { notifyOwner } from "./notification";
import * as db from "../db";

const BATCH_SIZE = 3; // Process 3 videos at a time to avoid overloading LLM API

/**
 * Find all video files that don't have visual captions yet.
 * Videos are stored in the files table with mimeType starting with 'video/'.
 * We cross-reference with visual_captions table to find uncaptioned ones.
 */
async function getUncaptionedVideoFiles(): Promise<
  Array<{ id: number; userId: number; url: string; filename: string }>
> {
  const drizzle = await getDb();
  if (!drizzle) return [];

  // Get all video files that don't have a visual_captions record
  // or have a failed caption record (retry those)
  const captionedFileIds = drizzle
    .select({ fileId: visualCaptions.fileId })
    .from(visualCaptions)
    .where(
      eq(visualCaptions.status, "completed")
    );

  const processingFileIds = drizzle
    .select({ fileId: visualCaptions.fileId })
    .from(visualCaptions)
    .where(
      eq(visualCaptions.status, "processing")
    );

  const uncaptioned = await drizzle
    .select({
      id: files.id,
      userId: files.userId,
      url: files.url,
      filename: files.filename,
    })
    .from(files)
    .where(
      and(
        sql`${files.mimeType} LIKE 'video/%'`,
        sql`${files.id} NOT IN (${captionedFileIds})`,
        sql`${files.id} NOT IN (${processingFileIds})`
      )
    )
    .limit(BATCH_SIZE);

  return uncaptioned;
}

/**
 * Caption a single video file using the LLM vision API.
 * This is the same logic as the autoCaptionVideo endpoint but runs without user context.
 */
async function captionSingleVideo(
  fileId: number,
  userId: number,
  url: string
): Promise<{ success: boolean; captionCount: number; error?: string }> {
  try {
    // Check if captions already exist
    const existing = await db.getVisualCaptionByFileId(fileId);
    if (existing && existing.status === "completed") {
      return { success: true, captionCount: 0 }; // Already done
    }

    // Create or update caption record
    let captionId: number;
    if (existing) {
      await db.updateVisualCaption(existing.id, {
        status: "processing",
        errorMessage: null,
      });
      captionId = existing.id;
    } else {
      captionId = await db.createVisualCaption({
        fileId,
        userId,
        intervalSeconds: 5,
        status: "processing",
      });
    }

    // Send video to LLM vision API
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert video analyst. Analyze the visual content and generate detailed captions at regular time intervals (approximately every 5 seconds).

For each timepoint, provide:
1. A descriptive caption of what is visually happening
2. Key entities/topics extracted from the visual content
3. A confidence score (0.0-1.0)

Focus on: what is shown on screen (text, diagrams, images, UI elements), actions being performed, objects, any visible text, scene changes, and people.`,
        },
        {
          role: "user",
          content: [
            {
              type: "file_url" as const,
              file_url: {
                url,
                mime_type: "video/mp4" as const,
              },
            },
            {
              type: "text" as const,
              text: "Analyze this video and generate visual captions at approximately 5-second intervals. Return a JSON response with the captions array.",
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "visual_captions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              captions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    timestamp: { type: "number" },
                    caption: { type: "string" },
                    entities: { type: "array", items: { type: "string" } },
                    confidence: { type: "number" },
                  },
                  required: ["timestamp", "caption", "entities", "confidence"],
                  additionalProperties: false,
                },
              },
              videoDurationEstimate: { type: "number" },
              videoSummary: { type: "string" },
            },
            required: ["captions", "videoDurationEstimate", "videoSummary"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    const contentStr =
      typeof content === "string" ? content : JSON.stringify(content);
    if (!contentStr) throw new Error("No response from LLM");

    const result = JSON.parse(contentStr);
    const captions = result.captions || [];

    await db.updateVisualCaption(captionId, {
      captions,
      totalFramesAnalyzed: captions.length,
      status: "completed",
    });

    return { success: true, captionCount: captions.length };
  } catch (error: any) {
    console.error(
      `[ScheduledAutoCaptioning] Failed for file ${fileId}:`,
      error.message
    );

    // Try to mark as failed
    try {
      const existing = await db.getVisualCaptionByFileId(fileId);
      if (existing) {
        await db.updateVisualCaption(existing.id, {
          status: "failed",
          errorMessage: error.message,
        });
      }
    } catch {
      // Ignore cleanup errors
    }

    return { success: false, captionCount: 0, error: error.message };
  }
}

/**
 * Main scheduled auto-captioning job.
 * Finds uncaptioned videos across all users and processes them in batches.
 */
export async function processScheduledAutoCaptioning(): Promise<{
  processed: number;
  captioned: number;
  failed: number;
  totalCaptions: number;
  errors: string[];
}> {
  const result = {
    processed: 0,
    captioned: 0,
    failed: 0,
    totalCaptions: 0,
    errors: [] as string[],
  };

  try {
    const uncaptionedVideos = await getUncaptionedVideoFiles();

    if (uncaptionedVideos.length === 0) {
      return result;
    }

    console.log(
      `[ScheduledAutoCaptioning] Found ${uncaptionedVideos.length} uncaptioned videos to process`
    );

    for (const video of uncaptionedVideos) {
      result.processed++;

      const captionResult = await captionSingleVideo(
        video.id,
        video.userId,
        video.url
      );

      if (captionResult.success) {
        if (captionResult.captionCount > 0) {
          result.captioned++;
          result.totalCaptions += captionResult.captionCount;
          console.log(
            `[ScheduledAutoCaptioning] Captioned video ${video.id} (${video.filename}): ${captionResult.captionCount} captions`
          );
        }
      } else {
        result.failed++;
        if (captionResult.error) {
          result.errors.push(
            `Video ${video.id} (${video.filename}): ${captionResult.error}`
          );
        }
      }
    }

    console.log(
      `[ScheduledAutoCaptioning] Completed: ${result.captioned} captioned, ${result.failed} failed, ${result.totalCaptions} total captions`
    );

    // Send notification to owner with results summary
    if (result.processed > 0) {
      try {
        const lines: string[] = [];
        lines.push(`Processed ${result.processed} video(s):`);
        if (result.captioned > 0) lines.push(`  ✅ ${result.captioned} successfully captioned (${result.totalCaptions} total captions generated)`);
        if (result.failed > 0) lines.push(`  ❌ ${result.failed} failed`);
        if (result.errors.length > 0) {
          lines.push("");
          lines.push("Errors:");
          result.errors.slice(0, 5).forEach(err => lines.push(`  • ${err}`));
          if (result.errors.length > 5) lines.push(`  ... and ${result.errors.length - 5} more`);
        }

        await notifyOwner({
          title: `Auto-Captioning Complete: ${result.captioned}/${result.processed} videos captioned`,
          content: lines.join("\n"),
        });
      } catch (notifyError) {
        console.warn("[ScheduledAutoCaptioning] Failed to send notification:", notifyError);
      }
    }

    return result;
  } catch (error) {
    console.error("[ScheduledAutoCaptioning] Error:", error);
    result.errors.push(
      error instanceof Error ? error.message : "Unknown error"
    );
    return result;
  }
}

/**
 * Get auto-captioning status for admin/dashboard display
 */
export async function getAutoCaptioningStatus(): Promise<{
  uncaptionedCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
}> {
  try {
    const drizzle = await getDb();
    if (!drizzle)
      return {
        uncaptionedCount: 0,
        processingCount: 0,
        completedCount: 0,
        failedCount: 0,
      };

    // Count video files
    const videoFiles = await drizzle
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(sql`${files.mimeType} LIKE 'video/%'`);
    const totalVideos = Number(videoFiles[0]?.count || 0);

    // Count caption statuses
    const captionStats = await drizzle
      .select({
        status: visualCaptions.status,
        count: sql<number>`count(*)`,
      })
      .from(visualCaptions)
      .groupBy(visualCaptions.status);

    let completedCount = 0;
    let processingCount = 0;
    let failedCount = 0;
    for (const stat of captionStats) {
      if (stat.status === "completed") completedCount = Number(stat.count);
      else if (stat.status === "processing")
        processingCount = Number(stat.count);
      else if (stat.status === "failed") failedCount = Number(stat.count);
    }

    const uncaptionedCount =
      totalVideos - completedCount - processingCount - failedCount;

    return {
      uncaptionedCount: Math.max(0, uncaptionedCount),
      processingCount,
      completedCount,
      failedCount,
    };
  } catch (error) {
    console.error("[ScheduledAutoCaptioning] Error getting status:", error);
    return {
      uncaptionedCount: 0,
      processingCount: 0,
      completedCount: 0,
      failedCount: 0,
    };
  }
}
