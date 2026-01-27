import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { showNotification } from "@/lib/notifications";

// Storage quota settings
export interface StorageQuotaSettings {
  enabled: boolean;
  quotaGB: number; // Storage limit in GB
  warningThreshold: number; // Percentage (0-100) to show warning
  criticalThreshold: number; // Percentage (0-100) to show critical warning
  blockUploadsAtLimit: boolean; // Whether to block uploads when quota exceeded
}

// Storage quota status
export interface StorageQuotaStatus {
  totalBytes: number;
  quotaBytes: number;
  usedPercentage: number;
  isWarning: boolean;
  isCritical: boolean;
  isExceeded: boolean;
  remainingBytes: number;
}

interface StorageQuotaContextType {
  settings: StorageQuotaSettings;
  status: StorageQuotaStatus | null;
  isLoading: boolean;
  updateSettings: (settings: Partial<StorageQuotaSettings>) => void;
  refreshStatus: () => Promise<void>;
  canUpload: (fileSize: number) => { allowed: boolean; reason?: string };
  formatBytes: (bytes: number) => string;
}

const defaultSettings: StorageQuotaSettings = {
  enabled: true,
  quotaGB: 10, // Default 10GB quota
  warningThreshold: 80,
  criticalThreshold: 95,
  blockUploadsAtLimit: false,
};

const STORAGE_KEY = "metaclips_storage_quota_settings";

const StorageQuotaContext = createContext<StorageQuotaContextType | null>(null);

export function useStorageQuota() {
  const context = useContext(StorageQuotaContext);
  if (!context) {
    throw new Error("useStorageQuota must be used within a StorageQuotaProvider");
  }
  return context;
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

interface StorageQuotaProviderProps {
  children: ReactNode;
}

export function StorageQuotaProvider({ children }: StorageQuotaProviderProps) {
  const [settings, setSettings] = useState<StorageQuotaSettings>(() => {
    // Load settings from localStorage
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          return { ...defaultSettings, ...JSON.parse(saved) };
        } catch {
          return defaultSettings;
        }
      }
    }
    return defaultSettings;
  });

  const [status, setStatus] = useState<StorageQuotaStatus | null>(null);
  const [lastNotifiedLevel, setLastNotifiedLevel] = useState<"warning" | "critical" | "exceeded" | null>(null);

  // Fetch storage stats
  const { data: storageStats, isLoading, refetch } = trpc.storageStats.getStats.useQuery(undefined, {
    refetchInterval: 60000, // Refetch every minute
  });

  // Calculate status when stats or settings change
  useEffect(() => {
    if (!storageStats || !settings.enabled) {
      setStatus(null);
      return;
    }

    const quotaBytes = settings.quotaGB * 1024 * 1024 * 1024;
    const usedPercentage = (storageStats.totalBytes / quotaBytes) * 100;
    const isWarning = usedPercentage >= settings.warningThreshold;
    const isCritical = usedPercentage >= settings.criticalThreshold;
    const isExceeded = usedPercentage >= 100;
    const remainingBytes = Math.max(0, quotaBytes - storageStats.totalBytes);

    const newStatus: StorageQuotaStatus = {
      totalBytes: storageStats.totalBytes,
      quotaBytes,
      usedPercentage,
      isWarning,
      isCritical,
      isExceeded,
      remainingBytes,
    };

    setStatus(newStatus);

    // Send notifications for threshold crossings
    if (isExceeded && lastNotifiedLevel !== "exceeded") {
      showNotification("Storage Quota Exceeded", {
        body: `You've used ${formatBytes(storageStats.totalBytes)} of your ${settings.quotaGB}GB quota. ${settings.blockUploadsAtLimit ? "Uploads are now blocked." : "Consider cleaning up old files."}`,
        type: "error",
      });
      toast.error(`Storage quota exceeded! ${settings.blockUploadsAtLimit ? "Uploads are blocked." : ""}`);
      setLastNotifiedLevel("exceeded");
    } else if (isCritical && !isExceeded && lastNotifiedLevel !== "critical" && lastNotifiedLevel !== "exceeded") {
      showNotification("Storage Almost Full", {
        body: `You've used ${usedPercentage.toFixed(1)}% of your storage quota. Only ${formatBytes(remainingBytes)} remaining.`,
        type: "error",
      });
      toast.warning(`Storage almost full! ${usedPercentage.toFixed(1)}% used.`);
      setLastNotifiedLevel("critical");
    } else if (isWarning && !isCritical && lastNotifiedLevel !== "warning" && lastNotifiedLevel !== "critical" && lastNotifiedLevel !== "exceeded") {
      showNotification("Storage Warning", {
        body: `You've used ${usedPercentage.toFixed(1)}% of your storage quota. Consider reviewing large files.`,
        type: "info",
      });
      toast.info(`Storage at ${usedPercentage.toFixed(1)}% capacity.`);
      setLastNotifiedLevel("warning");
    } else if (!isWarning && lastNotifiedLevel !== null) {
      // Reset notification level when back below warning
      setLastNotifiedLevel(null);
    }
  }, [storageStats, settings, lastNotifiedLevel]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((newSettings: Partial<StorageQuotaSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
    // Reset notification level when settings change
    setLastNotifiedLevel(null);
  }, []);

  const refreshStatus = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const canUpload = useCallback(
    (fileSize: number): { allowed: boolean; reason?: string } => {
      if (!settings.enabled || !status) {
        return { allowed: true };
      }

      if (status.isExceeded && settings.blockUploadsAtLimit) {
        return {
          allowed: false,
          reason: `Storage quota exceeded. You've used ${formatBytes(status.totalBytes)} of your ${settings.quotaGB}GB quota.`,
        };
      }

      const newTotal = status.totalBytes + fileSize;
      if (newTotal > status.quotaBytes && settings.blockUploadsAtLimit) {
        return {
          allowed: false,
          reason: `This file (${formatBytes(fileSize)}) would exceed your storage quota. Only ${formatBytes(status.remainingBytes)} remaining.`,
        };
      }

      return { allowed: true };
    },
    [settings, status]
  );

  const value: StorageQuotaContextType = {
    settings,
    status,
    isLoading,
    updateSettings,
    refreshStatus,
    canUpload,
    formatBytes,
  };

  return (
    <StorageQuotaContext.Provider value={value}>
      {children}
    </StorageQuotaContext.Provider>
  );
}
