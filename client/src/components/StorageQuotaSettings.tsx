import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useStorageQuota } from "@/contexts/StorageQuotaContext";
import { HardDrive, AlertTriangle, AlertCircle, Ban, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function StorageQuotaSettings() {
  const { settings, status, isLoading, updateSettings, refreshStatus, formatBytes } = useStorageQuota();

  const handleQuotaChange = (value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
      updateSettings({ quotaGB: num });
    }
  };

  const handleRefresh = async () => {
    await refreshStatus();
    toast.success("Storage status refreshed");
  };

  return (
    <div className="space-y-6">
      {/* Current Status Card */}
      {settings.enabled && status && (
        <Card className={
          status.isExceeded ? "border-red-500 bg-red-500/5" :
          status.isCritical ? "border-orange-500 bg-orange-500/5" :
          status.isWarning ? "border-yellow-500 bg-yellow-500/5" :
          ""
        }>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                {status.isExceeded ? (
                  <Ban className="w-5 h-5 text-red-500" />
                ) : status.isCritical ? (
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                ) : status.isWarning ? (
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                ) : (
                  <HardDrive className="w-5 h-5 text-green-500" />
                )}
                Storage Status
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading}>
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{formatBytes(status.totalBytes)} used</span>
                <span>{formatBytes(status.quotaBytes)} total</span>
              </div>
              <Progress 
                value={Math.min(status.usedPercentage, 100)} 
                className={`h-3 ${
                  status.isExceeded ? "[&>div]:bg-red-500" :
                  status.isCritical ? "[&>div]:bg-orange-500" :
                  status.isWarning ? "[&>div]:bg-yellow-500" :
                  "[&>div]:bg-green-500"
                }`}
              />
              <p className="text-sm text-muted-foreground">
                {status.usedPercentage.toFixed(1)}% used • {formatBytes(status.remainingBytes)} remaining
              </p>
            </div>
            
            {status.isExceeded && (
              <p className="text-sm text-red-500 font-medium">
                {settings.blockUploadsAtLimit 
                  ? "⚠️ Storage quota exceeded. Uploads are blocked until you free up space."
                  : "⚠️ Storage quota exceeded. Consider cleaning up old files."}
              </p>
            )}
            {status.isCritical && !status.isExceeded && (
              <p className="text-sm text-orange-500 font-medium">
                ⚠️ Storage almost full. Free up space soon to avoid interruptions.
              </p>
            )}
            {status.isWarning && !status.isCritical && (
              <p className="text-sm text-yellow-600 font-medium">
                ⚠️ Approaching storage limit. Review large files to free up space.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Storage Quota Settings</CardTitle>
          <CardDescription>
            Configure storage limits and alert thresholds
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable Quota Tracking */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Storage Quota</Label>
              <p className="text-sm text-muted-foreground">
                Track storage usage and receive alerts
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(enabled) => updateSettings({ enabled })}
            />
          </div>

          {settings.enabled && (
            <>
              {/* Quota Limit */}
              <div className="space-y-2">
                <Label>Storage Quota (GB)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={settings.quotaGB}
                    onChange={(e) => handleQuotaChange(e.target.value)}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">GB</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Set your storage limit. You'll receive alerts as you approach this limit.
                </p>
              </div>

              {/* Warning Threshold */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Warning Threshold</Label>
                  <span className="text-sm font-medium">{settings.warningThreshold}%</span>
                </div>
                <Slider
                  value={[settings.warningThreshold]}
                  onValueChange={([value]) => updateSettings({ warningThreshold: value })}
                  min={50}
                  max={95}
                  step={5}
                  className="w-full"
                />
                <p className="text-sm text-muted-foreground">
                  Show a warning when storage usage reaches this percentage
                </p>
              </div>

              {/* Critical Threshold */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Critical Threshold</Label>
                  <span className="text-sm font-medium">{settings.criticalThreshold}%</span>
                </div>
                <Slider
                  value={[settings.criticalThreshold]}
                  onValueChange={([value]) => updateSettings({ criticalThreshold: value })}
                  min={settings.warningThreshold + 5}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-sm text-muted-foreground">
                  Show a critical alert when storage usage reaches this percentage
                </p>
              </div>

              {/* Block Uploads */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Block Uploads at Limit</Label>
                  <p className="text-sm text-muted-foreground">
                    Prevent new uploads when quota is exceeded
                  </p>
                </div>
                <Switch
                  checked={settings.blockUploadsAtLimit}
                  onCheckedChange={(blockUploadsAtLimit) => updateSettings({ blockUploadsAtLimit })}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
