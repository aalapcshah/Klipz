import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { scheduledReports } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { fetchActivityDataForExport, generateCSV, generateExcel } from "../_core/activityExport";
import { notifyOwner } from "../_core/notification";

export const scheduledReportsRouter = router({
  /**
   * Get all scheduled reports
   */
  getAll: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    return await db
      .select()
      .from(scheduledReports)
      .orderBy(desc(scheduledReports.createdAt));
  }),

  /**
   * Get a single scheduled report by ID
   */
  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [report] = await db
        .select()
        .from(scheduledReports)
        .where(eq(scheduledReports.id, input.id))
        .limit(1);

      if (!report) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled report not found" });
      }

      return report;
    }),

  /**
   * Create a new scheduled report
   */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        frequency: z.enum(["daily", "weekly", "monthly"]),
        dayOfWeek: z.number().min(0).max(6).optional(),
        dayOfMonth: z.number().min(1).max(31).optional(),
        timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        userId: z.number().optional(),
        activityType: z.string().optional(),
        recipients: z.string().min(1),
        format: z.enum(["csv", "excel"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Calculate next run time
      const nextRunAt = calculateNextRunTime(
        input.frequency,
        input.timeOfDay,
        input.dayOfWeek,
        input.dayOfMonth
      );

      await db.insert(scheduledReports).values({
        name: input.name,
        description: input.description || null,
        frequency: input.frequency,
        dayOfWeek: input.dayOfWeek || null,
        dayOfMonth: input.dayOfMonth || null,
        timeOfDay: input.timeOfDay,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        userId: input.userId || null,
        activityType: input.activityType || null,
        recipients: input.recipients,
        format: input.format,
        enabled: true,
        nextRunAt,
        createdBy: ctx.user.id,
      });

      return { success: true };
    }),

  /**
   * Update a scheduled report
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
        dayOfWeek: z.number().min(0).max(6).optional(),
        dayOfMonth: z.number().min(1).max(31).optional(),
        timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        userId: z.number().optional(),
        activityType: z.string().optional(),
        recipients: z.string().optional(),
        format: z.enum(["csv", "excel"]).optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { id, ...updates } = input;

      // Get current report to calculate next run time if schedule changed
      const [currentReport] = await db
        .select()
        .from(scheduledReports)
        .where(eq(scheduledReports.id, id))
        .limit(1);

      if (!currentReport) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled report not found" });
      }

      const updateData: any = {};

      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.frequency !== undefined) updateData.frequency = updates.frequency;
      if (updates.dayOfWeek !== undefined) updateData.dayOfWeek = updates.dayOfWeek;
      if (updates.dayOfMonth !== undefined) updateData.dayOfMonth = updates.dayOfMonth;
      if (updates.timeOfDay !== undefined) updateData.timeOfDay = updates.timeOfDay;
      if (updates.startDate !== undefined) updateData.startDate = updates.startDate ? new Date(updates.startDate) : null;
      if (updates.endDate !== undefined) updateData.endDate = updates.endDate ? new Date(updates.endDate) : null;
      if (updates.userId !== undefined) updateData.userId = updates.userId;
      if (updates.activityType !== undefined) updateData.activityType = updates.activityType;
      if (updates.recipients !== undefined) updateData.recipients = updates.recipients;
      if (updates.format !== undefined) updateData.format = updates.format;
      if (updates.enabled !== undefined) updateData.enabled = updates.enabled;

      // Recalculate next run time if schedule changed
      if (
        updates.frequency !== undefined ||
        updates.timeOfDay !== undefined ||
        updates.dayOfWeek !== undefined ||
        updates.dayOfMonth !== undefined
      ) {
        updateData.nextRunAt = calculateNextRunTime(
          updates.frequency || currentReport.frequency,
          updates.timeOfDay || currentReport.timeOfDay,
          updates.dayOfWeek !== undefined ? updates.dayOfWeek : currentReport.dayOfWeek,
          updates.dayOfMonth !== undefined ? updates.dayOfMonth : currentReport.dayOfMonth
        );
      }

      await db
        .update(scheduledReports)
        .set(updateData)
        .where(eq(scheduledReports.id, id));

      return { success: true };
    }),

  /**
   * Delete a scheduled report
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db
        .delete(scheduledReports)
        .where(eq(scheduledReports.id, input.id));

      return { success: true };
    }),

  /**
   * Run a scheduled report manually
   */
  runNow: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [report] = await db
        .select()
        .from(scheduledReports)
        .where(eq(scheduledReports.id, input.id))
        .limit(1);

      if (!report) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled report not found" });
      }

      await executeScheduledReport(report);

      return { success: true };
    }),
});

/**
 * Calculate the next run time for a scheduled report
 */
function calculateNextRunTime(
  frequency: "daily" | "weekly" | "monthly",
  timeOfDay: string,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null
): Date {
  const now = new Date();
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  
  const nextRun = new Date(now);
  nextRun.setHours(hours, minutes, 0, 0);

  if (frequency === "daily") {
    // If time has passed today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
  } else if (frequency === "weekly") {
    // Schedule for the specified day of week
    const targetDay = dayOfWeek || 0;
    const currentDay = nextRun.getDay();
    let daysUntilTarget = targetDay - currentDay;
    
    if (daysUntilTarget < 0 || (daysUntilTarget === 0 && nextRun <= now)) {
      daysUntilTarget += 7;
    }
    
    nextRun.setDate(nextRun.getDate() + daysUntilTarget);
  } else if (frequency === "monthly") {
    // Schedule for the specified day of month
    const targetDay = dayOfMonth || 1;
    nextRun.setDate(targetDay);
    
    // If the date has passed this month, move to next month
    if (nextRun <= now) {
      nextRun.setMonth(nextRun.getMonth() + 1);
    }
  }

  return nextRun;
}

/**
 * Execute a scheduled report
 */
export async function executeScheduledReport(report: any): Promise<void> {
  try {
    // Fetch activity data with filters
    const filters: any = {};
    
    if (report.startDate) {
      filters.startDate = report.startDate;
    }
    
    if (report.endDate) {
      filters.endDate = report.endDate;
    }
    
    if (report.userId) {
      filters.userId = report.userId;
    }
    
    if (report.activityType) {
      filters.activityType = report.activityType;
    }

    const data = await fetchActivityDataForExport(filters);

    // Generate report in requested format
    let fileBuffer: Buffer;
    let filename: string;
    let mimeType: string;

    if (report.format === "csv") {
      const csv = generateCSV(data);
      fileBuffer = Buffer.from(csv);
      filename = `${report.name.replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.csv`;
      mimeType = "text/csv";
    } else {
      fileBuffer = await generateExcel(data);
      filename = `${report.name.replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.xlsx`;
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }

    // Send notification to owner (in production, this would email the recipients)
    const recipients = report.recipients.split(",").map((email: string) => email.trim());
    
    await notifyOwner({
      title: `Scheduled Report: ${report.name}`,
      content: `
Scheduled activity report generated.

Report: ${report.name}
Recipients: ${recipients.join(", ")}
Period: ${report.startDate ? new Date(report.startDate).toLocaleDateString() : "All time"} - ${report.endDate ? new Date(report.endDate).toLocaleDateString() : "Present"}
Total Activities: ${data.length}
Format: ${report.format.toUpperCase()}

Generated: ${new Date().toLocaleString()}

Note: In production, this report would be emailed to recipients with the ${filename} file attached.
      `.trim(),
    });

    // Update last run time and calculate next run
    const db = await getDb();
    if (db) {
      const nextRunAt = calculateNextRunTime(
        report.frequency,
        report.timeOfDay,
        report.dayOfWeek,
        report.dayOfMonth
      );

      await db
        .update(scheduledReports)
        .set({
          lastRunAt: new Date(),
          nextRunAt,
        })
        .where(eq(scheduledReports.id, report.id));
    }
  } catch (error) {
    console.error("[Scheduled Reports] Failed to execute report:", error);
    throw error;
  }
}
