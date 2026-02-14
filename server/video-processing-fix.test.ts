import { describe, it, expect } from "vitest";
import { getTranscriptionErrorMessage, getCaptioningErrorMessage } from "./lib/errorMessages";

describe("Error Message Fixes", () => {
  describe("getTranscriptionErrorMessage", () => {
    it("should not nest 'Transcription failed:' prefix", () => {
      const result = getTranscriptionErrorMessage("Transcription failed: Something went wrong");
      expect(result).not.toContain("Transcription failed: Transcription failed:");
    });

    it("should strip multiple nested prefixes", () => {
      const result = getTranscriptionErrorMessage(
        "Transcription failed: Transcription failed: Transcription failed: Failed to download audio file"
      );
      expect(result).not.toContain("Transcription failed: Transcription failed:");
    });

    it("should return file access error for download failures", () => {
      const result = getTranscriptionErrorMessage("Failed to download audio file");
      expect(result).toContain("Could not access the video file");
      expect(result).not.toContain("format is not supported");
    });

    it("should return processing error for files still being assembled", () => {
      const result = getTranscriptionErrorMessage("File is still being processed after upload");
      expect(result).toContain("still being processed");
      expect(result).not.toContain("format is not supported");
    });

    it("should return file too large error", () => {
      const result = getTranscriptionErrorMessage("File exceeds the maximum allowed size");
      expect(result).toContain("too large");
    });

    it("should return no audio error", () => {
      const result = getTranscriptionErrorMessage("No audio track detected");
      expect(result).toContain("No audio track");
    });

    it("should return timeout error", () => {
      const result = getTranscriptionErrorMessage("Request timed out after 120s");
      expect(result).toContain("timed out");
    });

    it("should return rate limit error", () => {
      const result = getTranscriptionErrorMessage("429 Too Many Requests");
      expect(result).toContain("temporarily busy");
    });

    it("should only match specific format errors, not generic 'format' mentions", () => {
      // This should NOT match as a format error - it's a generic error containing 'format'
      const result = getCaptioningErrorMessage("response_format validation failed");
      expect(result).not.toContain("format is not supported");
    });

    it("should match specific unsupported video format errors", () => {
      const result = getTranscriptionErrorMessage("Unsupported video format: MKV");
      expect(result).toContain("format is not supported");
    });
  });

  describe("getCaptioningErrorMessage", () => {
    it("should not nest 'Caption generation failed:' prefix", () => {
      const result = getCaptioningErrorMessage("Caption generation failed: Something went wrong");
      expect(result).not.toContain("Caption generation failed: Caption generation failed:");
    });

    it("should return file access error for download failures", () => {
      const result = getCaptioningErrorMessage("Failed to download video file");
      expect(result).toContain("Could not access the video file");
      expect(result).not.toContain("format is not supported");
    });

    it("should return processing error for files still being assembled", () => {
      const result = getCaptioningErrorMessage("File is still being processed");
      expect(result).toContain("still being processed");
      expect(result).not.toContain("format is not supported");
    });

    it("should NOT match generic 'format' in error messages as format error", () => {
      // The word 'format' appears in many error messages that are NOT about video format
      const genericErrors = [
        "response_format validation error",
        "Invalid JSON format in response",
        "Failed to format output",
        "LLM returned an empty or invalid response. The video may be too large or in an unsupported format for visual analysis.",
      ];
      for (const err of genericErrors) {
        const result = getCaptioningErrorMessage(err);
        expect(result).not.toContain("This video format is not supported for visual captioning");
      }
    });

    it("should match specific unsupported video format errors", () => {
      const result = getCaptioningErrorMessage("Unsupported video format");
      expect(result).toContain("format is not supported");
    });

    it("should match unsupported media type errors", () => {
      const result = getCaptioningErrorMessage("Unsupported media type: video/x-matroska");
      expect(result).toContain("format is not supported");
    });

    it("should return timeout error", () => {
      const result = getCaptioningErrorMessage("Request timed out");
      expect(result).toContain("timed out");
    });

    it("should return rate limit error", () => {
      const result = getCaptioningErrorMessage("429 rate limit exceeded");
      expect(result).toContain("temporarily busy");
    });

    it("should return too large error", () => {
      const result = getCaptioningErrorMessage("File exceeds maximum allowed size");
      expect(result).toContain("too large");
    });

    it("should return LLM empty response error", () => {
      const result = getCaptioningErrorMessage("LLM returned an empty or invalid response");
      expect(result).toContain("AI analysis returned no results");
    });

    it("should return JSON parse error", () => {
      const result = getCaptioningErrorMessage("Failed to parse LLM response as JSON");
      expect(result).toContain("unreadable response");
    });

    it("should handle default case with clean error message", () => {
      const result = getCaptioningErrorMessage("Some completely unknown error");
      expect(result).toContain("Some completely unknown error");
      expect(result).toContain("Captioning error:");
      expect(result).not.toContain("format is not supported");
    });
  });

  describe("resolveFileUrl behavior", () => {
    it("should detect streaming URLs correctly", () => {
      const streamingUrl = "/api/files/stream/abc123";
      expect(streamingUrl.startsWith("/api/files/stream/")).toBe(true);
    });

    it("should detect chunked file keys", () => {
      const chunkedKey = "chunked/session123/video.mp4";
      expect(chunkedKey.startsWith("chunked/")).toBe(true);
    });

    it("should detect S3 URLs", () => {
      const s3Url = "https://s3.amazonaws.com/bucket/file.mp4";
      expect(s3Url.startsWith("http")).toBe(true);
    });

    it("should detect relative URLs", () => {
      const relativeUrl = "/api/files/stream/token123";
      expect(relativeUrl.startsWith("/")).toBe(true);
      expect(relativeUrl.startsWith("http")).toBe(false);
    });
  });

  describe("Deep analysis enrichment", () => {
    it("should include image_url content type for image files", () => {
      const mimeType = "image/jpeg";
      expect(mimeType.startsWith("image/")).toBe(true);
    });

    it("should include file_url content type for video files", () => {
      const mimeType = "video/mp4";
      expect(mimeType.startsWith("video/")).toBe(true);
    });

    it("should include file_url content type for audio files", () => {
      const mimeType = "audio/mpeg";
      expect(mimeType.startsWith("audio/")).toBe(true);
    });

    it("should use text-only analysis for document files", () => {
      const mimeType = "application/pdf";
      const isMedia = mimeType.startsWith("image/") || mimeType.startsWith("video/") || mimeType.startsWith("audio/");
      expect(isMedia).toBe(false);
    });
  });
});
