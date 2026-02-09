import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

describe("Video Upload with Chunking", () => {
  let testUserId: number;
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    // Create test user context
    testUserId = 1;
    caller = appRouter.createCaller({
      user: { id: testUserId, role: "user" } as any,
    });
  });

  describe("s3Upload.completeUpload", () => {
    it("should handle small video file upload (single chunk)", async () => {
      // Create a small test video data (simulating ~1MB video)
      const testData = "A".repeat(1024 * 1024); // 1MB of 'A' characters
      const base64Chunk = Buffer.from(testData).toString("base64");

      const result = await caller.s3Upload.completeUpload({
        fileKey: `test-uploads/small-video-${Date.now()}.mp4`,
        filename: "small-test-video.mp4",
        mimeType: "video/mp4",
        fileSize: testData.length,
        title: "Small Test Video",
        chunks: [base64Chunk],
      });

      expect(result.success).toBe(true);
      expect(result.fileKey).toBeDefined();
      expect(result.url).toBeDefined();
      expect(result.url).toContain("small-video");
    });

    it("should handle large video file upload (multiple chunks)", async () => {
      // Simulate a larger video with multiple 5MB chunks
      const chunkSize = 5 * 1024 * 1024; // 5MB
      const numChunks = 3; // 15MB total
      const chunks: string[] = [];

      for (let i = 0; i < numChunks; i++) {
        const chunkData = `Chunk${i}`.repeat(Math.floor(chunkSize / 10)); // Fill chunk
        const base64Chunk = Buffer.from(chunkData).toString("base64");
        chunks.push(base64Chunk);
      }

      const totalSize = numChunks * chunkSize;

      const result = await caller.s3Upload.completeUpload({
        fileKey: `test-uploads/large-video-${Date.now()}.mp4`,
        filename: "large-test-video.mp4",
        mimeType: "video/mp4",
        fileSize: totalSize,
        title: "Large Test Video",
        chunks,
      });

      expect(result.success).toBe(true);
      expect(result.fileKey).toBeDefined();
      expect(result.url).toBeDefined();
      expect(result.url).toContain("large-video");
    });

    it("should reject files exceeding 2GB limit", async () => {
      const oversizedFileSize = 2.5 * 1024 * 1024 * 1024; // 2.5GB

      await expect(
        caller.s3Upload.completeUpload({
          fileKey: `test-uploads/oversized-${Date.now()}.mp4`,
          filename: "oversized-video.mp4",
          mimeType: "video/mp4",
          fileSize: oversizedFileSize,
          title: "Oversized Video",
          chunks: ["dGVzdA=="], // dummy chunk
        })
      ).rejects.toThrow("exceeds 2GB limit");
    });

    it("should handle invalid base64 chunk data gracefully", async () => {
      // S3 storagePut accepts raw data without base64 validation,
      // so the upload will succeed even with invalid base64 strings.
      // The test verifies the upload doesn't crash.
      const result = await caller.s3Upload.completeUpload({
        fileKey: `test-uploads/invalid-${Date.now()}.mp4`,
        filename: "invalid-video.mp4",
        mimeType: "video/mp4",
        fileSize: 1024,
        chunks: ["!!!invalid-base64!!!"],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("files.create with uploaded video", () => {
    it("should create file record after successful upload", async () => {
      // First upload the video
      const testData = "VideoContent".repeat(1000);
      const base64Chunk = Buffer.from(testData).toString("base64");

      const uploadResult = await caller.s3Upload.completeUpload({
        fileKey: `test-uploads/video-record-${Date.now()}.mp4`,
        filename: "video-for-record.mp4",
        mimeType: "video/mp4",
        fileSize: testData.length,
        chunks: [base64Chunk],
      });

      // Then create file record
      const fileRecord = await caller.files.create({
        fileKey: uploadResult.fileKey,
        url: uploadResult.url,
        filename: "video-for-record.mp4",
        mimeType: "video/mp4",
        fileSize: testData.length,
        title: "Test Video Record",
        description: "Video uploaded via chunked upload",
      });

      expect(fileRecord.id).toBeDefined();
      expect(typeof fileRecord.id).toBe("number");

      // Verify file was created in database
      const file = await db.getFileById(fileRecord.id);
      expect(file).toBeDefined();
      expect(file?.filename).toBe("video-for-record.mp4");
      expect(file?.mimeType).toBe("video/mp4");
      expect(file?.url).toBe(uploadResult.url);

      // Cleanup
      await db.deleteFile(fileRecord.id);
    });
  });

  describe("Upload flow simulation", () => {
    it("should simulate complete upload flow for 30-second video", async () => {
      // Simulate a 30-second video at ~10MB
      const videoSize = 10 * 1024 * 1024; // 10MB
      const chunkSize = 5 * 1024 * 1024; // 5MB chunks
      const numChunks = Math.ceil(videoSize / chunkSize);
      const chunks: string[] = [];

      // Generate chunks
      for (let i = 0; i < numChunks; i++) {
        const currentChunkSize = Math.min(chunkSize, videoSize - i * chunkSize);
        const chunkData = `VideoData${i}`.repeat(
          Math.floor(currentChunkSize / 15)
        );
        chunks.push(Buffer.from(chunkData).toString("base64"));
      }

      // Upload video
      const uploadResult = await caller.s3Upload.completeUpload({
        fileKey: `test-uploads/30sec-video-${Date.now()}.mp4`,
        filename: "30-second-test-video.mp4",
        mimeType: "video/mp4",
        fileSize: videoSize,
        title: "30 Second Test Video",
        chunks,
      });

      expect(uploadResult.success).toBe(true);
      expect(uploadResult.url).toBeDefined();

      // Create file record
      const fileRecord = await caller.files.create({
        fileKey: uploadResult.fileKey,
        url: uploadResult.url,
        filename: "30-second-test-video.mp4",
        mimeType: "video/mp4",
        fileSize: videoSize,
        title: "30 Second Test Video",
        description: "Uploaded video - High (1080p)",
      });

      expect(fileRecord.id).toBeDefined();

      // Verify file exists
      const file = await db.getFileById(fileRecord.id);
      expect(file).toBeDefined();
      expect(file?.fileSize).toBe(videoSize);
      expect(file?.enrichmentStatus).toBe("pending");

      // Cleanup
      await db.deleteFile(fileRecord.id);
    });
  });
});
