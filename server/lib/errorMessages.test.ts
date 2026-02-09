import { describe, it, expect } from "vitest";
import { getTranscriptionErrorMessage, getCaptioningErrorMessage } from "./errorMessages";

describe("getTranscriptionErrorMessage", () => {
  it("returns format-specific message for unsupported codec", () => {
    const msg = getTranscriptionErrorMessage("Unsupported codec detected");
    expect(msg).toContain("MP4");
    expect(msg).toContain("not supported");
  });

  it("returns format-specific message for format errors", () => {
    const msg = getTranscriptionErrorMessage("Invalid format: webm");
    expect(msg).toContain("not supported");
  });

  it("returns size message for FILE_TOO_LARGE error code", () => {
    const msg = getTranscriptionErrorMessage("File exceeds limit", "FILE_TOO_LARGE");
    expect(msg).toContain("too large");
  });

  it("returns no-audio message", () => {
    const msg = getTranscriptionErrorMessage("No audio track found in file");
    expect(msg).toContain("No audio track");
  });

  it("returns timeout message for connection errors", () => {
    const msg = getTranscriptionErrorMessage("Request timed out after 30s");
    expect(msg).toContain("timed out");
    expect(msg).toContain("try again");
  });

  it("returns rate limit message", () => {
    const msg = getTranscriptionErrorMessage("429 Too Many Requests");
    expect(msg).toContain("busy");
    expect(msg).toContain("wait");
  });

  it("returns LLM-specific message for parse errors", () => {
    const msg = getTranscriptionErrorMessage("Failed to parse JSON response");
    expect(msg).toContain("AI analysis");
  });

  it("returns LLM-specific message for empty response", () => {
    const msg = getTranscriptionErrorMessage("LLM returned an empty or invalid response");
    expect(msg).toContain("AI analysis");
  });

  it("returns server error message for 500", () => {
    const msg = getTranscriptionErrorMessage("Internal Server Error");
    expect(msg).toContain("unexpected server error");
  });

  it("returns default message with original error for unknown errors", () => {
    const msg = getTranscriptionErrorMessage("Something completely unexpected happened");
    expect(msg).toContain("Transcription failed");
    expect(msg).toContain("Something completely unexpected happened");
    expect(msg).toContain("retry");
  });
});

describe("getCaptioningErrorMessage", () => {
  it("returns format-specific message for unsupported format", () => {
    const msg = getCaptioningErrorMessage("Unsupported video format");
    expect(msg).toContain("not supported");
    expect(msg).toContain("MP4");
  });

  it("returns size message for large files", () => {
    const msg = getCaptioningErrorMessage("File too large for processing");
    expect(msg).toContain("too large");
  });

  it("returns LLM response message for empty responses", () => {
    const msg = getCaptioningErrorMessage("LLM returned an empty or invalid response");
    expect(msg).toContain("no results");
  });

  it("returns parse error message", () => {
    const msg = getCaptioningErrorMessage("Failed to parse LLM response as JSON");
    expect(msg).toContain("unreadable response");
  });

  it("returns timeout message", () => {
    const msg = getCaptioningErrorMessage("Request timed out");
    expect(msg).toContain("timed out");
  });

  it("returns rate limit message", () => {
    const msg = getCaptioningErrorMessage("429 rate limit exceeded");
    expect(msg).toContain("busy");
  });

  it("returns default message with original error for unknown errors", () => {
    const msg = getCaptioningErrorMessage("Unknown error occurred");
    expect(msg).toContain("Visual captioning failed");
    expect(msg).toContain("Unknown error occurred");
    expect(msg).toContain("retry");
  });
});
