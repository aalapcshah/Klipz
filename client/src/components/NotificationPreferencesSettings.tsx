import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Clock, Save, Mail } from "lucide-react";
import { toast } from "sonner";

export function NotificationPreferencesSettings() {
  const { data: preferences, isLoading } = trpc.notificationPreferences.get.useQuery();
  const updateMutation = trpc.notificationPreferences.update.useMutation();
  const utils = trpc.useUtils();

  const [localPrefs, setLocalPrefs] = useState({
    enableUploadNotifications: true,
    enableViewNotifications: false,
    enableEditNotifications: true,
    enableTagNotifications: true,
    enableShareNotifications: true,
    enableDeleteNotifications: true,
    enableEnrichNotifications: true,
    enableExportNotifications: true,
    quietHoursStart: "",
    quietHoursEnd: "",
    emailDigestFrequency: "immediate" as "immediate" | "daily" | "weekly" | "disabled",
  });

  useEffect(() => {
    if (preferences) {
      setLocalPrefs({
        enableUploadNotifications: preferences.enableUploadNotifications,
        enableViewNotifications: preferences.enableViewNotifications,
        enableEditNotifications: preferences.enableEditNotifications,
        enableTagNotifications: preferences.enableTagNotifications,
        enableShareNotifications: preferences.enableShareNotifications,
        enableDeleteNotifications: preferences.enableDeleteNotifications,
        enableEnrichNotifications: preferences.enableEnrichNotifications,
        enableExportNotifications: preferences.enableExportNotifications,
        quietHoursStart: preferences.quietHoursStart || "",
        quietHoursEnd: preferences.quietHoursEnd || "",
        emailDigestFrequency: (preferences as any).emailDigestFrequency || "immediate",
      });
    }
  }, [preferences]);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        ...localPrefs,
        quietHoursStart: localPrefs.quietHoursStart || null,
        quietHoursEnd: localPrefs.quietHoursEnd || null,
      });
      utils.notificationPreferences.get.invalidate();
      toast.success("Notification preferences saved");
    } catch (error) {
      toast.error("Failed to save preferences");
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3"></div>
          <div className="h-4 bg-muted rounded w-2/3"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
            <Bell className="h-5 w-5" />
            Activity Notifications
          </h3>
          <p className="text-sm text-muted-foreground">
            Choose which file activities trigger browser push notifications
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="upload">File Uploads</Label>
              <p className="text-sm text-muted-foreground">
                Notify when files are uploaded
              </p>
            </div>
            <Switch
              id="upload"
              checked={localPrefs.enableUploadNotifications}
              onCheckedChange={(checked) =>
                setLocalPrefs({ ...localPrefs, enableUploadNotifications: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="view">File Views</Label>
              <p className="text-sm text-muted-foreground">
                Notify when files are viewed (can be noisy)
              </p>
            </div>
            <Switch
              id="view"
              checked={localPrefs.enableViewNotifications}
              onCheckedChange={(checked) =>
                setLocalPrefs({ ...localPrefs, enableViewNotifications: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="edit">File Edits</Label>
              <p className="text-sm text-muted-foreground">
                Notify when file metadata is edited
              </p>
            </div>
            <Switch
              id="edit"
              checked={localPrefs.enableEditNotifications}
              onCheckedChange={(checked) =>
                setLocalPrefs({ ...localPrefs, enableEditNotifications: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="tag">Tag Changes</Label>
              <p className="text-sm text-muted-foreground">
                Notify when tags are added or removed
              </p>
            </div>
            <Switch
              id="tag"
              checked={localPrefs.enableTagNotifications}
              onCheckedChange={(checked) =>
                setLocalPrefs({ ...localPrefs, enableTagNotifications: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="share">File Shares</Label>
              <p className="text-sm text-muted-foreground">
                Notify when files are shared
              </p>
            </div>
            <Switch
              id="share"
              checked={localPrefs.enableShareNotifications}
              onCheckedChange={(checked) =>
                setLocalPrefs({ ...localPrefs, enableShareNotifications: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="delete">File Deletions</Label>
              <p className="text-sm text-muted-foreground">
                Notify when files are deleted
              </p>
            </div>
            <Switch
              id="delete"
              checked={localPrefs.enableDeleteNotifications}
              onCheckedChange={(checked) =>
                setLocalPrefs({ ...localPrefs, enableDeleteNotifications: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enrich">AI Enrichment</Label>
              <p className="text-sm text-muted-foreground">
                Notify when AI enrichment completes
              </p>
            </div>
            <Switch
              id="enrich"
              checked={localPrefs.enableEnrichNotifications}
              onCheckedChange={(checked) =>
                setLocalPrefs({ ...localPrefs, enableEnrichNotifications: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="export">Exports</Label>
              <p className="text-sm text-muted-foreground">
                Notify when exports are ready
              </p>
            </div>
            <Switch
              id="export"
              checked={localPrefs.enableExportNotifications}
              onCheckedChange={(checked) =>
                setLocalPrefs({ ...localPrefs, enableExportNotifications: checked })
              }
            />
          </div>
        </div>

        <div className="border-t pt-6">
          <h4 className="text-md font-semibold flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4" />
            Quiet Hours
          </h4>
          <p className="text-sm text-muted-foreground mb-4">
            Disable notifications during specific hours (24-hour format)
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quietStart">Start Time</Label>
              <Input
                id="quietStart"
                type="time"
                value={localPrefs.quietHoursStart}
                onChange={(e) =>
                  setLocalPrefs({ ...localPrefs, quietHoursStart: e.target.value })
                }
                placeholder="22:00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quietEnd">End Time</Label>
              <Input
                id="quietEnd"
                type="time"
                value={localPrefs.quietHoursEnd}
                onChange={(e) =>
                  setLocalPrefs({ ...localPrefs, quietHoursEnd: e.target.value })
                }
                placeholder="08:00"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Leave empty to receive notifications 24/7
          </p>
        </div>

        <div className="border-t pt-6">
          <h4 className="text-md font-semibold flex items-center gap-2 mb-4">
            <Mail className="h-4 w-4" />
            Email Digest
          </h4>
          <p className="text-sm text-muted-foreground mb-4">
            Choose how often you want to receive email notifications
          </p>
          <div className="space-y-2">
            <Label htmlFor="digestFrequency">Frequency</Label>
            <Select
              value={localPrefs.emailDigestFrequency}
              onValueChange={(value: any) =>
                setLocalPrefs({ ...localPrefs, emailDigestFrequency: value })
              }
            >
              <SelectTrigger id="digestFrequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">Immediate (send each notification as it happens)</SelectItem>
                <SelectItem value="daily">Daily (batch notifications once per day)</SelectItem>
                <SelectItem value="weekly">Weekly (batch notifications once per week)</SelectItem>
                <SelectItem value="disabled">Disabled (no email notifications)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              Daily digests are sent at 9:00 AM, weekly digests on Monday mornings
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
