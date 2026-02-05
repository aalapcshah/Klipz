import { getDb } from "../db";
import { users, fileActivityLogs } from "../../drizzle/schema";
import { eq, gte, and } from "drizzle-orm";
import { notifyOwner } from "./notification";
import * as db from "../db";

interface DigestActivity {
  id: number;
  activityType: string;
  details: string | null;
  createdAt: Date;
  fileName?: string;
}

/**
 * Generate and send daily digest emails
 */
export async function sendDailyDigests(): Promise<number> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  let sentCount = 0;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Get all users with daily digest enabled
  const allUsers = await database.select().from(users);

  for (const user of allUsers) {
    try {
      // Get user preferences
      const prefs = await db.getActivityNotificationPreferences(user.id);

      // Skip if not daily digest
      if (prefs.emailDigestFrequency !== "daily") {
        continue;
      }

      // Get activities from last 24 hours
      const activities = await database
        .select()
        .from(fileActivityLogs)
        .where(
          and(
            eq(fileActivityLogs.userId, user.id),
            gte(fileActivityLogs.createdAt, oneDayAgo)
          )
        )
        .orderBy(fileActivityLogs.createdAt);

      // Skip if no activities
      if (activities.length === 0) {
        continue;
      }

      // Group activities by type
      const activityByType: Record<string, number> = {};
      activities.forEach((activity: any) => {
        activityByType[activity.activityType] = (activityByType[activity.activityType] || 0) + 1;
      });

      // Build digest email
      const emailContent = buildDigestEmail({
        userName: user.name || user.email || "User",
        period: "daily",
        activities: activities as DigestActivity[],
        activityByType,
      });

      // Send email
      await notifyOwner({
        title: `[Klipz] Daily Activity Digest for ${user.name || user.email}`,
        content: emailContent,
      });

      sentCount++;
      console.log(`[EmailDigest] Sent daily digest to user ${user.id}`);
    } catch (error) {
      console.error(`[EmailDigest] Failed to send daily digest to user ${user.id}:`, error);
    }
  }

  return sentCount;
}

/**
 * Generate and send weekly digest emails
 */
export async function sendWeeklyDigests(): Promise<number> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  let sentCount = 0;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Get all users with weekly digest enabled
  const allUsers = await database.select().from(users);

  for (const user of allUsers) {
    try {
      // Get user preferences
      const prefs = await db.getActivityNotificationPreferences(user.id);

      // Skip if not weekly digest
      if (prefs.emailDigestFrequency !== "weekly") {
        continue;
      }

      // Get activities from last 7 days
      const activities = await database
        .select()
        .from(fileActivityLogs)
        .where(
          and(
            eq(fileActivityLogs.userId, user.id),
            gte(fileActivityLogs.createdAt, sevenDaysAgo)
          )
        )
        .orderBy(fileActivityLogs.createdAt);

      // Skip if no activities
      if (activities.length === 0) {
        continue;
      }

      // Group activities by type
      const activityByType: Record<string, number> = {};
      activities.forEach((activity: any) => {
        activityByType[activity.activityType] = (activityByType[activity.activityType] || 0) + 1;
      });

      // Build digest email
      const emailContent = buildDigestEmail({
        userName: user.name || user.email || "User",
        period: "weekly",
        activities: activities as DigestActivity[],
        activityByType,
      });

      // Send email
      await notifyOwner({
        title: `[Klipz] Weekly Activity Digest for ${user.name || user.email}`,
        content: emailContent,
      });

      sentCount++;
      console.log(`[EmailDigest] Sent weekly digest to user ${user.id}`);
    } catch (error) {
      console.error(`[EmailDigest] Failed to send weekly digest to user ${user.id}:`, error);
    }
  }

  return sentCount;
}

/**
 * Build digest email content
 */
function buildDigestEmail(params: {
  userName: string;
  period: "daily" | "weekly";
  activities: DigestActivity[];
  activityByType: Record<string, number>;
}): string {
  const { userName, period, activities, activityByType } = params;

  const periodLabel = period === "daily" ? "Last 24 Hours" : "Last 7 Days";
  const totalActivities = activities.length;

  // Build activity summary
  const summaryLines = Object.entries(activityByType)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => `  • ${type}: ${count}`)
    .join("\n");

  // Get recent activities (last 10)
  const recentActivities = activities
    .slice(-10)
    .reverse()
    .map((activity) => {
      const time = new Date(activity.createdAt).toLocaleString();
      const details = activity.details ? ` - ${activity.details}` : "";
      return `  • [${time}] ${activity.activityType}${details}`;
    })
    .join("\n");

  return `
Hi ${userName},

Here's your ${period} activity digest for Klipz.

📊 Activity Summary (${periodLabel})
Total Activities: ${totalActivities}

${summaryLines}

📝 Recent Activities
${recentActivities}

---
To change your digest preferences, visit Settings > Notifications in Klipz.
  `.trim();
}

/**
 * Update email notification service to respect digest frequency
 */
export function shouldSendImmediateEmail(digestFrequency: string): boolean {
  return digestFrequency === "immediate";
}
