import { getDb } from "../db";
import { engagementAlerts, alertNotificationLog } from "../../drizzle/schema";
import { eq, and, isNull, isNotNull, lt } from "drizzle-orm";
import { getAllEngagementMetrics } from "./engagementMetrics";
import { notifyOwner } from "./notification";

/**
 * Check all active alerts and auto-resolve those where metrics have been healthy for 24+ hours
 */
export async function checkAndResolveAlerts() {
  const db = await getDb();
  if (!db) {
    console.error("[AlertAutoResolution] Database not available");
    return { resolved: 0, errors: [] };
  }

  try {
    // Get all active (triggered but not resolved) alerts
    const activeAlerts = await db
      .select()
      .from(engagementAlerts)
      .where(
        and(
          eq(engagementAlerts.enabled, true),
          isNotNull(engagementAlerts.lastTriggeredAt)
        )
      );

    if (activeAlerts.length === 0) {
      console.log("[AlertAutoResolution] No active alerts to check");
      return { resolved: 0, errors: [] };
    }

    // Get current metrics
    const currentMetrics = await getAllEngagementMetrics();

    const resolvedCount = 0;
    const errors: string[] = [];

    for (const alert of activeAlerts) {
      try {
        // Check if alert should be resolved
        const shouldResolve = await shouldResolveAlert(alert, currentMetrics);

        if (shouldResolve) {
          // Update alert status
          await db
            .update(engagementAlerts)
            .set({
              lastCheckedAt: new Date(),
            })
            .where(eq(engagementAlerts.id, alert.id));

          // Find the most recent triggered log entry for this alert
          const [logEntry] = await db
            .select()
            .from(alertNotificationLog)
            .where(
              and(
                eq(alertNotificationLog.alertId, alert.id),
                eq(alertNotificationLog.status, "triggered")
              )
            )
            .orderBy(alertNotificationLog.triggeredAt)
            .limit(1);

          // Update log entry to resolved
          if (logEntry) {
            await db
              .update(alertNotificationLog)
              .set({
                status: "resolved",
                resolvedAt: new Date(),
                notes: "Auto-resolved: metrics returned to healthy thresholds",
              })
              .where(eq(alertNotificationLog.id, logEntry.id));
          }

          // Notify owner
          const metricValue = getMetricValue(currentMetrics, alert.metricType);
          await notifyOwner({
            title: `Alert Auto-Resolved: ${alert.name}`,
            content: `The alert "${alert.name}" has been automatically resolved. The ${alert.metricType} metric has returned to healthy levels (${metricValue} vs threshold ${alert.thresholdValue}).`,
          });

          console.log(`[AlertAutoResolution] Resolved alert: ${alert.name}`);
        }
      } catch (error) {
        const errorMsg = `Failed to process alert ${alert.id}: ${error}`;
        console.error(`[AlertAutoResolution] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    return { resolved: resolvedCount, errors };
  } catch (error) {
    console.error("[AlertAutoResolution] Error checking alerts:", error);
    return { resolved: 0, errors: [String(error)] };
  }
}

/**
 * Determine if an alert should be auto-resolved
 * Requires metrics to be healthy for at least 24 hours
 */
async function shouldResolveAlert(
  alert: any,
  currentMetrics: any
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get the current value for this metric
  const currentValue = getMetricValue(currentMetrics, alert.metricType);

  // Check if current value is healthy (not triggering the alert)
  const isHealthy = checkMetricHealth(
    currentValue,
    alert.threshold,
    alert.comparisonOperator
  );

  if (!isHealthy) {
    return false; // Still unhealthy, don't resolve
  }

  // Check if it's been healthy for at least 24 hours
  // by looking at when the alert was last triggered
  const [lastTrigger] = await db
    .select()
    .from(alertNotificationLog)
    .where(
      and(
        eq(alertNotificationLog.alertId, alert.id),
        eq(alertNotificationLog.status, "triggered")
      )
    )
    .orderBy(alertNotificationLog.triggeredAt)
    .limit(1);

  if (!lastTrigger) {
    return true; // No trigger log, safe to resolve
  }

  const hoursSinceLastTrigger =
    (Date.now() - new Date(lastTrigger.triggeredAt).getTime()) /
    (1000 * 60 * 60);

  // Require 24 hours of healthy metrics before auto-resolving
  return hoursSinceLastTrigger >= 24;
}

/**
 * Extract metric value from engagement metrics object
 */
function getMetricValue(metrics: any, metricType: string): number {
  switch (metricType) {
    case "dau":
      return metrics.dau || 0;
    case "wau":
      return metrics.wau || 0;
    case "mau":
      return metrics.mau || 0;
    case "retention_day1":
      return metrics.retentionDay1 || 0;
    case "retention_day7":
      return metrics.retentionDay7 || 0;
    case "retention_day30":
      return metrics.retentionDay30 || 0;
    default:
      return 0;
  }
}

/**
 * Check if a metric value is healthy (not triggering the alert)
 */
function checkMetricHealth(
  value: number,
  threshold: number,
  operator: string
): boolean {
  switch (operator) {
    case "less_than":
      return value >= threshold; // Healthy if value is NOT less than threshold
    case "greater_than":
      return value <= threshold; // Healthy if value is NOT greater than threshold
    case "equals":
      return value !== threshold; // Healthy if value is NOT equal to threshold
    default:
      return false;
  }
}
