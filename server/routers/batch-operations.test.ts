import { describe, it, expect } from "vitest";
import { appRouter } from "../routers";
import type { Context } from "../_core/context";

const mockUser = {
  id: 1,
  openId: "test-user",
  name: "Test User",
  email: "test@example.com",
  role: "user" as const,
};

const createCaller = () => {
  const mockContext: Context = {
    user: mockUser,
    req: {} as any,
    res: {} as any,
  };
  return appRouter.createCaller(mockContext);
};

describe("Batch Operations Router", () => {
  it("should bulk approve annotations", async () => {
    const caller = createCaller();
    
    const result = await caller.batchOperations.bulkApprove({
      annotationIds: [1, 2, 3],
      annotationType: "voice",
      comment: "Approved in batch",
    });
    
    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
  });

  it("should bulk reject annotations", async () => {
    const caller = createCaller();
    
    const result = await caller.batchOperations.bulkReject({
      annotationIds: [4, 5],
      annotationType: "visual",
      comment: "Rejected in batch",
    });
    
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });

  it("should export annotations", async () => {
    const caller = createCaller();
    
    const result = await caller.batchOperations.exportAnnotations({
      annotationIds: [1, 2],
      annotationType: "voice",
    });
    
    expect(result).toHaveProperty("annotations");
    expect(result).toHaveProperty("exportDate");
    expect(result).toHaveProperty("annotationType");
    expect(result.annotationType).toBe("voice");
    expect(Array.isArray(result.annotations)).toBe(true);
  });

  it("should fail to delete annotations not owned by user", async () => {
    const caller = createCaller();
    
    // Try to delete annotations with IDs that don't exist or aren't owned by user
    await expect(
      caller.batchOperations.bulkDelete({
        annotationIds: [999999, 999998],
        annotationType: "voice",
      })
    ).rejects.toThrow();
  });
});
