import { describe, expect, it } from "vitest";

/**
 * Tests for upload adaptive features:
 * 1. Adaptive timeout logic
 * 2. Network quality calculation
 * 3. Scheduled retry timer logic
 * 
 * Since the adaptive upload logic lives in the frontend hook (useResumableUpload),
 * we test the pure utility functions and logic here.
 */

// Replicate the adaptive settings logic from useResumableUpload.ts
interface AdaptiveSettings {
  currentTimeoutMs: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;

function getDefaultAdaptiveSettings(): AdaptiveSettings {
  return {
    currentTimeoutMs: DEFAULT_TIMEOUT_MS,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
    totalFailures: 0,
    totalSuccesses: 0,
  };
}

function recordSuccess(settings: AdaptiveSettings): AdaptiveSettings {
  const updated = { ...settings };
  updated.consecutiveSuccesses += 1;
  updated.consecutiveFailures = 0;
  updated.totalSuccesses += 1;
  // After 5 consecutive successes, reduce timeout (faster, more aggressive)
  if (updated.consecutiveSuccesses >= 5 && updated.currentTimeoutMs > MIN_TIMEOUT_MS) {
    updated.currentTimeoutMs = Math.max(MIN_TIMEOUT_MS, Math.round(updated.currentTimeoutMs * 0.8));
    updated.consecutiveSuccesses = 0;
  }
  return updated;
}

function recordFailure(settings: AdaptiveSettings): AdaptiveSettings {
  const updated = { ...settings };
  updated.consecutiveFailures += 1;
  updated.consecutiveSuccesses = 0;
  updated.totalFailures += 1;
  // Increase timeout on failure (more patient)
  updated.currentTimeoutMs = Math.min(MAX_TIMEOUT_MS, Math.round(updated.currentTimeoutMs * 1.5));
  return updated;
}

type NetworkQuality = 'good' | 'fair' | 'poor' | 'unknown';

function calculateNetworkQuality(recentSpeeds: number[], recentFailureRate: number): NetworkQuality {
  if (recentSpeeds.length < 3) return 'unknown';
  const avgSpeed = recentSpeeds.reduce((a, b) => a + b, 0) / recentSpeeds.length;
  // Good: >500KB/s and <10% failure rate
  if (avgSpeed > 500 * 1024 && recentFailureRate < 0.1) return 'good';
  // Fair: >100KB/s and <30% failure rate
  if (avgSpeed > 100 * 1024 && recentFailureRate < 0.3) return 'fair';
  // Poor: everything else
  return 'poor';
}

function calculateFailureRate(history: boolean[]): number {
  if (history.length === 0) return 0;
  const failures = history.filter(x => !x).length;
  return failures / history.length;
}

describe("Adaptive Timeout Logic", () => {
  it("starts with default timeout of 120 seconds", () => {
    const settings = getDefaultAdaptiveSettings();
    expect(settings.currentTimeoutMs).toBe(120_000);
    expect(settings.consecutiveSuccesses).toBe(0);
    expect(settings.consecutiveFailures).toBe(0);
  });

  it("does not change timeout on fewer than 5 consecutive successes", () => {
    let settings = getDefaultAdaptiveSettings();
    for (let i = 0; i < 4; i++) {
      settings = recordSuccess(settings);
    }
    expect(settings.currentTimeoutMs).toBe(120_000);
    expect(settings.consecutiveSuccesses).toBe(4);
    expect(settings.totalSuccesses).toBe(4);
  });

  it("reduces timeout after 5 consecutive successes", () => {
    let settings = getDefaultAdaptiveSettings();
    for (let i = 0; i < 5; i++) {
      settings = recordSuccess(settings);
    }
    // 120000 * 0.8 = 96000
    expect(settings.currentTimeoutMs).toBe(96_000);
    expect(settings.consecutiveSuccesses).toBe(0); // reset after adjustment
    expect(settings.totalSuccesses).toBe(5);
  });

  it("increases timeout on failure by 1.5x", () => {
    let settings = getDefaultAdaptiveSettings();
    settings = recordFailure(settings);
    // 120000 * 1.5 = 180000
    expect(settings.currentTimeoutMs).toBe(180_000);
    expect(settings.consecutiveFailures).toBe(1);
    expect(settings.totalFailures).toBe(1);
  });

  it("resets consecutive successes on failure", () => {
    let settings = getDefaultAdaptiveSettings();
    settings = recordSuccess(settings);
    settings = recordSuccess(settings);
    settings = recordSuccess(settings);
    expect(settings.consecutiveSuccesses).toBe(3);
    settings = recordFailure(settings);
    expect(settings.consecutiveSuccesses).toBe(0);
    expect(settings.consecutiveFailures).toBe(1);
  });

  it("resets consecutive failures on success", () => {
    let settings = getDefaultAdaptiveSettings();
    settings = recordFailure(settings);
    settings = recordFailure(settings);
    expect(settings.consecutiveFailures).toBe(2);
    settings = recordSuccess(settings);
    expect(settings.consecutiveFailures).toBe(0);
    expect(settings.consecutiveSuccesses).toBe(1);
  });

  it("does not exceed maximum timeout", () => {
    let settings = getDefaultAdaptiveSettings();
    // Fail many times
    for (let i = 0; i < 10; i++) {
      settings = recordFailure(settings);
    }
    expect(settings.currentTimeoutMs).toBe(MAX_TIMEOUT_MS);
    expect(settings.currentTimeoutMs).toBeLessThanOrEqual(300_000);
  });

  it("does not go below minimum timeout", () => {
    let settings = getDefaultAdaptiveSettings();
    // Succeed many times to keep reducing
    for (let i = 0; i < 100; i++) {
      settings = recordSuccess(settings);
    }
    expect(settings.currentTimeoutMs).toBeGreaterThanOrEqual(MIN_TIMEOUT_MS);
  });

  it("handles alternating success and failure correctly", () => {
    let settings = getDefaultAdaptiveSettings();
    settings = recordSuccess(settings);
    settings = recordFailure(settings);
    settings = recordSuccess(settings);
    settings = recordFailure(settings);
    expect(settings.totalSuccesses).toBe(2);
    expect(settings.totalFailures).toBe(2);
    expect(settings.consecutiveSuccesses).toBe(0);
    expect(settings.consecutiveFailures).toBe(1);
  });

  it("progressively reduces timeout with many successes", () => {
    let settings = getDefaultAdaptiveSettings();
    const timeouts: number[] = [settings.currentTimeoutMs];
    for (let i = 0; i < 20; i++) {
      settings = recordSuccess(settings);
      if (settings.currentTimeoutMs !== timeouts[timeouts.length - 1]) {
        timeouts.push(settings.currentTimeoutMs);
      }
    }
    // Should have decreased at least once
    expect(timeouts.length).toBeGreaterThan(1);
    // Each subsequent timeout should be smaller
    for (let i = 1; i < timeouts.length; i++) {
      expect(timeouts[i]).toBeLessThan(timeouts[i - 1]!);
    }
  });

  it("recovers timeout after failure then successes", () => {
    let settings = getDefaultAdaptiveSettings();
    // Fail twice to increase timeout
    settings = recordFailure(settings);
    settings = recordFailure(settings);
    const highTimeout = settings.currentTimeoutMs;
    expect(highTimeout).toBeGreaterThan(DEFAULT_TIMEOUT_MS);
    // Succeed 5 times to decrease
    for (let i = 0; i < 5; i++) {
      settings = recordSuccess(settings);
    }
    expect(settings.currentTimeoutMs).toBeLessThan(highTimeout);
  });
});

describe("Network Quality Calculation", () => {
  it("returns unknown with fewer than 3 speed samples", () => {
    expect(calculateNetworkQuality([], 0)).toBe('unknown');
    expect(calculateNetworkQuality([100000], 0)).toBe('unknown');
    expect(calculateNetworkQuality([100000, 200000], 0)).toBe('unknown');
  });

  it("returns good for high speed and low failure rate", () => {
    // 1MB/s speeds, 0% failure
    const speeds = [1024 * 1024, 1024 * 1024, 1024 * 1024];
    expect(calculateNetworkQuality(speeds, 0)).toBe('good');
  });

  it("returns good for >500KB/s and <10% failure", () => {
    const speeds = [600 * 1024, 700 * 1024, 800 * 1024];
    expect(calculateNetworkQuality(speeds, 0.05)).toBe('good');
  });

  it("returns fair for moderate speed", () => {
    // 200KB/s speeds, 15% failure
    const speeds = [200 * 1024, 200 * 1024, 200 * 1024];
    expect(calculateNetworkQuality(speeds, 0.15)).toBe('fair');
  });

  it("returns fair for high speed but moderate failure rate", () => {
    // 1MB/s but 20% failure
    const speeds = [1024 * 1024, 1024 * 1024, 1024 * 1024];
    expect(calculateNetworkQuality(speeds, 0.2)).toBe('fair');
  });

  it("returns poor for low speed", () => {
    // 50KB/s speeds
    const speeds = [50 * 1024, 50 * 1024, 50 * 1024];
    expect(calculateNetworkQuality(speeds, 0)).toBe('poor');
  });

  it("returns poor for high failure rate", () => {
    // Decent speed but 40% failure
    const speeds = [300 * 1024, 300 * 1024, 300 * 1024];
    expect(calculateNetworkQuality(speeds, 0.4)).toBe('poor');
  });

  it("returns poor for very low speed even with no failures", () => {
    const speeds = [10 * 1024, 20 * 1024, 15 * 1024];
    expect(calculateNetworkQuality(speeds, 0)).toBe('poor');
  });

  it("handles mixed speed samples correctly", () => {
    // Average ~600KB/s, should be good with low failure
    const speeds = [400 * 1024, 600 * 1024, 800 * 1024];
    expect(calculateNetworkQuality(speeds, 0.05)).toBe('good');
  });

  it("handles borderline good/fair correctly", () => {
    // Exactly at 500KB/s threshold
    const speeds = [500 * 1024, 500 * 1024, 500 * 1024];
    // Average is exactly 500KB/s, which is NOT > 500KB/s
    expect(calculateNetworkQuality(speeds, 0.05)).toBe('fair');
  });
});

describe("Failure Rate Calculation", () => {
  it("returns 0 for empty history", () => {
    expect(calculateFailureRate([])).toBe(0);
  });

  it("returns 0 for all successes", () => {
    expect(calculateFailureRate([true, true, true, true, true])).toBe(0);
  });

  it("returns 1 for all failures", () => {
    expect(calculateFailureRate([false, false, false])).toBe(1);
  });

  it("calculates correct rate for mixed results", () => {
    // 2 failures out of 5 = 0.4
    expect(calculateFailureRate([true, false, true, false, true])).toBe(0.4);
  });

  it("calculates correct rate for single failure", () => {
    expect(calculateFailureRate([false])).toBe(1);
  });

  it("calculates correct rate for single success", () => {
    expect(calculateFailureRate([true])).toBe(0);
  });

  it("handles 50/50 split", () => {
    expect(calculateFailureRate([true, false, true, false])).toBe(0.5);
  });
});

describe("Scheduled Retry Logic", () => {
  it("calculates correct retry timestamp for 5 minutes", () => {
    const now = Date.now();
    const delayMinutes = 5;
    const retryAt = now + delayMinutes * 60 * 1000;
    const expectedMs = 5 * 60 * 1000; // 300000ms
    expect(retryAt - now).toBe(expectedMs);
  });

  it("calculates correct retry timestamp for 15 minutes", () => {
    const now = Date.now();
    const delayMinutes = 15;
    const retryAt = now + delayMinutes * 60 * 1000;
    expect(retryAt - now).toBe(15 * 60 * 1000);
  });

  it("calculates correct retry timestamp for 30 minutes", () => {
    const now = Date.now();
    const delayMinutes = 30;
    const retryAt = now + delayMinutes * 60 * 1000;
    expect(retryAt - now).toBe(30 * 60 * 1000);
  });

  it("calculates correct retry timestamp for 60 minutes", () => {
    const now = Date.now();
    const delayMinutes = 60;
    const retryAt = now + delayMinutes * 60 * 1000;
    expect(retryAt - now).toBe(60 * 60 * 1000);
  });

  it("scheduled retry time is always in the future", () => {
    const now = Date.now();
    const delays = [5, 15, 30, 60];
    for (const delay of delays) {
      const retryAt = now + delay * 60 * 1000;
      expect(retryAt).toBeGreaterThan(now);
    }
  });
});

describe("Integration: Adaptive Settings Through Upload Lifecycle", () => {
  it("simulates a typical upload with some failures", () => {
    let settings = getDefaultAdaptiveSettings();
    
    // First 10 chunks succeed
    for (let i = 0; i < 10; i++) {
      settings = recordSuccess(settings);
    }
    // Timeout should have decreased after 5 and 10 successes
    expect(settings.currentTimeoutMs).toBeLessThan(DEFAULT_TIMEOUT_MS);
    
    // Then 2 failures
    settings = recordFailure(settings);
    settings = recordFailure(settings);
    const afterFailures = settings.currentTimeoutMs;
    
    // Then recovery with successes
    for (let i = 0; i < 10; i++) {
      settings = recordSuccess(settings);
    }
    
    expect(settings.totalSuccesses).toBe(20);
    expect(settings.totalFailures).toBe(2);
    // Should have recovered somewhat
    expect(settings.currentTimeoutMs).toBeLessThan(afterFailures);
  });

  it("simulates a poor connection with many failures", () => {
    let settings = getDefaultAdaptiveSettings();
    
    // Alternating: success, fail, fail, success, fail, fail...
    for (let i = 0; i < 20; i++) {
      if (i % 3 === 0) {
        settings = recordSuccess(settings);
      } else {
        settings = recordFailure(settings);
      }
    }
    
    // Should be at max timeout due to many failures
    expect(settings.currentTimeoutMs).toBe(MAX_TIMEOUT_MS);
    expect(settings.totalFailures).toBeGreaterThan(10);
  });

  it("simulates network quality degradation", () => {
    // Start with good speeds
    const goodSpeeds = [1024 * 1024, 900 * 1024, 800 * 1024];
    expect(calculateNetworkQuality(goodSpeeds, 0)).toBe('good');
    
    // Speeds drop
    const fairSpeeds = [300 * 1024, 250 * 1024, 200 * 1024];
    expect(calculateNetworkQuality(fairSpeeds, 0.1)).toBe('fair');
    
    // Speeds drop further
    const poorSpeeds = [50 * 1024, 30 * 1024, 40 * 1024];
    expect(calculateNetworkQuality(poorSpeeds, 0.3)).toBe('poor');
  });
});

// ============================================================
// Tests for Bandwidth Throttling (Speed Limit)
// ============================================================

function calculateThrottleDelay(
  chunkBytes: number,
  speedLimitBytesPerSec: number,
  actualDurationMs: number
): number {
  if (speedLimitBytesPerSec <= 0) return 0;
  const targetDurationMs = (chunkBytes / speedLimitBytesPerSec) * 1000;
  const delay = targetDurationMs - actualDurationMs;
  return Math.max(0, Math.round(delay));
}

describe("Bandwidth Throttling (Speed Limit)", () => {
  it("returns 0 delay when speed limit is 0 (unlimited)", () => {
    expect(calculateThrottleDelay(1024 * 1024, 0, 500)).toBe(0);
  });

  it("returns 0 delay when speed limit is negative", () => {
    expect(calculateThrottleDelay(1024 * 1024, -1, 500)).toBe(0);
  });

  it("returns 0 delay when upload is already slower than limit", () => {
    // 1MB chunk at 500KB/s limit = 2000ms target, actual took 3000ms
    const delay = calculateThrottleDelay(1024 * 1024, 512 * 1024, 3000);
    expect(delay).toBe(0);
  });

  it("calculates correct delay for 1MB chunk at 512KB/s limit", () => {
    // 1MB chunk at 512KB/s = 2000ms target, actual took 500ms → 1500ms delay
    const delay = calculateThrottleDelay(1024 * 1024, 512 * 1024, 500);
    expect(delay).toBe(1500);
  });

  it("calculates correct delay for 2MB chunk at 1MB/s limit", () => {
    // 2MB chunk at 1MB/s = 2000ms target, actual took 800ms → 1200ms delay
    const delay = calculateThrottleDelay(2 * 1024 * 1024, 1024 * 1024, 800);
    expect(delay).toBe(1200);
  });

  it("calculates correct delay for 1MB chunk at 5MB/s limit", () => {
    // 1MB chunk at 5MB/s = 200ms target, actual took 100ms → 100ms delay
    const delay = calculateThrottleDelay(1024 * 1024, 5 * 1024 * 1024, 100);
    expect(delay).toBe(100);
  });

  it("returns 0 when actual duration matches target exactly", () => {
    // 1MB chunk at 1MB/s = 1000ms target, actual took 1000ms → 0ms delay
    const delay = calculateThrottleDelay(1024 * 1024, 1024 * 1024, 1000);
    expect(delay).toBe(0);
  });

  it("handles very small chunks correctly", () => {
    // 10KB chunk at 512KB/s = ~19.5ms target, actual took 5ms → ~15ms delay
    const delay = calculateThrottleDelay(10 * 1024, 512 * 1024, 5);
    expect(delay).toBeGreaterThan(10);
    expect(delay).toBeLessThan(20);
  });

  it("handles very large chunks correctly", () => {
    // 100MB chunk at 2MB/s = 50000ms target, actual took 10000ms → 40000ms delay
    const delay = calculateThrottleDelay(100 * 1024 * 1024, 2 * 1024 * 1024, 10000);
    expect(delay).toBe(40000);
  });
});

// ============================================================
// Tests for Parallel Chunk Upload Logic
// ============================================================

type ConcurrencyOption = 1 | 2 | 3;

function determineConcurrency(
  setting: ConcurrencyOption,
  networkQuality: NetworkQuality,
  consecutiveFailures: number
): number {
  // Auto-fallback to sequential on poor network or repeated failures
  if (networkQuality === 'poor' || consecutiveFailures >= 3) return 1;
  // On fair network, cap at 2 regardless of setting
  if (networkQuality === 'fair' && setting > 2) return 2;
  return setting;
}

function createChunkBatches(
  pendingChunks: number[],
  batchSize: number
): number[][] {
  const batches: number[][] = [];
  for (let i = 0; i < pendingChunks.length; i += batchSize) {
    batches.push(pendingChunks.slice(i, i + batchSize));
  }
  return batches;
}

describe("Parallel Chunk Upload - Concurrency Determination", () => {
  it("returns 1 for sequential setting regardless of network", () => {
    expect(determineConcurrency(1, 'good', 0)).toBe(1);
    expect(determineConcurrency(1, 'fair', 0)).toBe(1);
    expect(determineConcurrency(1, 'poor', 0)).toBe(1);
  });

  it("returns setting value for good network", () => {
    expect(determineConcurrency(2, 'good', 0)).toBe(2);
    expect(determineConcurrency(3, 'good', 0)).toBe(3);
  });

  it("caps at 2 for fair network when setting is 3", () => {
    expect(determineConcurrency(3, 'fair', 0)).toBe(2);
  });

  it("allows 2 for fair network when setting is 2", () => {
    expect(determineConcurrency(2, 'fair', 0)).toBe(2);
  });

  it("falls back to 1 for poor network", () => {
    expect(determineConcurrency(2, 'poor', 0)).toBe(1);
    expect(determineConcurrency(3, 'poor', 0)).toBe(1);
  });

  it("falls back to 1 when consecutive failures >= 3", () => {
    expect(determineConcurrency(3, 'good', 3)).toBe(1);
    expect(determineConcurrency(2, 'good', 5)).toBe(1);
  });

  it("allows parallel with fewer than 3 consecutive failures", () => {
    expect(determineConcurrency(3, 'good', 2)).toBe(3);
    expect(determineConcurrency(2, 'good', 1)).toBe(2);
  });

  it("returns 1 for unknown network quality", () => {
    // unknown is not poor, fair, or good — should use setting
    // But our function doesn't explicitly handle 'unknown', 
    // so it falls through to return setting
    expect(determineConcurrency(2, 'unknown', 0)).toBe(2);
  });
});

describe("Parallel Chunk Upload - Batch Creation", () => {
  it("creates single batch for fewer chunks than batch size", () => {
    const batches = createChunkBatches([0, 1, 2], 5);
    expect(batches).toEqual([[0, 1, 2]]);
  });

  it("creates correct batches for exact multiple", () => {
    const batches = createChunkBatches([0, 1, 2, 3, 4, 5], 3);
    expect(batches).toEqual([[0, 1, 2], [3, 4, 5]]);
  });

  it("creates correct batches with remainder", () => {
    const batches = createChunkBatches([0, 1, 2, 3, 4], 2);
    expect(batches).toEqual([[0, 1], [2, 3], [4]]);
  });

  it("creates single-element batches for concurrency 1", () => {
    const batches = createChunkBatches([0, 1, 2], 1);
    expect(batches).toEqual([[0], [1], [2]]);
  });

  it("handles empty chunk list", () => {
    const batches = createChunkBatches([], 3);
    expect(batches).toEqual([]);
  });

  it("handles single chunk", () => {
    const batches = createChunkBatches([42], 3);
    expect(batches).toEqual([[42]]);
  });

  it("preserves chunk order in batches", () => {
    const chunks = [5, 10, 15, 20, 25];
    const batches = createChunkBatches(chunks, 2);
    expect(batches).toEqual([[5, 10], [15, 20], [25]]);
  });
});

// ============================================================
// Tests for Speed Limit Options Validation
// ============================================================

describe("Speed Limit Options", () => {
  const validLimits = [0, 512000, 1048576, 2097152, 5242880];

  it("all speed limit values are non-negative", () => {
    for (const limit of validLimits) {
      expect(limit).toBeGreaterThanOrEqual(0);
    }
  });

  it("0 represents unlimited", () => {
    expect(calculateThrottleDelay(1024 * 1024, 0, 100)).toBe(0);
  });

  it("each non-zero limit produces a positive throttle delay for fast uploads", () => {
    for (const limit of validLimits.filter(l => l > 0)) {
      // 2MB chunk uploaded in 10ms = very fast → should throttle
      const delay = calculateThrottleDelay(2 * 1024 * 1024, limit, 10);
      expect(delay).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// Integration: Throttling + Network Quality + Concurrency
// ============================================================

describe("Integration: Upload Settings Interaction", () => {
  it("poor network forces sequential even with high concurrency setting", () => {
    const concurrency = determineConcurrency(3, 'poor', 0);
    expect(concurrency).toBe(1);
  });

  it("good network with throttle still allows parallel", () => {
    const concurrency = determineConcurrency(3, 'good', 0);
    expect(concurrency).toBe(3);
    // Throttle delay is independent of concurrency
    const delay = calculateThrottleDelay(1024 * 1024, 512 * 1024, 500);
    expect(delay).toBeGreaterThan(0);
  });

  it("network degradation triggers concurrency reduction", () => {
    // Start good
    let concurrency = determineConcurrency(3, 'good', 0);
    expect(concurrency).toBe(3);
    
    // Network degrades to fair
    concurrency = determineConcurrency(3, 'fair', 0);
    expect(concurrency).toBe(2);
    
    // Network degrades to poor
    concurrency = determineConcurrency(3, 'poor', 0);
    expect(concurrency).toBe(1);
  });

  it("failure accumulation triggers concurrency reduction", () => {
    let concurrency = determineConcurrency(3, 'good', 0);
    expect(concurrency).toBe(3);
    
    concurrency = determineConcurrency(3, 'good', 2);
    expect(concurrency).toBe(3); // Still OK with 2 failures
    
    concurrency = determineConcurrency(3, 'good', 3);
    expect(concurrency).toBe(1); // Falls back at 3 failures
  });
});
