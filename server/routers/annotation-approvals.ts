import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { annotationApprovals } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { broadcastApprovalEvent } from "../_core/websocketBroadcast";
import { sendNotification } from "../_core/notifications";

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

      const approvalId = approval.insertId;
      
      // Broadcast approval request
      broadcastApprovalEvent(
        "approval_requested",
        input.annotationId,
        input.annotationType,
        { id: approvalId, ...input, userId: ctx.user.id, status: "pending" },
        ctx.user.id,
        ctx.user.name || "Unknown User"
      );

      return {
        success: true,
        approvalId,
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
      
      // Broadcast approval
      broadcastApprovalEvent(
        "approval_approved",
        approval.annotationId,
        approval.annotationType as "voice" | "visual",
        { id: input.approvalId, status: "approved", comment: input.comment },
        ctx.user.id,
        ctx.user.name || "Unknown User"
      );
      
      // Send notification to annotation owner
      await sendNotification({
        userId: approval.userId,
        type: "approval_approved",
        title: "Annotation Approved",
        content: `Your ${approval.annotationType} annotation has been approved${input.comment ? `: ${input.comment}` : "."}`,
        annotationId: approval.annotationId,
        annotationType: approval.annotationType as "voice" | "visual",
        relatedUserId: ctx.user.id,
        relatedUserName: ctx.user.name || "Unknown User",
      });

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
      
      // Broadcast rejection
      broadcastApprovalEvent(
        "approval_rejected",
        approval.annotationId,
        approval.annotationType as "voice" | "visual",
        { id: input.approvalId, status: "rejected", comment: input.comment },
        ctx.user.id,
        ctx.user.name || "Unknown User"
      );
      
      // Send notification to annotation owner
      await sendNotification({
        userId: approval.userId,
        type: "approval_rejected",
        title: "Annotation Rejected",
        content: `Your ${approval.annotationType} annotation was rejected: ${input.comment}`,
        annotationId: approval.annotationId,
        annotationType: approval.annotationType as "voice" | "visual",
        relatedUserId: ctx.user.id,
        relatedUserName: ctx.user.name || "Unknown User",
      });

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
      
      // Broadcast cancellation
      broadcastApprovalEvent(
        "approval_cancelled",
        approval.annotationId,
        approval.annotationType as "voice" | "visual",
        { id: input.approvalId },
        ctx.user.id,
        ctx.user.name || "Unknown User"
      );

      return { success: true };
    }),
});
