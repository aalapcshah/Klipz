import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { engagementAlerts } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  calculateDAU,
  calculateWAU,
  calculateMAU,
  calculateRetentionDay1,
  calculateRetentionDay7,
  calculateRetentionDay30,
} from "../_core/engagementMetrics";
import { notifyOwner } from "../_core/notification";

export const engagementAlertsRouter = router({
  /**
   * Get all engagement alerts
   */
  getAll: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    return await db
      .select()
      .from(engagementAlerts)
      .orderBy(desc(engagementAlerts.createdAt));
  }),

  /**
   * Get a single engagement alert by ID
   */
  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [alert] = await db
        .select()
        .from(engagementAlerts)
        .where(eq(engagementAlerts.id, input.id))
        .limit(1);

      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Engagement alert not found" });
      }

      return alert;
    }),

  /**
   * Create a new engagement alert
   */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        metricType: z.enum(["dau", "wau", "mau", "retention_day1", "retention_day7", "retention_day30"]),
        thresholdType: z.enum(["below", "above"]),
        thresholdValue: z.number().int().min(0),
        notifyEmails: z.string().min(1),
        checkFrequency: z.enum(["hourly", "daily", "weekly"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db.insert(engagementAlerts).values({
        name: input.name,
        description: input.description || null,
        metricType: input.metricType,
        thresholdType: input.thresholdType,
        thresholdValue: input.thresholdValue,
        notifyEmails: input.notifyEmails,
        checkFrequency: input.checkFrequency,
        enabled: true,
        createdBy: ctx.user.id,
      });

      return { success: true };
    }),

  /**
   * Update an engagement alert
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        metricType: z.enum(["dau", "wau", "mau", "retention_day1", "retention_day7", "retention_day30"]).optional(),
        thresholdType: z.enum(["below", "above"]).optional(),
        thresholdValue: z.number().int().min(0).optional(),
        notifyEmails: z.string().optional(),
        checkFrequency: z.enum(["hourly", "daily", "weekly"]).optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { id, ...updates } = input;

      const updateData: any = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.metricType !== undefined) updateData.metricType = updates.metricType;
      if (updates.thresholdType !== undefined) updateData.thresholdType = updates.thresholdType;
      if (updates.thresholdValue !== undefined) updateData.thresholdValue = updates.thresholdValue;
      if (updates.notifyEmails !== undefined) updateData.notifyEmails = updates.notifyEmails;
      if (updates.checkFrequency !== undefined) updateData.checkFrequency = updates.checkFrequency;
      if (updates.enabled !== undefined) updateData.enabled = updates.enabled;

      await db
        .update(engagementAlerts)
        .set(updateData)
        .where(eq(engagementAlerts.id, id));

      return { success: true };
    }),

  /**
   * Delete an engagement alert
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db
        .delete(engagementAlerts)
        .where(eq(engagementAlerts.id, input.id));

      return { success: true };
    }),

  /**
   * Check an alert manually
   */
  checkNow: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [alert] = await db
        .select()
        .from(engagementAlerts)
        .where(eq(engagementAlerts.id, input.id))
        .limit(1);

      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Engagement alert not found" });
      }

      const result = await checkEngagementAlert(alert);

      return {
        success: true,
        triggered: result.triggered,
        currentValue: result.currentValue,
        thresholdValue: alert.thresholdValue,
      };
    }),
});

/**
 * Check an engagement alert and send notification if threshold is crossed
 */
export async function checkEngagementAlert(alert: any): Promise<{ triggered: boolean; currentValue: number }> {
  try {
    // Get current metric value
    let currentValue: number;

    switch (alert.metricType) {
      case "dau":
        currentValue = await calculateDAU();
        break;
      case "wau":
        currentValue = await calculateWAU();
        break;
      case "mau":
        currentValue = await calculateMAU();
        break;
      case "retention_day1":
        currentValue = await calculateRetentionDay1();
        break;
      case "retention_day7":
        currentValue = await calculateRetentionDay7();
        break;
      case "retention_day30":
        currentValue = await calculateRetentionDay30();
        break;
      default:
        throw new Error(`Unknown metric type: ${alert.metricType}`);
    }

    // Check if threshold is crossed
    const triggered =
      (alert.thresholdType === "below" && currentValue < alert.thresholdValue) ||
      (alert.thresholdType === "above" && currentValue > alert.thresholdValue);

    // Update last checked time and value
    const db = await getDb();
    if (db) {
      const updateData: any = {
        lastCheckedAt: new Date(),
        lastValue: currentValue,
      };

      if (triggered) {
        updateData.lastTriggeredAt = new Date();
      }

      await db
        .update(engagementAlerts)
        .set(updateData)
        .where(eq(engagementAlerts.id, alert.id));
    }

    // Send notification if triggered
    if (triggered) {
      const recipients = alert.notifyEmails.split(",").map((email: string) => email.trim());
      
      const metricName = alert.metricType.toUpperCase().replace(/_/g, " ");
      const comparisonText = alert.thresholdType === "below" ? "dropped below" : "exceeded";
      
      await notifyOwner({
        title: `🚨 Engagement Alert: ${alert.name}`,
        content: `
Alert Triggered: ${alert.name}

Metric: ${metricName}
Current Value: ${currentValue}
Threshold: ${alert.thresholdValue}
Status: ${comparisonText} threshold

${alert.description || ""}

Recipients: ${recipients.join(", ")}
Checked: ${new Date().toLocaleString()}

This alert will continue to monitor and notify when thresholds are crossed.
        `.trim(),
      });
    }

    return { triggered, currentValue };
  } catch (error) {
    console.error("[Engagement Alerts] Failed to check alert:", error);
    throw error;
  }
}

/**
 * Check all enabled alerts (to be called by a cron job)
 */
export async function checkAllEngagementAlerts(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const alerts = await db
    .select()
    .from(engagementAlerts)
    .where(eq(engagementAlerts.enabled, true));

  for (const alert of alerts) {
    try {
      await checkEngagementAlert(alert);
    } catch (error) {
      console.error(`[Engagement Alerts] Failed to check alert ${alert.id}:`, error);
    }
  }
}
