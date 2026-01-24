import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { annotationHistory, voiceAnnotations, visualAnnotations } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";

export const annotationHistoryRouter = router({
  /**
   * Get history for a specific annotation
   */
  getHistory: protectedProcedure
    .input(
      z.object({
        annotationId: z.number(),
        annotationType: z.enum(["voice", "visual"]),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const history = await db
        .select()
        .from(annotationHistory)
        .where(
          and(
            eq(annotationHistory.annotationId, input.annotationId),
            eq(annotationHistory.annotationType, input.annotationType)
          )
        )
        .orderBy(desc(annotationHistory.createdAt));

      return history;
    }),

  /**
   * Revert annotation to a previous version
   */
  revertToVersion: protectedProcedure
    .input(
      z.object({
        historyId: z.number(),
        annotationId: z.number(),
        annotationType: z.enum(["voice", "visual"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      // Get the history record
      const historyRecord = await db
        .select()
        .from(annotationHistory)
        .where(eq(annotationHistory.id, input.historyId))
        .limit(1);

      if (historyRecord.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "History record not found",
        });
      }

      const record = historyRecord[0];

      // Verify the history record matches the annotation
      if (
        record.annotationId !== input.annotationId ||
        record.annotationType !== input.annotationType
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "History record does not match annotation",
        });
      }

      if (!record.previousState) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No previous state available to revert to",
        });
      }

      // Get current annotation to save in history
      let currentAnnotation;
      if (input.annotationType === "voice") {
        const annotations = await db
          .select()
          .from(voiceAnnotations)
          .where(eq(voiceAnnotations.id, input.annotationId))
          .limit(1);
        
        if (annotations.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Annotation not found",
          });
        }
        currentAnnotation = annotations[0];
      } else {
        const annotations = await db
          .select()
          .from(visualAnnotations)
          .where(eq(visualAnnotations.id, input.annotationId))
          .limit(1);
        
        if (annotations.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Annotation not found",
          });
        }
        currentAnnotation = annotations[0];
      }

      // Save current state to history before reverting
      await db.insert(annotationHistory).values({
        annotationId: input.annotationId,
        annotationType: input.annotationType,
        userId: ctx.user.id,
        changeType: "edited",
        previousState: currentAnnotation as any,
      });

      // Revert to previous state
      const previousState = record.previousState as any;
      
      if (input.annotationType === "voice") {
        await db
          .update(voiceAnnotations)
          .set({
            transcript: previousState.transcript,
            videoTimestamp: previousState.videoTimestamp,
            duration: previousState.duration,
            audioUrl: previousState.audioUrl,
          })
          .where(eq(voiceAnnotations.id, input.annotationId));
      } else {
        await db
          .update(visualAnnotations)
          .set({
            videoTimestamp: previousState.videoTimestamp,
            imageUrl: previousState.imageUrl,
            description: previousState.description,
            duration: previousState.duration,
          })
          .where(eq(visualAnnotations.id, input.annotationId));
      }

      return { success: true };
    }),

  /**
   * Get history count for an annotation
   */
  getHistoryCount: protectedProcedure
    .input(
      z.object({
        annotationId: z.number(),
        annotationType: z.enum(["voice", "visual"]),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const history = await db
        .select()
        .from(annotationHistory)
        .where(
          and(
            eq(annotationHistory.annotationId, input.annotationId),
            eq(annotationHistory.annotationType, input.annotationType)
          )
        );

      return { count: history.length };
    }),
});
