import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Upload Router Cleanup", () => {
  it("old uploadChunk and largeFileUpload routers should be removed from router registration", async () => {
    const routersPath = path.resolve(__dirname, "routers.ts");
    const content = fs.readFileSync(routersPath, "utf-8");

    // Should NOT have active registrations for old routers
    expect(content).not.toMatch(/^\s+uploadChunk:\s+uploadChunkRouter/m);
    expect(content).not.toMatch(/^\s+largeFileUpload:\s+largeFileUploadRouter/m);

    // Should still have resumableUpload registered
    expect(content).toContain("resumableUpload: resumableUploadRouter");
  });

  it("old router imports should be commented out in routers.ts", async () => {
    const routersPath = path.resolve(__dirname, "routers.ts");
    const content = fs.readFileSync(routersPath, "utf-8");

    // Imports should be commented out
    expect(content).toMatch(/\/\/.*import.*uploadChunkRouter/);
    expect(content).toMatch(/\/\/.*import.*largeFileUploadRouter/);
  });

  it("UPLOAD_OPERATIONS in main.tsx should only contain resumableUpload operations", async () => {
    const mainPath = path.resolve(__dirname, "../client/src/main.tsx");
    const content = fs.readFileSync(mainPath, "utf-8");

    // Should NOT contain old upload operations
    expect(content).not.toContain("'uploadChunk.uploadChunk'");
    expect(content).not.toContain("'uploadChunk.initUpload'");
    expect(content).not.toContain("'uploadChunk.finalizeUpload'");
    expect(content).not.toContain("'uploadChunk.cancelUpload'");
    expect(content).not.toContain("'largeFileUpload.uploadLargeChunk'");
    expect(content).not.toContain("'largeFileUpload.initLargeUpload'");
    expect(content).not.toContain("'largeFileUpload.finalizeLargeUpload'");
    expect(content).not.toContain("'largeFileUpload.cancelLargeUpload'");

    // Should contain resumableUpload operations
    expect(content).toContain("'resumableUpload.createSession'");
    expect(content).toContain("'resumableUpload.uploadChunk'");
    expect(content).toContain("'resumableUpload.finalizeUpload'");
  });

  it("no client components should use trpc.uploadChunk or trpc.largeFileUpload mutations", async () => {
    const clientDir = path.resolve(__dirname, "../client/src");

    function findTrpcUsages(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findTrpcUsages(fullPath));
        } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          if (content.includes("trpc.uploadChunk.") || content.includes("trpc.largeFileUpload.")) {
            results.push(fullPath);
          }
        }
      }
      return results;
    }

    const filesWithOldUsages = findTrpcUsages(clientDir);
    expect(filesWithOldUsages).toEqual([]);
  });
});

describe("Upload Components use Resumable Upload System", () => {
  it("VideoUploadSection should use resumable upload via trpcCall", async () => {
    const filePath = path.resolve(__dirname, "../client/src/components/VideoUploadSection.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Should use resumable upload API
    expect(content).toContain("resumableUpload.createSession");
    expect(content).toContain("resumableUpload.uploadChunk");
    expect(content).toContain("resumableUpload.finalizeUpload");

    // Should NOT use old upload mutations
    expect(content).not.toContain("uploadChunkMutation");
    expect(content).not.toContain("initUploadMutation");
    expect(content).not.toContain("finalizeUploadMutation");
    expect(content).not.toContain("initLargeUploadMutation");
    expect(content).not.toContain("finalizeLargeUploadMutation");
  });

  it("FileUploadProcessor should use resumable upload via trpcCall", async () => {
    const filePath = path.resolve(__dirname, "../client/src/components/FileUploadProcessor.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Should use resumable upload API
    expect(content).toContain("resumableUpload.createSession");
    expect(content).toContain("resumableUpload.uploadChunk");
    expect(content).toContain("resumableUpload.finalizeUpload");

    // Should NOT use old upload mutations
    expect(content).not.toContain("trpc.uploadChunk");
    expect(content).not.toContain("trpc.largeFileUpload");
  });

  it("PendingUploads should use resumable upload via trpcCall", async () => {
    const filePath = path.resolve(__dirname, "../client/src/components/videos/PendingUploads.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Should use resumable upload API
    expect(content).toContain("resumableUpload.createSession");
    expect(content).toContain("resumableUpload.uploadChunk");
    expect(content).toContain("resumableUpload.finalizeUpload");

    // Should NOT use old upload mutations
    expect(content).not.toContain("trpc.uploadChunk");
    expect(content).not.toContain("initUploadMutation");
  });

  it("VideoRecorderWithTranscription should use resumable upload via trpcCall", async () => {
    const filePath = path.resolve(__dirname, "../client/src/components/videos/VideoRecorderWithTranscription.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Should use resumable upload API
    expect(content).toContain("resumableUpload.createSession");
    expect(content).toContain("resumableUpload.uploadChunk");
    expect(content).toContain("resumableUpload.finalizeUpload");

    // Should NOT use old upload mutations
    expect(content).not.toContain("trpc.uploadChunk");
    expect(content).not.toContain("initUploadMutation.mutateAsync");
    expect(content).not.toContain("uploadChunkMutation.mutateAsync");
    expect(content).not.toContain("finalizeUploadMutation.mutateAsync");
  });
});

describe("Upload Progress Persistence", () => {
  it("useResumableUpload should have localStorage persistence helpers", async () => {
    const filePath = path.resolve(__dirname, "../client/src/hooks/useResumableUpload.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Should have localStorage helpers
    expect(content).toContain("saveSessionsToStorage");
    expect(content).toContain("loadSessionsFromStorage");
    expect(content).toContain("clearSessionsFromStorage");
    expect(content).toContain("STORAGE_KEY");

    // Should load from localStorage on mount
    expect(content).toContain("loadSessionsFromStorage()");

    // Should save to localStorage on session changes
    expect(content).toContain("saveSessionsToStorage(updated)");
  });

  it("useResumableUpload should sync localStorage on chunk progress", async () => {
    const filePath = path.resolve(__dirname, "../client/src/hooks/useResumableUpload.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Should sync every 5 chunks
    expect(content).toContain("uploadedChunks % 5 === 0");
    expect(content).toContain("saveSessionsToStorage");
  });

  it("useResumableUpload should clear localStorage when clearing all sessions", async () => {
    const filePath = path.resolve(__dirname, "../client/src/hooks/useResumableUpload.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("clearSessionsFromStorage()");
  });

  it("ResumableUploadsBanner should have file re-selection dialog for resume after refresh", async () => {
    const filePath = path.resolve(__dirname, "../client/src/components/ResumableUploadsBanner.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Should have file re-selection dialog
    expect(content).toContain("Re-select File to Resume Upload");
    expect(content).toContain("handleOpenFilePicker");
    expect(content).toContain("handleFileSelect");

    // Should show hint when file needs re-selection
    expect(content).toContain("Tap resume to re-select file and continue");
  });
});
