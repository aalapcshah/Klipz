import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";

describe("Notification Preferences", () => {
  let testUserId: number;

  beforeAll(async () => {
    // Create a test user
    const testUser = {
      openId: `test-notif-prefs-${Date.now()}`,
      name: "Test User",
      email: "test@example.com",
    };
    await db.upsertUser(testUser);
    const user = await db.getUserByOpenId(testUser.openId);
    if (!user) throw new Error("Failed to create test user");
    testUserId = user.id;
  });

  it("should return default preferences for new user", async () => {
    const prefs = await db.getActivityNotificationPreferences(testUserId);
    
    expect(prefs).toBeDefined();
    expect(prefs.userId).toBe(testUserId);
    expect(prefs.enableUploadNotifications).toBe(true);
    expect(prefs.enableViewNotifications).toBe(false);
    expect(prefs.enableEditNotifications).toBe(true);
    expect(prefs.enableTagNotifications).toBe(true);
    expect(prefs.enableShareNotifications).toBe(true);
    expect(prefs.enableDeleteNotifications).toBe(true);
    expect(prefs.enableEnrichNotifications).toBe(true);
    expect(prefs.enableExportNotifications).toBe(true);
    expect(prefs.quietHoursStart).toBeNull();
    expect(prefs.quietHoursEnd).toBeNull();
  });

  it("should create new preferences", async () => {
    const prefs = await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      enableUploadNotifications: false,
      enableViewNotifications: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    });
    
    expect(prefs.enableUploadNotifications).toBe(false);
    expect(prefs.enableViewNotifications).toBe(true);
    expect(prefs.quietHoursStart).toBe("22:00");
    expect(prefs.quietHoursEnd).toBe("08:00");
  });

  it("should update existing preferences", async () => {
    // First create preferences
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      enableUploadNotifications: true,
      quietHoursStart: "22:00",
    });
    
    // Then update them
    const updated = await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      enableUploadNotifications: false,
      enableShareNotifications: false,
      quietHoursStart: "23:00",
    });
    
    expect(updated.enableUploadNotifications).toBe(false);
    expect(updated.enableShareNotifications).toBe(false);
    expect(updated.quietHoursStart).toBe("23:00");
  });

  it("should preserve unmodified preferences on update", async () => {
    // Create initial preferences
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      enableUploadNotifications: true,
      enableEditNotifications: false,
      quietHoursStart: "22:00",
    });
    
    // Update only one field
    const updated = await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      enableTagNotifications: false,
    });
    
    // Check that other fields are preserved
    expect(updated.enableUploadNotifications).toBe(true);
    expect(updated.enableEditNotifications).toBe(false);
    expect(updated.enableTagNotifications).toBe(false);
    expect(updated.quietHoursStart).toBe("22:00");
  });

  it("should handle null quiet hours", async () => {
    // Set quiet hours
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    });
    
    // Clear quiet hours
    const updated = await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      quietHoursStart: null,
      quietHoursEnd: null,
    });
    
    expect(updated.quietHoursStart).toBeNull();
    expect(updated.quietHoursEnd).toBeNull();
  });

  it("should retrieve preferences after creation", async () => {
    await db.upsertActivityNotificationPreferences({
      userId: testUserId,
      enableUploadNotifications: false,
      enableViewNotifications: true,
      enableEditNotifications: false,
      quietHoursStart: "23:00",
      quietHoursEnd: "07:00",
    });
    
    const retrieved = await db.getActivityNotificationPreferences(testUserId);
    
    expect(retrieved.enableUploadNotifications).toBe(false);
    expect(retrieved.enableViewNotifications).toBe(true);
    expect(retrieved.enableEditNotifications).toBe(false);
    expect(retrieved.quietHoursStart).toBe("23:00");
    expect(retrieved.quietHoursEnd).toBe("07:00");
  });
});
