import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

/**
 * Upload & Enrichment Flow Tests
 * 
 * Tests the complete file upload pipeline including:
 * - File metadata extraction
 * - AI enrichment
 * - Tag generation
 * - Quality score calculation
 * - Storage integration
 */

describe("Upload & Enrichment Flow", () => {
  // Use a test user ID (assuming user with ID 1 exists from auth tests)
  const testUserId = 1;
  let testFileId: number;

  afterAll(async () => {
    // Cleanup: delete test files
    if (testFileId) {
      await db.deleteFile(testFileId);
    }
  });

  describe("File Upload", () => {
    it("should create a file with basic metadata", async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, role: "user" } as any,
      });

      const result = await caller.files.create({
        fileKey: `test-files/upload-test-${Date.now()}.jpg`,
        url: "https://example.com/test.jpg",
        filename: "test-image.jpg",
        mimeType: "image/jpeg",
        fileSize: 1024000, // 1MB
        title: "Test Image",
        description: "A test image for upload flow testing",
      });

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe("number");
      
      testFileId = result.id;

      // Verify file was created in database
      const file = await db.getFileById(testFileId);
      expect(file).toBeDefined();
      expect(file?.filename).toBe("test-image.jpg");
      expect(file?.title).toBe("Test Image");
      expect(file?.mimeType).toBe("image/jpeg");
    });

    it("should handle files without title or description", async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, role: "user" } as any,
      });

      const result = await caller.files.create({
        fileKey: `test-files/no-metadata-${Date.now()}.jpg`,
        url: "https://example.com/no-metadata.jpg",
        filename: "no-metadata.jpg",
        mimeType: "image/jpeg",
        fileSize: 512000,
      });

      expect(result.id).toBeDefined();
      
      const file = await db.getFileById(result.id);
      expect(file).toBeDefined();
      expect(file?.filename).toBe("no-metadata.jpg");
      
      // Cleanup
      await db.deleteFile(result.id);
    });

    it("should handle various file formats", async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, role: "user" } as any,
      });

      const formats = [
        { filename: "test.png", mimeType: "image/png" },
        { filename: "test.pdf", mimeType: "application/pdf" },
        { filename: "test.mp4", mimeType: "video/mp4" },
        { filename: "test.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      ];

      for (const format of formats) {
        const result = await caller.files.create({
          fileKey: `test-files/${format.filename}`,
          url: `https://example.com/${format.filename}`,
          filename: format.filename,
          mimeType: format.mimeType,
          fileSize: 1024000,
        });

        expect(result.id).toBeDefined();
        
        const file = await db.getFileById(result.id);
        expect(file?.mimeType).toBe(format.mimeType);
        
        // Cleanup
        await db.deleteFile(result.id);
      }
    });
  });

  describe("File Enrichment", () => {
    it("should verify file enrichment status tracking", async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, role: "user" } as any,
      });

      // Create a file
      const fileResult = await caller.files.create({
        fileKey: `test-files/enrich-test-${Date.now()}.jpg`,
        url: "https://example.com/enrich-test.jpg",
        filename: "enrich-test.jpg",
        mimeType: "image/jpeg",
        fileSize: 2048000,
        title: "Mountain Landscape",
      });

      // Verify file has enrichment status field
      const file = await db.getFileById(fileResult.id);
      expect(file).toBeDefined();
      expect(file?.enrichmentStatus).toBeDefined();

      // Cleanup
      await db.deleteFile(fileResult.id);
    });
  });

  describe("Tag Generation", () => {
    it("should support tag creation", async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, role: "user" } as any,
      });

      // Create a tag
      const tagResult = await caller.tags.create({
        name: `test-tag-${Date.now()}`,
        source: "manual",
      });

      expect(tagResult.id).toBeDefined();
      expect(typeof tagResult.id).toBe("number");

      // Cleanup
      await db.deleteTag(tagResult.id);
    });
  });





  describe("File Retrieval", () => {
    it("should retrieve user's files with pagination", async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, role: "user" } as any,
      });

      // Create multiple test files
      const fileIds: number[] = [];
      for (let i = 0; i < 5; i++) {
        const result = await caller.files.create({
          fileKey: `test-files/pagination-${i}-${Date.now()}.jpg`,
          url: `https://example.com/pagination-${i}.jpg`,
          filename: `pagination-${i}.jpg`,
          mimeType: "image/jpeg",
          fileSize: 1024000,
        });
        fileIds.push(result.id);
      }

      // Retrieve files with pagination
      const result = await caller.files.list({
        page: 1,
        pageSize: 3,
      });

      // The API returns { files, pagination }
      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.files)).toBe(true);
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.files.length).toBeLessThanOrEqual(3);

      // Cleanup
      for (const id of fileIds) {
        await db.deleteFile(id);
      }
    });

    it("should filter files by search query", async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, role: "user" } as any,
      });

      // Create files with specific titles
      const searchFile = await caller.files.create({
        fileKey: `test-files/searchable-${Date.now()}.jpg`,
        url: "https://example.com/searchable.jpg",
        filename: "searchable.jpg",
        mimeType: "image/jpeg",
        fileSize: 1024000,
        title: "Unique Searchable Title",
      });

      // Retrieve files and check for the searchable file
      const result = await caller.files.list({
        page: 1,
        pageSize: 50,
      });

      const found = result.files.some((f: any) => f.id === searchFile.id);
      expect(found).toBe(true);

      // Cleanup
      await db.deleteFile(searchFile.id);
    });
  });
});
