import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";
import { getDb } from "./db";
import { users, engagementAlerts } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Engagement Alerts", () => {
  let adminContext: Context;
  let adminUserId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create admin user
    const [admin] = await db.insert(users).values({
      openId: `test-admin-alerts-${Date.now()}`,
      name: "Test Admin Alerts",
      email: `admin-alerts-${Date.now()}@test.com`,
      role: "admin",
    });

    adminUserId = admin.insertId;

    adminContext = {
      user: {
        id: adminUserId,
        openId: `test-admin-alerts-${Date.now()}`,
        name: "Test Admin Alerts",
        email: `admin-alerts-${Date.now()}@test.com`,
        role: "admin",
      },
      req: {} as any,
      res: {} as any,
    };
  });

  it("should create an engagement alert", async () => {
    const caller = appRouter.createCaller(adminContext);

    const result = await caller.engagementAlerts.create({
      name: "Low DAU Alert",
      description: "Alert when DAU drops below 100",
      metricType: "dau",
      thresholdType: "below",
      thresholdValue: 100,
      notifyEmails: "admin@test.com",
      checkFrequency: "daily",
    });

    expect(result.success).toBe(true);
  });

  it("should get all engagement alerts", async () => {
    const caller = appRouter.createCaller(adminContext);

    const alerts = await caller.engagementAlerts.getAll();

    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("should update an engagement alert", async () => {
    const caller = appRouter.createCaller(adminContext);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create an alert first
    await caller.engagementAlerts.create({
      name: "Test Alert",
      metricType: "wau",
      thresholdType: "below",
      thresholdValue: 50,
      notifyEmails: "test@test.com",
      checkFrequency: "daily",
    });

    const alerts = await db.select().from(engagementAlerts).where(eq(engagementAlerts.name, "Test Alert"));
    const alertId = alerts[0].id;

    const result = await caller.engagementAlerts.update({
      id: alertId,
      thresholdValue: 75,
      enabled: false,
    });

    expect(result.success).toBe(true);

    const updated = await db.select().from(engagementAlerts).where(eq(engagementAlerts.id, alertId));
    expect(updated[0].thresholdValue).toBe(75);
    expect(updated[0].enabled).toBe(false);
  });

  it("should delete an engagement alert", async () => {
    const caller = appRouter.createCaller(adminContext);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create an alert first
    await caller.engagementAlerts.create({
      name: "Alert to Delete",
      metricType: "mau",
      thresholdType: "above",
      thresholdValue: 1000,
      notifyEmails: "delete@test.com",
      checkFrequency: "weekly",
    });

    const alerts = await db.select().from(engagementAlerts).where(eq(engagementAlerts.name, "Alert to Delete"));
    const alertId = alerts[0].id;

    const result = await caller.engagementAlerts.delete({ id: alertId });

    expect(result.success).toBe(true);

    const deleted = await db.select().from(engagementAlerts).where(eq(engagementAlerts.id, alertId));
    expect(deleted.length).toBe(0);
  });

  it("should check an alert manually", async () => {
    const caller = appRouter.createCaller(adminContext);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create an alert
    await caller.engagementAlerts.create({
      name: "Manual Check Alert",
      metricType: "dau",
      thresholdType: "below",
      thresholdValue: 10000, // High threshold so it triggers
      notifyEmails: "check@test.com",
      checkFrequency: "daily",
    });

    const alerts = await db.select().from(engagementAlerts).where(eq(engagementAlerts.name, "Manual Check Alert"));
    const alertId = alerts[0].id;

    const result = await caller.engagementAlerts.checkNow({ id: alertId });

    expect(result.success).toBe(true);
    expect(typeof result.currentValue).toBe("number");
    expect(typeof result.thresholdValue).toBe("number");
  });
});
