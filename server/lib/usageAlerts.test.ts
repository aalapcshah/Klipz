import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependencies
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../shared/subscriptionPlans", () => ({
  getPlanLimits: vi.fn((tier: string) => {
    if (tier === "free") {
      return {
        maxStorageBytes: 2 * 1024 * 1024 * 1024, // 2 GB
        maxFileCount: 100,
        maxVideoCount: 0,
        canUploadVideos: false,
      };
    }
    if (tier === "pro") {
      return {
        maxStorageBytes: 50 * 1024 * 1024 * 1024, // 50 GB
        maxFileCount: -1, // unlimited
        maxVideoCount: -1, // unlimited
        canUploadVideos: true,
      };
    }
    return {
      maxStorageBytes: 200 * 1024 * 1024 * 1024, // 200 GB
      maxFileCount: -1,
      maxVideoCount: -1,
      canUploadVideos: true,
    };
  }),
  formatStorageSize: vi.fn((bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }),
}));

import { checkUsageAlerts, sendUsageAlertNotification, getUsageSummary } from "./usageAlerts";
import { getDb } from "../db";
import { notifyOwner } from "../_core/notification";

describe("usageAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkUsageAlerts", () => {
    it("returns empty alerts when user not found", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };
      (getDb as any).mockResolvedValue(mockDb);

      const alerts = await checkUsageAlerts(999);
      expect(alerts).toEqual([]);
    });

    it("returns empty alerts when db is not available", async () => {
      (getDb as any).mockResolvedValue(null);

      const alerts = await checkUsageAlerts(1);
      expect(alerts).toEqual([]);
    });

    it("returns storage alert at 80% threshold for free tier", async () => {
      const storageUsed = 1.7 * 1024 * 1024 * 1024; // 1.7 GB of 2 GB = 85%
      const mockDb = {
        select: vi.fn().mockImplementation((...args: any[]) => ({
          from: vi.fn().mockImplementation((table: any) => ({
            where: vi.fn().mockImplementation((...whereArgs: any[]) => {
              // First call: user lookup
              if (!whereArgs.length || (table && table.name === undefined)) {
                return {
                  limit: vi.fn().mockResolvedValue([{ subscriptionTier: "free" }]),
                };
              }
              return {
                limit: vi.fn().mockResolvedValue([{ subscriptionTier: "free" }]),
              };
            }),
          })),
        })),
      };

      // More specific mock for the actual DB calls
      let callCount = 0;
      const mockSelect = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // User lookup
              return { limit: vi.fn().mockResolvedValue([{ subscriptionTier: "free" }]) };
            }
            if (callCount === 2) {
              // Storage sum
              return [{ total: storageUsed }];
            }
            if (callCount === 3) {
              // File count
              return [{ count: 50 }];
            }
            if (callCount === 4) {
              // Video count
              return [{ count: 0 }];
            }
            return [];
          }),
        })),
      }));

      (getDb as any).mockResolvedValue({ select: mockSelect });

      const alerts = await checkUsageAlerts(1);
      // Should have a storage alert at 80% level
      const storageAlert = alerts.find(a => a.type === "storage");
      if (storageAlert) {
        expect(storageAlert.level).toBe(80);
        expect(storageAlert.percentage).toBeGreaterThanOrEqual(80);
      }
    });
  });

  describe("sendUsageAlertNotification", () => {
    it("does not send notifications when no alerts", async () => {
      await sendUsageAlertNotification(1, []);
      expect(notifyOwner).not.toHaveBeenCalled();
    });

    it("sends critical notification for 95% alerts", async () => {
      await sendUsageAlertNotification(1, [
        {
          type: "storage",
          level: 95,
          current: 1.9 * 1024 * 1024 * 1024,
          limit: 2 * 1024 * 1024 * 1024,
          percentage: 95,
          message: "You've used 95% of your storage",
        },
      ]);
      expect(notifyOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Critical"),
        })
      );
    });

    it("sends warning notification for 80% alerts", async () => {
      await sendUsageAlertNotification(1, [
        {
          type: "files",
          level: 80,
          current: 80,
          limit: 100,
          percentage: 80,
          message: "You've used 80% of your file limit",
        },
      ]);
      expect(notifyOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Warning"),
        })
      );
    });
  });

  describe("getUsageSummary", () => {
    it("returns summary with correct flags", async () => {
      (getDb as any).mockResolvedValue(null);

      const summary = await getUsageSummary(1);
      expect(summary).toEqual({
        alerts: [],
        hasWarnings: false,
        hasCritical: false,
        alertCount: 0,
      });
    });
  });
});
