import { getDb } from "../db";
import { files, enrichmentJobs } from "../../drizzle/schema";
import { eq, and, inArray, sql, isNull, or } from "drizzle-orm";
import { invokeLLM } from "./llm";

const BATCH_SIZE = 5; // Process 5 files at a time
const MAX_RETRIES = 3;

/**
 * Enrich a single file with AI-generated metadata
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

    // Call LLM for enrichment
    const prompt = `Analyze this file and provide a detailed description:
    - Filename: ${file.filename}
    - Type: ${file.mimeType}
    - Current title: ${file.title || "None"}
    - Current description: ${file.description || "None"}
    
    Provide:
    1. A concise title (max 100 chars)
    2. A detailed description (2-3 sentences)
    3. Up to 10 relevant keywords/tags
    
    Format your response as JSON:
    {
      "title": "...",
      "description": "...",
      "keywords": ["...", "..."]
    }`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a helpful assistant that analyzes files and provides metadata." },
        { role: "user", content: prompt },
      ],
    });

    const messageContent = response.choices[0]?.message?.content;
    const content = typeof messageContent === 'string' ? messageContent : '';
    
    // Parse the response
    let enrichmentData: { title?: string; description?: string; keywords?: string[] } = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        enrichmentData = JSON.parse(jsonMatch[0]);
      }
    } catch {
      enrichmentData = { description: content };
    }

    // Update the file with enrichment data
    await db
      .update(files)
      .set({
        enrichmentStatus: "completed",
        enrichedAt: new Date(),
        aiAnalysis: enrichmentData.description || content,
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
