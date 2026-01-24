import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Settings, Trash2, CheckCircle2, MessageCircle, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { NotificationPreferences } from "./NotificationPreferences";
import { cn } from "@/lib/utils";

interface NotificationListProps {
  onClose: () => void;
}

export function NotificationList({ onClose }: NotificationListProps) {
  const [showSettings, setShowSettings] = useState(false);
  const utils = trpc.useUtils();

  // Get notifications
  const { data: notifications = [], isLoading } = trpc.notifications.getNotifications.useQuery({
    limit: 20,
  });

  // Mark as read mutation
  const markAsRead = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.getNotifications.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });

  // Delete notification mutation
  const deleteNotification = trpc.notifications.deleteNotification.useMutation({
    onSuccess: () => {
      utils.notifications.getNotifications.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "approval_approved":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "approval_rejected":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "comment_reply":
        return <MessageCircle className="h-5 w-5 text-blue-500" />;
      default:
        return <CheckCircle2 className="h-5 w-5 text-gray-500" />;
    }
  };

  const handleNotificationClick = (notification: any) => {
    // Mark as read if unread
    if (!notification.read) {
      markAsRead.mutate({ notificationId: notification.id });
    }

    // Navigate to annotation if available
    if (notification.annotationId && notification.annotationType) {
      // TODO: Navigate to the specific annotation
      // For now, just close the dropdown
      onClose();
    }
  };

  if (showSettings) {
    return <NotificationPreferences onBack={() => setShowSettings(false)} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-lg">Notifications</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowSettings(true)}
          aria-label="Notification settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Notification list */}
      <ScrollArea className="flex-1 max-h-96">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>No notifications yet</p>
            <p className="text-sm mt-2">
              You'll be notified when someone approves, rejects, or comments on your annotations.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  "p-4 hover:bg-accent cursor-pointer transition-colors relative group",
                  !notification.read && "bg-accent/50"
                )}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{notification.title}</p>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {notification.content}
                    </p>
                    {notification.relatedUserName && (
                      <p className="text-xs text-muted-foreground mt-1">
                        by {notification.relatedUserName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification.mutate({ notificationId: notification.id });
                    }}
                    aria-label="Delete notification"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {!notification.read && (
                  <div className="absolute top-4 right-4 w-2 h-2 bg-blue-500 rounded-full" />
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      {notifications.length > 0 && (
        <>
          <Separator />
          <div className="p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                // TODO: Navigate to full notifications page
                onClose();
              }}
            >
              View all notifications
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
