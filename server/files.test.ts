import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("files router", () => {
  describe("files.list", () => {
    it("returns empty array when user has no files", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      const files = await caller.files.list();

      expect(Array.isArray(files)).toBe(true);
    });
  });

  describe("files.create", () => {
    it("creates a new file record", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.files.create({
        fileKey: "test-file-key",
        url: "https://example.com/test.jpg",
        filename: "test.jpg",
        mimeType: "image/jpeg",
        fileSize: 1024000,
        title: "Test Image",
        description: "A test image file",
      });

      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("number");
    });

    it("sets enrichment status to pending by default", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      const { id } = await caller.files.create({
        fileKey: "test-file-key-2",
        url: "https://example.com/test2.jpg",
        filename: "test2.jpg",
        mimeType: "image/jpeg",
        fileSize: 1024000,
      });

      const file = await db.getFileById(id);
      expect(file?.enrichmentStatus).toBe("pending");
    });
  });

  describe("files.get", () => {
    it("returns file with tags and knowledge edges", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      // Create a file first
      const { id } = await caller.files.create({
        fileKey: "test-file-key-3",
        url: "https://example.com/test3.jpg",
        filename: "test3.jpg",
        mimeType: "image/jpeg",
        fileSize: 1024000,
        title: "Test File for Get",
      });

      const file = await caller.files.get({ id });

      expect(file).toHaveProperty("id", id);
      expect(file).toHaveProperty("title", "Test File for Get");
      expect(file).toHaveProperty("tags");
      expect(file).toHaveProperty("knowledgeEdges");
      expect(Array.isArray(file.tags)).toBe(true);
      expect(Array.isArray(file.knowledgeEdges)).toBe(true);
    });

    it("throws error when file does not exist", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.files.get({ id: 99999 })).rejects.toThrow(
        "File not found"
      );
    });
  });

  describe("files.update", () => {
    it("updates file metadata", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      // Create a file first
      const { id } = await caller.files.create({
        fileKey: "test-file-key-4",
        url: "https://example.com/test4.jpg",
        filename: "test4.jpg",
        mimeType: "image/jpeg",
        fileSize: 1024000,
        title: "Original Title",
      });

      // Update the file
      await caller.files.update({
        id,
        title: "Updated Title",
        description: "Updated description",
      });

      const updatedFile = await db.getFileById(id);
      expect(updatedFile?.title).toBe("Updated Title");
      expect(updatedFile?.description).toBe("Updated description");
    });
  });

  describe("files.delete", () => {
    it("deletes a file and its related records", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      // Create a file first
      const { id } = await caller.files.create({
        fileKey: "test-file-key-5",
        url: "https://example.com/test5.jpg",
        filename: "test5.jpg",
        mimeType: "image/jpeg",
        fileSize: 1024000,
      });

      // Delete the file
      const result = await caller.files.delete({ id });
      expect(result.success).toBe(true);

      // Verify file is deleted
      const deletedFile = await db.getFileById(id);
      expect(deletedFile).toBeUndefined();
    });
  });

  describe("files.search", () => {
    it("searches files by query string", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      // Create test files
      await caller.files.create({
        fileKey: "search-test-1",
        url: "https://example.com/search1.jpg",
        filename: "search1.jpg",
        mimeType: "image/jpeg",
        fileSize: 1024000,
        title: "Mountain Landscape",
        description: "Beautiful mountain scenery",
      });

      await caller.files.create({
        fileKey: "search-test-2",
        url: "https://example.com/search2.jpg",
        filename: "search2.jpg",
        mimeType: "image/jpeg",
        fileSize: 1024000,
        title: "Ocean View",
        description: "Sunset over the ocean",
      });

      // Search for "mountain"
      const results = await caller.files.search({ query: "mountain" });
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(
        results.some((f) => f.title?.toLowerCase().includes("mountain"))
      ).toBe(true);
    });
  });
});

describe("tags router", () => {
  describe("tags.create", () => {
    it("creates a new tag", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.tags.create({
        name: "nature",
        source: "manual",
      });

      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("number");
    });

    it("returns existing tag id if tag already exists", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      const first = await caller.tags.create({
        name: "landscape",
        source: "manual",
      });

      const second = await caller.tags.create({
        name: "landscape",
        source: "manual",
      });

      expect(first.id).toBe(second.id);
    });
  });

  describe("tags.linkToFile", () => {
    it("links a tag to a file", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      // Create file and tag
      const { id: fileId } = await caller.files.create({
        fileKey: "tag-test-file",
        url: "https://example.com/tagtest.jpg",
        filename: "tagtest.jpg",
        mimeType: "image/jpeg",
        fileSize: 1024000,
      });

      const { id: tagId } = await caller.tags.create({
        name: "test-tag",
        source: "manual",
      });

      // Link them
      const result = await caller.tags.linkToFile({ fileId, tagId });
      expect(result.success).toBe(true);

      // Verify link
      const file = await caller.files.get({ id: fileId });
      expect(file.tags.some((t) => t.id === tagId)).toBe(true);
    });
  });
});

describe("storage router", () => {
  describe("storage.uploadFile", () => {
    it("uploads file and returns URL and key", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      // Create a small base64 test file
      const testData = "SGVsbG8gV29ybGQ="; // "Hello World" in base64

      const result = await caller.storage.uploadFile({
        filename: "test-upload.txt",
        contentType: "text/plain",
        base64Data: testData,
      });

      expect(result).toHaveProperty("url");
      expect(result).toHaveProperty("fileKey");
      expect(typeof result.url).toBe("string");
      expect(typeof result.fileKey).toBe("string");
      expect(result.fileKey).toContain("test-upload.txt");
    });
  });
});
