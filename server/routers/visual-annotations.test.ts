import { describe, it, expect, beforeEach, vi } from "vitest";
import { visualAnnotationsRouter } from "./visual-annotations";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { visualAnnotations } from "../../drizzle/schema";

// Mock dependencies
vi.mock("../db");
vi.mock("../storage");

describe("visualAnnotationsRouter", () => {
  const mockUser = { id: 1, openId: "test-user", role: "user" as const };
  const mockCtx = { user: mockUser };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("saveAnnotation", () => {
    it("should save a visual annotation with image upload", async () => {
      const mockDb = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([{ insertId: 123 }]),
        }),
      };
      vi.mocked(getDb).mockResolvedValue(mockDb as any);
      vi.mocked(storagePut).mockResolvedValue({
        url: "https://s3.example.com/annotation.png",
        key: "visual-annotations/1/10/123456.png",
      });

      const caller = visualAnnotationsRouter.createCaller(mockCtx as any);
      const result = await caller.saveAnnotation({
        fileId: 10,
        imageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        videoTimestamp: 42,
        duration: 10,
        description: "Test drawing",
      });

      expect(result.success).toBe(true);
      expect(result.annotationId).toBe(123);
      expect(storagePut).toHaveBeenCalledWith(
        expect.stringContaining("visual-annotations/1/10/"),
        expect.any(Buffer),
        "image/png"
      );
    });

    it("should throw error if database is not available", async () => {
      vi.mocked(getDb).mockResolvedValue(null);
      // storagePut is called before getDb in the router, so we need to mock it
      vi.mocked(storagePut).mockResolvedValue({
        url: "https://s3.example.com/annotation.png",
        key: "visual-annotations/1/10/123456.png",
      });

      const caller = visualAnnotationsRouter.createCaller(mockCtx as any);
      await expect(
        caller.saveAnnotation({
          fileId: 10,
          imageDataUrl: "data:image/png;base64,test",
          videoTimestamp: 42,
          duration: 5,
        })
      ).rejects.toThrow("Database not available");
    });
  });

  describe("getAnnotations", () => {
    it("should return annotations for a file", async () => {
      const mockAnnotations = [
        {
          id: 1,
          fileId: 10,
          userId: 1,
          imageUrl: "https://s3.example.com/annotation1.png",
          imageKey: "key1",
          videoTimestamp: 10,
          description: null,
          createdAt: new Date(),
        },
        {
          id: 2,
          fileId: 10,
          userId: 1,
          imageUrl: "https://s3.example.com/annotation2.png",
          imageKey: "key2",
          videoTimestamp: 20,
          description: "Test",
          createdAt: new Date(),
        },
      ];

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(mockAnnotations),
            }),
          }),
        }),
      };
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const caller = visualAnnotationsRouter.createCaller(mockCtx as any);
      const result = await caller.getAnnotations({ fileId: 10 });

      expect(result).toEqual(mockAnnotations);
      expect(result).toHaveLength(2);
    });

    it("should return empty array if no annotations exist", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const caller = visualAnnotationsRouter.createCaller(mockCtx as any);
      const result = await caller.getAnnotations({ fileId: 10 });

      expect(result).toEqual([]);
    });
  });

  describe("deleteAnnotation", () => {
    it("should delete an annotation owned by the user", async () => {
      const mockAnnotation = {
        id: 1,
        fileId: 10,
        userId: 1,
        imageUrl: "https://s3.example.com/annotation.png",
        imageKey: "key1",
        videoTimestamp: 10,
        description: null,
        createdAt: new Date(),
      };

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockAnnotation]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const caller = visualAnnotationsRouter.createCaller(mockCtx as any);
      const result = await caller.deleteAnnotation({ annotationId: 1 });

      expect(result.success).toBe(true);
    });

    it("should throw error if annotation not found", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const caller = visualAnnotationsRouter.createCaller(mockCtx as any);
      await expect(
        caller.deleteAnnotation({ annotationId: 999 })
      ).rejects.toThrow("Annotation not found");
    });

    it("should throw error if user does not own the annotation", async () => {
      const mockAnnotation = {
        id: 1,
        fileId: 10,
        userId: 999, // Different user
        imageUrl: "https://s3.example.com/annotation.png",
        imageKey: "key1",
        videoTimestamp: 10,
        description: null,
        createdAt: new Date(),
      };

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockAnnotation]),
            }),
          }),
        }),
      };
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const caller = visualAnnotationsRouter.createCaller(mockCtx as any);
      await expect(
        caller.deleteAnnotation({ annotationId: 1 })
      ).rejects.toThrow("You don't have permission to delete this annotation");
    });
  });
});
