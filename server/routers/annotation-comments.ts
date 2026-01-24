import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { annotationComments } from "../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const annotationCommentsRouter = router({
  /**
   * Create a new comment on an annotation
   */
  createComment: protectedProcedure
    .input(
      z.object({
        annotationId: z.number(),
        annotationType: z.enum(["voice", "visual"]),
        content: z.string().min(1),
        parentCommentId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [comment] = await db.insert(annotationComments).values({
        annotationId: input.annotationId,
        annotationType: input.annotationType,
        userId: ctx.user.id,
        content: input.content,
        parentCommentId: input.parentCommentId,
      });

      return {
        success: true,
        commentId: comment.insertId,
      };
    }),

  /**
   * Get all comments for an annotation (with threading)
   */
  getComments: protectedProcedure
    .input(
      z.object({
        annotationId: z.number(),
        annotationType: z.enum(["voice", "visual"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get all comments for this annotation
      const comments = await db
        .select()
        .from(annotationComments)
        .where(
          and(
            eq(annotationComments.annotationId, input.annotationId),
            eq(annotationComments.annotationType, input.annotationType)
          )
        )
        .orderBy(annotationComments.createdAt);

      // Build threaded structure
      const commentMap = new Map();
      const rootComments: any[] = [];

      // First pass: create map of all comments
      comments.forEach((comment) => {
        commentMap.set(comment.id, { ...comment, replies: [] });
      });

      // Second pass: build tree structure
      comments.forEach((comment) => {
        const commentWithReplies = commentMap.get(comment.id);
        if (comment.parentCommentId) {
          const parent = commentMap.get(comment.parentCommentId);
          if (parent) {
            parent.replies.push(commentWithReplies);
          }
        } else {
          rootComments.push(commentWithReplies);
        }
      });

      return rootComments;
    }),

  /**
   * Update a comment
   */
  updateComment: protectedProcedure
    .input(
      z.object({
        commentId: z.number(),
        content: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify ownership
      const [comment] = await db
        .select()
        .from(annotationComments)
        .where(eq(annotationComments.id, input.commentId))
        .limit(1);

      if (!comment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found",
        });
      }

      if (comment.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to edit this comment",
        });
      }

      await db
        .update(annotationComments)
        .set({ content: input.content })
        .where(eq(annotationComments.id, input.commentId));

      return { success: true };
    }),

  /**
   * Delete a comment
   */
  deleteComment: protectedProcedure
    .input(
      z.object({
        commentId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify ownership
      const [comment] = await db
        .select()
        .from(annotationComments)
        .where(eq(annotationComments.id, input.commentId))
        .limit(1);

      if (!comment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found",
        });
      }

      if (comment.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to delete this comment",
        });
      }

      // Delete the comment and all its replies (cascade)
      await db.delete(annotationComments).where(eq(annotationComments.id, input.commentId));

      // Also delete all replies
      await db
        .delete(annotationComments)
        .where(eq(annotationComments.parentCommentId, input.commentId));

      return { success: true };
    }),

  /**
   * Get comment count for an annotation
   */
  getCommentCount: protectedProcedure
    .input(
      z.object({
        annotationId: z.number(),
        annotationType: z.enum(["voice", "visual"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const comments = await db
        .select()
        .from(annotationComments)
        .where(
          and(
            eq(annotationComments.annotationId, input.annotationId),
            eq(annotationComments.annotationType, input.annotationType)
          )
        );

      return { count: comments.length };
    }),
});
