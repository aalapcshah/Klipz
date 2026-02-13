import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the storage module before importing resolveFileUrl
vi.mock("../storage", () => ({
  storageGet: vi.fn(),
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

  it("resolves relative streaming URLs via storageGet", async () => {
    const file = {
      url: "/api/files/stream/utRpvq4Z-IZC9JOsLTbRsmsE9hCcUCwp",
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

  it("throws if storageGet fails and no fallback is available", async () => {
    const file = {
      url: "/api/files/stream/some-token",
      fileKey: "user-123/video.mp4",
    };
    mockedStorageGet.mockRejectedValue(new Error("S3 error"));

    await expect(resolveFileUrl(file)).rejects.toThrow(
      "Cannot resolve file URL to a publicly accessible address"
    );
  });

  it("throws if storageGet returns a non-http URL", async () => {
    const file = {
      url: "/api/files/stream/some-token",
      fileKey: "user-123/video.mp4",
    };
    mockedStorageGet.mockResolvedValue({
      key: "user-123/video.mp4",
      url: "",
    });

    await expect(resolveFileUrl(file)).rejects.toThrow(
      "Cannot resolve file URL to a publicly accessible address"
    );
  });

  it("throws if fileKey is empty and URL is relative", async () => {
    const file = {
      url: "/api/files/stream/some-token",
      fileKey: "",
    };

    await expect(resolveFileUrl(file)).rejects.toThrow(
      "Cannot resolve file URL to a publicly accessible address"
    );
  });
});
