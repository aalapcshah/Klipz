import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "../routers";
import type { Context } from "../_core/context";
import { getDb } from "../db";
import { notifications, notificationPreferences } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Notifications Router", () => {
  const mockUser = {
    id: 1,
    openId: "test-user",
    name: "Test User",
    email: "test@example.com",
    role: "user" as const,
  };

  const mockContext: Context = {
    user: mockUser,
    req: {} as any,
    res: {} as any,
  };

  const caller = appRouter.createCaller(mockContext);

  // Note: Tests run sequentially and build on each other's state

  it("should get notification preferences with defaults", async () => {
    const prefs = await caller.notifications.getPreferences();

    expect(prefs).toMatchObject({
      emailOnApproval: true,
      emailOnComment: true,
      emailOnApprovalRequest: true,
      inAppOnApproval: true,
      inAppOnComment: true,
      inAppOnApprovalRequest: true,
    });
  });

  it("should update notification preferences", async () => {
    await caller.notifications.updatePreferences({
      emailOnApproval: false,
      inAppOnComment: false,
    });

    const prefs = await caller.notifications.getPreferences();

    expect(prefs.emailOnApproval).toBe(false);
    expect(prefs.inAppOnComment).toBe(false);
    expect(prefs.emailOnComment).toBe(true); // unchanged
  });

  it("should get empty notifications list initially", async () => {
    const notifs = await caller.notifications.getNotifications();

    expect(notifs).toEqual([]);
  });

  it("should get unread count of zero initially", async () => {
    const result = await caller.notifications.getUnreadCount();

    expect(result.count).toBe(0);
  });

  it("should create and retrieve a notification", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Manually create a notification
    await db.insert(notifications).values({
      userId: mockUser.id,
      type: "approval_approved",
      title: "Test Notification",
      content: "This is a test notification",
      annotationId: 1,
      annotationType: "voice",
      relatedUserId: 2,
      relatedUserName: "Other User",
    });

    const notifs = await caller.notifications.getNotifications();

    expect(notifs.length).toBe(1);
    expect(notifs[0].title).toBe("Test Notification");
    expect(notifs[0].read).toBe(false);
  });

  it("should get unread count correctly", async () => {
    const result = await caller.notifications.getUnreadCount();

    expect(result.count).toBe(1);
  });

  it("should mark notification as read", async () => {
    const notifs = await caller.notifications.getNotifications();
    const notifId = notifs[0].id;

    await caller.notifications.markAsRead({ notificationId: notifId });

    const updated = await caller.notifications.getNotifications();
    expect(updated[0].read).toBe(true);
    expect(updated[0].readAt).not.toBeNull();
  });

  it("should get only unread notifications", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create another unread notification
    await db.insert(notifications).values({
      userId: mockUser.id,
      type: "comment_reply",
      title: "New Comment",
      content: "Someone replied to your comment",
    });

    const unreadOnly = await caller.notifications.getNotifications({ unreadOnly: true });

    expect(unreadOnly.length).toBe(1);
    expect(unreadOnly[0].title).toBe("New Comment");
  });

  it("should mark all notifications as read", async () => {
    await caller.notifications.markAllAsRead();

    const unreadCount = await caller.notifications.getUnreadCount();
    expect(unreadCount.count).toBe(0);
  });

  it("should delete a notification", async () => {
    const notifs = await caller.notifications.getNotifications();
    const notifId = notifs[0].id;

    await caller.notifications.deleteNotification({ notificationId: notifId });

    const remaining = await caller.notifications.getNotifications();
    expect(remaining.length).toBe(notifs.length - 1);
  });

  it("should respect notification limit", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create multiple notifications
    for (let i = 0; i < 10; i++) {
      await db.insert(notifications).values({
        userId: mockUser.id,
        type: "approval_approved",
        title: `Notification ${i}`,
        content: `Content ${i}`,
      });
    }

    const limited = await caller.notifications.getNotifications({ limit: 5 });

    expect(limited.length).toBe(5);
  });
});
