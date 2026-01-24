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

describe("Annotation History Router", () => {
  it("should get history for an annotation", async () => {
    const caller = createCaller();
    
    const history = await caller.annotationHistory.getHistory({
      annotationId: 1,
      annotationType: "voice",
    });
    
    expect(Array.isArray(history)).toBe(true);
  });

  it("should get history count for an annotation", async () => {
    const caller = createCaller();
    
    const result = await caller.annotationHistory.getHistoryCount({
      annotationId: 1,
      annotationType: "voice",
    });
    
    expect(result).toHaveProperty("count");
    expect(typeof result.count).toBe("number");
  });

  it("should fail to revert without valid history ID", async () => {
    const caller = createCaller();
    
    await expect(
      caller.annotationHistory.revertToVersion({
        historyId: 999999,
        annotationId: 1,
        annotationType: "voice",
      })
    ).rejects.toThrow();
  });
});
