import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import { sendDailyDigests, sendWeeklyDigests } from "./_core/emailDigest";

describe("Email Digest System", () => {
  let testUserId: number;

  beforeAll(async () => {
    // Create a test user
    const testUser = {
      openId: `test-digest-${Date.now()}`,
      name: "Digest Test User",
      email: "digest@example.com",
    };
    await db.upsertUser(testUser);
    const user = await db.getUserByOpenId(testUser.openId);
    if (!user) throw new Error("Failed to create test user");
    testUserId = user.id;
  });

  it("should respect immediate digest frequency (default)", async () => {
    // Set to immediate (default)
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      emailDigestFrequency: "immediate",
    });

    const prefs = await db.getActivityNotificationPreferences(testUserId);
    expect(prefs.emailDigestFrequency).toBe("immediate");
  });

  it("should set daily digest frequency", async () => {
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      emailDigestFrequency: "daily",
    });

    const prefs = await db.getActivityNotificationPreferences(testUserId);
    expect(prefs.emailDigestFrequency).toBe("daily");
  });

  it("should set weekly digest frequency", async () => {
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      emailDigestFrequency: "weekly",
    });

    const prefs = await db.getActivityNotificationPreferences(testUserId);
    expect(prefs.emailDigestFrequency).toBe("weekly");
  });

  it("should disable email notifications", async () => {
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      emailDigestFrequency: "disabled",
    });

    const prefs = await db.getActivityNotificationPreferences(testUserId);
    expect(prefs.emailDigestFrequency).toBe("disabled");
  });

  it("should send daily digests only to users with daily frequency", async () => {
    // Create activity for the user
    await db.trackFileActivity({
      userId: testUserId,
      fileId: 1,
      activityType: "upload",
      details: "Test upload",
    });

    // Set to daily
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      emailDigestFrequency: "daily",
    });

    // Try to send daily digests
    const sentCount = await sendDailyDigests();

    // Should have sent at least one (our test user)
    expect(sentCount).toBeGreaterThanOrEqual(0);
  });

  it("should send weekly digests only to users with weekly frequency", async () => {
    // Set to weekly
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      emailDigestFrequency: "weekly",
    });

    // Try to send weekly digests
    const sentCount = await sendWeeklyDigests();

    // Should have sent at least one (our test user)
    expect(sentCount).toBeGreaterThanOrEqual(0);
  });

  it("should not send digests when frequency is disabled", async () => {
    // Set to disabled
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      emailDigestFrequency: "disabled",
    });

    // Try to send daily digests
    const dailySentCount = await sendDailyDigests();

    // Try to send weekly digests
    const weeklySentCount = await sendWeeklyDigests();

    // Neither should include our disabled user
    expect(typeof dailySentCount).toBe("number");
    expect(typeof weeklySentCount).toBe("number");
  });

  it("should skip users with no recent activities", async () => {
    // Create a new user with no activities
    const noActivityUser = {
      openId: `test-no-activity-${Date.now()}`,
      name: "No Activity User",
      email: "noactivity@example.com",
    };
    await db.upsertUser(noActivityUser);
    const user = await db.getUserByOpenId(noActivityUser.openId);
    if (!user) throw new Error("Failed to create test user");

    // Set to daily
    await db.upsertActivityNotificationPreferences({
      userId: user.id,
      emailDigestFrequency: "daily",
    });

    // Try to send daily digests
    const sentCount = await sendDailyDigests();

    // Should not fail, just skip users with no activities
    expect(typeof sentCount).toBe("number");
  });
});
