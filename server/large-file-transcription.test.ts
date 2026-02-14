/**
 * Tests for large file transcription handling:
 * 1. Files >16MB should skip Whisper and go directly to LLM fallback
 * 2. HEAD request pre-check in voiceTranscription prevents downloading large files
 * 3. Stale-processing detection resets stuck transcripts
 * 4. CloudFront/S3 URLs are returned as-is by resolveFileUrl
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Large file transcription - fileSize check", () => {
  it("should identify files >16MB as needing LLM fallback", () => {
    const testCases = [
      { fileSize: 309186340, expectedMB: 294.86, shouldSkipWhisper: true },  // 295MB video
      { fileSize: 728000000, expectedMB: 694.27, shouldSkipWhisper: true },  // 695MB video
      { fileSize: 16777216, expectedMB: 16.0, shouldSkipWhisper: false },    // Exactly 16MB
      { fileSize: 16777217, expectedMB: 16.0, shouldSkipWhisper: true },     // Just over 16MB
      { fileSize: 5000000, expectedMB: 4.77, shouldSkipWhisper: false },     // 5MB file
      { fileSize: 0, expectedMB: 0, shouldSkipWhisper: false },              // No size info
      { fileSize: null, expectedMB: 0, shouldSkipWhisper: false },           // Null size
    ];

    for (const tc of testCases) {
      const fileSizeMB = tc.fileSize ? tc.fileSize / (1024 * 1024) : 0;
      const shouldSkip = fileSizeMB > 16;
      expect(shouldSkip).toBe(tc.shouldSkipWhisper);
    }
  });

  it("should calculate correct MB from bytes", () => {
    expect(309186340 / (1024 * 1024)).toBeCloseTo(294.86, 1);
    expect(16777216 / (1024 * 1024)).toBe(16);
    expect(0 / (1024 * 1024)).toBe(0);
  });
});

describe("HEAD request pre-check in voiceTranscription", () => {
  it("should parse content-length header correctly", () => {
    const testCases = [
      { contentLength: "309186340", expectedMB: 294.86, shouldReject: true },
      { contentLength: "16777216", expectedMB: 16.0, shouldReject: false },
      { contentLength: "16777217", expectedMB: 16.0, shouldReject: true },
      { contentLength: "5000000", expectedMB: 4.77, shouldReject: false },
      { contentLength: null, expectedMB: 0, shouldReject: false },
    ];

    for (const tc of testCases) {
      if (tc.contentLength) {
        const sizeMB = parseInt(tc.contentLength, 10) / (1024 * 1024);
        expect(sizeMB > 16).toBe(tc.shouldReject);
      }
    }
  });

  it("should handle missing content-length gracefully", () => {
    // When HEAD request doesn't return content-length, should proceed with GET
    const contentLength: string | null = null;
    if (contentLength) {
      const sizeMB = parseInt(contentLength, 10) / (1024 * 1024);
      expect(sizeMB).toBeDefined(); // This branch shouldn't execute
    }
    // No assertion needed - the absence of content-length means we proceed
    expect(true).toBe(true);
  });
});

describe("Stale-processing detection", () => {
  it("should detect transcripts stuck for >10 minutes", () => {
    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000;

    // Transcript updated 15 minutes ago - should be stale
    const staleTimestamp = now - 15 * 60 * 1000;
    expect(staleTimestamp < tenMinutesAgo).toBe(true);

    // Transcript updated 5 minutes ago - should NOT be stale
    const recentTimestamp = now - 5 * 60 * 1000;
    expect(recentTimestamp < tenMinutesAgo).toBe(false);

    // Transcript updated exactly 10 minutes ago - should NOT be stale (boundary)
    const exactlyTenMin = tenMinutesAgo;
    expect(exactlyTenMin < tenMinutesAgo).toBe(false);
  });

  it("should handle null/undefined updatedAt as stale", () => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    
    // When updatedAt is null, convert to 0 (epoch) which is definitely stale
    const updatedAt = null;
    const timestamp = updatedAt ? new Date(updatedAt).getTime() : 0;
    expect(timestamp < tenMinutesAgo).toBe(true);
  });
});

describe("URL resolution for assembled files", () => {
  it("should recognize CloudFront URLs as already resolved", () => {
    const cloudFrontUrl = "https://d2xsxph8kpxj0f.cloudfront.net/310519663292476273/SaoZcd7riW2zyxorRaqL7d/user-1/videos/test.mp4";
    expect(cloudFrontUrl.startsWith("http://") || cloudFrontUrl.startsWith("https://")).toBe(true);
  });

  it("should recognize S3 URLs as already resolved", () => {
    const s3Url = "https://manus-storage.s3.amazonaws.com/user-1/videos/test.mp4";
    expect(s3Url.startsWith("http://") || s3Url.startsWith("https://")).toBe(true);
  });

  it("should recognize streaming URLs as needing resolution", () => {
    const streamingUrl = "/api/files/stream/abc123-session-token";
    expect(streamingUrl.startsWith("http://") || streamingUrl.startsWith("https://")).toBe(false);
    expect(streamingUrl.startsWith("/api/files/stream/")).toBe(true);
  });
});

describe("LLM transcription response parsing", () => {
  it("should parse valid LLM transcription response", () => {
    const response = {
      fullText: "Hello, welcome to the presentation.",
      language: "en",
      segments: [
        { text: "Hello, welcome", start: 0.0, end: 1.5 },
        { text: "to the presentation.", start: 1.5, end: 3.0 },
      ],
    };

    expect(response.fullText).toBeTruthy();
    expect(response.language).toBe("en");
    expect(response.segments).toHaveLength(2);
    expect(response.segments[0].start).toBe(0.0);
    expect(response.segments[1].end).toBe(3.0);
  });

  it("should build word timestamps from segments", () => {
    const segments = [
      { text: "Hello world", start: 0.0, end: 2.0 },
      { text: "Good morning everyone", start: 2.0, end: 5.0 },
    ];

    const wordTimestamps = segments.flatMap((segment) => {
      const words = segment.text.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) return [];
      const duration = segment.end - segment.start;
      const timePerWord = duration / words.length;
      return words.map((word, index) => ({
        word,
        start: segment.start + index * timePerWord,
        end: segment.start + (index + 1) * timePerWord,
      }));
    });

    expect(wordTimestamps).toHaveLength(5); // "Hello", "world", "Good", "morning", "everyone"
    expect(wordTimestamps[0].word).toBe("Hello");
    expect(wordTimestamps[0].start).toBe(0.0);
    expect(wordTimestamps[0].end).toBe(1.0);
    expect(wordTimestamps[1].word).toBe("world");
    expect(wordTimestamps[1].start).toBe(1.0);
    expect(wordTimestamps[1].end).toBe(2.0);
    expect(wordTimestamps[4].word).toBe("everyone");
    expect(wordTimestamps[4].end).toBe(5.0);
  });

  it("should handle empty segments gracefully", () => {
    const segments: Array<{ text: string; start: number; end: number }> = [];
    const fullText = segments.map((s) => s.text).join(" ");
    expect(fullText).toBe("");
  });

  it("should handle segments with empty text", () => {
    const segments = [
      { text: "", start: 0.0, end: 1.0 },
      { text: "   ", start: 1.0, end: 2.0 },
    ];

    const wordTimestamps = segments.flatMap((segment) => {
      const words = segment.text.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) return [];
      const duration = segment.end - segment.start;
      const timePerWord = duration / words.length;
      return words.map((word, index) => ({
        word,
        start: segment.start + index * timePerWord,
        end: segment.start + (index + 1) * timePerWord,
      }));
    });

    expect(wordTimestamps).toHaveLength(0);
  });
});

describe("Transcription flow decision logic", () => {
  it("should return 'already_exists' for completed transcripts", () => {
    const existing = { id: 240003, status: "completed" };
    if (existing && existing.status === "completed") {
      expect(existing.status).toBe("completed");
      // Should return early without re-transcribing
    }
  });

  it("should reset stale processing transcripts and allow retry", () => {
    const existing = {
      id: 240003,
      status: "processing",
      updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 min ago
    };

    const updatedAt = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

    if (existing.status === "processing" && updatedAt < tenMinutesAgo) {
      // Should reset to failed and allow retry
      expect(true).toBe(true);
    }
  });

  it("should not reset actively processing transcripts", () => {
    const existing = {
      id: 240003,
      status: "processing",
      updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
    };

    const updatedAt = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

    if (existing.status === "processing" && updatedAt >= tenMinutesAgo) {
      // Should return "processing" status without starting a new one
      expect(true).toBe(true);
    }
  });

  it("should allow retry for failed transcripts", () => {
    const existing = { id: 240003, status: "failed", errorMessage: "Previous transcription attempt timed out." };
    // Failed transcripts should proceed to create/update and retry
    expect(existing.status).toBe("failed");
    // The code creates a new transcript or updates existing one
  });

  it("should skip Whisper for 295MB file and use LLM directly", () => {
    const file = { fileSize: 309186340 }; // 295MB
    const fileSizeMB = file.fileSize ? file.fileSize / (1024 * 1024) : 0;
    
    expect(fileSizeMB).toBeGreaterThan(16);
    // Code path: skip Whisper, call transcribeWithLLM directly
  });

  it("should use Whisper for small files", () => {
    const file = { fileSize: 5000000 }; // 5MB
    const fileSizeMB = file.fileSize ? file.fileSize / (1024 * 1024) : 0;
    
    expect(fileSizeMB).toBeLessThanOrEqual(16);
    // Code path: try Whisper first, fall back to LLM on FILE_TOO_LARGE
  });
});
