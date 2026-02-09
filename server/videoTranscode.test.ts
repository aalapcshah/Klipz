import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    url: "https://s3.example.com/transcoded/test.mp4",
    key: "transcoded/test.mp4",
  }),
}));

vi.mock("axios", () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: Buffer.from("fake-video-data"),
    }),
  },
}));

vi.mock("child_process", () => ({
  exec: vi.fn((cmd: string, opts: any, cb?: any) => {
    const callback = cb || opts;
    // Simulate FFmpeg success
    callback(null, { stdout: "", stderr: "FFmpeg output" });
  }),
}));

vi.mock("fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from("fake-mp4-data")),
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

describe("videoTranscode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should transcode a video from WebM to MP4", async () => {
    const { transcodeToMp4 } = await import("./videoTranscode");

    const result = await transcodeToMp4(
      "https://example.com/video.webm",
      "test-recording.webm"
    );

    expect(result.success).toBe(true);
    expect(result.url).toBeDefined();
    expect(result.fileKey).toBeDefined();
    expect(result.fileKey).toContain(".mp4");
    expect(result.error).toBeUndefined();
  });

  it("should handle download failure gracefully", async () => {
    const axios = await import("axios");
    vi.mocked(axios.default.get).mockRejectedValueOnce(new Error("Network error"));

    const { transcodeToMp4 } = await import("./videoTranscode");

    const result = await transcodeToMp4(
      "https://example.com/video.webm",
      "test-recording.webm"
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("should handle FFmpeg failure gracefully", async () => {
    const axios = await import("axios");
    vi.mocked(axios.default.get).mockResolvedValueOnce({
      data: Buffer.from("fake-video-data"),
    } as any);
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);

    const { transcodeToMp4 } = await import("./videoTranscode");

    const result = await transcodeToMp4(
      "https://example.com/video.webm",
      "test-recording.webm"
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("FFmpeg did not produce output file");
  });

  it("should generate a proper file key with mp4 extension", async () => {
    const axios = await import("axios");
    vi.mocked(axios.default.get).mockResolvedValueOnce({
      data: Buffer.from("fake-video-data"),
    } as any);
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    const storage = await import("./storage");
    vi.mocked(storage.storagePut).mockResolvedValueOnce({
      url: "https://s3.example.com/transcoded/test.mp4",
      key: "transcoded/test.mp4",
    });
    const fsp = await import("fs/promises");
    vi.mocked(fsp.readFile).mockResolvedValueOnce(Buffer.from("fake-mp4-data") as any);

    const { transcodeToMp4 } = await import("./videoTranscode");

    const result = await transcodeToMp4(
      "https://example.com/video.webm",
      "my-recording.webm"
    );

    expect(result.success).toBe(true);
    expect(result.fileKey).toMatch(/^transcoded\/.*-my-recording\.mp4$/);
  });
});
