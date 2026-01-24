import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "../routers";
import type { inferProcedureInput } from "@trpc/server";
import type { AppRouter } from "../routers";

describe("Annotation Approvals Router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let mockUser: { id: number; openId: string; name: string; email: string; role: "user" | "admin" };

  beforeEach(async () => {
    mockUser = {
      id: 1,
      openId: "test-user-approvals",
      name: "Test User",
      email: "test@example.com",
      role: "user",
    };

    caller = appRouter.createCaller({
      user: mockUser,
      req: {} as any,
      res: {} as any,
    });
  });

  it("should request approval for an annotation", async () => {
    const uniqueId = Math.floor(Math.random() * 1000000) + 10000;
    const input: inferProcedureInput<AppRouter["annotationApprovals"]["requestApproval"]> = {
      annotationId: uniqueId,
      annotationType: "visual",
      comment: "Please review this annotation",
    };

    const result = await caller.annotationApprovals.requestApproval(input);

    expect(result.success).toBe(true);
    expect(result.approvalId).toBeDefined();
  });

  it("should approve an annotation", async () => {
    const uniqueId = Math.floor(Math.random() * 1000000) + 10000;
    // Request approval first
    const requestResult = await caller.annotationApprovals.requestApproval({
      annotationId: uniqueId,
      annotationType: "voice",
    });

    // Approve it
    const approveResult = await caller.annotationApprovals.approve({
      approvalId: requestResult.approvalId,
      comment: "Looks good!",
    });

    expect(approveResult.success).toBe(true);

    // Verify status
    const status = await caller.annotationApprovals.getApprovalStatus({
      annotationId: uniqueId,
      annotationType: "voice",
    });

    expect(status?.status).toBe("approved");
  });

  it("should reject an annotation with reason", async () => {
    const uniqueId = Math.floor(Math.random() * 1000000) + 10000;
    // Request approval first
    const requestResult = await caller.annotationApprovals.requestApproval({
      annotationId: uniqueId,
      annotationType: "visual",
    });

    // Reject it
    const rejectResult = await caller.annotationApprovals.reject({
      approvalId: requestResult.approvalId,
      comment: "Needs improvement",
    });

    expect(rejectResult.success).toBe(true);

    // Verify status
    const status = await caller.annotationApprovals.getApprovalStatus({
      annotationId: uniqueId,
      annotationType: "visual",
    });

    expect(status?.status).toBe("rejected");
    expect(status?.comment).toBe("Needs improvement");
  });

  it("should get approval status for an annotation", async () => {
    const uniqueId = Math.floor(Math.random() * 1000000) + 10000;
    // Request approval
    await caller.annotationApprovals.requestApproval({
      annotationId: uniqueId,
      annotationType: "voice",
      comment: "Test approval",
    });

    // Get status
    const status = await caller.annotationApprovals.getApprovalStatus({
      annotationId: uniqueId,
      annotationType: "voice",
    });

    expect(status).toBeDefined();
    expect(status?.status).toBe("pending");
    expect(status?.comment).toBe("Test approval");
  });

  it("should get all pending approvals", async () => {
    const uniqueId1 = Math.floor(Math.random() * 1000000) + 10000;
    const uniqueId2 = Math.floor(Math.random() * 1000000) + 20000;
    // Create multiple approval requests
    await caller.annotationApprovals.requestApproval({
      annotationId: uniqueId1,
      annotationType: "visual",
    });

    await caller.annotationApprovals.requestApproval({
      annotationId: uniqueId2,
      annotationType: "voice",
    });

    // Get pending approvals
    const pending = await caller.annotationApprovals.getPendingApprovals();

    expect(pending.length).toBeGreaterThanOrEqual(2);
    expect(pending.every((a) => a.status === "pending")).toBe(true);
  });

  it("should get all approvals for current user", async () => {
    const uniqueId1 = Math.floor(Math.random() * 1000000) + 10000;
    const uniqueId2 = Math.floor(Math.random() * 1000000) + 20000;
    // Create approval requests
    await caller.annotationApprovals.requestApproval({
      annotationId: uniqueId1,
      annotationType: "visual",
    });

    await caller.annotationApprovals.requestApproval({
      annotationId: uniqueId2,
      annotationType: "voice",
    });

    // Get user's approvals
    const myApprovals = await caller.annotationApprovals.getMyApprovals();

    expect(myApprovals.length).toBeGreaterThanOrEqual(2);
    expect(myApprovals.every((a) => a.userId === mockUser.id)).toBe(true);
  });

  it("should cancel an approval request", async () => {
    const uniqueId = Math.floor(Math.random() * 1000000) + 10000;
    // Request approval
    const requestResult = await caller.annotationApprovals.requestApproval({
      annotationId: uniqueId,
      annotationType: "visual",
    });

    // Cancel it
    const cancelResult = await caller.annotationApprovals.cancelApproval({
      approvalId: requestResult.approvalId,
    });

    expect(cancelResult.success).toBe(true);

    // Verify it's deleted
    const status = await caller.annotationApprovals.getApprovalStatus({
      annotationId: uniqueId,
      annotationType: "visual",
    });

    expect(status).toBeNull();
  });

  it("should not allow duplicate approval requests", async () => {
    const uniqueId = Math.floor(Math.random() * 1000000) + 10000;
    
    // Request approval
    await caller.annotationApprovals.requestApproval({
      annotationId: uniqueId,
      annotationType: "voice",
    });

    // Try to request again
    await expect(
      caller.annotationApprovals.requestApproval({
        annotationId: uniqueId,
        annotationType: "voice",
      })
    ).rejects.toThrow(/already exists/);
  });

  it("should not allow canceling another user's approval", async () => {
    const uniqueId = Math.floor(Math.random() * 1000000) + 10000;
    
    // Request approval as first user
    const requestResult = await caller.annotationApprovals.requestApproval({
      annotationId: uniqueId,
      annotationType: "visual",
    });

    // Create another user's caller
    const otherUser = {
      id: 999,
      openId: "other-user",
      name: "Other User",
      email: "other@example.com",
      role: "user" as const,
    };

    const otherCaller = appRouter.createCaller({
      user: otherUser,
      req: {} as any,
      res: {} as any,
    });

    // Try to cancel as other user
    await expect(
      otherCaller.annotationApprovals.cancelApproval({
        approvalId: requestResult.approvalId,
      })
    ).rejects.toThrow(/permission/);
  });
});
