import { getDb } from "../db";
import { users, files, videos } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { getPlanLimits, formatStorageSize, type SubscriptionTier } from "../../shared/subscriptionPlans";
import { notifyOwner } from "../_core/notification";

/**
 * Usage alert thresholds (percentage of limit)
 */
const ALERT_THRESHOLDS = [80, 95] as const;

type AlertType = "storage" | "files" | "videos";
type AlertLevel = 80 | 95;

interface UsageAlert {
  type: AlertType;
  level: AlertLevel;
  current: number;
  limit: number;
  percentage: number;
  message: string;
}

/**
 * Check a user's usage against their plan limits and return any alerts
 */
export async function checkUsageAlerts(userId: number): Promise<UsageAlert[]> {
  const db = await getDb();
  if (!db) return [];

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return [];

  const tier = user.subscriptionTier as SubscriptionTier;
  const limits = getPlanLimits(tier);
  const alerts: UsageAlert[] = [];

  // Calculate current usage
  const [storageResult] = await db.select({
    total: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`
  }).from(files).where(eq(files.userId, userId));
  const storageUsed = storageResult?.total || 0;

  const [fileResult] = await db.select({
    count: sql<number>`COUNT(*)`
  }).from(files).where(eq(files.userId, userId));
  const fileCount = fileResult?.count || 0;

  const [videoResult] = await db.select({
    count: sql<number>`COUNT(*)`
  }).from(videos).where(eq(videos.userId, userId));
  const videoCount = videoResult?.count || 0;

  // Check storage alerts (skip if unlimited: -1)
  if (limits.maxStorageBytes > 0) {
    const storagePercentage = Math.round((storageUsed / limits.maxStorageBytes) * 100);
    for (const threshold of ALERT_THRESHOLDS) {
      if (storagePercentage >= threshold) {
        alerts.push({
          type: "storage",
          level: threshold,
          current: storageUsed,
          limit: limits.maxStorageBytes,
          percentage: storagePercentage,
          message: `You've used ${storagePercentage}% of your storage (${formatStorageSize(storageUsed)} of ${formatStorageSize(limits.maxStorageBytes)}).${threshold >= 95 ? " Consider upgrading your plan to avoid running out of space." : ""}`,
        });
        break; // Only show the highest threshold alert
      }
    }
  }

  // Check file count alerts (skip if unlimited: -1)
  if (limits.maxFileCount > 0) {
    const filePercentage = Math.round((fileCount / limits.maxFileCount) * 100);
    for (const threshold of ALERT_THRESHOLDS) {
      if (filePercentage >= threshold) {
        alerts.push({
          type: "files",
          level: threshold,
          current: fileCount,
          limit: limits.maxFileCount,
          percentage: filePercentage,
          message: `You've used ${filePercentage}% of your file limit (${fileCount} of ${limits.maxFileCount} files).${threshold >= 95 ? " Consider upgrading your plan to upload more files." : ""}`,
        });
        break;
      }
    }
  }

  // Check video count alerts (skip if unlimited: -1)
  if (limits.maxVideoCount > 0) {
    const videoPercentage = Math.round((videoCount / limits.maxVideoCount) * 100);
    for (const threshold of ALERT_THRESHOLDS) {
      if (videoPercentage >= threshold) {
        alerts.push({
          type: "videos",
          level: threshold,
          current: videoCount,
          limit: limits.maxVideoCount,
          percentage: videoPercentage,
          message: `You've used ${videoPercentage}% of your video limit (${videoCount} of ${limits.maxVideoCount} videos).${threshold >= 95 ? " Consider upgrading your plan to upload more videos." : ""}`,
        });
        break;
      }
    }
  }

  return alerts;
}

/**
 * Send usage alert notifications to the user (via owner notification system)
 */
export async function sendUsageAlertNotification(userId: number, alerts: UsageAlert[]): Promise<void> {
  if (alerts.length === 0) return;

  const criticalAlerts = alerts.filter(a => a.level >= 95);
  const warningAlerts = alerts.filter(a => a.level < 95);

  if (criticalAlerts.length > 0) {
    const alertDetails = criticalAlerts.map(a => `- ${a.message}`).join("\n");
    await notifyOwner({
      title: "⚠️ Critical Usage Alert - MetaClips",
      content: `A user (ID: ${userId}) has reached critical usage levels:\n\n${alertDetails}\n\nThey may need to upgrade their plan soon.`,
    });
  }

  if (warningAlerts.length > 0) {
    const alertDetails = warningAlerts.map(a => `- ${a.message}`).join("\n");
    await notifyOwner({
      title: "📊 Usage Warning - MetaClips",
      content: `A user (ID: ${userId}) is approaching usage limits:\n\n${alertDetails}`,
    });
  }
}

/**
 * Get usage summary for a user (used by the frontend to display alerts)
 */
export async function getUsageSummary(userId: number) {
  const alerts = await checkUsageAlerts(userId);
  
  return {
    alerts,
    hasWarnings: alerts.some(a => a.level === 80),
    hasCritical: alerts.some(a => a.level >= 95),
    alertCount: alerts.length,
  };
}
