import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { notificationService } from "@/lib/notificationService";

/**
 * Notification Permission Prompt
 * Shows a prompt to request notification permission from the user
 */
export function NotificationPrompt() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if we should show the prompt
    const checkPermission = () => {
      if (dismissed) return;

      // Don't show if notifications aren't supported
      if (!("Notification" in window)) return;

      // Don't show if permission already granted or denied
      if (Notification.permission !== "default") return;

      // Check if user has dismissed the prompt before
      const hasDismissed = localStorage.getItem("notification-prompt-dismissed");
      if (hasDismissed) {
        setDismissed(true);
        return;
      }

      // Show prompt after 5 seconds
      setTimeout(() => setShow(true), 5000);
    };

    checkPermission();
  }, [dismissed]);

  const handleEnable = async () => {
    const granted = await notificationService.requestPermission();
    if (granted) {
      setShow(false);
      // Show a test notification
      await notificationService.show({
        title: "Notifications Enabled",
        body: "You'll now receive notifications for important activities",
        type: "mention",
      });
    }
  };

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    localStorage.setItem("notification-prompt-dismissed", "true");
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <Card className="p-4 shadow-lg border-border bg-card">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-card-foreground mb-1">
              Enable Notifications
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Get notified about file shares, comments, and approval requests
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleEnable}
                className="flex-1"
              >
                Enable
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDismiss}
                className="flex-1"
              >
                Not Now
              </Button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </Card>
    </div>
  );
}
