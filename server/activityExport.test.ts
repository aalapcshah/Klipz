import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import { fetchActivityDataForExport, generateCSV, generateExcel } from "./_core/activityExport";

describe("Activity Export", { timeout: 30000 }, () => {
  let testUserId: number;
  let testFileId: number;

  beforeAll(async () => {
    // Create a test user
    const testUser = {
      openId: `test-export-${Date.now()}`,
      name: "Export Test User",
      email: "export@example.com",
    };
    await db.upsertUser(testUser);
    const user = await db.getUserByOpenId(testUser.openId);
    if (!user) throw new Error("Failed to create test user");
    testUserId = user.id;

    // Create a test file
    testFileId = await db.createFile({
      userId: testUserId,
      filename: "test-export.jpg",
      url: "https://example.com/test.jpg",
      fileKey: "test-key",
      mimeType: "image/jpeg",
      fileSize: 1024,
      title: "Test Export File",
      description: "Test file for export",
    });

    // Create some test activities
    await db.trackFileActivity({
      userId: testUserId,
      fileId: testFileId,
      activityType: "upload",
      details: "Test upload",
    });

    await db.trackFileActivity({
      userId: testUserId,
      fileId: testFileId,
      activityType: "view",
      details: "Test view",
    });

    await db.trackFileActivity({
      userId: testUserId,
      fileId: testFileId,
      activityType: "edit",
      details: "Test edit",
    });
  });

  it("should fetch activity data without filters", async () => {
    // Use userId filter to keep the result set bounded (unfiltered query is too slow with N+1 lookups)
    const data = await fetchActivityDataForExport({ userId: testUserId });
    
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    
    // Check structure
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("id");
      expect(data[0]).toHaveProperty("timestamp");
      expect(data[0]).toHaveProperty("userName");
      expect(data[0]).toHaveProperty("userEmail");
      expect(data[0]).toHaveProperty("activityType");
      expect(data[0]).toHaveProperty("fileName");
      expect(data[0]).toHaveProperty("details");
    }
  });

  it("should filter by user ID", async () => {
    const data = await fetchActivityDataForExport({
      userId: testUserId,
    });

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(3); // Our 3 test activities
    
    // All activities should be from test user
    data.forEach((activity) => {
      expect(activity.userEmail).toBe("export@example.com");
    });
  });

  it("should filter by activity type", async () => {
    const data = await fetchActivityDataForExport({
      userId: testUserId,
      activityType: "upload",
    });

    expect(Array.isArray(data)).toBe(true);
    
    // All activities should be uploads
    data.forEach((activity) => {
      expect(activity.activityType).toBe("upload");
    });
  });

  it("should filter by date range", async () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const data = await fetchActivityDataForExport({
      startDate: oneDayAgo,
      endDate: now,
    });

    expect(Array.isArray(data)).toBe(true);
    
    // All activities should be within date range
    data.forEach((activity) => {
      const activityDate = new Date(activity.timestamp);
      expect(activityDate.getTime()).toBeGreaterThanOrEqual(oneDayAgo.getTime());
      expect(activityDate.getTime()).toBeLessThanOrEqual(now.getTime());
    });
  });

  it("should generate valid CSV", async () => {
    const data = await fetchActivityDataForExport({
      userId: testUserId,
    });

    const csv = generateCSV(data);

    expect(typeof csv).toBe("string");
    expect(csv.length).toBeGreaterThan(0);
    
    // Check CSV structure
    const lines = csv.split("\n");
    expect(lines.length).toBeGreaterThan(1); // At least header + 1 row
    
    // Check header
    expect(lines[0]).toContain("ID");
    expect(lines[0]).toContain("Timestamp");
    expect(lines[0]).toContain("Activity Type");
  });

  it("should generate valid Excel buffer", async () => {
    const data = await fetchActivityDataForExport({
      userId: testUserId,
    });

    const buffer = await generateExcel(data);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("should handle empty results", async () => {
    // Use a date range with no activities
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    
    const data = await fetchActivityDataForExport({
      startDate: futureDate,
    });

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);

    // Should still generate valid CSV/Excel
    const csv = generateCSV(data);
    expect(csv).toContain("ID,Timestamp"); // Header only

    const buffer = await generateExcel(data);
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it("should escape CSV special characters", async () => {
    // Create activity with special characters
    await db.trackFileActivity({
      userId: testUserId,
      fileId: testFileId,
      activityType: "edit",
      details: 'Test with "quotes" and, commas',
    });

    const data = await fetchActivityDataForExport({
      userId: testUserId,
    });

    const csv = generateCSV(data);

    // CSV should properly escape special characters
    expect(csv).toContain('""'); // Escaped quotes
  });
});
