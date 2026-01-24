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
