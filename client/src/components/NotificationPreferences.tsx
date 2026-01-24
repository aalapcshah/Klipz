import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";


interface NotificationPreferencesProps {
  onBack: () => void;
}

export function NotificationPreferences({ onBack }: NotificationPreferencesProps) {

  const utils = trpc.useUtils();

  // Get current preferences
  const { data: preferences, isLoading } = trpc.notifications.getPreferences.useQuery();

  // Update preferences mutation
  const updatePreferences = trpc.notifications.updatePreferences.useMutation({
    onSuccess: () => {
      utils.notifications.getPreferences.invalidate();
    },
  });

  const handleToggle = (key: string, value: boolean) => {
    updatePreferences.mutate({ [key]: value });
  };

  if (isLoading || !preferences) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading preferences...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to notifications">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-semibold text-lg">Notification Settings</h3>
      </div>

      {/* Settings */}
      <div className="p-4 space-y-6">
        {/* Email Notifications */}
        <div>
          <h4 className="font-medium mb-3">Email Notifications</h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="emailOnApproval" className="cursor-pointer">
                Annotation approved/rejected
              </Label>
              <Switch
                id="emailOnApproval"
                checked={preferences.emailOnApproval}
                onCheckedChange={(checked) => handleToggle("emailOnApproval", checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="emailOnComment" className="cursor-pointer">
                New comment replies
              </Label>
              <Switch
                id="emailOnComment"
                checked={preferences.emailOnComment}
                onCheckedChange={(checked) => handleToggle("emailOnComment", checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="emailOnApprovalRequest" className="cursor-pointer">
                Approval requests
              </Label>
              <Switch
                id="emailOnApprovalRequest"
                checked={preferences.emailOnApprovalRequest}
                onCheckedChange={(checked) => handleToggle("emailOnApprovalRequest", checked)}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* In-App Notifications */}
        <div>
          <h4 className="font-medium mb-3">In-App Notifications</h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="inAppOnApproval" className="cursor-pointer">
                Annotation approved/rejected
              </Label>
              <Switch
                id="inAppOnApproval"
                checked={preferences.inAppOnApproval}
                onCheckedChange={(checked) => handleToggle("inAppOnApproval", checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="inAppOnComment" className="cursor-pointer">
                New comment replies
              </Label>
              <Switch
                id="inAppOnComment"
                checked={preferences.inAppOnComment}
                onCheckedChange={(checked) => handleToggle("inAppOnComment", checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="inAppOnApprovalRequest" className="cursor-pointer">
                Approval requests
              </Label>
              <Switch
                id="inAppOnApprovalRequest"
                checked={preferences.inAppOnApprovalRequest}
                onCheckedChange={(checked) => handleToggle("inAppOnApprovalRequest", checked)}
              />
            </div>
          </div>
        </div>

        <Separator />

        <p className="text-sm text-muted-foreground">
          Changes are saved automatically. You can adjust these settings at any time.
        </p>
      </div>
    </div>
  );
}
