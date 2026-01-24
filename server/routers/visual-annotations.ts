import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { visualAnnotations, annotationHistory } from "../../drizzle/schema";
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
        duration: z.number().default(5), // Duration in seconds
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { fileId, imageDataUrl, videoTimestamp, duration, description } = input;

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
        duration,
        description,
      });

      // Track creation in history
      const annotationData = {
        id: annotation.insertId,
        fileId,
        userId: ctx.user.id,
        imageUrl,
        imageKey,
        videoTimestamp,
        duration,
        description,
      };
      await db.insert(annotationHistory).values({
        annotationId: annotation.insertId,
        annotationType: "visual",
        userId: ctx.user.id,
        changeType: "created",
        previousState: null,
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

      // Track deletion in history before deleting
      await db.insert(annotationHistory).values({
        annotationId: input.annotationId,
        annotationType: "visual",
        userId: ctx.user.id,
        changeType: "deleted",
        previousState: annotation,
      });

      // Delete from database
      await db
        .delete(visualAnnotations)
        .where(eq(visualAnnotations.id, input.annotationId));

      return { success: true };
    }),

  /**
   * Get annotation history for a file
   */
  getHistory: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get all visual annotations for this file
      const annotations = await db
        .select()
        .from(visualAnnotations)
        .where(
          and(
            eq(visualAnnotations.fileId, input.fileId),
            eq(visualAnnotations.userId, ctx.user.id)
          )
        );
      
      const annotationIds = annotations.map(a => a.id);
      
      // Get history for these annotations
      const history = await db
        .select()
        .from(annotationHistory)
        .where(
          and(
            eq(annotationHistory.userId, ctx.user.id),
            eq(annotationHistory.annotationType, "visual")
          )
        )
        .orderBy(annotationHistory.createdAt);
      
      // Filter to only include history for annotations in this file
      return history.filter(h => annotationIds.includes(h.annotationId));
    }),
});
