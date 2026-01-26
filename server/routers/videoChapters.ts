import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const videoChaptersRouter = router({
  // Get all chapters for a video
  getChapters: protectedProcedure
    .input(z.object({ fileId: z.number() }))
    .query(async ({ input }) => {
      return await db.getVideoChapters(input.fileId);
    }),

  // Create a new chapter
  createChapter: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        name: z.string(),
        description: z.string().optional(),
        timestamp: z.number(), // seconds
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get existing chapters to determine sort order
      const existingChapters = await db.getVideoChapters(input.fileId);
      const maxSortOrder = existingChapters.reduce((max, ch) => Math.max(max, ch.sortOrder), 0);

      const chapterId = await db.createVideoChapter({
        fileId: input.fileId,
        userId: ctx.user.id,
        name: input.name,
        description: input.description || null,
        timestamp: input.timestamp,
        sortOrder: maxSortOrder + 1,
      });

      return { id: chapterId };
    }),

  // Update a chapter
  updateChapter: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        timestamp: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      await db.updateVideoChapter(id, updates);
      return { success: true };
    }),

  // Delete a chapter
  deleteChapter: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteVideoChapter(input.id);
      return { success: true };
    }),

  // Reorder chapters
  reorderChapters: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        chapterIds: z.array(z.number()), // New order
      })
    )
    .mutation(async ({ input }) => {
      // Update sort order for each chapter
      for (let i = 0; i < input.chapterIds.length; i++) {
        await db.updateVideoChapter(input.chapterIds[i], { sortOrder: i + 1 });
      }
      return { success: true };
    }),
});
