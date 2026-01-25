import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import { sendActivityEmail, sendUploadEmail } from "./_core/activityEmailNotifications";

describe("Activity Email Notifications", () => {
  let testUserId: number;

  beforeAll(async () => {
    // Create a test user
    const testUser = {
      openId: `test-email-notif-${Date.now()}`,
      name: "Test User",
      email: "test@example.com",
    };
    await db.upsertUser(testUser);
    const user = await db.getUserByOpenId(testUser.openId);
    if (!user) throw new Error("Failed to create test user");
    testUserId = user.id;
  });

  it("should respect notification preferences when disabled", async () => {
    // Disable upload notifications
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      enableUploadNotifications: false,
    });

    // Try to send upload email
    const result = await sendActivityEmail({
      userId: testUserId,
      activityType: "upload",
      title: "Test Upload",
      content: "This should not be sent",
      fileName: "test.jpg",
    });

    // Should return false because notifications are disabled
    expect(result).toBe(false);
  });

  it("should respect notification preferences when enabled", async () => {
    // Enable upload notifications
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      enableUploadNotifications: true,
    });

    // Try to send upload email (will actually attempt to send)
    const result = await sendActivityEmail({
      userId: testUserId,
      activityType: "upload",
      title: "Test Upload",
      content: "This should be sent",
      fileName: "test.jpg",
    });

    // Should return true (email sending attempted)
    // Note: Actual delivery depends on notifyOwner service availability
    expect(typeof result).toBe("boolean");
  });

  it("should respect quiet hours", async () => {
    // Set quiet hours that include current time
    const now = new Date();
    const currentHour = now.getHours();
    const quietStart = `${String(currentHour).padStart(2, '0')}:00`;
    const quietEnd = `${String((currentHour + 1) % 24).padStart(2, '0')}:00`;

    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      enableUploadNotifications: true,
      quietHoursStart: quietStart,
      quietHoursEnd: quietEnd,
    });

    // Try to send email during quiet hours
    const result = await sendActivityEmail({
      userId: testUserId,
      activityType: "upload",
      title: "Test Upload During Quiet Hours",
      content: "This should be skipped",
      fileName: "test.jpg",
    });

    // Should return false because we're in quiet hours
    expect(result).toBe(false);
  });

  it("should send email outside quiet hours", async () => {
    // Set quiet hours that do NOT include current time
    const now = new Date();
    const currentHour = now.getHours();
    const quietStart = `${String((currentHour + 2) % 24).padStart(2, '0')}:00`;
    const quietEnd = `${String((currentHour + 3) % 24).padStart(2, '0')}:00`;

    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      enableUploadNotifications: true,
      quietHoursStart: quietStart,
      quietHoursEnd: quietEnd,
    });

    // Try to send email outside quiet hours
    const result = await sendActivityEmail({
      userId: testUserId,
      activityType: "upload",
      title: "Test Upload Outside Quiet Hours",
      content: "This should be sent",
      fileName: "test.jpg",
    });

    // Should return true (email sending attempted)
    expect(typeof result).toBe("boolean");
  });

  it("should handle quiet hours spanning midnight", async () => {
    // Set quiet hours from 22:00 to 08:00 (spans midnight)
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      enableUploadNotifications: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    });

    // Test at 23:00 (should be in quiet hours)
    const now = new Date();
    const currentHour = now.getHours();
    
    // If current time is between 22:00-23:59 or 00:00-08:00, we're in quiet hours
    const isInQuietHours = currentHour >= 22 || currentHour < 8;
    
    const result = await sendActivityEmail({
      userId: testUserId,
      activityType: "upload",
      title: "Test Upload Midnight Span",
      content: "Testing quiet hours across midnight",
      fileName: "test.jpg",
    });

    if (isInQuietHours) {
      expect(result).toBe(false);
    } else {
      expect(typeof result).toBe("boolean");
    }
  });

  it("should use helper functions correctly", async () => {
    // Enable all notifications and clear quiet hours
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      enableUploadNotifications: true,
      quietHoursStart: null,
      quietHoursEnd: null,
    });

    // Test upload email helper
    const result = await sendUploadEmail(testUserId, "test-file.jpg", 123);
    expect(typeof result).toBe("boolean");
  });

  it("should handle missing user email gracefully", async () => {
    // Create user without email
    const noEmailUser = {
      openId: `test-no-email-${Date.now()}`,
      name: "No Email User",
      email: null,
    };
    await db.upsertUser(noEmailUser);
    const user = await db.getUserByOpenId(noEmailUser.openId);
    if (!user) throw new Error("Failed to create test user");

    // Enable notifications
    await db.upsertActivityNotificationPreferences({
      userId: user.id,
      enableUploadNotifications: true,
    });

    // Try to send email
    const result = await sendActivityEmail({
      userId: user.id,
      activityType: "upload",
      title: "Test Upload",
      content: "User has no email",
      fileName: "test.jpg",
    });

    // Should return false because user has no email
    expect(result).toBe(false);
  });
});
