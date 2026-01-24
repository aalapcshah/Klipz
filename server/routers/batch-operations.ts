import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { voiceAnnotations, visualAnnotations, annotationApprovals } from "../../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";

export const batchOperationsRouter = router({
  /**
   * Bulk approve annotations
   */
  bulkApprove: protectedProcedure
    .input(
      z.object({
        annotationIds: z.array(z.number()),
        annotationType: z.enum(["voice", "visual"]),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create approval records for all annotations
      const approvalValues = input.annotationIds.map((annotationId) => ({
        annotationId,
        annotationType: input.annotationType,
        userId: ctx.user.id,
        status: "approved" as const,
        comment: input.comment || null,
      }));

      await db.insert(annotationApprovals).values(approvalValues);

      return { success: true, count: input.annotationIds.length };
    }),

  /**
   * Bulk reject annotations
   */
  bulkReject: protectedProcedure
    .input(
      z.object({
        annotationIds: z.array(z.number()),
        annotationType: z.enum(["voice", "visual"]),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create rejection records for all annotations
      const approvalValues = input.annotationIds.map((annotationId) => ({
        annotationId,
        annotationType: input.annotationType,
        userId: ctx.user.id,
        status: "rejected" as const,
        comment: input.comment || null,
      }));

      await db.insert(annotationApprovals).values(approvalValues);

      return { success: true, count: input.annotationIds.length };
    }),

  /**
   * Bulk delete annotations
   */
  bulkDelete: protectedProcedure
    .input(
      z.object({
        annotationIds: z.array(z.number()),
        annotationType: z.enum(["voice", "visual"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (input.annotationType === "voice") {
        // Verify ownership before deleting
        const annotations = await db
          .select()
          .from(voiceAnnotations)
          .where(
            and(
              inArray(voiceAnnotations.id, input.annotationIds),
              eq(voiceAnnotations.userId, ctx.user.id)
            )
          );

        if (annotations.length !== input.annotationIds.length) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only delete your own annotations",
          });
        }

        await db
          .delete(voiceAnnotations)
          .where(inArray(voiceAnnotations.id, input.annotationIds));
      } else {
        // Verify ownership before deleting
        const annotations = await db
          .select()
          .from(visualAnnotations)
          .where(
            and(
              inArray(visualAnnotations.id, input.annotationIds),
              eq(visualAnnotations.userId, ctx.user.id)
            )
          );

        if (annotations.length !== input.annotationIds.length) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only delete your own annotations",
          });
        }

        await db
          .delete(visualAnnotations)
          .where(inArray(visualAnnotations.id, input.annotationIds));
      }

      return { success: true, count: input.annotationIds.length };
    }),

  /**
   * Export annotations to JSON
   */
  exportAnnotations: protectedProcedure
    .input(
      z.object({
        annotationIds: z.array(z.number()),
        annotationType: z.enum(["voice", "visual"]),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let annotations;
      if (input.annotationType === "voice") {
        annotations = await db
          .select()
          .from(voiceAnnotations)
          .where(
            and(
              inArray(voiceAnnotations.id, input.annotationIds),
              eq(voiceAnnotations.userId, ctx.user.id)
            )
          );
      } else {
        annotations = await db
          .select()
          .from(visualAnnotations)
          .where(
            and(
              inArray(visualAnnotations.id, input.annotationIds),
              eq(visualAnnotations.userId, ctx.user.id)
            )
          );
      }

      return {
        annotations,
        exportDate: new Date().toISOString(),
        annotationType: input.annotationType,
        count: annotations.length,
      };
    }),
});
