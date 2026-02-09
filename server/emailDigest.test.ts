import { describe, it, expect, beforeAll, vi } from "vitest";
import * as db from "./db";
import { shouldSendImmediateEmail } from "./_core/emailDigest";

// These tests focus on the preference logic and helper functions.
// The sendDailyDigests/sendWeeklyDigests functions iterate over ALL users in the DB,
// which is too slow for unit tests. Integration tests should cover those separately.

describe("Email Digest System", { timeout: 15000 }, () => {
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

  it("shouldSendImmediateEmail returns true for immediate frequency", () => {
    expect(shouldSendImmediateEmail("immediate")).toBe(true);
  });

  it("shouldSendImmediateEmail returns false for daily frequency", () => {
    expect(shouldSendImmediateEmail("daily")).toBe(false);
  });

  it("shouldSendImmediateEmail returns false for weekly frequency", () => {
    expect(shouldSendImmediateEmail("weekly")).toBe(false);
  });

  it("shouldSendImmediateEmail returns false for disabled frequency", () => {
    expect(shouldSendImmediateEmail("disabled")).toBe(false);
  });
});
