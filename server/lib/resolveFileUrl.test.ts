import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the storage module before importing resolveFileUrl
vi.mock("../storage", () => ({
  storageGet: vi.fn(),
}));

// Mock the db module
vi.mock("../db", () => ({
  getFileById: vi.fn(),
}));

import { resolveFileUrl } from "./resolveFileUrl";
import { storageGet } from "../storage";

const mockedStorageGet = vi.mocked(storageGet);

describe("resolveFileUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns absolute HTTP URLs as-is", async () => {
    const file = {
      url: "https://cdn.example.com/video.mp4",
      fileKey: "some-key",
    };
    const result = await resolveFileUrl(file);
    expect(result).toBe("https://cdn.example.com/video.mp4");
    expect(mockedStorageGet).not.toHaveBeenCalled();
  });

  it("returns absolute http:// URLs as-is", async () => {
    const file = {
      url: "http://cdn.example.com/video.mp4",
      fileKey: "some-key",
    };
    const result = await resolveFileUrl(file);
    expect(result).toBe("http://cdn.example.com/video.mp4");
    expect(mockedStorageGet).not.toHaveBeenCalled();
  });

  it("resolves streaming URLs with non-chunked fileKey via deployed domain (streaming path takes priority)", async () => {
    const file = {
      url: "/api/files/stream/utRpvq4Z-IZC9JOsLTbRsmsE9hCcUCwp",
      fileKey: "user-123/video-abc.mp4",
    };

    // Streaming URLs take priority over storageGet — the code constructs a public URL
    // using the deployed domain rather than trying storageGet
    const result = await resolveFileUrl(file);
    expect(result).toContain("/api/files/stream/utRpvq4Z-IZC9JOsLTbRsmsE9hCcUCwp");
    expect(result).toMatch(/^https?:\/\//);
  });

  it("resolves non-streaming relative URLs via storageGet", async () => {
    const file = {
      url: "/some/relative/path",
      fileKey: "user-123/video-abc.mp4",
    };
    mockedStorageGet.mockResolvedValue({
      key: "user-123/video-abc.mp4",
      url: "https://s3.amazonaws.com/bucket/user-123/video-abc.mp4",
    });

    const result = await resolveFileUrl(file);
    expect(result).toBe("https://s3.amazonaws.com/bucket/user-123/video-abc.mp4");
    expect(mockedStorageGet).toHaveBeenCalledWith("user-123/video-abc.mp4");
  });

  it("falls back to deployed domain URL when storageGet fails for non-chunked fileKey", async () => {
    const file = {
      url: "/api/files/stream/some-token",
      fileKey: "user-123/video.mp4",
    };
    mockedStorageGet.mockRejectedValue(new Error("S3 error"));

    // Should fall back to deployed domain URL instead of throwing
    const result = await resolveFileUrl(file);
    expect(result).toContain("/api/files/stream/some-token");
    expect(result).toMatch(/^https?:\/\//);
  });

  it("constructs public URL for chunked fileKey using deployed domain", async () => {
    const file = {
      url: "/api/files/stream/some-token",
      fileKey: "chunked/some-token/video.mp4",
    };

    // Chunked files should use deployed domain directly (no storageGet)
    const result = await resolveFileUrl(file);
    expect(result).toContain("/api/files/stream/some-token");
    expect(result).toMatch(/^https?:\/\//);
  });

  it("uses origin when provided for streaming URLs", async () => {
    const file = {
      url: "/api/files/stream/some-token",
      fileKey: "chunked/some-token/video.mp4",
    };

    const result = await resolveFileUrl(file, { origin: "https://my-app.example.com" });
    expect(result).toBe("https://my-app.example.com/api/files/stream/some-token");
  });

  it("handles empty fileKey with streaming URL by using deployed domain", async () => {
    const file = {
      url: "/api/files/stream/some-token",
      fileKey: "",
    };

    // Should fall back to deployed domain URL
    const result = await resolveFileUrl(file);
    expect(result).toContain("/api/files/stream/some-token");
    expect(result).toMatch(/^https?:\/\//);
  });
});
