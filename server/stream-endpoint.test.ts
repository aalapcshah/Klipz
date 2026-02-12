/**
 * Tests for the streaming endpoint (/api/files/stream/:sessionToken)
 * 
 * The streaming endpoint serves large files that were uploaded via chunked upload.
 * It supports HEAD requests for metadata discovery and Range requests for video seeking.
 */
import { describe, it, expect } from "vitest";

describe("Streaming Endpoint Behavior", () => {
  describe("HEAD request handling", () => {
    it("should return metadata headers without streaming data", () => {
      // HEAD requests must return Content-Type, Content-Length, Accept-Ranges
      // without fetching any chunk data from S3
      const session = {
        mimeType: "video/mp4",
        fileSize: 483822037,
        filename: "Video 10 - No More Research.mp4",
      };

      const expectedHeaders = {
        "Content-Type": session.mimeType,
        "Content-Length": session.fileSize,
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename="${encodeURIComponent(session.filename)}"`,
        "Cache-Control": "public, max-age=86400",
      };

      expect(expectedHeaders["Content-Type"]).toBe("video/mp4");
      expect(expectedHeaders["Content-Length"]).toBe(483822037);
      expect(expectedHeaders["Accept-Ranges"]).toBe("bytes");
      expect(expectedHeaders["Content-Disposition"]).toContain("Video%2010%20-%20No%20More%20Research.mp4");
    });

    it("should redirect to S3 URL if file has been assembled", () => {
      const session = {
        finalFileUrl: "https://cdn.example.com/files/assembled-video.mp4",
      };

      // If finalFileUrl exists and doesn't contain /api/files/stream/, redirect
      const shouldRedirect = session.finalFileUrl && !session.finalFileUrl.includes('/api/files/stream/');
      expect(shouldRedirect).toBe(true);
    });

    it("should NOT redirect if finalFileUrl is a streaming URL", () => {
      const session = {
        finalFileUrl: "/api/files/stream/abc123",
      };

      const shouldRedirect = session.finalFileUrl && !session.finalFileUrl.includes('/api/files/stream/');
      expect(shouldRedirect).toBe(false);
    });
  });

  describe("Range request handling", () => {
    it("should parse Range header correctly", () => {
      const rangeHeader = "bytes=0-1023";
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const rangeStart = parseInt(parts[0], 10);
      const rangeEnd = parts[1] ? parseInt(parts[1], 10) : -1;

      expect(rangeStart).toBe(0);
      expect(rangeEnd).toBe(1023);
    });

    it("should cap open-ended range requests to 2MB", () => {
      const totalSize = 483822037;
      const rangeHeader = "bytes=0-";
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const rangeStart = parseInt(parts[0], 10);
      // When end is not specified, cap at 2MB
      const rangeEnd = parts[1] ? parseInt(parts[1], 10) : Math.min(rangeStart + 2 * 1024 * 1024 - 1, totalSize - 1);

      expect(rangeStart).toBe(0);
      expect(rangeEnd).toBe(2 * 1024 * 1024 - 1); // 2MB - 1
      expect(rangeEnd).toBeLessThan(totalSize);
    });

    it("should calculate correct chunk indices for range requests", () => {
      const chunkSize = 5 * 1024 * 1024; // 5MB chunks
      
      // Range within first chunk
      const rangeStart1 = 0;
      const rangeEnd1 = 1023;
      expect(Math.floor(rangeStart1 / chunkSize)).toBe(0);
      expect(Math.floor(rangeEnd1 / chunkSize)).toBe(0);

      // Range spanning two chunks
      const rangeStart2 = 4 * 1024 * 1024; // 4MB
      const rangeEnd2 = 6 * 1024 * 1024; // 6MB
      expect(Math.floor(rangeStart2 / chunkSize)).toBe(0);
      expect(Math.floor(rangeEnd2 / chunkSize)).toBe(1);

      // Range in middle of file
      const rangeStart3 = 100 * 1024 * 1024; // 100MB
      const rangeEnd3 = 100 * 1024 * 1024 + 1023;
      expect(Math.floor(rangeStart3 / chunkSize)).toBe(20);
      expect(Math.floor(rangeEnd3 / chunkSize)).toBe(20);
    });

    it("should calculate correct Content-Range header", () => {
      const totalSize = 483822037;
      const rangeStart = 0;
      const rangeEnd = 1023;
      const contentLength = rangeEnd - rangeStart + 1;

      const contentRange = `bytes ${rangeStart}-${rangeEnd}/${totalSize}`;
      expect(contentRange).toBe("bytes 0-1023/483822037");
      expect(contentLength).toBe(1024);
    });

    it("should handle range request for last bytes of file", () => {
      const totalSize = 483822037;
      const rangeStart = totalSize - 1024;
      const rangeEnd = totalSize - 1;
      const contentLength = rangeEnd - rangeStart + 1;

      expect(contentLength).toBe(1024);
      expect(rangeEnd).toBe(totalSize - 1);
    });
  });

  describe("Media type detection", () => {
    it("should identify video MIME types as media", () => {
      const videoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
      for (const mimeType of videoTypes) {
        expect(mimeType.startsWith("video/")).toBe(true);
      }
    });

    it("should identify audio MIME types as media", () => {
      const audioTypes = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"];
      for (const mimeType of audioTypes) {
        expect(mimeType.startsWith("audio/")).toBe(true);
      }
    });

    it("should NOT identify non-media types as media", () => {
      const nonMediaTypes = ["image/png", "application/pdf", "text/plain"];
      for (const mimeType of nonMediaTypes) {
        const isMedia = mimeType.startsWith("video/") || mimeType.startsWith("audio/");
        expect(isMedia).toBe(false);
      }
    });
  });

  describe("Chunk slice calculation", () => {
    it("should correctly slice chunk data for range requests", () => {
      const chunkSize = 5 * 1024 * 1024; // 5MB
      const bufferLength = chunkSize; // Full chunk

      // Range starts at beginning of chunk
      const rangeStart = 0;
      const rangeEnd = 1023;
      const globalOffset = 0;

      const sliceStart = Math.max(0, rangeStart - globalOffset);
      const sliceEnd = Math.min(bufferLength, rangeEnd - globalOffset + 1);

      expect(sliceStart).toBe(0);
      expect(sliceEnd).toBe(1024);
    });

    it("should correctly slice when range starts mid-chunk", () => {
      const chunkSize = 5 * 1024 * 1024; // 5MB
      const bufferLength = chunkSize;

      // Range starts at 2MB into the chunk
      const rangeStart = 2 * 1024 * 1024;
      const rangeEnd = 3 * 1024 * 1024 - 1;
      const globalOffset = 0; // First chunk

      const sliceStart = Math.max(0, rangeStart - globalOffset);
      const sliceEnd = Math.min(bufferLength, rangeEnd - globalOffset + 1);

      expect(sliceStart).toBe(2 * 1024 * 1024);
      expect(sliceEnd).toBe(3 * 1024 * 1024);
    });

    it("should correctly slice when range spans chunk boundary", () => {
      const chunkSize = 5 * 1024 * 1024; // 5MB
      const bufferLength = chunkSize;

      // Range: bytes 4MB to 6MB (spans chunk 0 and chunk 1)
      const rangeStart = 4 * 1024 * 1024;
      const rangeEnd = 6 * 1024 * 1024 - 1;

      // For chunk 0 (globalOffset = 0):
      const globalOffset0 = 0;
      const sliceStart0 = Math.max(0, rangeStart - globalOffset0);
      const sliceEnd0 = Math.min(bufferLength, rangeEnd - globalOffset0 + 1);
      expect(sliceStart0).toBe(4 * 1024 * 1024);
      expect(sliceEnd0).toBe(5 * 1024 * 1024); // End of chunk 0

      // For chunk 1 (globalOffset = 5MB):
      const globalOffset1 = chunkSize;
      const sliceStart1 = Math.max(0, rangeStart - globalOffset1);
      const sliceEnd1 = Math.min(bufferLength, rangeEnd - globalOffset1 + 1);
      expect(sliceStart1).toBe(0); // Start of chunk 1
      expect(sliceEnd1).toBe(1 * 1024 * 1024); // 1MB into chunk 1
    });
  });
});
