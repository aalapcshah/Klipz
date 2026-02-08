import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "metaclips-upload-settings";

export type ThrottleLevel = "unlimited" | "fast" | "medium" | "slow";

export interface UploadSettings {
  throttleLevel: ThrottleLevel;
  // Delay in ms between chunk uploads
  chunkDelayMs: number;
  // Max bytes per second (0 = unlimited)
  maxBytesPerSecond: number;
}

const THROTTLE_PRESETS: Record<ThrottleLevel, { chunkDelayMs: number; maxBytesPerSecond: number; label: string }> = {
  unlimited: { chunkDelayMs: 0, maxBytesPerSecond: 0, label: "Unlimited" },
  fast: { chunkDelayMs: 100, maxBytesPerSecond: 2 * 1024 * 1024, label: "Fast (2 MB/s)" },
  medium: { chunkDelayMs: 300, maxBytesPerSecond: 1024 * 1024, label: "Medium (1 MB/s)" },
  slow: { chunkDelayMs: 800, maxBytesPerSecond: 512 * 1024, label: "Slow (500 KB/s)" },
};

export function getThrottlePresets() {
  return THROTTLE_PRESETS;
}

export function getThrottleLabel(level: ThrottleLevel): string {
  return THROTTLE_PRESETS[level].label;
}

/**
 * Calculate the delay needed after uploading a chunk of given size
 * to stay within the target bytes/second rate.
 */
export function calculateChunkDelay(chunkSizeBytes: number, settings: UploadSettings): number {
  if (settings.maxBytesPerSecond <= 0) return 0;
  // Time it should take to send this chunk at the target rate
  const targetTimeMs = (chunkSizeBytes / settings.maxBytesPerSecond) * 1000;
  // We assume the actual upload took some time, so we add a fraction of the target as delay
  // This is a simple throttle - we add delay between chunks
  return Math.max(settings.chunkDelayMs, targetTimeMs * 0.5);
}

export function useUploadSettings() {
  const [settings, setSettings] = useState<UploadSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const preset = THROTTLE_PRESETS[parsed.throttleLevel as ThrottleLevel];
        if (preset) {
          return {
            throttleLevel: parsed.throttleLevel as ThrottleLevel,
            chunkDelayMs: preset.chunkDelayMs,
            maxBytesPerSecond: preset.maxBytesPerSecond,
          };
        }
      }
    } catch {}
    return {
      throttleLevel: "unlimited" as ThrottleLevel,
      chunkDelayMs: 0,
      maxBytesPerSecond: 0,
    };
  });

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ throttleLevel: settings.throttleLevel }));
    } catch {}
  }, [settings]);

  const setThrottleLevel = useCallback((level: ThrottleLevel) => {
    const preset = THROTTLE_PRESETS[level];
    setSettings({
      throttleLevel: level,
      chunkDelayMs: preset.chunkDelayMs,
      maxBytesPerSecond: preset.maxBytesPerSecond,
    });
  }, []);

  return {
    settings,
    setThrottleLevel,
    throttlePresets: THROTTLE_PRESETS,
  };
}
