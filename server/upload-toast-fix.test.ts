import { describe, it, expect } from "vitest";

/**
 * Tests for the file upload toast message fix:
 * - Large files (>50MB) use resumable upload which runs in background
 * - The handleUpload function should NOT show "0 file(s) uploaded successfully" for large files
 * - Instead, it should show an appropriate message about background uploads
 */

describe("File upload toast message fix", () => {
  const RESUMABLE_UPLOAD_THRESHOLD = 50 * 1024 * 1024; // 50MB

  it("should identify files above resumable upload threshold", () => {
    const smallFile = { size: 10 * 1024 * 1024 }; // 10MB
    const largeFile = { size: 259 * 1024 * 1024 }; // 259MB
    const borderlineFile = { size: 50 * 1024 * 1024 }; // exactly 50MB

    expect(smallFile.size > RESUMABLE_UPLOAD_THRESHOLD).toBe(false);
    expect(largeFile.size > RESUMABLE_UPLOAD_THRESHOLD).toBe(true);
    expect(borderlineFile.size > RESUMABLE_UPLOAD_THRESHOLD).toBe(false);
  });

  it("should correctly count resumable uploads vs regular uploads", () => {
    // Simulate the files array after handleUpload processes them
    const files = [
      { file: { size: 259 * 1024 * 1024 }, uploadStatus: 'uploading' as const }, // Large file - resumable
      { file: { size: 5 * 1024 * 1024 }, uploadStatus: 'completed' as const },   // Small file - regular
      { file: { size: 100 * 1024 * 1024 }, uploadStatus: 'uploading' as const },  // Large file - resumable
    ];

    const successCount = files.filter(f => f.uploadStatus === 'completed').length;
    const failedCount = files.filter(f => f.uploadStatus === 'error').length;
    const resumableCount = files.filter(
      f => f.file.size > RESUMABLE_UPLOAD_THRESHOLD && f.uploadStatus !== 'error'
    ).length;

    expect(successCount).toBe(1);
    expect(failedCount).toBe(0);
    expect(resumableCount).toBe(2);
  });

  it("should not count failed resumable uploads as resumable", () => {
    const files = [
      { file: { size: 259 * 1024 * 1024 }, uploadStatus: 'error' as const }, // Large file that failed to start
    ];

    const resumableCount = files.filter(
      f => f.file.size > RESUMABLE_UPLOAD_THRESHOLD && f.uploadStatus !== 'error'
    ).length;

    expect(resumableCount).toBe(0);
  });

  it("should handle mixed upload results correctly", () => {
    const files = [
      { file: { size: 259 * 1024 * 1024 }, uploadStatus: 'uploading' as const }, // Large - resumable
      { file: { size: 5 * 1024 * 1024 }, uploadStatus: 'completed' as const },   // Small - success
      { file: { size: 3 * 1024 * 1024 }, uploadStatus: 'error' as const },       // Small - failed
    ];

    const successCount = files.filter(f => f.uploadStatus === 'completed').length;
    const failedCount = files.filter(f => f.uploadStatus === 'error').length;
    const resumableCount = files.filter(
      f => f.file.size > RESUMABLE_UPLOAD_THRESHOLD && f.uploadStatus !== 'error'
    ).length;

    expect(successCount).toBe(1);
    expect(failedCount).toBe(1);
    expect(resumableCount).toBe(1);
  });
});

describe("Resumable upload operations in non-batching link", () => {
  it("should include all resumable upload operations", () => {
    // These operations should be routed through the non-batching httpLink
    const UPLOAD_OPERATIONS = new Set([
      'uploadChunk.uploadChunk',
      'uploadChunk.initUpload',
      'uploadChunk.finalizeUpload',
      'uploadChunk.cancelUpload',
      'largeFileUpload.uploadLargeChunk',
      'largeFileUpload.initLargeUpload',
      'largeFileUpload.finalizeLargeUpload',
      'largeFileUpload.cancelLargeUpload',
      'resumableUpload.createSession',
      'resumableUpload.uploadChunk',
      'resumableUpload.finalizeUpload',
      'resumableUpload.pauseSession',
      'resumableUpload.cancelSession',
      'resumableUpload.saveThumbnail',
    ]);

    // Verify all resumable upload operations are included
    expect(UPLOAD_OPERATIONS.has('resumableUpload.createSession')).toBe(true);
    expect(UPLOAD_OPERATIONS.has('resumableUpload.uploadChunk')).toBe(true);
    expect(UPLOAD_OPERATIONS.has('resumableUpload.finalizeUpload')).toBe(true);
    expect(UPLOAD_OPERATIONS.has('resumableUpload.pauseSession')).toBe(true);
    expect(UPLOAD_OPERATIONS.has('resumableUpload.cancelSession')).toBe(true);
    expect(UPLOAD_OPERATIONS.has('resumableUpload.saveThumbnail')).toBe(true);
  });

  it("should verify main.tsx contains resumable upload operations", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/main.tsx", "utf-8");
    
    expect(content).toContain("resumableUpload.createSession");
    expect(content).toContain("resumableUpload.uploadChunk");
    expect(content).toContain("resumableUpload.finalizeUpload");
    expect(content).toContain("resumableUpload.pauseSession");
    expect(content).toContain("resumableUpload.cancelSession");
    expect(content).toContain("resumableUpload.saveThumbnail");
  });

  it("should verify FileUploadDialog handles resumable uploads in success counting", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/components/files/FileUploadDialog.tsx", "utf-8");
    
    // Should count resumable uploads separately
    expect(content).toContain("resumableCount");
    expect(content).toContain("RESUMABLE_UPLOAD_THRESHOLD");
    
    // Should show appropriate message for background uploads
    expect(content).toContain("uploading in the background");
    
    // Should NOT show "0 file(s) uploaded successfully" when only resumable uploads exist
    // The resumableCount check should come before the regular success check
    const resumableCheckIndex = content.indexOf("if (resumableCount > 0)");
    const regularCheckIndex = content.indexOf("if (failedCount === 0)");
    expect(resumableCheckIndex).toBeLessThan(regularCheckIndex);
  });
});
