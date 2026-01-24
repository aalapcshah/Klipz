import { notificationService } from "@/lib/notificationService";
import { useWebSocket } from "@/hooks/useWebSocket";

/**
 * Notification Listener
 * Listens to WebSocket events and triggers browser notifications
 */
export function NotificationListener() {
  // Set up WebSocket listeners for notification-worthy events
  useWebSocket({
    onCommentCreated: (data) => {
      if (data.filename && data.userName && data.fileId) {
        notificationService.notifyCommentAdded(
          data.filename,
          data.userName,
          data.fileId
        );
      }
    },
    onApprovalRequested: (data) => {
      if (data.filename && data.userName && data.fileId) {
        notificationService.notifyApprovalRequested(
          data.filename,
          data.userName,
          data.fileId
        );
      }
    },
  });

  return null; // This component doesn't render anything
}
