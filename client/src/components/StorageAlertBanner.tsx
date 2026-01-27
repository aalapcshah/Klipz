import { useStorageQuota } from "@/contexts/StorageQuotaContext";
import { AlertTriangle, AlertCircle, Ban, X, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Link } from "wouter";

export function StorageAlertBanner() {
  const { settings, status, formatBytes } = useStorageQuota();
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Don't show if quota tracking is disabled or no status
  if (!settings.enabled || !status) {
    return null;
  }

  // Don't show if below warning threshold
  if (!status.isWarning) {
    return null;
  }

  // Allow dismissing the banner (but it will come back on page refresh or level change)
  const currentLevel = status.isExceeded ? "exceeded" : status.isCritical ? "critical" : "warning";
  if (dismissed === currentLevel) {
    return null;
  }

  const getBannerStyle = () => {
    if (status.isExceeded) {
      return "bg-red-500/10 border-red-500/50 text-red-700 dark:text-red-400";
    }
    if (status.isCritical) {
      return "bg-orange-500/10 border-orange-500/50 text-orange-700 dark:text-orange-400";
    }
    return "bg-yellow-500/10 border-yellow-500/50 text-yellow-700 dark:text-yellow-400";
  };

  const getIcon = () => {
    if (status.isExceeded) {
      return <Ban className="w-5 h-5 flex-shrink-0" />;
    }
    if (status.isCritical) {
      return <AlertCircle className="w-5 h-5 flex-shrink-0" />;
    }
    return <AlertTriangle className="w-5 h-5 flex-shrink-0" />;
  };

  const getMessage = () => {
    if (status.isExceeded) {
      return (
        <>
          <strong>Storage quota exceeded!</strong> You've used {formatBytes(status.totalBytes)} of your {settings.quotaGB}GB quota.
          {settings.blockUploadsAtLimit && " Uploads are blocked until you free up space."}
        </>
      );
    }
    if (status.isCritical) {
      return (
        <>
          <strong>Storage almost full!</strong> You've used {status.usedPercentage.toFixed(1)}% of your quota. Only {formatBytes(status.remainingBytes)} remaining.
        </>
      );
    }
    return (
      <>
        <strong>Storage warning:</strong> You've used {status.usedPercentage.toFixed(1)}% of your {settings.quotaGB}GB quota.
      </>
    );
  };

  return (
    <div className={`border-b px-4 py-2 ${getBannerStyle()}`}>
      <div className="container flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {getIcon()}
          <p className="text-sm">
            {getMessage()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings?tab=storage">
            <Button variant="outline" size="sm" className="text-xs">
              <HardDrive className="w-3 h-3 mr-1" />
              Manage Storage
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(currentLevel)}
            className="h-6 w-6 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
