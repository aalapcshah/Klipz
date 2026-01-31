import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Volume2, VolumeX, Upload, AlertTriangle, Calendar, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  getNotificationSettings,
  saveNotificationSettings,
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  NotificationSettings,
} from "@/lib/notifications";

export function BrowserNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(getNotificationSettings());
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  const handleSettingChange = (key: keyof NotificationSettings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveNotificationSettings(newSettings);
  };

  const handleRequestPermission = async () => {
    setIsRequestingPermission(true);
    try {
      const result = await requestNotificationPermission();
      setPermission(result);
      
      if (result === 'granted') {
        toast.success("Notifications enabled!");
        // Send a test notification
        new Notification("Klipz Notifications", {
          body: "You'll now receive notifications for upload events.",
          icon: "/favicon.ico",
        });
      } else if (result === 'denied') {
        toast.error("Notifications blocked. Please enable them in your browser settings.");
      }
    } catch (error) {
      toast.error("Failed to request notification permission");
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const isEnabled = permission === 'granted' && settings.enabled;

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
            <Bell className="h-5 w-5" />
            Browser Notifications
          </h3>
          <p className="text-sm text-muted-foreground">
            Receive browser notifications when uploads complete, even when the tab is in the background
          </p>
        </div>

        {/* Permission Status */}
        {!isNotificationSupported() ? (
          <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
            <div>
              <p className="font-medium text-yellow-500">Notifications Not Supported</p>
              <p className="text-sm text-muted-foreground">
                Your browser doesn't support notifications. Try using Chrome, Firefox, or Edge.
              </p>
            </div>
          </div>
        ) : permission === 'denied' ? (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <BellOff className="h-5 w-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-500">Notifications Blocked</p>
              <p className="text-sm text-muted-foreground">
                You've blocked notifications for this site. To enable them, click the lock icon in your browser's address bar and allow notifications.
              </p>
            </div>
          </div>
        ) : permission === 'default' ? (
          <div className="flex items-center justify-between gap-4 p-4 bg-muted/50 border rounded-lg">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="font-medium">Enable Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Click to allow browser notifications for upload events
                </p>
              </div>
            </div>
            <Button onClick={handleRequestPermission} disabled={isRequestingPermission}>
              {isRequestingPermission ? "Requesting..." : "Enable"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
            <div>
              <p className="font-medium text-green-500">Notifications Enabled</p>
              <p className="text-sm text-muted-foreground">
                You'll receive browser notifications for upload events
              </p>
            </div>
          </div>
        )}

        {/* Settings (only show if permission granted) */}
        {permission === 'granted' && (
          <>
            <div className="border-t pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="notifications-enabled" className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Enable Notifications
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Master toggle for all upload notifications
                  </p>
                </div>
                <Switch
                  id="notifications-enabled"
                  checked={settings.enabled}
                  onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sound-enabled" className="flex items-center gap-2">
                    {settings.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                    Notification Sound
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Play a sound when notifications appear
                  </p>
                </div>
                <Switch
                  id="sound-enabled"
                  checked={settings.soundEnabled}
                  onCheckedChange={(checked) => handleSettingChange('soundEnabled', checked)}
                  disabled={!settings.enabled}
                />
              </div>
            </div>

            <div className="border-t pt-6 space-y-4">
              <h4 className="text-md font-semibold">Notification Types</h4>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="upload-complete" className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Upload Complete
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Notify when an upload finishes successfully
                  </p>
                </div>
                <Switch
                  id="upload-complete"
                  checked={settings.onUploadComplete}
                  onCheckedChange={(checked) => handleSettingChange('onUploadComplete', checked)}
                  disabled={!settings.enabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="upload-failed" className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Upload Failed
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Notify when an upload fails after all retries
                  </p>
                </div>
                <Switch
                  id="upload-failed"
                  checked={settings.onUploadFailed}
                  onCheckedChange={(checked) => handleSettingChange('onUploadFailed', checked)}
                  disabled={!settings.enabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="scheduled-start" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Scheduled Upload Started
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Notify when a scheduled upload begins
                  </p>
                </div>
                <Switch
                  id="scheduled-start"
                  checked={settings.onScheduledStart}
                  onCheckedChange={(checked) => handleSettingChange('onScheduledStart', checked)}
                  disabled={!settings.enabled}
                />
              </div>
            </div>

            {/* Test Notification Button */}
            <div className="border-t pt-6">
              <Button
                variant="outline"
                onClick={() => {
                  new Notification("Test Notification", {
                    body: "This is a test notification from Klipz.",
                    icon: "/favicon.ico",
                  });
                  toast.success("Test notification sent!");
                }}
                disabled={!settings.enabled}
              >
                <Bell className="h-4 w-4 mr-2" />
                Send Test Notification
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
