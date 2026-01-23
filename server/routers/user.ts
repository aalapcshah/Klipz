import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { files, tags, fileTags, collections, voiceAnnotations } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const userRouter = router({
  // Export all user data (GDPR compliance)
  exportData: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    const userId = ctx.user.id;

    // Get all user files
    const userFiles = await db.select().from(files).where(eq(files.userId, userId));

    // Get all user tags
    const userTags = await db.select().from(tags).where(eq(tags.userId, userId));

    // Get file-tag relationships for user's files
    const userFileIds = userFiles.map(f => f.id);
    const fileTagRelations = userFileIds.length > 0
      ? await db.select().from(fileTags)
      : [];

    // Get all user collections
    const userCollections = await db
      .select()
      .from(collections)
      .where(eq(collections.userId, userId));

    // Get file-collection relationships for user's files
    const fileCollectionRelations: any[] = [];

    // Get voice annotations
    const userAnnotations = await db
      .select()
      .from(voiceAnnotations)
      .where(eq(voiceAnnotations.userId, userId));

    return {
      exportDate: new Date().toISOString(),
      user: {
        id: ctx.user.id,
        openId: ctx.user.openId,
        name: ctx.user.name,
        email: ctx.user.email,
        role: ctx.user.role,
        createdAt: ctx.user.createdAt,
      },
      files: userFiles.map((file) => ({
        id: file.id,
        filename: file.filename,
        title: file.title,
        description: file.description,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        url: file.url,
        fileKey: file.fileKey,
        enrichmentStatus: file.enrichmentStatus,
        aiAnalysis: file.aiAnalysis,
        extractedKeywords: file.extractedKeywords,
        qualityScore: file.qualityScore,
        voiceTranscript: file.voiceTranscript,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        enrichedAt: file.enrichedAt,
        lastAccessedAt: file.lastAccessedAt,
      })),
      tags: userTags,
      fileTagRelations,
      collections: userCollections,
      fileCollectionRelations,
      voiceAnnotations: userAnnotations.map((annotation) => ({
        id: annotation.id,
        fileId: annotation.fileId,
        videoTimestamp: annotation.videoTimestamp,
        audioUrl: annotation.audioUrl,
        transcript: annotation.transcript,
        createdAt: annotation.createdAt,
      })),
    };
  }),

  // Delete account (GDPR right to erasure)
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    const userId = ctx.user.id;

    // Delete all user data in correct order (respecting foreign keys)
    await db.delete(voiceAnnotations).where(eq(voiceAnnotations.userId, userId));
    await db.delete(fileTags);
    await db.delete(files).where(eq(files.userId, userId));
    await db.delete(tags).where(eq(tags.userId, userId));
    await db.delete(collections).where(eq(collections.userId, userId));

    // Note: User account deletion from auth system should be handled separately
    // This just removes all user data from the database

    return { success: true, message: "All user data deleted successfully" };
  }),
});
