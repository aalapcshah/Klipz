import { getDb } from "../db";
import { notifications, notificationPreferences, users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { notifyOwner } from "./notification";

interface CreateNotificationParams {
  userId: number;
  type: "approval_approved" | "approval_rejected" | "comment_reply" | "approval_requested";
  title: string;
  content: string;
  annotationId?: number;
  annotationType?: "voice" | "visual";
  relatedUserId?: number;
  relatedUserName?: string;
}

/**
 * Create an in-app notification
 */
export async function createNotification(params: CreateNotificationParams) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check user preferences
  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, params.userId))
    .limit(1);

  // Create default preferences if not exists
  if (!prefs) {
    await db.insert(notificationPreferences).values({
      userId: params.userId,
    });
  }

  // Check if in-app notification is enabled
  const shouldSendInApp =
    !prefs ||
    (params.type === "approval_approved" && prefs.inAppOnApproval) ||
    (params.type === "approval_rejected" && prefs.inAppOnApproval) ||
    (params.type === "comment_reply" && prefs.inAppOnComment) ||
    (params.type === "approval_requested" && prefs.inAppOnApprovalRequest);

  if (!shouldSendInApp) {
    return null;
  }

  // Create notification
  const [notification] = await db.insert(notifications).values({
    userId: params.userId,
    type: params.type,
    title: params.title,
    content: params.content,
    annotationId: params.annotationId,
    annotationType: params.annotationType,
    relatedUserId: params.relatedUserId,
    relatedUserName: params.relatedUserName,
  });

  return notification.insertId;
}

/**
 * Send email notification (using owner notification system)
 */
export async function sendEmailNotification(params: CreateNotificationParams) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check user preferences
  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, params.userId))
    .limit(1);

  // Check if email notification is enabled
  const shouldSendEmail =
    !prefs ||
    (params.type === "approval_approved" && prefs.emailOnApproval) ||
    (params.type === "approval_rejected" && prefs.emailOnApproval) ||
    (params.type === "comment_reply" && prefs.emailOnComment) ||
    (params.type === "approval_requested" && prefs.emailOnApprovalRequest);

  if (!shouldSendEmail) {
    return false;
  }

  // Get user email
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  if (!user || !user.email) {
    return false;
  }

  // Send notification to owner (which will be forwarded to user's email in production)
  const emailContent = `
${params.title}

${params.content}

---
User: ${user.name || user.email}
Type: ${params.type}
${params.annotationId ? `Annotation ID: ${params.annotationId} (${params.annotationType})` : ""}
  `.trim();

  try {
    await notifyOwner({
      title: `[MetaClips] ${params.title}`,
      content: emailContent,
    });
    return true;
  } catch (error) {
    console.error("[Notifications] Failed to send email:", error);
    return false;
  }
}

/**
 * Send both in-app and email notification
 */
export async function sendNotification(params: CreateNotificationParams) {
  const notificationId = await createNotification(params);
  await sendEmailNotification(params);
  return notificationId;
}
