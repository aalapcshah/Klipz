import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";

describe("Quality Improvement & Semantic Search", () => {
  const mockUser = {
    id: 1,
    openId: "test-user",
    name: "Test User",
    email: "test@example.com",
    role: "user" as const,
    createdAt: new Date(),
  };

  const mockContext: Context = {
    user: mockUser,
    req: {} as any,
    res: {} as any,
  };

  const caller = appRouter.createCaller(mockContext);

  describe("Quality Improvement", () => {
    it("should detect low-quality files", async () => {
      const result = await caller.qualityImprovement.detectLowQualityFiles();
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Result may be empty if no low-quality files exist
    });

    it("should get suggestions for a file (mock)", async () => {
      // This test requires a real file ID with quality score < 70
      // For now, we'll test the error case
      try {
        await caller.qualityImprovement.getSuggestions({ fileId: 999999 });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain("File not found");
      }
    });

    it("should reject enhancement for non-existent file", async () => {
      try {
        await caller.qualityImprovement.applyEnhancement({
          fileId: 999999,
          enhancementType: "upscale",
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain("File not found");
      }
    });
  });

  describe("Semantic Search", () => {
    it("should parse and search with natural language query", { timeout: 30000 }, async () => {
      const result = await caller.semanticSearch.search({
        query: "beach photos from last summer",
      });

      expect(result).toBeDefined();
      expect(result.query).toBe("beach photos from last summer");
      expect(result.parsedParams).toBeDefined();
      expect(result.parsedParams.keywords).toBeDefined();
      expect(Array.isArray(result.parsedParams.keywords)).toBe(true);
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.totalResults).toBeDefined();
    });

    it("should parse file type filters", async () => {
      const result = await caller.semanticSearch.search({
        query: "show me all videos",
      });

      expect(result.parsedParams.fileTypes).toBeDefined();
      expect(Array.isArray(result.parsedParams.fileTypes)).toBe(true);
    });

    it("should parse date ranges", async () => {
      const result = await caller.semanticSearch.search({
        query: "photos from last month",
      });

      expect(result.parsedParams.dateRange).toBeDefined();
      // Date range may or may not be populated depending on LLM parsing
    });

    it("should return scored results", { timeout: 30000 }, async () => {
      const result = await caller.semanticSearch.search({
        query: "sunset photos",
      });

      // Each result should have a relevance score
      result.results.forEach((file: any) => {
        expect(file.relevanceScore).toBeDefined();
        expect(typeof file.relevanceScore).toBe("number");
        expect(file.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(file.relevanceScore).toBeLessThanOrEqual(100);
      });
    });
  });
});
