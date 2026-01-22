import React, { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X, HardDrive } from "lucide-react";
import { Link } from "wouter";

interface StorageAlertProps {
  totalStorage: number; // in bytes
  storageLimit: number; // in bytes
}

export function StorageAlert({ totalStorage, storageLimit }: StorageAlertProps) {
  const [dismissed, setDismissed] = useState(false);
  const storagePercent = (totalStorage / storageLimit) * 100;
  
  // Check if alert was previously dismissed
  useEffect(() => {
    const dismissedKey = `storage-alert-dismissed-${Math.floor(storagePercent / 5) * 5}`;
    const wasDismissed = localStorage.getItem(dismissedKey);
    if (wasDismissed) {
      setDismissed(true);
    }
  }, [storagePercent]);

  const handleDismiss = () => {
    // Store dismissal in localStorage with a key based on current percentage tier
    const dismissedKey = `storage-alert-dismissed-${Math.floor(storagePercent / 5) * 5}`;
    localStorage.setItem(dismissedKey, "true");
    setDismissed(true);
  };

  // Don't show alert if below 80% or if dismissed
  if (storagePercent < 80 || dismissed) {
    return null;
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const isNearLimit = storagePercent >= 95;
  const isApproachingLimit = storagePercent >= 80 && storagePercent < 95;

  return (
    <Alert 
      variant={isNearLimit ? "destructive" : "default"}
      className={`relative ${isApproachingLimit ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20" : ""}`}
    >
      <div className="flex items-start gap-3">
        {isNearLimit ? (
          <AlertTriangle className="h-5 w-5 mt-0.5" />
        ) : (
          <HardDrive className="h-5 w-5 mt-0.5 text-yellow-600 dark:text-yellow-400" />
        )}
        <div className="flex-1">
          <AlertTitle className="mb-1">
            {isNearLimit ? "Storage Almost Full" : "Storage Running Low"}
          </AlertTitle>
          <AlertDescription className="text-sm space-y-2">
            <p>
              You're using {formatBytes(totalStorage)} of {formatBytes(storageLimit)} 
              ({Math.round(storagePercent)}% full). 
              {isNearLimit 
                ? " You may not be able to upload new files soon."
                : " Consider managing your files to free up space."}
            </p>
            <div className="flex gap-2 mt-3">
              <Link href="/">
                <Button size="sm" variant={isNearLimit ? "secondary" : "outline"}>
                  Manage Files
                </Button>
              </Link>
              <Button 
                size="sm" 
                variant="outline"
                onClick={handleDismiss}
                className="gap-2"
              >
                <X className="h-3 w-3" />
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}
