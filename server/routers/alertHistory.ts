import { router, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";

const db = getDb();
import { alertNotificationLog, engagementAlerts } from "../../drizzle/schema";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";

export const alertHistoryRouter = router({
  getAll: adminProcedure
    .input(
      z.object({
        alertId: z.number().optional(),
        status: z.enum(["triggered", "resolved", "acknowledged"]).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const conditions = [];

      if (input.alertId) {
        conditions.push(eq(alertNotificationLog.alertId, input.alertId));
      }

      if (input.status) {
        conditions.push(eq(alertNotificationLog.status, input.status));
      }

      if (input.startDate) {
        const startTimestamp = new Date(input.startDate);
        conditions.push(gte(alertNotificationLog.triggeredAt, startTimestamp));
      }

      if (input.endDate) {
        const endTimestamp = new Date(input.endDate);
        conditions.push(lte(alertNotificationLog.triggeredAt, endTimestamp));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const dbInstance = await db;
      if (!dbInstance) throw new Error("Database not available");
      const logs = await dbInstance
        .select({
          id: alertNotificationLog.id,
          alertId: alertNotificationLog.alertId,
          alertName: engagementAlerts.name,
          metricType: engagementAlerts.metricType,
          thresholdType: engagementAlerts.thresholdType,
          triggeredAt: alertNotificationLog.triggeredAt,
          metricValue: alertNotificationLog.metricValue,
          thresholdValue: alertNotificationLog.thresholdValue,
          status: alertNotificationLog.status,
          resolvedAt: alertNotificationLog.resolvedAt,
          notes: alertNotificationLog.notes,
          createdAt: alertNotificationLog.createdAt,
        })
        .from(alertNotificationLog)
        .leftJoin(engagementAlerts, eq(alertNotificationLog.alertId, engagementAlerts.id))
        .where(whereClause)
        .orderBy(desc(alertNotificationLog.triggeredAt))
        .limit(input.limit)
        .offset(input.offset);

      return logs;
    }),

  getStats: adminProcedure.query(async () => {
    const dbInstance = await db;
    if (!dbInstance) throw new Error("Database not available");
    const [totalTriggered] = await dbInstance
      .select({ count: sql<number>`count(*)` })
      .from(alertNotificationLog);

    const [triggeredToday] = await dbInstance
      .select({ count: sql<number>`count(*)` })
      .from(alertNotificationLog)
      .where(
        gte(alertNotificationLog.triggeredAt, new Date(new Date().setHours(0, 0, 0, 0)))
      );

    const [unresolvedCount] = await dbInstance
      .select({ count: sql<number>`count(*)` })
      .from(alertNotificationLog)
      .where(eq(alertNotificationLog.status, "triggered"));

    return {
      totalTriggered: totalTriggered?.count || 0,
      triggeredToday: triggeredToday?.count || 0,
      unresolved: unresolvedCount?.count || 0,
    };
  }),

  updateStatus: adminProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["triggered", "resolved", "acknowledged"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const updates: any = {
        status: input.status,
      };

      if (input.notes) {
        updates.notes = input.notes;
      }

      if (input.status === "resolved") {
        updates.resolvedAt = new Date();
      }

      const dbInstance = await db;
      if (!dbInstance) throw new Error("Database not available");
      await dbInstance
        .update(alertNotificationLog)
        .set(updates)
        .where(eq(alertNotificationLog.id, input.id));

      return { success: true };
    }),

  logAlert: adminProcedure
    .input(
      z.object({
        alertId: z.number(),
        metricValue: z.number(),
        thresholdValue: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const dbInstance = await db;
      if (!dbInstance) throw new Error("Database not available");
      await dbInstance.insert(alertNotificationLog).values({
        alertId: input.alertId,
        triggeredAt: new Date(),
        metricValue: input.metricValue,
        thresholdValue: input.thresholdValue,
        status: "triggered",
      });

      return { success: true };
    }),
});
