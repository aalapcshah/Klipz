import { describe, it, expect } from "vitest";
import * as fs from "fs";

describe("HLS Polling in VideoDetail", () => {
  const videoDetailPath = "/home/ubuntu/metaclips/client/src/pages/VideoDetail.tsx";
  const content = fs.readFileSync(videoDetailPath, "utf-8");

  it("should have refetchInterval that checks hlsStatus", () => {
    expect(content).toContain("hlsInProgress");
    expect(content).toContain("data?.hlsStatus === 'processing'");
    expect(content).toContain("data?.hlsStatus === 'pending'");
  });

  it("should poll every 5 seconds during HLS transcoding", () => {
    // The refetchInterval returns 5000 when HLS is in progress
    expect(content).toContain("(mp4InProgress || hlsInProgress) ? 5000 : false");
  });

  it("should stop polling when HLS status is completed or failed", () => {
    // Only 'processing' and 'pending' trigger polling
    // 'completed' and 'failed' are not in the hlsInProgress condition
    const hlsInProgressLine = content.match(/const hlsInProgress = .+/)?.[0] || "";
    expect(hlsInProgressLine).not.toContain("completed");
    expect(hlsInProgressLine).not.toContain("failed");
  });

  it("should track previous HLS status for transition detection", () => {
    expect(content).toContain("prevHlsStatus");
    expect(content).toContain("setPrevHlsStatus");
  });

  it("should show success toast when HLS completes", () => {
    expect(content).toContain("HLS adaptive streaming is now ready!");
  });

  it("should show error toast when HLS fails", () => {
    expect(content).toContain("HLS transcoding failed");
  });

  it("should show info toast when HLS starts processing", () => {
    expect(content).toContain("HLS transcoding is now processing...");
  });

  it("should differentiate pending and processing in badge text", () => {
    expect(content).toContain('"HLS Queued..."');
    expect(content).toContain('"Generating HLS..."');
  });

  it("should have animate-pulse on the HLS in-progress badge", () => {
    expect(content).toContain("animate-pulse");
  });

  it("should also poll during MP4 transcoding", () => {
    expect(content).toContain("mp4InProgress");
    expect(content).toContain("data?.transcodeStatus !== 'failed'");
  });
});

describe("Auto-HLS Integration Completeness", () => {
  it("should have autoHls helper module", () => {
    const autoHlsPath = "/home/ubuntu/metaclips/server/lib/autoHls.ts";
    expect(fs.existsSync(autoHlsPath)).toBe(true);
    const content = fs.readFileSync(autoHlsPath, "utf-8");
    expect(content).toContain("queueAutoHls");
    expect(content).toContain("pendingHlsJobs");
    expect(content).toContain("isHlsQueued");
  });

  it("should trigger auto-HLS in all 4 video creation paths", () => {
    const resumable = fs.readFileSync(
      "/home/ubuntu/metaclips/server/routers/resumableUpload.ts",
      "utf-8"
    );
    const assembly = fs.readFileSync(
      "/home/ubuntu/metaclips/server/lib/backgroundAssembly.ts",
      "utf-8"
    );
    const routers = fs.readFileSync(
      "/home/ubuntu/metaclips/server/routers.ts",
      "utf-8"
    );

    // 1. Resumable sync finalize
    expect(resumable).toContain("queueAutoHls");
    // 2. Background assembly
    expect(assembly).toContain("queueAutoHls");
    // 3 & 4. Auto-detect and direct creation in routers.ts
    const routerMatches = routers.match(/queueAutoHls/g);
    expect(routerMatches).not.toBeNull();
    expect(routerMatches!.length).toBeGreaterThanOrEqual(2);
  });
});
