import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";

describe("Activity Log Export", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let testUserId: number;
  let testFileId: number;

  beforeAll(async () => {
    // Create test context with authenticated user
    const mockContext: Context = {
      user: {
        id: 1,
        openId: "test-user",
        name: "Test User",
        email: "test@example.com",
        role: "user",
      },
      req: {} as any,
      res: {} as any,
    };

    caller = appRouter.createCaller(mockContext);
    testUserId = mockContext.user!.id;

    // Create a test file
    const file = await caller.files.create({
      filename: "export-test.jpg",
      fileType: "image/jpeg",
      fileSize: 1024,
      storageUrl: "https://example.com/export-test.jpg",
      storageKey: "export-test.jpg",
      fileKey: "export-test.jpg",
      url: "https://example.com/export-test.jpg",
      mimeType: "image/jpeg",
    });
    testFileId = file.id;

    // Track some activities
    await caller.activityLogs.track({
      fileId: testFileId,
      activityType: "upload",
      details: "Test upload",
    });

    await caller.activityLogs.track({
      fileId: testFileId,
      activityType: "view",
      details: "Test view",
    });

    await caller.activityLogs.track({
      fileId: testFileId,
      activityType: "edit",
      details: "Test edit",
    });
  });

  describe("CSV Export", () => {
    it("should export activity logs as CSV", async () => {
      const result = await caller.activityLogs.export({
        format: "csv",
      });

      expect(result).toBeDefined();
      expect(result.data).toContain("Timestamp");
      expect(result.data).toContain("Activity Type");
      expect(result.data).toContain("upload");
      expect(result.data).toContain("view");
      expect(result.data).toContain("edit");
      expect(result.filename).toMatch(/activity-logs-\d+\.csv/);
    });

    it("should filter CSV export by activity type", async () => {
      const result = await caller.activityLogs.export({
        format: "csv",
        activityType: "upload",
      });

      expect(result.data).toContain("upload");
      expect(result.data).not.toContain("view");
      expect(result.data).not.toContain("edit");
    });

    it("should filter CSV export by date range", async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const result = await caller.activityLogs.export({
        format: "csv",
        startDate: yesterday,
      });

      expect(result.data).toBeDefined();
      expect(result.data).toContain("Timestamp");
    });
  });

  describe("JSON Export", () => {
    it("should export activity logs as JSON", async () => {
      const result = await caller.activityLogs.export({
        format: "json",
      });

      expect(result).toBeDefined();
      const data = JSON.parse(result.data);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty("activityType");
      expect(data[0]).toHaveProperty("createdAt");
      expect(result.filename).toMatch(/activity-logs-\d+\.json/);
    });

    it("should filter JSON export by activity type", async () => {
      const result = await caller.activityLogs.export({
        format: "json",
        activityType: "view",
      });

      const data = JSON.parse(result.data);
      expect(data.every((log: any) => log.activityType === "view")).toBe(true);
    });

    it("should include file information in JSON export", async () => {
      const result = await caller.activityLogs.export({
        format: "json",
      });

      const data = JSON.parse(result.data);
      const logWithFile = data.find((log: any) => log.fileId === testFileId);
      expect(logWithFile).toBeDefined();
      expect(logWithFile.file).toBeDefined();
      expect(logWithFile.file.filename).toBe("export-test.jpg");
    });
  });
});
