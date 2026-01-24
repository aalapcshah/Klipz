import { describe, it, expect } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    role: "user",
  };

  return {
    user,
    req: {} as any,
    res: {} as any,
  };
}

describe("export router", () => {
  it("should export voice annotations as CSV", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Export empty list (just test the export format)
    const result = await caller.export.exportCSV({
      annotationIds: [],
      annotationType: "voice",
    });

    expect(result).toBeDefined();
    expect(result.content).toContain("ID,File ID,Timestamp,Duration,Transcript,Created At");
    expect(result.filename).toContain("annotations_voice");
    expect(result.mimeType).toBe("text/csv");
  });

  it("should export visual annotations as CSV", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Export empty list (just test the export format)
    const result = await caller.export.exportCSV({
      annotationIds: [],
      annotationType: "visual",
    });

    expect(result).toBeDefined();
    expect(result.content).toContain("ID,File ID,Timestamp,Duration,Description,Created At");
    expect(result.filename).toContain("annotations_visual");
    expect(result.mimeType).toBe("text/csv");
  });

  it("should export annotations as JSON", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Export empty list
    const result = await caller.export.exportJSON({
      annotationIds: [],
      annotationType: "voice",
    });

    expect(result).toBeDefined();
    const parsed = JSON.parse(result.content);
    expect(parsed.annotationType).toBe("voice");
    expect(parsed.count).toBe(0);
    expect(parsed.annotations).toHaveLength(0);
    expect(result.filename).toContain("annotations_voice");
    expect(result.mimeType).toBe("application/json");
  });

  it("should export annotations as PDF (HTML)", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Export empty list
    const result = await caller.export.exportPDF({
      annotationIds: [],
      annotationType: "visual",
    });

    expect(result).toBeDefined();
    expect(result.content).toContain("<!DOCTYPE html>");
    expect(result.content).toContain("Visual Annotations Export");
    expect(result.filename).toContain("annotations_visual");
    expect(result.mimeType).toBe("text/html");
  });

  it("should export with empty annotation list", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Export empty list as JSON
    const result = await caller.export.exportJSON({
      annotationIds: [],
      annotationType: "voice",
    });

    const parsed = JSON.parse(result.content);
    expect(parsed.count).toBe(0);
    expect(parsed.annotations).toHaveLength(0);
    expect(parsed).toHaveProperty("exportedAt");
  });
});
