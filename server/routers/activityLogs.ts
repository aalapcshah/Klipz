import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { trackFileActivity, getActivityLogs, getActivityStats } from "../db";

export const activityLogsRouter = router({
  track: protectedProcedure
    .input(
      z.object({
        fileId: z.number().optional(),
        activityType: z.enum(["upload", "view", "edit", "tag", "share", "delete", "enrich", "export"]),
        details: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await trackFileActivity({
        userId: ctx.user.id,
        fileId: input.fileId,
        activityType: input.activityType,
        details: input.details,
      });
    }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().optional().default(50),
        offset: z.number().optional().default(0),
        activityType: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return await getActivityLogs({
        userId: ctx.user.id,
        limit: input.limit,
        offset: input.offset,
        activityType: input.activityType,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      });
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    return await getActivityStats(ctx.user.id);
  }),

  statistics: protectedProcedure.query(async ({ ctx }) => {
    const { getDb } = await import("../db");
    const { fileActivityLogs } = await import("../../drizzle/schema");
    const { sql, eq, gte, and } = await import("drizzle-orm");
    const { TRPCError } = await import("@trpc/server");

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get daily activity (last 30 days) grouped by type
    const dailyActivityRaw = await db
      .select({
        date: sql<string>`DATE(${fileActivityLogs.createdAt})`,
        activityType: fileActivityLogs.activityType,
        count: sql<number>`COUNT(*)`,
      })
      .from(fileActivityLogs)
      .where(
        and(
          eq(fileActivityLogs.userId, ctx.user!.id),
          gte(fileActivityLogs.createdAt, thirtyDaysAgo)
        )
      )
      .groupBy(sql`DATE(${fileActivityLogs.createdAt})`, fileActivityLogs.activityType)
      .orderBy(sql`DATE(${fileActivityLogs.createdAt})`);

    // Transform to format expected by chart
    const dailyActivity: any[] = [];
    const dateMap = new Map<string, any>();
    
    dailyActivityRaw.forEach((row: any) => {
      if (!dateMap.has(row.date)) {
        dateMap.set(row.date, { date: row.date, uploads: 0, views: 0, edits: 0 });
      }
      const entry = dateMap.get(row.date)!;
      if (row.activityType === 'upload') entry.uploads = row.count;
      else if (row.activityType === 'view') entry.views = row.count;
      else if (row.activityType === 'edit') entry.edits = row.count;
    });
    
    dateMap.forEach(value => dailyActivity.push(value));

    // Get peak hours (24-hour array)
    const peakHoursRaw = await db
      .select({
        hour: sql<number>`HOUR(${fileActivityLogs.createdAt})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(fileActivityLogs)
      .where(eq(fileActivityLogs.userId, ctx.user!.id))
      .groupBy(sql`HOUR(${fileActivityLogs.createdAt})`);
    
    const hourlyActivity = Array(24).fill(0);
    peakHoursRaw.forEach((row: any) => {
      hourlyActivity[row.hour] = row.count;
    });

    // Get activity types
    const activityTypes = await db
      .select({
        type: fileActivityLogs.activityType,
        count: sql<number>`COUNT(*)`,
      })
      .from(fileActivityLogs)
      .where(eq(fileActivityLogs.userId, ctx.user!.id))
      .groupBy(fileActivityLogs.activityType);

    // Get total activities
    const totalResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(fileActivityLogs)
      .where(eq(fileActivityLogs.userId, ctx.user!.id));
    
    // Get today's activities
    const todayResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(fileActivityLogs)
      .where(
        and(
          eq(fileActivityLogs.userId, ctx.user!.id),
          gte(fileActivityLogs.createdAt, today)
        )
      );
    
    // Get week's activities
    const weekResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(fileActivityLogs)
      .where(
        and(
          eq(fileActivityLogs.userId, ctx.user!.id),
          gte(fileActivityLogs.createdAt, weekAgo)
        )
      );
    
    // Get month's activities
    const monthResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(fileActivityLogs)
      .where(
        and(
          eq(fileActivityLogs.userId, ctx.user!.id),
          gte(fileActivityLogs.createdAt, monthAgo)
        )
      );

    return {
      dailyActivity,
      hourlyActivity,
      activityTypes,
      totalActivities: totalResult[0]?.count || 0,
      todayActivities: todayResult[0]?.count || 0,
      weekActivities: weekResult[0]?.count || 0,
      monthActivities: monthResult[0]?.count || 0
    };
  }),

  export: protectedProcedure
    .input(
      z.object({
        format: z.enum(["csv", "json"]),
        activityType: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const logs = await getActivityLogs({
        userId: ctx.user.id,
        activityType: input.activityType,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        limit: 10000, // Export limit
      });

      if (input.format === "csv") {
        // Convert to CSV
        const headers = ["Timestamp", "Activity Type", "File Name", "Details"];
        const rows = logs.map((log: any) => [
          new Date(log.createdAt).toISOString(),
          log.activityType,
          log.file?.filename || "N/A",
          log.details || "",
        ]);
        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
        return { data: csv, filename: `activity-logs-${Date.now()}.csv` };
      } else {
        // Return JSON
        return { data: JSON.stringify(logs, null, 2), filename: `activity-logs-${Date.now()}.json` };
      }
    }),
});
