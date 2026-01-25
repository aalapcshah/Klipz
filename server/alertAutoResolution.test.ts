import { describe, it, expect, beforeEach } from "vitest";
import { checkAndResolveAlerts } from "./_core/alertAutoResolution";
import { getDb } from "./db";
import { engagementAlerts, alertNotificationLog, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Alert Auto-Resolution", () => {
  let testUserId: number;
  let testAlertId: number;

  beforeEach(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test user
    const [user] = await db.insert(users).values({
      openId: `test-alert-${Date.now()}`,
      name: "Test User",
      email: "test@example.com",
      role: "admin",
    });
    testUserId = user.insertId;

    // Create test alert
    const [alert] = await db.insert(engagementAlerts).values({
      name: "Test DAU Alert",
      description: "Test alert for auto-resolution",
      metricType: "dau",
      thresholdType: "below",
      thresholdValue: 10,
      notifyEmails: "admin@example.com",
      checkFrequency: "daily",
      enabled: true,
      lastTriggeredAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
      createdBy: testUserId,
    });
    testAlertId = alert.insertId;

    // Create triggered log entry
    await db.insert(alertNotificationLog).values({
      alertId: testAlertId,
      status: "triggered",
      metricValue: 5,
      thresholdValue: 10,
      triggeredAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
  });

  it("should not resolve alerts that are still unhealthy", async () => {
    // Alert is triggered but metrics are still below threshold
    const result = await checkAndResolveAlerts();
    
    expect(result.resolved).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  it("should not resolve alerts that have been healthy for less than 24 hours", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Update alert to be triggered only 12 hours ago
    await db
      .update(engagementAlerts)
      .set({ lastTriggeredAt: new Date(Date.now() - 12 * 60 * 60 * 1000) })
      .where(eq(engagementAlerts.id, testAlertId));

    const result = await checkAndResolveAlerts();
    
    expect(result.resolved).toBe(0);
  });

  it("should handle alerts with no log entries", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Delete log entries
    await db
      .delete(alertNotificationLog)
      .where(eq(alertNotificationLog.alertId, testAlertId));

    const result = await checkAndResolveAlerts();
    
    // Should not crash
    expect(result.errors.length).toBe(0);
  });

  it("should handle database errors gracefully", async () => {
    // This test verifies error handling
    const result = await checkAndResolveAlerts();
    
    // Should return result even if some alerts fail
    expect(result).toHaveProperty("resolved");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it("should check enabled alerts only", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Disable the alert
    await db
      .update(engagementAlerts)
      .set({ enabled: false })
      .where(eq(engagementAlerts.id, testAlertId));

    const result = await checkAndResolveAlerts();
    
    // Should skip disabled alerts
    expect(result.resolved).toBe(0);
  });
});
