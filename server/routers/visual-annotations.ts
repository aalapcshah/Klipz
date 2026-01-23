import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { visualAnnotations } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";

export const visualAnnotationsRouter = router({
  /**
   * Save a new visual annotation (drawing) for a video
   */
  saveAnnotation: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        imageDataUrl: z.string(), // Base64 data URL of the canvas drawing
        videoTimestamp: z.number(), // Timestamp in seconds
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { fileId, imageDataUrl, videoTimestamp, description } = input;

      // Convert data URL to buffer
      const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      // Upload to S3
      const imageKey = `visual-annotations/${ctx.user.id}/${fileId}/${Date.now()}.png`;
      const { url: imageUrl } = await storagePut(imageKey, buffer, "image/png");

      // Save to database
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [annotation] = await db.insert(visualAnnotations).values({
        fileId,
        userId: ctx.user.id,
        imageUrl,
        imageKey,
        videoTimestamp,
        description,
      });

      return {
        success: true,
        annotationId: annotation.insertId,
      };
    }),

  /**
   * Get all visual annotations for a file
   */
  getAnnotations: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const annotations = await db
        .select()
        .from(visualAnnotations)
        .where(
          and(
            eq(visualAnnotations.fileId, input.fileId),
            eq(visualAnnotations.userId, ctx.user.id)
          )
        )
        .orderBy(visualAnnotations.videoTimestamp);

      return annotations;
    }),

  /**
   * Get all visual annotations for a file (alias for getAnnotations)
   */
  getByFileId: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const annotations = await db
        .select()
        .from(visualAnnotations)
        .where(
          and(
            eq(visualAnnotations.fileId, input.fileId),
            eq(visualAnnotations.userId, ctx.user.id)
          )
        );

      return annotations;
    }),

  /**
   * Delete a visual annotation
   */
  deleteAnnotation: protectedProcedure
    .input(
      z.object({
        annotationId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      // Verify ownership
      const [annotation] = await db
        .select()
        .from(visualAnnotations)
        .where(eq(visualAnnotations.id, input.annotationId))
        .limit(1);

      if (!annotation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Annotation not found",
        });
      }

      if (annotation.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to delete this annotation",
        });
      }

      // Delete from database
      await db
        .delete(visualAnnotations)
        .where(eq(visualAnnotations.id, input.annotationId));

      return { success: true };
    }),
});
