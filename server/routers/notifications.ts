import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { notifications, notificationPreferences } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

export const notificationsRouter = router({
  /**
   * Get all notifications for the current user
   */
  getNotifications: protectedProcedure
    .input(
      z
        .object({
          unreadOnly: z.boolean().optional(),
          limit: z.number().min(1).max(100).default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (input?.unreadOnly) {
        const results = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, ctx.user.id),
              eq(notifications.read, false)
            )
          )
          .orderBy(desc(notifications.createdAt))
          .limit(input?.limit || 50);
        return results;
      }

      const results = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, ctx.user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(input?.limit || 50);

      return results;
    }),

  /**
   * Get unread notification count
   */
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const unread = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ctx.user.id),
          eq(notifications.read, false)
        )
      );

    return { count: unread.length };
  }),

  /**
   * Mark a notification as read
   */
  markAsRead: protectedProcedure
    .input(
      z.object({
        notificationId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(notifications)
        .set({
          read: true,
          readAt: new Date(),
        })
        .where(
          and(
            eq(notifications.id, input.notificationId),
            eq(notifications.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  /**
   * Mark all notifications as read
   */
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db
      .update(notifications)
      .set({
        read: true,
        readAt: new Date(),
      })
      .where(eq(notifications.userId, ctx.user.id));

    return { success: true };
  }),

  /**
   * Delete a notification
   */
  deleteNotification: protectedProcedure
    .input(
      z.object({
        notificationId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.id, input.notificationId),
            eq(notifications.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  /**
   * Get notification preferences
   */
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, ctx.user.id))
      .limit(1);

    // Return default preferences if not set
    if (!prefs) {
      return {
        emailOnApproval: true,
        emailOnComment: true,
        emailOnApprovalRequest: true,
        inAppOnApproval: true,
        inAppOnComment: true,
        inAppOnApprovalRequest: true,
      };
    }

    return prefs;
  }),

  /**
   * Update notification preferences
   */
  updatePreferences: protectedProcedure
    .input(
      z.object({
        emailOnApproval: z.boolean().optional(),
        emailOnComment: z.boolean().optional(),
        emailOnApprovalRequest: z.boolean().optional(),
        inAppOnApproval: z.boolean().optional(),
        inAppOnComment: z.boolean().optional(),
        inAppOnApprovalRequest: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check if preferences exist
      const [existing] = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, ctx.user.id))
        .limit(1);

      if (existing) {
        // Update existing preferences
        await db
          .update(notificationPreferences)
          .set(input)
          .where(eq(notificationPreferences.userId, ctx.user.id));
      } else {
        // Create new preferences
        await db.insert(notificationPreferences).values({
          userId: ctx.user.id,
          ...input,
        });
      }

      return { success: true };
    }),
});
