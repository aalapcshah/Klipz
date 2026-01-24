/**
 * Browser Push Notification Service
 * Handles requesting permission and displaying notifications for important activities
 */

export type ActivityNotificationType =
  | "file_shared"
  | "approval_requested"
  | "comment_added"
  | "tag_added"
  | "mention";

export interface ActivityNotification {
  title: string;
  body: string;
  type: ActivityNotificationType;
  fileId?: number;
  url?: string;
}

class NotificationService {
  private permissionGranted = false;

  /**
   * Request notification permission from the user
   */
  async requestPermission(): Promise<boolean> {
    if (!("Notification" in window)) {
      console.warn("This browser does not support notifications");
      return false;
    }

    if (Notification.permission === "granted") {
      this.permissionGranted = true;
      return true;
    }

    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      this.permissionGranted = permission === "granted";
      return this.permissionGranted;
    }

    return false;
  }

  /**
   * Check if notifications are supported and permission is granted
   */
  isSupported(): boolean {
    return "Notification" in window && Notification.permission === "granted";
  }

  /**
   * Show a notification
   */
  async show(notification: ActivityNotification): Promise<void> {
    if (!this.isSupported()) {
      console.log("Notifications not supported or permission not granted");
      return;
    }

    const options: NotificationOptions = {
      body: notification.body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: notification.type,
      requireInteraction: false,
      silent: false,
    };

    const n = new Notification(notification.title, options);

    // Handle notification click
    n.onclick = () => {
      window.focus();
      if (notification.url) {
        window.location.href = notification.url;
      } else if (notification.fileId) {
        window.location.href = `/files/${notification.fileId}`;
      }
      n.close();
    };

    // Auto-close after 5 seconds
    setTimeout(() => n.close(), 5000);
  }

  /**
   * Show notification for file share
   */
  async notifyFileShared(filename: string, sharedBy: string, fileId: number): Promise<void> {
    await this.show({
      title: "File Shared",
      body: `${sharedBy} shared "${filename}" with you`,
      type: "file_shared",
      fileId,
    });
  }

  /**
   * Show notification for approval request
   */
  async notifyApprovalRequested(filename: string, requestedBy: string, fileId: number): Promise<void> {
    await this.show({
      title: "Approval Requested",
      body: `${requestedBy} requested approval for "${filename}"`,
      type: "approval_requested",
      fileId,
    });
  }

  /**
   * Show notification for comment added
   */
  async notifyCommentAdded(filename: string, commentedBy: string, fileId: number): Promise<void> {
    await this.show({
      title: "New Comment",
      body: `${commentedBy} commented on "${filename}"`,
      type: "comment_added",
      fileId,
    });
  }

  /**
   * Show notification for tag added
   */
  async notifyTagAdded(filename: string, tagName: string, addedBy: string, fileId: number): Promise<void> {
    await this.show({
      title: "Tag Added",
      body: `${addedBy} added tag "${tagName}" to "${filename}"`,
      type: "tag_added",
      fileId,
    });
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
