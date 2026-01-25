import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";
import { getDb } from "./db";
import { users, files, fileActivityLogs } from "../drizzle/schema";

describe("Cohort Analysis", () => {
  let adminContext: Context;
  let adminUserId: number;
  let testUserId1: number;
  let testUserId2: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create admin user
    const [admin] = await db.insert(users).values({
      openId: `test-admin-cohort-${Date.now()}`,
      name: "Test Admin Cohort",
      email: `admin-cohort-${Date.now()}@test.com`,
      role: "admin",
    });

    adminUserId = admin.insertId;

    adminContext = {
      user: {
        id: adminUserId,
        openId: `test-admin-cohort-${Date.now()}`,
        name: "Test Admin Cohort",
        email: `admin-cohort-${Date.now()}@test.com`,
        role: "admin",
      },
      req: {} as any,
      res: {} as any,
    };

    // Create test users in January 2026
    const jan2026 = new Date("2026-01-15");
    const [user1] = await db.insert(users).values({
      openId: `test-user-cohort-1-${Date.now()}`,
      name: "Test User 1",
      email: `user1-cohort-${Date.now()}@test.com`,
      createdAt: jan2026,
    });
    testUserId1 = user1.insertId;

    const [user2] = await db.insert(users).values({
      openId: `test-user-cohort-2-${Date.now()}`,
      name: "Test User 2",
      email: `user2-cohort-${Date.now()}@test.com`,
      createdAt: jan2026,
    });
    testUserId2 = user2.insertId;

    // Create some test files
    const [file1] = await db.insert(files).values({
      userId: testUserId1,
      filename: "test1.jpg",
      mimeType: "image/jpeg",
      fileSize: 1000,
      url: "https://example.com/test1.jpg",
      fileKey: "test1.jpg",
    });

    const [file2] = await db.insert(files).values({
      userId: testUserId2,
      filename: "test2.jpg",
      mimeType: "image/jpeg",
      fileSize: 1000,
      url: "https://example.com/test2.jpg",
      fileKey: "test2.jpg",
    });

    // Create some activities
    await db.insert(fileActivityLogs).values([
      {
        userId: testUserId1,
        fileId: file1.insertId,
        activityType: "upload",
        details: "Uploaded test file",
      },
      {
        userId: testUserId1,
        fileId: file1.insertId,
        activityType: "view",
        details: "Viewed test file",
      },
      {
        userId: testUserId2,
        fileId: file2.insertId,
        activityType: "upload",
        details: "Uploaded test file",
      },
    ]);
  });

  it("should analyze a single cohort", async () => {
    const caller = appRouter.createCaller(adminContext);

    const result = await caller.admin.analyzeCohort({
      name: "January 2026",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-01-31"),
    });

    expect(result.cohortName).toBe("January 2026");
    expect(result.totalUsers).toBeGreaterThanOrEqual(2);
    expect(result.activeUsers).toBeGreaterThanOrEqual(0);
    expect(result.totalActivities).toBeGreaterThanOrEqual(0);
    expect(typeof result.averageActivitiesPerUser).toBe("number");
    expect(typeof result.retentionDay1).toBe("number");
    expect(typeof result.retentionDay7).toBe("number");
    expect(typeof result.retentionDay30).toBe("number");
    expect(result.activityBreakdown).toBeDefined();
    expect(typeof result.activityBreakdown.upload).toBe("number");
    expect(typeof result.activityBreakdown.view).toBe("number");
  });

  it("should compare multiple cohorts", async () => {
    const caller = appRouter.createCaller(adminContext);

    const results = await caller.admin.compareCohorts([
      {
        name: "January 2026",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
      },
      {
        name: "February 2026",
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-02-28"),
      },
    ]);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);
    expect(results[0].cohortName).toBe("January 2026");
    expect(results[1].cohortName).toBe("February 2026");
    
    // January should have users, February should have 0
    expect(results[0].totalUsers).toBeGreaterThanOrEqual(2);
    expect(results[1].totalUsers).toBe(0);
  });

  it("should handle empty cohorts", async () => {
    const caller = appRouter.createCaller(adminContext);

    const result = await caller.admin.analyzeCohort({
      name: "Empty Cohort",
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-01-31"),
    });

    expect(result.cohortName).toBe("Empty Cohort");
    expect(result.totalUsers).toBe(0);
    expect(result.activeUsers).toBe(0);
    expect(result.totalActivities).toBe(0);
    expect(result.averageActivitiesPerUser).toBe(0);
  });
});
