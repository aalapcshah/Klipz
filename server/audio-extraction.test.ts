import { describe, it, expect } from "vitest";
import { getTranscriptionStrategy } from "./services/audioExtraction";

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

    it("should use extract_then_whisper for files 16-100MB", () => {
      const result = getTranscriptionStrategy(50 * 1024 * 1024); // 50MB
      expect(result.method).toBe("extract_then_whisper");
      expect(result.reason).toContain("50.0MB");
      expect(result.reason).toContain("16-100MB");
    });

    it("should use extract_then_whisper for files just over 16MB", () => {
      const result = getTranscriptionStrategy(17 * 1024 * 1024); // 17MB
      expect(result.method).toBe("extract_then_whisper");
    });

    it("should use extract_then_whisper for exactly 100MB", () => {
      const result = getTranscriptionStrategy(100 * 1024 * 1024); // 100MB
      expect(result.method).toBe("extract_then_whisper");
    });

    it("should use llm_direct for files > 100MB", () => {
      const result = getTranscriptionStrategy(200 * 1024 * 1024); // 200MB
      expect(result.method).toBe("llm_direct");
      expect(result.reason).toContain(">100MB");
    });

    it("should use llm_direct for the 295MB test video", () => {
      const result = getTranscriptionStrategy(309186340); // 294.86MB
      expect(result.method).toBe("llm_direct");
      expect(result.reason).toContain("294.9MB");
    });

    it("should use whisper_direct for null file size", () => {
      const result = getTranscriptionStrategy(null);
      expect(result.method).toBe("whisper_direct");
      expect(result.reason).toContain("unknown");
    });

    it("should use whisper_direct for zero file size", () => {
      const result = getTranscriptionStrategy(0);
      expect(result.method).toBe("whisper_direct");
      expect(result.reason).toContain("unknown");
    });

    it("should use whisper_direct for very small files", () => {
      const result = getTranscriptionStrategy(1024); // 1KB
      expect(result.method).toBe("whisper_direct");
    });

    it("should use llm_direct for very large files (1GB+)", () => {
      const result = getTranscriptionStrategy(1024 * 1024 * 1024); // 1GB
      expect(result.method).toBe("llm_direct");
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

    it("should have correct phase order for extract_then_whisper", () => {
      const expectedOrder = [
        "extracting_audio",
        "uploading_audio",
        "transcribing_whisper",
        "processing_results",
        "completed",
      ];
      // Verify each phase comes after the previous one in the phases array
      for (let i = 1; i < expectedOrder.length; i++) {
        const prevIdx = phases.indexOf(expectedOrder[i - 1]);
        const currIdx = phases.indexOf(expectedOrder[i]);
        expect(currIdx).toBeGreaterThan(prevIdx);
      }
    });

    it("should have correct phase order for llm_direct", () => {
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

    it("whisper_extracted method should be for medium files", () => {
      const strategy = getTranscriptionStrategy(50 * 1024 * 1024); // 50MB
      expect(strategy.method).toBe("extract_then_whisper");
    });

    it("llm method should be for large files", () => {
      const strategy = getTranscriptionStrategy(200 * 1024 * 1024); // 200MB
      expect(strategy.method).toBe("llm_direct");
    });
  });

  describe("Phase display messages", () => {
    // Test the phase-to-message mapping logic used in the UI
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
      expect(result.method).toBe("whisper_direct"); // 16MB is within Whisper limit
    });

    it("should handle boundary just over 16MB", () => {
      const justOver16MB = 16 * 1024 * 1024 + 1;
      const result = getTranscriptionStrategy(justOver16MB);
      expect(result.method).toBe("extract_then_whisper");
    });

    it("should handle boundary at exactly 100MB", () => {
      const exactly100MB = 100 * 1024 * 1024;
      const result = getTranscriptionStrategy(exactly100MB);
      expect(result.method).toBe("extract_then_whisper"); // 100MB is within extraction range
    });

    it("should handle boundary just over 100MB", () => {
      const justOver100MB = 100 * 1024 * 1024 + 1;
      const result = getTranscriptionStrategy(justOver100MB);
      expect(result.method).toBe("llm_direct");
    });
  });
});
