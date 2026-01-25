import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingDown, TrendingUp, Loader2, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";

export function AlertDashboardWidget() {
  const [, setLocation] = useLocation();
  const { data: alerts, isLoading } = trpc.engagementAlerts.getAll.useQuery();
  const { data: engagementMetrics } = trpc.admin.getEngagementMetrics.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Engagement Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const enabledAlerts = alerts?.filter((alert) => alert.enabled) || [];
  
  // Calculate current values for each metric
  const getCurrentValue = (metricType: string) => {
    if (!engagementMetrics) return 0;
    
    switch (metricType) {
      case "dau":
        return engagementMetrics.dau;
      case "wau":
        return engagementMetrics.wau;
      case "mau":
        return engagementMetrics.mau;
      case "retention_day1":
        return engagementMetrics.retentionDay1;
      case "retention_day7":
        return engagementMetrics.retentionDay7;
      case "retention_day30":
        return engagementMetrics.retentionDay30;
      default:
        return 0;
    }
  };

  // Check if alert is triggered
  const isTriggered = (alert: any) => {
    const currentValue = getCurrentValue(alert.metricType);
    if (alert.thresholdType === "below") {
      return currentValue < alert.thresholdValue;
    } else {
      return currentValue > alert.thresholdValue;
    }
  };

  const triggeredAlerts = enabledAlerts.filter(isTriggered);
  const normalAlerts = enabledAlerts.filter((alert) => !isTriggered(alert));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Engagement Alerts
            </CardTitle>
            <CardDescription className="mt-1">
              {triggeredAlerts.length > 0 ? (
                <span className="text-orange-600 dark:text-orange-400 font-medium">
                  {triggeredAlerts.length} alert{triggeredAlerts.length > 1 ? "s" : ""} triggered
                </span>
              ) : (
                "All metrics within thresholds"
              )}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/admin/alerts")}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Manage
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {enabledAlerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No alerts configured</p>
            <Button
              variant="link"
              onClick={() => setLocation("/admin/alerts")}
              className="mt-2"
            >
              Create your first alert
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Triggered Alerts */}
            {triggeredAlerts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                  Triggered
                </h4>
                {triggeredAlerts.map((alert) => {
                  const currentValue = getCurrentValue(alert.metricType);
                  return (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between p-3 border border-orange-200 dark:border-orange-800 rounded-lg bg-orange-50 dark:bg-orange-950/20"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{alert.name}</p>
                          <Badge variant="destructive" className="text-xs">
                            {alert.thresholdType === "below" ? (
                              <TrendingDown className="h-3 w-3 mr-1" />
                            ) : (
                              <TrendingUp className="h-3 w-3 mr-1" />
                            )}
                            {alert.thresholdType}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {alert.metricType.toUpperCase()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                          {currentValue.toFixed(alert.metricType.includes("retention") ? 1 : 0)}
                          {alert.metricType.includes("retention") && "%"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Threshold: {alert.thresholdValue}
                          {alert.metricType.includes("retention") && "%"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Normal Alerts (show max 3) */}
            {normalAlerts.length > 0 && (
              <div className="space-y-2">
                {triggeredAlerts.length > 0 && (
                  <h4 className="text-sm font-semibold text-green-600 dark:text-green-400 mt-4">
                    Normal
                  </h4>
                )}
                {normalAlerts.slice(0, 3).map((alert) => {
                  const currentValue = getCurrentValue(alert.metricType);
                  return (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{alert.name}</p>
                          <Badge variant="outline" className="text-xs">
                            {alert.metricType.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                          {currentValue.toFixed(alert.metricType.includes("retention") ? 1 : 0)}
                          {alert.metricType.includes("retention") && "%"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Threshold: {alert.thresholdValue}
                          {alert.metricType.includes("retention") && "%"}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {normalAlerts.length > 3 && (
                  <p className="text-xs text-center text-muted-foreground pt-2">
                    +{normalAlerts.length - 3} more alerts
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
