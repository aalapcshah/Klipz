import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { annotationApprovals } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const annotationApprovalsRouter = router({
  /**
   * Request approval for an annotation
   */
  requestApproval: protectedProcedure
    .input(
      z.object({
        annotationId: z.number(),
        annotationType: z.enum(["voice", "visual"]),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check if approval already exists
      const [existing] = await db
        .select()
        .from(annotationApprovals)
        .where(
          and(
            eq(annotationApprovals.annotationId, input.annotationId),
            eq(annotationApprovals.annotationType, input.annotationType)
          )
        )
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Approval request already exists for this annotation",
        });
      }

      const [approval] = await db.insert(annotationApprovals).values({
        annotationId: input.annotationId,
        annotationType: input.annotationType,
        userId: ctx.user.id,
        status: "pending",
        comment: input.comment,
      });

      return {
        success: true,
        approvalId: approval.insertId,
      };
    }),

  /**
   * Approve an annotation
   */
  approve: protectedProcedure
    .input(
      z.object({
        approvalId: z.number(),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [approval] = await db
        .select()
        .from(annotationApprovals)
        .where(eq(annotationApprovals.id, input.approvalId))
        .limit(1);

      if (!approval) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval request not found",
        });
      }

      await db
        .update(annotationApprovals)
        .set({
          status: "approved",
          comment: input.comment || approval.comment,
        })
        .where(eq(annotationApprovals.id, input.approvalId));

      return { success: true };
    }),

  /**
   * Reject an annotation
   */
  reject: protectedProcedure
    .input(
      z.object({
        approvalId: z.number(),
        comment: z.string().min(1, "Please provide a reason for rejection"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [approval] = await db
        .select()
        .from(annotationApprovals)
        .where(eq(annotationApprovals.id, input.approvalId))
        .limit(1);

      if (!approval) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval request not found",
        });
      }

      await db
        .update(annotationApprovals)
        .set({
          status: "rejected",
          comment: input.comment,
        })
        .where(eq(annotationApprovals.id, input.approvalId));

      return { success: true };
    }),

  /**
   * Get approval status for an annotation
   */
  getApprovalStatus: protectedProcedure
    .input(
      z.object({
        annotationId: z.number(),
        annotationType: z.enum(["voice", "visual"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [approval] = await db
        .select()
        .from(annotationApprovals)
        .where(
          and(
            eq(annotationApprovals.annotationId, input.annotationId),
            eq(annotationApprovals.annotationType, input.annotationType)
          )
        )
        .limit(1);

      return approval || null;
    }),

  /**
   * Get all pending approvals (for reviewers)
   */
  getPendingApprovals: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const approvals = await db
      .select()
      .from(annotationApprovals)
      .where(eq(annotationApprovals.status, "pending"))
      .orderBy(annotationApprovals.createdAt);

    return approvals;
  }),

  /**
   * Get all approvals for the current user's annotations
   */
  getMyApprovals: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const approvals = await db
      .select()
      .from(annotationApprovals)
      .where(eq(annotationApprovals.userId, ctx.user.id))
      .orderBy(annotationApprovals.createdAt);

    return approvals;
  }),

  /**
   * Cancel/delete an approval request
   */
  cancelApproval: protectedProcedure
    .input(
      z.object({
        approvalId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify ownership
      const [approval] = await db
        .select()
        .from(annotationApprovals)
        .where(eq(annotationApprovals.id, input.approvalId))
        .limit(1);

      if (!approval) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval request not found",
        });
      }

      if (approval.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to cancel this approval",
        });
      }

      await db.delete(annotationApprovals).where(eq(annotationApprovals.id, input.approvalId));

      return { success: true };
    }),
});
