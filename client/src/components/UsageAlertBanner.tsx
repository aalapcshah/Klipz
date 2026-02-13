import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AlertTriangle, X, HardDrive, FileStack, Video, ArrowRight } from "lucide-react";
import { Link } from "wouter";

/**
 * UsageAlertBanner - Shows usage warnings/critical alerts as a dismissible banner
 * Placed below the main navigation bar
 */
export function UsageAlertBanner() {
  const { user } = useAuth();
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const { data: alertData } = trpc.subscription.getUsageAlerts.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    staleTime: 2 * 60 * 1000,
  });

  if (!user || !alertData || alertData.alertCount === 0) return null;

  // Filter out dismissed alerts
  const visibleAlerts = alertData.alerts.filter(
    (a) => !dismissedAlerts.has(`${a.type}-${a.level}`)
  );

  if (visibleAlerts.length === 0) return null;

  const handleDismiss = (type: string, level: number) => {
    setDismissedAlerts((prev) => new Set(prev).add(`${type}-${level}`));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "storage":
        return <HardDrive className="h-4 w-4" />;
      case "files":
        return <FileStack className="h-4 w-4" />;
      case "videos":
        return <Video className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  // Show the most critical alert prominently
  const mostCritical = visibleAlerts.sort((a, b) => b.level - a.level)[0];
  const isCritical = mostCritical.level >= 95;

  return (
    <div
      className={`border-b px-4 py-2.5 ${
        isCritical
          ? "bg-destructive/10 border-destructive/20 text-destructive"
          : "bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-400"
      }`}
    >
      <div className="container max-w-7xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            {isCritical ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              getIcon(mostCritical.type)
            )}
          </div>
          <p className="text-sm truncate">
            {mostCritical.message}
            {visibleAlerts.length > 1 && (
              <span className="ml-1 opacity-70">
                (+{visibleAlerts.length - 1} more)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/pricing">
            <span className="text-xs font-medium hover:underline cursor-pointer flex items-center gap-1">
              Upgrade <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
          <button
            onClick={() => handleDismiss(mostCritical.type, mostCritical.level)}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            aria-label="Dismiss alert"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
