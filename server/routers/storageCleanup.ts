import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { files } from "../../drizzle/schema";
import { eq, and, lt, sql } from "drizzle-orm";

export const storageCleanupRouter = router({
  /**
   * Scan for files that can be cleaned up
   */
  scanFiles: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const userId = ctx.user.id;
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Get all user files
    const userFiles = await db
      .select()
      .from(files)
      .where(eq(files.userId, userId));

    // Find duplicates by perceptual hash
    const duplicates: any[] = [];
    const hashMap = new Map<string, any[]>();
    
    userFiles.forEach((file) => {
      if (file.perceptualHash) {
        if (!hashMap.has(file.perceptualHash)) {
          hashMap.set(file.perceptualHash, []);
        }
        hashMap.get(file.perceptualHash)!.push(file);
      }
    });

    // Extract duplicates (keep first, mark rest as duplicates)
    hashMap.forEach((fileGroup) => {
      if (fileGroup.length > 1) {
        // Skip the first file (original), add rest as duplicates
        fileGroup.slice(1).forEach((file) => {
          duplicates.push({
            id: file.id,
            filename: file.filename,
            fileSize: file.fileSize,
            url: file.url,
            mimeType: file.mimeType,
            reason: "Duplicate",
            createdAt: file.createdAt,
          });
        });
      }
    });

    // Find low-quality files (quality score < 50)
    const lowQuality = userFiles
      .filter((file) => file.qualityScore !== null && file.qualityScore < 50)
      .map((file) => ({
        id: file.id,
        filename: file.filename,
        fileSize: file.fileSize,
        url: file.url,
        mimeType: file.mimeType,
        reason: "Low Quality",
        qualityScore: file.qualityScore,
        createdAt: file.createdAt,
      }));

    // Find unused files (not accessed in 90+ days)
    const unused = userFiles
      .filter((file) => new Date(file.lastAccessedAt) < ninetyDaysAgo)
      .map((file) => ({
        id: file.id,
        filename: file.filename,
        fileSize: file.fileSize,
        url: file.url,
        mimeType: file.mimeType,
        reason: "Not accessed in 90+ days",
        lastAccessedAt: file.lastAccessedAt,
        createdAt: file.createdAt,
      }));

    // Calculate total storage that can be freed
    const totalFiles = duplicates.length + lowQuality.length + unused.length;
    const totalSize = [...duplicates, ...lowQuality, ...unused].reduce(
      (sum, file) => sum + file.fileSize,
      0
    );

    return {
      duplicates,
      lowQuality,
      unused,
      summary: {
        totalFiles,
        totalSize,
        duplicateCount: duplicates.length,
        lowQualityCount: lowQuality.length,
        unusedCount: unused.length,
      },
    };
  }),

  /**
   * Delete selected files in bulk
   */
  deleteFiles: protectedProcedure
    .input(
      z.object({
        fileIds: z.array(z.number()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify all files belong to user
      const filesToDelete = await db
        .select()
        .from(files)
        .where(
          and(
            eq(files.userId, ctx.user.id),
            sql`${files.id} IN (${sql.join(input.fileIds.map((id) => sql`${id}`), sql`, `)})`
          )
        );

      if (filesToDelete.length !== input.fileIds.length) {
        throw new Error("Some files not found or access denied");
      }

      // Calculate total size freed
      const totalSizeFreed = filesToDelete.reduce((sum, file) => sum + file.fileSize, 0);

      // Delete files
      await db
        .delete(files)
        .where(
          and(
            eq(files.userId, ctx.user.id),
            sql`${files.id} IN (${sql.join(input.fileIds.map((id) => sql`${id}`), sql`, `)})`
          )
        );

      return {
        success: true,
        deletedCount: filesToDelete.length,
        sizeFreed: totalSizeFreed,
      };
    }),

  /**
   * Update file access timestamp
   */
  trackFileAccess: protectedProcedure
    .input(z.object({ fileId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(files)
        .set({ lastAccessedAt: new Date() })
        .where(and(eq(files.id, input.fileId), eq(files.userId, ctx.user.id)));

      return { success: true };
    }),
});
