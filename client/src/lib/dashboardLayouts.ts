export type DashboardLayout = "monitoring" | "analytics" | "balanced";

export interface LayoutConfig {
  name: string;
  description: string;
  widgets: {
    statistics: boolean;
    alertWidget: boolean;
    engagementMetrics: boolean;
    activityChart: boolean;
    userManagement: boolean;
    recentReports: boolean;
    exportTools: boolean;
  };
}

export const DASHBOARD_LAYOUTS: Record<DashboardLayout, LayoutConfig> = {
  monitoring: {
    name: "Monitoring Focus",
    description: "Emphasizes system health, alerts, and real-time monitoring",
    widgets: {
      statistics: true,
      alertWidget: true,
      engagementMetrics: false,
      activityChart: true,
      userManagement: false,
      recentReports: true,
      exportTools: false,
    },
  },
  analytics: {
    name: "Analytics Focus",
    description: "Emphasizes engagement metrics, trends, and user insights",
    widgets: {
      statistics: true,
      alertWidget: false,
      engagementMetrics: true,
      activityChart: true,
      userManagement: true,
      recentReports: false,
      exportTools: true,
    },
  },
  balanced: {
    name: "Balanced View",
    description: "Shows all widgets for comprehensive overview",
    widgets: {
      statistics: true,
      alertWidget: true,
      engagementMetrics: true,
      activityChart: true,
      userManagement: true,
      recentReports: true,
      exportTools: true,
    },
  },
};

export function getLayoutConfig(layout: DashboardLayout): LayoutConfig {
  return DASHBOARD_LAYOUTS[layout];
}
