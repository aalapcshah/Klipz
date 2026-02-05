import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { notifyOwner } from "./notification";
import * as db from "../db";

export type ActivityType = "upload" | "view" | "edit" | "tag" | "share" | "delete" | "enrich" | "export";

interface SendActivityEmailParams {
  userId: number;
  activityType: ActivityType;
  title: string;
  content: string;
  fileId?: number;
  fileName?: string;
  details?: string;
}

/**
 * Check if current time is within quiet hours
 */
function isWithinQuietHours(quietHoursStart: string | null, quietHoursEnd: string | null): boolean {
  if (!quietHoursStart || !quietHoursEnd) {
    return false;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const [startHour, startMinute] = quietHoursStart.split(':').map(Number);
  const [endHour, endMinute] = quietHoursEnd.split(':').map(Number);
  const startTime = startHour * 60 + startMinute;
  const endTime = endHour * 60 + endMinute;

  // Handle quiet hours that span midnight
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  }

  return currentTime >= startTime && currentTime < endTime;
}

/**
 * Send email notification for activity events
 */
export async function sendActivityEmail(params: SendActivityEmailParams): Promise<boolean> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  try {
    // Get activity notification preferences
    const prefs = await db.getActivityNotificationPreferences(params.userId);
    
    // Check if digest is enabled (skip immediate emails if digest is active)
    if (prefs.emailDigestFrequency !== "immediate") {
      console.log(`[ActivityEmail] Skipping immediate email - digest mode is ${prefs.emailDigestFrequency}`);
      return false;
    }

    // Check if email notifications are enabled for this activity type
    const enableField = `enable${params.activityType.charAt(0).toUpperCase() + params.activityType.slice(1)}Notifications` as keyof typeof prefs;
    const isEnabled = prefs[enableField];

    if (!isEnabled) {
      console.log(`[ActivityEmail] Email notifications disabled for ${params.activityType}`);
      return false;
    }

    // Check quiet hours
    if (isWithinQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd)) {
      console.log(`[ActivityEmail] Skipping email - within quiet hours (${prefs.quietHoursStart} - ${prefs.quietHoursEnd})`);
      return false;
    }

    // Get user email
    const [user] = await database
      .select()
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1);

    if (!user || !user.email) {
      console.log(`[ActivityEmail] No email found for user ${params.userId}`);
      return false;
    }

    // Build email content
    const emailContent = `
${params.title}

${params.content}

${params.details ? `\nDetails: ${params.details}` : ''}

---
Activity Type: ${params.activityType}
${params.fileName ? `File: ${params.fileName}` : ''}
User: ${user.name || user.email}
Time: ${new Date().toLocaleString()}

---
To manage your notification preferences, visit Settings > Notifications in Klipz.
    `.trim();

    // Send via owner notification system
    await notifyOwner({
      title: `[Klipz Activity] ${params.title}`,
      content: emailContent,
    });

    console.log(`[ActivityEmail] Sent ${params.activityType} notification to user ${params.userId}`);
    return true;
  } catch (error) {
    console.error("[ActivityEmail] Failed to send activity email:", error);
    return false;
  }
}

/**
 * Send email notification for file upload
 */
export async function sendUploadEmail(userId: number, fileName: string, fileId: number) {
  return sendActivityEmail({
    userId,
    activityType: "upload",
    title: "New File Uploaded",
    content: `A new file "${fileName}" has been uploaded to your Klipz library.`,
    fileId,
    fileName,
  });
}

/**
 * Send email notification for file edit
 */
export async function sendEditEmail(userId: number, fileName: string, fileId: number, details: string) {
  return sendActivityEmail({
    userId,
    activityType: "edit",
    title: "File Updated",
    content: `The file "${fileName}" has been updated.`,
    fileId,
    fileName,
    details,
  });
}

/**
 * Send email notification for file tag
 */
export async function sendTagEmail(userId: number, fileName: string, fileId: number, tags: string[]) {
  return sendActivityEmail({
    userId,
    activityType: "tag",
    title: "File Tagged",
    content: `Tags have been added to "${fileName}".`,
    fileId,
    fileName,
    details: `Tags: ${tags.join(', ')}`,
  });
}

/**
 * Send email notification for file share
 */
export async function sendShareEmail(userId: number, fileName: string, fileId: number) {
  return sendActivityEmail({
    userId,
    activityType: "share",
    title: "File Shared",
    content: `The file "${fileName}" has been shared.`,
    fileId,
    fileName,
  });
}

/**
 * Send email notification for file delete
 */
export async function sendDeleteEmail(userId: number, fileName: string) {
  return sendActivityEmail({
    userId,
    activityType: "delete",
    title: "File Deleted",
    content: `The file "${fileName}" has been deleted from your library.`,
    fileName,
  });
}

/**
 * Send email notification for enrichment
 */
export async function sendEnrichEmail(userId: number, fileName: string, fileId: number) {
  return sendActivityEmail({
    userId,
    activityType: "enrich",
    title: "File Enrichment Complete",
    content: `AI enrichment has been completed for "${fileName}".`,
    fileId,
    fileName,
  });
}

/**
 * Send email notification for export
 */
export async function sendExportEmail(userId: number, fileName: string, format: string) {
  return sendActivityEmail({
    userId,
    activityType: "export",
    title: "File Export Complete",
    content: `Your export of "${fileName}" is ready.`,
    fileName,
    details: `Format: ${format}`,
  });
}
