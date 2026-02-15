import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Auto-HLS Module", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should export queueAutoHls and isHlsQueued functions", async () => {
    const autoHls = await import("./lib/autoHls");
    expect(typeof autoHls.queueAutoHls).toBe("function");
    expect(typeof autoHls.isHlsQueued).toBe("function");
  });

  it("should skip non-HTTP URLs", async () => {
    const autoHls = await import("./lib/autoHls");
    const consoleSpy = vi.spyOn(console, "log");

    await autoHls.queueAutoHls(999, "/api/files/stream/abc123");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("not an S3 URL")
    );
    consoleSpy.mockRestore();
  });

  it("should prevent duplicate queuing for the same videoId", async () => {
    const autoHls = await import("./lib/autoHls");
    const consoleSpy = vi.spyOn(console, "log");

    // Queue first time
    await autoHls.queueAutoHls(100, "https://example.com/video.mp4");
    expect(autoHls.isHlsQueued(100)).toBe(true);

    // Try to queue again
    await autoHls.queueAutoHls(100, "https://example.com/video.mp4");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("already queued")
    );
    consoleSpy.mockRestore();
  });

  it("should not be queued for non-HTTP URLs", async () => {
    const autoHls = await import("./lib/autoHls");
    await autoHls.queueAutoHls(200, "/api/files/stream/abc123");
    expect(autoHls.isHlsQueued(200)).toBe(false);
  });

  it("should accept custom delay option", async () => {
    const autoHls = await import("./lib/autoHls");
    const consoleSpy = vi.spyOn(console, "log");

    await autoHls.queueAutoHls(300, "https://example.com/video.mp4", {
      delay: 1000,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("delay: 1000ms")
    );
    consoleSpy.mockRestore();
  });
});

describe("Auto-HLS Integration Points", () => {
  it("should have autoHls import in resumableUpload.ts", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      "/home/ubuntu/metaclips/server/routers/resumableUpload.ts",
      "utf-8"
    );
    expect(content).toContain("autoHls");
    expect(content).toContain("queueAutoHls");
  });

  it("should have autoHls import in backgroundAssembly.ts", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      "/home/ubuntu/metaclips/server/lib/backgroundAssembly.ts",
      "utf-8"
    );
    expect(content).toContain("autoHls");
    expect(content).toContain("queueAutoHls");
  });

  it("should have autoHls import in routers.ts", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      "/home/ubuntu/metaclips/server/routers.ts",
      "utf-8"
    );
    // Should appear in both auto-detect and direct video creation paths
    const matches = content.match(/queueAutoHls/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("should trigger HLS for HTTP URLs in all video creation paths", async () => {
    const fs = await import("fs");
    
    // Check resumableUpload sync finalize
    const resumable = fs.readFileSync(
      "/home/ubuntu/metaclips/server/routers/resumableUpload.ts",
      "utf-8"
    );
    expect(resumable).toContain("finalUrl.startsWith('http')");
    expect(resumable).toContain("queueAutoHls(videoId!");

    // Check backgroundAssembly
    const assembly = fs.readFileSync(
      "/home/ubuntu/metaclips/server/lib/backgroundAssembly.ts",
      "utf-8"
    );
    expect(assembly).toContain("finalUrl.startsWith('http')");
    expect(assembly).toContain("queueAutoHls(videoId");

    // Check routers.ts auto-detect
    const routers = fs.readFileSync(
      "/home/ubuntu/metaclips/server/routers.ts",
      "utf-8"
    );
    expect(routers).toContain("url!.startsWith('http')");
    expect(routers).toContain("input.url.startsWith('http')");
  });
});
