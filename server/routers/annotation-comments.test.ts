import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "../routers";
import type { inferProcedureInput } from "@trpc/server";
import type { AppRouter } from "../routers";

describe("Annotation Comments Router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let mockUser: { id: number; openId: string; name: string; email: string; role: "user" | "admin" };

  beforeEach(async () => {
    mockUser = {
      id: 1,
      openId: "test-user-comments",
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

  it("should create a comment on an annotation", async () => {
    const input: inferProcedureInput<AppRouter["annotationComments"]["createComment"]> = {
      annotationId: 1,
      annotationType: "visual",
      content: "This is a test comment",
    };

    const result = await caller.annotationComments.createComment(input);

    expect(result.success).toBe(true);
    expect(result.commentId).toBeDefined();
  });

  it("should create a reply to a comment", async () => {
    // Create parent comment
    const parentResult = await caller.annotationComments.createComment({
      annotationId: 1,
      annotationType: "visual",
      content: "Parent comment",
    });

    // Create reply
    const replyResult = await caller.annotationComments.createComment({
      annotationId: 1,
      annotationType: "visual",
      content: "Reply to parent",
      parentCommentId: parentResult.commentId,
    });

    expect(replyResult.success).toBe(true);
    expect(replyResult.commentId).toBeDefined();
  });

  it("should retrieve comments with threading", async () => {
    // Create parent comment
    const parentResult = await caller.annotationComments.createComment({
      annotationId: 2,
      annotationType: "voice",
      content: "Parent comment",
    });

    // Create reply
    await caller.annotationComments.createComment({
      annotationId: 2,
      annotationType: "voice",
      content: "Reply 1",
      parentCommentId: parentResult.commentId,
    });

    await caller.annotationComments.createComment({
      annotationId: 2,
      annotationType: "voice",
      content: "Reply 2",
      parentCommentId: parentResult.commentId,
    });

    // Get comments
    const comments = await caller.annotationComments.getComments({
      annotationId: 2,
      annotationType: "voice",
    });

    expect(comments.length).toBeGreaterThanOrEqual(1);
    const parentComment = comments.find((c) => c.content === "Parent comment");
    expect(parentComment).toBeDefined();
    expect(parentComment?.replies.length).toBeGreaterThanOrEqual(2);
  });

  it("should update a comment", async () => {
    // Create comment
    const createResult = await caller.annotationComments.createComment({
      annotationId: 3,
      annotationType: "visual",
      content: "Original content",
    });

    // Update it
    const updateResult = await caller.annotationComments.updateComment({
      commentId: createResult.commentId,
      content: "Updated content",
    });

    expect(updateResult.success).toBe(true);
  });

  it("should delete a comment", async () => {
    // Create comment
    const createResult = await caller.annotationComments.createComment({
      annotationId: 4,
      annotationType: "visual",
      content: "Comment to delete",
    });

    // Delete it
    const deleteResult = await caller.annotationComments.deleteComment({
      commentId: createResult.commentId,
    });

    expect(deleteResult.success).toBe(true);
  });

  it("should get comment count", async () => {
    // Create multiple comments
    await caller.annotationComments.createComment({
      annotationId: 5,
      annotationType: "voice",
      content: "Comment 1",
    });

    await caller.annotationComments.createComment({
      annotationId: 5,
      annotationType: "voice",
      content: "Comment 2",
    });

    // Get count
    const countResult = await caller.annotationComments.getCommentCount({
      annotationId: 5,
      annotationType: "voice",
    });

    expect(countResult.count).toBeGreaterThanOrEqual(2);
  });

  it("should not allow editing another user's comment", async () => {
    // Create comment as first user
    const createResult = await caller.annotationComments.createComment({
      annotationId: 6,
      annotationType: "visual",
      content: "Protected comment",
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

    // Try to update as other user
    await expect(
      otherCaller.annotationComments.updateComment({
        commentId: createResult.commentId,
        content: "Hacked content",
      })
    ).rejects.toThrow(/permission/);
  });
});
