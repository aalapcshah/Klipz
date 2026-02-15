import { describe, it, expect } from "vitest";
import { getTranscriptionStrategy, getExtractionTimeout } from "./services/audioExtraction";

describe("Audio Extraction & Transcription Strategy", () => {
  describe("getTranscriptionStrategy", () => {
    it("should use whisper_direct for files <= 16MB", () => {
      const result = getTranscriptionStrategy(10 * 1024 * 1024); // 10MB
      expect(result.method).toBe("whisper_direct");
      expect(result.reason).toContain("10.0MB");
      expect(result.reason).toContain("≤16MB");
    });

    it("should use whisper_direct for exactly 16MB", () => {
      const result = getTranscriptionStrategy(16 * 1024 * 1024); // 16MB
      expect(result.method).toBe("whisper_direct");
    });

    it("should use llm_then_extract for files >16MB (LLM first, FFmpeg fallback)", () => {
      const result = getTranscriptionStrategy(50 * 1024 * 1024); // 50MB
      expect(result.method).toBe("llm_then_extract");
      expect(result.reason).toContain("50.0MB");
    });

    it("should use llm_then_extract for files just over 16MB", () => {
      const result = getTranscriptionStrategy(17 * 1024 * 1024); // 17MB
      expect(result.method).toBe("llm_then_extract");
    });

    it("should use llm_then_extract for exactly 100MB", () => {
      const result = getTranscriptionStrategy(100 * 1024 * 1024); // 100MB
      expect(result.method).toBe("llm_then_extract");
    });

    it("should use llm_then_extract for files > 100MB", () => {
      const result = getTranscriptionStrategy(200 * 1024 * 1024); // 200MB
      expect(result.method).toBe("llm_then_extract");
      expect(result.reason).toContain(">16MB");
    });

    it("should use llm_then_extract for the 295MB test video", () => {
      const result = getTranscriptionStrategy(309186340); // 294.86MB
      expect(result.method).toBe("llm_then_extract");
      expect(result.reason).toContain("294.9MB");
    });

    it("should use llm_then_extract for null file size (unknown)", () => {
      const result = getTranscriptionStrategy(null);
      expect(result.method).toBe("llm_then_extract");
      expect(result.reason).toContain("unknown");
    });

    it("should use llm_then_extract for zero file size (unknown)", () => {
      const result = getTranscriptionStrategy(0);
      expect(result.method).toBe("llm_then_extract");
      expect(result.reason).toContain("unknown");
    });

    it("should use whisper_direct for very small files", () => {
      const result = getTranscriptionStrategy(1024); // 1KB
      expect(result.method).toBe("whisper_direct");
    });

    it("should use llm_then_extract for very large files (1GB+)", () => {
      const result = getTranscriptionStrategy(1024 * 1024 * 1024); // 1GB
      expect(result.method).toBe("llm_then_extract");
    });

    it("should use llm_then_extract for 10GB files", () => {
      const result = getTranscriptionStrategy(10 * 1024 * 1024 * 1024); // 10GB
      expect(result.method).toBe("llm_then_extract");
    });
  });

  describe("Transcription phase tracking", () => {
    const phases = [
      "extracting_audio",
      "uploading_audio",
      "transcribing_whisper",
      "transcribing_llm",
      "processing_results",
      "completed",
    ];

    it("should have valid phase names", () => {
      phases.forEach((phase) => {
        expect(phase).toMatch(/^[a-z_]+$/);
      });
    });

    it("should have correct phase order for extract_then_whisper fallback", () => {
      const expectedOrder = [
        "extracting_audio",
        "uploading_audio",
        "transcribing_whisper",
        "processing_results",
        "completed",
      ];
      for (let i = 1; i < expectedOrder.length; i++) {
        const prevIdx = phases.indexOf(expectedOrder[i - 1]);
        const currIdx = phases.indexOf(expectedOrder[i]);
        expect(currIdx).toBeGreaterThan(prevIdx);
      }
    });

    it("should have correct phase order for whisper_direct", () => {
      const expectedOrder = [
        "transcribing_whisper",
        "processing_results",
        "completed",
      ];
      for (let i = 1; i < expectedOrder.length; i++) {
        const prevIdx = phases.indexOf(expectedOrder[i - 1]);
        const currIdx = phases.indexOf(expectedOrder[i]);
        expect(currIdx).toBeGreaterThan(prevIdx);
      }
    });

    it("should have correct phase order for llm_then_extract (LLM path)", () => {
      const expectedOrder = [
        "transcribing_llm",
        "processing_results",
        "completed",
      ];
      for (let i = 1; i < expectedOrder.length; i++) {
        const prevIdx = phases.indexOf(expectedOrder[i - 1]);
        const currIdx = phases.indexOf(expectedOrder[i]);
        expect(currIdx).toBeGreaterThan(prevIdx);
      }
    });
  });

  describe("Transcription method types", () => {
    const validMethods = ["whisper", "llm", "whisper_extracted"];

    it("should have valid method names", () => {
      validMethods.forEach((method) => {
        expect(method).toMatch(/^[a-z_]+$/);
        expect(method.length).toBeLessThanOrEqual(20); // matches varchar(20) in schema
      });
    });

    it("whisper method should be for small files", () => {
      const strategy = getTranscriptionStrategy(5 * 1024 * 1024); // 5MB
      expect(strategy.method).toBe("whisper_direct");
    });

    it("llm_then_extract should be for medium files (LLM first, FFmpeg fallback)", () => {
      const strategy = getTranscriptionStrategy(50 * 1024 * 1024); // 50MB
      expect(strategy.method).toBe("llm_then_extract");
    });

    it("llm_then_extract should be used for large files too", () => {
      const strategy = getTranscriptionStrategy(200 * 1024 * 1024); // 200MB
      expect(strategy.method).toBe("llm_then_extract");
    });
  });

  describe("Phase display messages", () => {
    const phaseMessages: Record<string, { label: string; hasEstimate: boolean }> = {
      extracting_audio: { label: "Extracting audio", hasEstimate: true },
      uploading_audio: { label: "Uploading", hasEstimate: true },
      transcribing_whisper: { label: "Whisper", hasEstimate: true },
      transcribing_llm: { label: "AI vision", hasEstimate: true },
      processing_results: { label: "Processing", hasEstimate: true },
    };

    it("should have messages for all phases", () => {
      Object.keys(phaseMessages).forEach((phase) => {
        expect(phaseMessages[phase]).toBeDefined();
        expect(phaseMessages[phase].label.length).toBeGreaterThan(0);
      });
    });

    it("should have estimates for all phases", () => {
      Object.keys(phaseMessages).forEach((phase) => {
        expect(phaseMessages[phase].hasEstimate).toBe(true);
      });
    });
  });

  describe("Audio extraction edge cases", () => {
    it("should handle boundary at exactly 16MB", () => {
      const exactly16MB = 16 * 1024 * 1024;
      const result = getTranscriptionStrategy(exactly16MB);
      expect(result.method).toBe("whisper_direct");
    });

    it("should handle boundary just over 16MB", () => {
      const justOver16MB = 16 * 1024 * 1024 + 1;
      const result = getTranscriptionStrategy(justOver16MB);
      expect(result.method).toBe("llm_then_extract");
    });

    it("should handle boundary at exactly 100MB", () => {
      const exactly100MB = 100 * 1024 * 1024;
      const result = getTranscriptionStrategy(exactly100MB);
      expect(result.method).toBe("llm_then_extract");
    });

    it("should handle boundary just over 100MB", () => {
      const justOver100MB = 100 * 1024 * 1024 + 1;
      const result = getTranscriptionStrategy(justOver100MB);
      expect(result.method).toBe("llm_then_extract");
    });
  });

  describe("getExtractionTimeout", () => {
    it("should return default timeout for null", () => {
      expect(getExtractionTimeout(null)).toBe(300);
    });

    it("should return minimum 180s for small files", () => {
      expect(getExtractionTimeout(10 * 1024 * 1024)).toBe(180);
    });

    it("should scale with file size", () => {
      const timeout10GB = getExtractionTimeout(10 * 1024 * 1024 * 1024);
      expect(timeout10GB).toBeGreaterThanOrEqual(1800);
    });

    it("should cap at 3600s", () => {
      const timeout100GB = getExtractionTimeout(100 * 1024 * 1024 * 1024);
      expect(timeout100GB).toBeLessThanOrEqual(3600);
    });
  });
});
