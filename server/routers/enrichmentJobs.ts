import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { enrichmentJobs, files } from "../../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

// Helper to enrich a single file
async function enrichSingleFile(fileId: number, userId: number): Promise<{ success: boolean; error?: string }> {
  try {
    // Get the file
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
      // If parsing fails, use the raw content as description
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
        qualityScore: 75, // Base quality score after enrichment
      })
      .where(eq(files.id, fileId));

    return { success: true };
  } catch (error) {
    console.error(`Error enriching file ${fileId}:`, error);
    
    // Update status to failed
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

// Background job processor
async function processEnrichmentJob(jobId: number) {
  try {
    // Get the job
    const db = await getDb();
    if (!db) return;
    
    const [job] = await db
      .select()
      .from(enrichmentJobs)
      .where(eq(enrichmentJobs.id, jobId));

    if (!job || job.status === "cancelled" || job.status === "completed") {
      return;
    }

    // Update status to processing
    await db
      .update(enrichmentJobs)
      .set({ status: "processing", startedAt: new Date() })
      .where(eq(enrichmentJobs.id, jobId));

    const fileIds = job.fileIds as number[];
    const processedFileIds = (job.processedFileIds as number[]) || [];
    const failedFileIds = (job.failedFileIds as number[]) || [];

    // Process each file
    for (const fileId of fileIds) {
      // Check if already processed
      if (processedFileIds.includes(fileId) || failedFileIds.includes(fileId)) {
        continue;
      }

      // Check if job was cancelled
      const [currentJob] = await db
        .select()
        .from(enrichmentJobs)
        .where(eq(enrichmentJobs.id, jobId));

      if (currentJob?.status === "cancelled") {
        return;
      }

      // Update current file
      await db
        .update(enrichmentJobs)
        .set({ currentFileId: fileId })
        .where(eq(enrichmentJobs.id, jobId));

      // Process the file
      const result = await enrichSingleFile(fileId, job.userId);

      if (result.success) {
        processedFileIds.push(fileId);
        await db
          .update(enrichmentJobs)
          .set({
            completedFiles: processedFileIds.length,
            processedFileIds: processedFileIds,
          })
          .where(eq(enrichmentJobs.id, jobId));
      } else {
        failedFileIds.push(fileId);
        await db
          .update(enrichmentJobs)
          .set({
            failedFiles: failedFileIds.length,
            failedFileIds: failedFileIds,
            lastError: result.error,
          })
          .where(eq(enrichmentJobs.id, jobId));
      }
    }

    // Mark job as completed
    await db
      .update(enrichmentJobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        currentFileId: null,
      })
      .where(eq(enrichmentJobs.id, jobId));
  } catch (error) {
    console.error(`Error processing enrichment job ${jobId}:`, error);
    
    const dbForError = await getDb();
    if (dbForError) {
      await dbForError
        .update(enrichmentJobs)
        .set({
          status: "failed",
          lastError: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(enrichmentJobs.id, jobId));
    }
  }
}

export const enrichmentJobsRouter = router({
  // Create a new enrichment job
  create: protectedProcedure
    .input(
      z.object({
        fileIds: z.array(z.number()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check for existing active job
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const [existingJob] = await db
        .select()
        .from(enrichmentJobs)
        .where(
          and(
            eq(enrichmentJobs.userId, ctx.user.id),
            inArray(enrichmentJobs.status, ["pending", "processing"])
          )
        );

      if (existingJob) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An enrichment job is already in progress",
        });
      }

      // Create the job
      const [result] = await db.insert(enrichmentJobs).values({
        userId: ctx.user.id,
        status: "pending",
        totalFiles: input.fileIds.length,
        completedFiles: 0,
        failedFiles: 0,
        fileIds: input.fileIds,
        processedFileIds: [],
        failedFileIds: [],
      });

      const jobId = result.insertId;

      // Start processing in the background (non-blocking)
      setImmediate(() => processEnrichmentJob(jobId));

      return { jobId, totalFiles: input.fileIds.length };
    }),

  // Get current job status
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    
    const [job] = await db
      .select()
      .from(enrichmentJobs)
      .where(eq(enrichmentJobs.userId, ctx.user.id))
      .orderBy(desc(enrichmentJobs.createdAt))
      .limit(1);

    if (!job) {
      return null;
    }

    // Get current file name if processing
    let currentFileName: string | null = null;
    if (job.currentFileId) {
      const [file] = await db
        .select({ filename: files.filename, title: files.title })
        .from(files)
        .where(eq(files.id, job.currentFileId));
      currentFileName = file?.title || file?.filename || null;
    }

    return {
      id: job.id,
      status: job.status,
      totalFiles: job.totalFiles,
      completedFiles: job.completedFiles,
      failedFiles: job.failedFiles,
      currentFileId: job.currentFileId,
      currentFileName,
      progress: job.totalFiles > 0 
        ? Math.round(((job.completedFiles + job.failedFiles) / job.totalFiles) * 100)
        : 0,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      lastError: job.lastError,
    };
  }),

  // Cancel a job
  cancel: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const [job] = await db
        .select()
        .from(enrichmentJobs)
        .where(
          and(
            eq(enrichmentJobs.id, input.jobId),
            eq(enrichmentJobs.userId, ctx.user.id)
          )
        );

      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Job not found",
        });
      }

      if (job.status !== "pending" && job.status !== "processing") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Job cannot be cancelled",
        });
      }

      await db
        .update(enrichmentJobs)
        .set({ status: "cancelled" })
        .where(eq(enrichmentJobs.id, input.jobId));

      return { success: true };
    }),

  // Get job history
  getHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      
      const jobs = await db
        .select()
        .from(enrichmentJobs)
        .where(eq(enrichmentJobs.userId, ctx.user.id))
        .orderBy(desc(enrichmentJobs.createdAt))
        .limit(input.limit);

      return jobs.map((job: typeof enrichmentJobs.$inferSelect) => ({
        id: job.id,
        status: job.status,
        totalFiles: job.totalFiles,
        completedFiles: job.completedFiles,
        failedFiles: job.failedFiles,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
      }));
    }),

  // Dismiss completed/failed job (clear from status)
  dismiss: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // We don't delete, just mark as acknowledged by setting a flag or updating status
      // For now, we'll just return success - the frontend will stop polling
      return { success: true };
    }),
});
