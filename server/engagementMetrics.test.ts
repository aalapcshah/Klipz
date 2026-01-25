import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import {
  calculateDAU,
  calculateWAU,
  calculateMAU,
  calculateRetentionDay1,
  calculateFeatureAdoption,
  getAllEngagementMetrics,
  getEngagementTrends,
} from "./_core/engagementMetrics";

describe("Engagement Metrics", () => {
  let testUserId1: number;
  let testUserId2: number;
  let testFileId: number;

  beforeAll(async () => {
    // Create test users
    const testUser1 = {
      openId: `test-engagement-1-${Date.now()}`,
      name: "Engagement Test User 1",
      email: "engagement1@example.com",
    };
    await db.upsertUser(testUser1);
    const user1 = await db.getUserByOpenId(testUser1.openId);
    if (!user1) throw new Error("Failed to create test user 1");
    testUserId1 = user1.id;

    const testUser2 = {
      openId: `test-engagement-2-${Date.now()}`,
      name: "Engagement Test User 2",
      email: "engagement2@example.com",
    };
    await db.upsertUser(testUser2);
    const user2 = await db.getUserByOpenId(testUser2.openId);
    if (!user2) throw new Error("Failed to create test user 2");
    testUserId2 = user2.id;

    // Create a test file
    testFileId = await db.createFile({
      userId: testUserId1,
      filename: "test-engagement.jpg",
      url: "https://example.com/test.jpg",
      fileKey: "test-key",
      mimeType: "image/jpeg",
      fileSize: 1024,
      title: "Test Engagement File",
      description: "Test file for engagement",
    });

    // Create activities for both users (within last 24 hours)
    await db.trackFileActivity({
      userId: testUserId1,
      fileId: testFileId,
      activityType: "upload",
      details: "Test upload",
    });

    await db.trackFileActivity({
      userId: testUserId1,
      fileId: testFileId,
      activityType: "view",
      details: "Test view",
    });

    await db.trackFileActivity({
      userId: testUserId2,
      fileId: testFileId,
      activityType: "edit",
      details: "Test edit",
    });

    await db.trackFileActivity({
      userId: testUserId2,
      fileId: testFileId,
      activityType: "share",
      details: "Test share",
    });
  });

  it("should calculate DAU (Daily Active Users)", async () => {
    const dau = await calculateDAU();
    
    expect(typeof dau).toBe("number");
    expect(dau).toBeGreaterThanOrEqual(2); // At least our 2 test users
  });

  it("should calculate WAU (Weekly Active Users)", async () => {
    const wau = await calculateWAU();
    
    expect(typeof wau).toBe("number");
    expect(wau).toBeGreaterThanOrEqual(2); // At least our 2 test users
  });

  it("should calculate MAU (Monthly Active Users)", async () => {
    const mau = await calculateMAU();
    
    expect(typeof mau).toBe("number");
    expect(mau).toBeGreaterThanOrEqual(2); // At least our 2 test users
  });

  it("should calculate Day 1 retention", async () => {
    const retention = await calculateRetentionDay1();
    
    expect(typeof retention).toBe("number");
    expect(retention).toBeGreaterThanOrEqual(0);
    expect(retention).toBeLessThanOrEqual(100);
  });

  it("should calculate feature adoption", async () => {
    const adoption = await calculateFeatureAdoption();
    
    expect(Array.isArray(adoption)).toBe(true);
    expect(adoption.length).toBeGreaterThan(0);
    
    // Check structure
    adoption.forEach((feature) => {
      expect(feature).toHaveProperty("feature");
      expect(feature).toHaveProperty("userCount");
      expect(feature).toHaveProperty("percentage");
      expect(typeof feature.feature).toBe("string");
      expect(typeof feature.userCount).toBe("number");
      expect(typeof feature.percentage).toBe("number");
      expect(feature.percentage).toBeGreaterThanOrEqual(0);
      expect(feature.percentage).toBeLessThanOrEqual(100);
    });

    // Should include our test activities
    const uploadFeature = adoption.find((f) => f.feature === "upload");
    expect(uploadFeature).toBeDefined();
    expect(uploadFeature!.userCount).toBeGreaterThanOrEqual(1);
  });

  it("should get all engagement metrics", async () => {
    const metrics = await getAllEngagementMetrics();
    
    expect(metrics).toHaveProperty("dau");
    expect(metrics).toHaveProperty("wau");
    expect(metrics).toHaveProperty("mau");
    expect(metrics).toHaveProperty("retentionDay1");
    expect(metrics).toHaveProperty("retentionDay7");
    expect(metrics).toHaveProperty("retentionDay30");
    expect(metrics).toHaveProperty("featureAdoption");
    
    expect(typeof metrics.dau).toBe("number");
    expect(typeof metrics.wau).toBe("number");
    expect(typeof metrics.mau).toBe("number");
    expect(typeof metrics.retentionDay1).toBe("number");
    expect(typeof metrics.retentionDay7).toBe("number");
    expect(typeof metrics.retentionDay30).toBe("number");
    expect(Array.isArray(metrics.featureAdoption)).toBe(true);
    
    // DAU should be <= WAU <= MAU
    expect(metrics.dau).toBeLessThanOrEqual(metrics.wau);
    expect(metrics.wau).toBeLessThanOrEqual(metrics.mau);
  });

  it("should get engagement trends", async () => {
    const trends = await getEngagementTrends();
    
    expect(trends).toHaveProperty("dates");
    expect(trends).toHaveProperty("dauTrend");
    
    expect(Array.isArray(trends.dates)).toBe(true);
    expect(Array.isArray(trends.dauTrend)).toBe(true);
    
    // Arrays should have same length
    expect(trends.dates.length).toBe(trends.dauTrend.length);
    
    // All DAU values should be numbers
    trends.dauTrend.forEach((value) => {
      expect(typeof value).toBe("number");
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  it("should handle empty data gracefully", async () => {
    // Feature adoption should still return array even with no data
    const adoption = await calculateFeatureAdoption();
    expect(Array.isArray(adoption)).toBe(true);
    
    // Metrics should return numbers (possibly 0)
    const dau = await calculateDAU();
    expect(typeof dau).toBe("number");
  });
});
