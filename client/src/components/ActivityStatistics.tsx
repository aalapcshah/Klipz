import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Line, Bar, Pie, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Loader2 } from "lucide-react";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export function ActivityStatistics() {
  const { data: stats, isLoading } = trpc.activityLogs.statistics.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center p-12 text-muted-foreground">
        No activity data available
      </div>
    );
  }



  // Activity trends over time (last 30 days)
  const trendsData = {
    labels: stats.dailyActivity?.map((d: any) => d.date) || [],
    datasets: [
      {
        label: "Uploads",
        data: stats.dailyActivity?.map((d: any) => d.uploads) || [],
        borderColor: "rgb(34, 197, 94)",
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        fill: true,
      },
      {
        label: "Views",
        data: stats.dailyActivity?.map((d: any) => d.views) || [],
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        fill: true,
      },
      {
        label: "Edits",
        data: stats.dailyActivity?.map((d: any) => d.edits) || [],
        borderColor: "rgb(168, 85, 247)",
        backgroundColor: "rgba(168, 85, 247, 0.1)",
        fill: true,
      },
    ],
  };

  // Activity type distribution
  const activityTypeData = {
    labels: stats.activityTypes?.map((t: any) => t.type) || [],
    datasets: [
      {
        data: stats.activityTypes?.map((t: any) => t.count) || [],
        backgroundColor: [
          "rgba(34, 197, 94, 0.8)",
          "rgba(59, 130, 246, 0.8)",
          "rgba(168, 85, 247, 0.8)",
          "rgba(251, 191, 36, 0.8)",
          "rgba(239, 68, 68, 0.8)",
          "rgba(20, 184, 166, 0.8)",
        ],
      },
    ],
  };

  // Peak hours (24-hour format)
  const peakHoursData = {
    labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
    datasets: [
      {
        label: "Activities per Hour",
        data: stats.hourlyActivity || Array(24).fill(0),
        backgroundColor: "rgba(59, 130, 246, 0.8)",
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Activity Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Trends (Last 30 Days)</CardTitle>
          <CardDescription>
            Track uploads, views, and edits over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <Line
              data={trendsData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: "top",
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                  },
                },
              }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Activity Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Distribution</CardTitle>
            <CardDescription>Breakdown by activity type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center">
              <Doughnut
                data={activityTypeData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: "right",
                    },
                  },
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Peak Usage Hours */}
        <Card>
          <CardHeader>
            <CardTitle>Peak Usage Hours</CardTitle>
            <CardDescription>Activity by hour of day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <Bar
                data={peakHoursData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false,
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                    },
                  },
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Activities</CardDescription>
            <CardTitle className="text-3xl">{stats.totalActivities || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Today</CardDescription>
            <CardTitle className="text-3xl">{stats.todayActivities || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>This Week</CardDescription>
            <CardTitle className="text-3xl">{stats.weekActivities || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>This Month</CardDescription>
            <CardTitle className="text-3xl">{stats.monthActivities || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
