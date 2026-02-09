import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { notificationService } from "@/lib/notificationService";
import { useBannerQueue } from "@/contexts/BannerQueueContext";

/**
 * Notification Permission Prompt
 * Shows a prompt to request notification permission from the user.
 * Coordinated via BannerQueue so it only shows after cookie/install banners are dismissed.
 */
export function NotificationPrompt() {
  const [wantsToShow, setWantsToShow] = useState(false);
  const { activeBanner, register, dismiss } = useBannerQueue();

  useEffect(() => {
    // Don't show if notifications aren't supported
    if (!("Notification" in window)) return;

    // Don't show if permission already granted or denied
    if (Notification.permission !== "default") return;

    // Check if user has dismissed the prompt before
    const hasDismissed = localStorage.getItem("notification-prompt-dismissed");
    if (hasDismissed) return;

    // Register after a short delay
    const timer = setTimeout(() => {
      setWantsToShow(true);
      register("notification");
    }, 5000);

    return () => clearTimeout(timer);
  }, [register]);

  const handleEnable = async () => {
    const granted = await notificationService.requestPermission();
    if (granted) {
      await notificationService.show({
        title: "Notifications Enabled",
        body: "You'll now receive notifications for important activities",
        type: "mention",
      });
    }
    setWantsToShow(false);
    dismiss("notification");
  };

  const handleDismiss = () => {
    setWantsToShow(false);
    localStorage.setItem("notification-prompt-dismissed", "true");
    dismiss("notification");
  };

  if (!wantsToShow || activeBanner !== "notification") return null;

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
