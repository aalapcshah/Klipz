import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";
import { getDb } from "./db";
import { users, scheduledReports } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Scheduled Reports", () => {
  let adminContext: Context;
  let adminUserId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create admin user
    const [admin] = await db.insert(users).values({
      openId: `test-admin-${Date.now()}`,
      name: "Test Admin",
      email: `admin-${Date.now()}@test.com`,
      role: "admin",
    });

    adminUserId = admin.insertId;

    adminContext = {
      user: {
        id: adminUserId,
        openId: `test-admin-${Date.now()}`,
        name: "Test Admin",
        email: `admin-${Date.now()}@test.com`,
        role: "admin",
      },
      req: {} as any,
      res: {} as any,
    };
  });

  it("should create a scheduled report", async () => {
    const caller = appRouter.createCaller(adminContext);

    const result = await caller.scheduledReports.create({
      name: "Weekly Activity Report",
      description: "Weekly summary of all activities",
      frequency: "weekly",
      dayOfWeek: 1,
      timeOfDay: "09:00",
      recipients: "admin@test.com",
      format: "excel",
    });

    expect(result.success).toBe(true);
  });

  it("should get all scheduled reports", async () => {
    const caller = appRouter.createCaller(adminContext);

    const reports = await caller.scheduledReports.getAll();

    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBeGreaterThan(0);
  });

  it("should update a scheduled report", async () => {
    const caller = appRouter.createCaller(adminContext);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create a report first
    await caller.scheduledReports.create({
      name: "Test Report",
      frequency: "daily",
      timeOfDay: "10:00",
      recipients: "test@test.com",
      format: "csv",
    });

    const reports = await db.select().from(scheduledReports).where(eq(scheduledReports.name, "Test Report"));
    const reportId = reports[0].id;

    const result = await caller.scheduledReports.update({
      id: reportId,
      name: "Updated Test Report",
      enabled: false,
    });

    expect(result.success).toBe(true);

    const updated = await db.select().from(scheduledReports).where(eq(scheduledReports.id, reportId));
    expect(updated[0].name).toBe("Updated Test Report");
    expect(updated[0].enabled).toBe(false);
  });

  it("should delete a scheduled report", async () => {
    const caller = appRouter.createCaller(adminContext);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create a report first
    await caller.scheduledReports.create({
      name: "Report to Delete",
      frequency: "monthly",
      dayOfMonth: 1,
      timeOfDay: "08:00",
      recipients: "delete@test.com",
      format: "excel",
    });

    const reports = await db.select().from(scheduledReports).where(eq(scheduledReports.name, "Report to Delete"));
    const reportId = reports[0].id;

    const result = await caller.scheduledReports.delete({ id: reportId });

    expect(result.success).toBe(true);

    const deleted = await db.select().from(scheduledReports).where(eq(scheduledReports.id, reportId));
    expect(deleted.length).toBe(0);
  });
});
