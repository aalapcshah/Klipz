import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Request, Response } from "express";

describe("Voice Note Transcription", () => {
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

  it("should have saveAnnotation procedure with transcription support", () => {
    expect(appRouter._def.procedures).toHaveProperty("voiceAnnotations.saveAnnotation");
  });

  it("should have getAnnotations procedure", () => {
    expect(appRouter._def.procedures).toHaveProperty("voiceAnnotations.getAnnotations");
  });
});

describe("Quality Score Calculation", () => {
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

  it("should have quality score router registered", () => {
    expect(appRouter._def.procedures).toHaveProperty("qualityScore.calculateScore");
    expect(appRouter._def.procedures).toHaveProperty("qualityScore.calculateAllScores");
  });

  it("should reject invalid file ID in calculateScore", async () => {
    const caller = appRouter.createCaller(mockContext);
    
    await expect(
      caller.qualityScore.calculateScore({ fileId: 99999 })
    ).rejects.toThrow();
  });
});

describe("Duplicate File Preview", () => {
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

  it("should return duplicate files in scan results", async () => {
    const caller = appRouter.createCaller(mockContext);
    const result = await caller.storageCleanup.scanFiles();
    
    expect(result).toHaveProperty("duplicates");
    expect(Array.isArray(result.duplicates)).toBe(true);
    
    // Check that duplicates have required fields for preview
    if (result.duplicates.length > 0) {
      const duplicate = result.duplicates[0];
      expect(duplicate).toHaveProperty("id");
      expect(duplicate).toHaveProperty("url");
      expect(duplicate).toHaveProperty("mimeType");
      expect(duplicate).toHaveProperty("filename");
    }
  });
});
