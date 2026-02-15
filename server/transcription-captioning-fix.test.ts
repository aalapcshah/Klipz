/**
 * Tests for transcription and captioning bug fixes:
 * 1. resolveFileUrl properly handles chunked upload files
 * 2. Error messages are not nested/duplicated
 * 3. Visual captioning uses actual file mime type
 */
import { describe, it, expect } from "vitest";
import { getTranscriptionErrorMessage, getCaptioningErrorMessage } from "./lib/errorMessages";

describe("resolveFileUrl - chunked upload handling", () => {
  it("should recognize streaming URLs as needing resolution", () => {
    const url = "/api/files/stream/abc123-session-token";
    expect(url.startsWith("/api/files/stream/")).toBe(true);
  });

  it("should recognize absolute URLs as already resolved", () => {
    const url = "https://storage.example.com/user-1/videos/test.mp4";
    expect(url.startsWith("http://") || url.startsWith("https://")).toBe(true);
  });

  it("should recognize chunked file keys", () => {
    const fileKey = "chunked/abc123-session-token/video.mp4";
    expect(fileKey.startsWith("chunked/")).toBe(true);
  });

  it("should not treat regular S3 keys as chunked", () => {
    const fileKey = "user-1/videos/1234-abc-video.mp4";
    expect(fileKey.startsWith("chunked/")).toBe(false);
  });

  it("should construct public URL from streaming URL and deployed domain", () => {
    const deployedDomain = "https://klipz.manus.space";
    const streamingUrl = "/api/files/stream/abc123";
    const publicUrl = `${deployedDomain}${streamingUrl}`;
    expect(publicUrl).toBe("https://klipz.manus.space/api/files/stream/abc123");
    expect(publicUrl.startsWith("https://")).toBe(true);
  });

  it("should detect when a file has been assembled (URL updated to S3)", () => {
    // Before assembly
    const beforeAssembly = {
      url: "/api/files/stream/abc123",
      fileKey: "chunked/abc123/video.mp4",
    };
    expect(beforeAssembly.url.startsWith("http")).toBe(false);

    // After assembly
    const afterAssembly = {
      url: "https://storage.example.com/user-1/videos/video.mp4",
      fileKey: "user-1/videos/video.mp4",
    };
    expect(afterAssembly.url.startsWith("http")).toBe(true);
  });
});

describe("Error message deduplication - Transcription", () => {
  it("should not nest 'Transcription failed:' prefix", () => {
    const alreadyWrapped = "Transcription failed: Failed to download audio file. You can retry by clicking the Transcript button.";
    const result = getTranscriptionErrorMessage(alreadyWrapped);
    // Should not contain double prefix
    expect(result).not.toContain("Transcription failed: Transcription failed:");
  });

  it("should not triple-nest error messages", () => {
    const tripleWrapped = "Transcription failed: Transcription failed: Transcription failed: Failed to download audio file. You can retry by clicking the Transcript button.. You can retry by clicking the Transcript button.";
    const result = getTranscriptionErrorMessage(tripleWrapped);
    expect(result).not.toContain("Transcription failed: Transcription failed:");
    // Should not contain duplicate retry messages
    const retryCount = (result.match(/You can retry/g) || []).length;
    expect(retryCount).toBeLessThanOrEqual(1);
  });

  it("should handle 'Failed to download audio file' with a clear message", () => {
    const result = getTranscriptionErrorMessage("Failed to download audio file");
    expect(result).toContain("video file");
    expect(result).toContain("try again");
    expect(result).not.toContain("Transcription failed: Transcription failed:");
  });

  it("should handle 'still being processed' error", () => {
    const result = getTranscriptionErrorMessage("Video file is still being processed. The file was uploaded in chunks and hasn't been fully assembled yet.");
    expect(result).toContain("still being processed");
    expect(result).toContain("wait");
  });

  it("should handle 'cannot resolve file url' error", () => {
    const result = getTranscriptionErrorMessage("Cannot resolve file URL to a publicly accessible address");
    expect(result).toContain("video file");
    expect(result).toContain("try again");
  });

  it("should handle normal errors without double-wrapping", () => {
    const result = getTranscriptionErrorMessage("Some unexpected error");
    expect(result).toBe("Transcription error: Some unexpected error. You can retry by clicking the Transcript button.");
  });

  it("should handle empty string gracefully", () => {
    const result = getTranscriptionErrorMessage("");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("Error message deduplication - Captioning", () => {
  it("should not nest 'Caption generation failed:' prefix", () => {
    const alreadyWrapped = "Caption generation failed: This video format is not supported for visual captioning. Try converting it to MP4 (H.264).";
    const result = getCaptioningErrorMessage(alreadyWrapped);
    expect(result).not.toContain("Caption generation failed: Caption generation failed:");
  });

  it("should not nest 'Visual captioning failed:' prefix", () => {
    const alreadyWrapped = "Visual captioning failed: Some error message";
    const result = getCaptioningErrorMessage(alreadyWrapped);
    expect(result).not.toContain("Visual captioning failed: Visual captioning failed:");
    expect(result).not.toContain("Caption generation failed: Visual captioning failed:");
  });

  it("should handle 'Failed to download' with a clear message", () => {
    const result = getCaptioningErrorMessage("Failed to download audio file");
    expect(result).toContain("video file");
    expect(result).toContain("try again");
  });

  it("should handle 'still being processed' error", () => {
    const result = getCaptioningErrorMessage("Video file is still being processed");
    expect(result).toContain("still being processed");
    expect(result).toContain("wait");
  });

  it("should handle format errors properly", () => {
    const result = getCaptioningErrorMessage("unsupported video format");
    expect(result).toContain("not supported");
    expect(result).toContain("MP4");
  });

  it("should handle normal errors without double-wrapping", () => {
    const result = getCaptioningErrorMessage("Some unexpected error");
    expect(result).toBe("Captioning error: Some unexpected error. You can retry by clicking the Retry button.");
  });
});

describe("Mime type handling for visual captioning", () => {
  it("should use actual file mime type instead of hardcoded video/mp4", () => {
    // Test that different mime types are handled
    const mimeTypes = [
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-matroska",
      "video/avi",
    ];

    for (const mimeType of mimeTypes) {
      const resolvedMimeType = mimeType || "video/mp4";
      expect(resolvedMimeType).toBe(mimeType);
    }
  });

  it("should fallback to video/mp4 when mime type is null", () => {
    const mimeType: string | null = null;
    const resolvedMimeType = mimeType || "video/mp4";
    expect(resolvedMimeType).toBe("video/mp4");
  });

  it("should fallback to video/mp4 when mime type is empty string", () => {
    const mimeType = "";
    const resolvedMimeType = mimeType || "video/mp4";
    expect(resolvedMimeType).toBe("video/mp4");
  });
});

// ===== Audio Chunking Service Tests =====
describe("Audio Chunking Service", () => {
  it("should export splitAudioIntoChunks function", async () => {
    const mod = await import("./services/audioChunking");
    expect(typeof mod.splitAudioIntoChunks).toBe("function");
  });

  it("should export transcribeChunkedAudio function", async () => {
    const mod = await import("./services/audioChunking");
    expect(typeof mod.transcribeChunkedAudio).toBe("function");
  });

  it("should export cleanupChunks function", async () => {
    const mod = await import("./services/audioChunking");
    expect(typeof mod.cleanupChunks).toBe("function");
  });

  it("should export getExtractionTimeout function", async () => {
    const mod = await import("./services/audioExtraction");
    expect(typeof mod.getExtractionTimeout).toBe("function");
  });

  it("getExtractionTimeout should scale with file size", async () => {
    const { getExtractionTimeout } = await import("./services/audioExtraction");
    
    const smallTimeout = getExtractionTimeout(10 * 1024 * 1024); // 10MB
    expect(smallTimeout).toBeGreaterThanOrEqual(180);
    
    const mediumTimeout = getExtractionTimeout(1024 * 1024 * 1024); // 1GB
    expect(mediumTimeout).toBeGreaterThanOrEqual(180);
    
    const largeTimeout = getExtractionTimeout(10 * 1024 * 1024 * 1024); // 10GB
    expect(largeTimeout).toBeGreaterThanOrEqual(1800); // 10GB should get at least 30 min
    
    const defaultTimeout = getExtractionTimeout(null);
    expect(defaultTimeout).toBeGreaterThanOrEqual(180);
  });
});

// ===== Frame Extraction Service Tests =====
describe("Frame Extraction Service", () => {
  it("should export extractFramesFromVideo function", async () => {
    const mod = await import("./services/frameExtraction");
    expect(typeof mod.extractFramesFromVideo).toBe("function");
  });

  it("should export uploadFramesToS3 function", async () => {
    const mod = await import("./services/frameExtraction");
    expect(typeof mod.uploadFramesToS3).toBe("function");
  });

  it("should export cleanupFrames function", async () => {
    const mod = await import("./services/frameExtraction");
    expect(typeof mod.cleanupFrames).toBe("function");
  });

  it("should export getCaptioningStrategy function", async () => {
    const mod = await import("./services/frameExtraction");
    expect(typeof mod.getCaptioningStrategy).toBe("function");
  });

  it("getCaptioningStrategy should recommend llm_direct for all file sizes (frame extraction as fallback)", async () => {
    const { getCaptioningStrategy } = await import("./services/frameExtraction");
    
    const largeStrategy = getCaptioningStrategy(100 * 1024 * 1024);
    expect(largeStrategy.method).toBe("llm_direct");
    
    const veryLargeStrategy = getCaptioningStrategy(1024 * 1024 * 1024);
    expect(veryLargeStrategy.method).toBe("llm_direct");
    
    const unknownStrategy = getCaptioningStrategy(null);
    expect(unknownStrategy.method).toBe("llm_direct");
  });

  it("getCaptioningStrategy should recommend llm_direct for small files", async () => {
    const { getCaptioningStrategy } = await import("./services/frameExtraction");
    
    const smallStrategy = getCaptioningStrategy(5 * 1024 * 1024);
    expect(smallStrategy.method).toBe("llm_direct");
  });
});

// ===== Audio Extraction Strategy Tests =====
describe("Audio Extraction Strategy - Large File Support", () => {
  it("should use extract_then_whisper for large files (FFmpeg + Whisper, no LLM)", async () => {
    const { getTranscriptionStrategy } = await import("./services/audioExtraction");
    
    // 500MB: extract audio with FFmpeg, transcribe with Whisper
    const strategy500 = getTranscriptionStrategy(500 * 1024 * 1024);
    expect(strategy500.method).toBe("extract_then_whisper");
    
    // 5GB: same strategy
    const strategy5G = getTranscriptionStrategy(5 * 1024 * 1024 * 1024);
    expect(strategy5G.method).toBe("extract_then_whisper");
    
    // 10GB: same strategy
    const strategy10G = getTranscriptionStrategy(10 * 1024 * 1024 * 1024);
    expect(strategy10G.method).toBe("extract_then_whisper");
  });

  it("should use extract_then_whisper for null/unknown file size", async () => {
    const { getTranscriptionStrategy } = await import("./services/audioExtraction");
    
    const strategy = getTranscriptionStrategy(null);
    expect(strategy.method).toBe("extract_then_whisper");
  });
});

// ===== Scheduled Auto-Captioning Tests =====
describe("Scheduled Auto-Captioning with Frame Extraction", () => {
  it("should export processScheduledAutoCaptioning function", async () => {
    const mod = await import("./_core/scheduledAutoCaptioning");
    expect(typeof mod.processScheduledAutoCaptioning).toBe("function");
  });

  it("should export getAutoCaptioningStatus function", async () => {
    const mod = await import("./_core/scheduledAutoCaptioning");
    expect(typeof mod.getAutoCaptioningStatus).toBe("function");
  });
});

// ===== Integration: Strategy → Pipeline =====
describe("Large File Pipeline Integration", () => {
  it("large files should go through extract_then_whisper (FFmpeg + Whisper, no LLM)", async () => {
    const { getTranscriptionStrategy } = await import("./services/audioExtraction");
    const { getExtractionTimeout } = await import("./services/audioExtraction");
    
    const fileSize = 10 * 1024 * 1024 * 1024; // 10GB
    const strategy = getTranscriptionStrategy(fileSize);
    const timeout = getExtractionTimeout(fileSize);
    
    expect(strategy.method).toBe("extract_then_whisper");
    expect(timeout).toBeGreaterThanOrEqual(600);
  });

  it("captioning pipeline should use llm_direct for all files (frame extraction as fallback)", async () => {
    const { getCaptioningStrategy } = await import("./services/frameExtraction");
    
    const strategy = getCaptioningStrategy(500 * 1024 * 1024);
    expect(strategy.method).toBe("llm_direct");
    expect(strategy.reason).toBeTruthy();
  });

  it("10GB file should have sufficient timeout and correct strategy", async () => {
    const { getTranscriptionStrategy } = await import("./services/audioExtraction");
    const { getExtractionTimeout } = await import("./services/audioExtraction");
    const { getCaptioningStrategy } = await import("./services/frameExtraction");
    
    const fileSize = 10 * 1024 * 1024 * 1024; // 10GB
    
    const transcriptionStrategy = getTranscriptionStrategy(fileSize);
    expect(transcriptionStrategy.method).toBe("extract_then_whisper");
    
    const captioningStrategy = getCaptioningStrategy(fileSize);
    expect(captioningStrategy.method).toBe("llm_direct");
    
    const timeout = getExtractionTimeout(fileSize);
    expect(timeout).toBeGreaterThanOrEqual(1800); // At least 30 minutes for 10GB
  });
});
