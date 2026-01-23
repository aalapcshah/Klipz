import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Request, Response } from "express";

describe("Voice Annotations", () => {
  let mockContext: any;

  beforeAll(async () => {
    mockContext = {
      req: {} as Request,
      res: {} as Response,
      user: {
        id: 1,
        openId: "test-user",
        name: "Test User",
        email: "test@example.com",
        role: "user",
      },
    };
  });

  it("should have voice annotations router registered", () => {
    expect(appRouter._def.procedures).toHaveProperty("voiceAnnotations.saveAnnotation");
    expect(appRouter._def.procedures).toHaveProperty("voiceAnnotations.getAnnotations");
    expect(appRouter._def.procedures).toHaveProperty("voiceAnnotations.deleteAnnotation");
  });

  it("should reject invalid file ID in getAnnotations", async () => {
    const caller = appRouter.createCaller(mockContext);
    
    await expect(
      caller.voiceAnnotations.getAnnotations({ fileId: 99999 })
    ).rejects.toThrow();
  });
});

describe("Storage Cleanup", () => {
  let mockContext: any;

  beforeAll(async () => {
    mockContext = {
      req: {} as Request,
      res: {} as Response,
      user: {
        id: 1,
        openId: "test-user",
        name: "Test User",
        email: "test@example.com",
        role: "user",
      },
    };
  });

  it("should have storage cleanup router registered", () => {
    expect(appRouter._def.procedures).toHaveProperty("storageCleanup.scanFiles");
    expect(appRouter._def.procedures).toHaveProperty("storageCleanup.deleteFiles");
    expect(appRouter._def.procedures).toHaveProperty("storageCleanup.trackFileAccess");
  });

  it("should return scan results with summary", async () => {
    const caller = appRouter.createCaller(mockContext);
    const result = await caller.storageCleanup.scanFiles();
    
    expect(result).toHaveProperty("duplicates");
    expect(result).toHaveProperty("lowQuality");
    expect(result).toHaveProperty("unused");
    expect(result).toHaveProperty("summary");
    expect(result.summary).toHaveProperty("totalFiles");
    expect(result.summary).toHaveProperty("totalSize");
  });

  it("should reject empty file IDs in deleteFiles", async () => {
    const caller = appRouter.createCaller(mockContext);
    
    await expect(
      caller.storageCleanup.deleteFiles({ fileIds: [] })
    ).rejects.toThrow();
  });
});
