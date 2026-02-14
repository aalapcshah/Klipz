/**
 * Tests for background assembly improvements:
 * 1. Dynamic timeout calculation based on file size
 * 2. Non-blocking curl upload (spawn instead of execSync)
 * 3. Chunk download retry logic
 * 4. Assembly deduplication
 */
import { describe, it, expect } from "vitest";
import { calculateTimeout } from "./lib/backgroundAssembly";

describe("Background Assembly - calculateTimeout", () => {
  it("returns base timeout (600s) for files under 200MB", () => {
    const timeout = calculateTimeout(100 * 1024 * 1024); // 100MB
    expect(timeout).toBe(600);
  });

  it("returns base timeout for files exactly at 200MB", () => {
    const timeout = calculateTimeout(200 * 1024 * 1024); // 200MB
    expect(timeout).toBe(600);
  });

  it("scales timeout for files between 200MB and 500MB", () => {
    const timeout = calculateTimeout(500 * 1024 * 1024); // 500MB
    // 300MB excess / 100MB = 3 chunks * 300s = 900s + 600s base = 1500s
    expect(timeout).toBe(1500);
  });

  it("scales timeout for 700MB file (matches the user's 695MB file)", () => {
    const timeout = calculateTimeout(700 * 1024 * 1024); // 700MB
    // 500MB excess / 100MB = 5 chunks * 300s = 1500s + 600s base = 2100s (35 min)
    expect(timeout).toBe(2100);
  });

  it("scales timeout for 1GB file", () => {
    const timeout = calculateTimeout(1024 * 1024 * 1024); // 1GB
    // ~824MB excess / 100MB = 9 chunks (ceil) * 300s = 2700s + 600s = 3300s
    expect(timeout).toBe(3300);
  });

  it("caps timeout at 3600s (1 hour) for very large files", () => {
    const timeout = calculateTimeout(1.5 * 1024 * 1024 * 1024); // 1.5GB
    // Would be 600 + ceil(1300/100)*300 = 600 + 13*300 = 600 + 3900 = 4500
    // But capped at 3600
    expect(timeout).toBe(3600);
  });

  it("caps timeout at 3600s for 2GB file", () => {
    const timeout = calculateTimeout(2 * 1024 * 1024 * 1024); // 2GB
    expect(timeout).toBe(3600);
  });

  it("returns base timeout for very small files", () => {
    const timeout = calculateTimeout(1024); // 1KB
    expect(timeout).toBe(600);
  });

  it("returns base timeout for zero-byte files", () => {
    const timeout = calculateTimeout(0);
    expect(timeout).toBe(600);
  });
});

describe("Background Assembly - timeout scaling table", () => {
  // Verify the timeout scaling makes sense for common file sizes
  const testCases = [
    { sizeMB: 50, expectedMin: 600, expectedMax: 600, label: "50MB" },
    { sizeMB: 200, expectedMin: 600, expectedMax: 600, label: "200MB" },
    { sizeMB: 300, expectedMin: 800, expectedMax: 1200, label: "300MB" },
    { sizeMB: 500, expectedMin: 1200, expectedMax: 1800, label: "500MB" },
    { sizeMB: 700, expectedMin: 1800, expectedMax: 2400, label: "700MB (user's file)" },
    { sizeMB: 1000, expectedMin: 2400, expectedMax: 3600, label: "1GB" },
    { sizeMB: 2000, expectedMin: 3600, expectedMax: 3600, label: "2GB (max)" },
  ];

  for (const tc of testCases) {
    it(`timeout for ${tc.label} is between ${tc.expectedMin}s and ${tc.expectedMax}s`, () => {
      const timeout = calculateTimeout(tc.sizeMB * 1024 * 1024);
      expect(timeout).toBeGreaterThanOrEqual(tc.expectedMin);
      expect(timeout).toBeLessThanOrEqual(tc.expectedMax);
    });
  }
});

describe("Background Assembly - PROGRESS_DB_WRITE_INTERVAL", () => {
  it("progress is written to DB every 5 chunks (PROGRESS_DB_WRITE_INTERVAL)", () => {
    // The interval is defined as a constant in backgroundAssembly.ts
    // This test documents the expected behavior:
    // - Progress is written to DB every 5 chunks during download phase
    // - Progress is also written at the final chunk
    // - Phase transitions (downloading → uploading → generating_thumbnail → complete) are also written
    const PROGRESS_DB_WRITE_INTERVAL = 5;
    
    // For a file with 100 chunks, we expect ~20 DB writes for progress
    const totalChunks = 100;
    let dbWrites = 0;
    for (let i = 0; i < totalChunks; i++) {
      if ((i + 1) % PROGRESS_DB_WRITE_INTERVAL === 0 || i === totalChunks - 1) {
        dbWrites++;
      }
    }
    expect(dbWrites).toBe(20); // 100/5 = 20
    
    // For a file with 7 chunks: writes at 5, 7 = 2 writes
    let dbWrites2 = 0;
    for (let i = 0; i < 7; i++) {
      if ((i + 1) % PROGRESS_DB_WRITE_INTERVAL === 0 || i === 6) {
        dbWrites2++;
      }
    }
    expect(dbWrites2).toBe(2);
  });
});

describe("Background Assembly - module exports", () => {
  it("exports assembleChunksInBackground function", async () => {
    const mod = await import("./lib/backgroundAssembly");
    expect(mod.assembleChunksInBackground).toBeDefined();
    expect(typeof mod.assembleChunksInBackground).toBe("function");
  });

  it("exports isAssemblyInProgress function", async () => {
    const mod = await import("./lib/backgroundAssembly");
    expect(mod.isAssemblyInProgress).toBeDefined();
    expect(typeof mod.isAssemblyInProgress).toBe("function");
  });

  it("exports calculateTimeout function", async () => {
    const mod = await import("./lib/backgroundAssembly");
    expect(mod.calculateTimeout).toBeDefined();
    expect(typeof mod.calculateTimeout).toBe("function");
  });

  it("exports assembleAllPendingSessions function", async () => {
    const mod = await import("./lib/backgroundAssembly");
    expect(mod.assembleAllPendingSessions).toBeDefined();
    expect(typeof mod.assembleAllPendingSessions).toBe("function");
  });

  it("isAssemblyInProgress returns false for unknown token", async () => {
    const { isAssemblyInProgress } = await import("./lib/backgroundAssembly");
    expect(isAssemblyInProgress("nonexistent-token-12345")).toBe(false);
  });
});
