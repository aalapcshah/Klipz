import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { AlertDashboardWidget } from "@/components/AlertDashboardWidget";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Users, Files, Activity, TrendingUp, Shield, ShieldOff, Download, FileSpreadsheet } from "lucide-react";
import { Line } from "react-chartjs-2";
import { toast } from "sonner";

export function Admin() {
  return (
    <AdminLayout>
      <AdminDashboard />
    </AdminLayout>
  );
}

function AdminDashboard() {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [roleChangeUserId, setRoleChangeUserId] = useState<number | null>(null);
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportUserId, setExportUserId] = useState<string>("");
  const [exportActivityType, setExportActivityType] = useState<string>("");

  const { data: systemStats, isLoading: statsLoading } = trpc.admin.getSystemStats.useQuery();
  const { data: allUsers, isLoading: usersLoading } = trpc.admin.getAllUsers.useQuery({
    limit: 100,
    offset: 0,
  });
  const { data: userStats } = trpc.admin.getUserStats.useQuery(
    { userId: selectedUserId! },
    { enabled: !!selectedUserId }
  );
  const { data: userActivityStats } = trpc.admin.getUserActivityStats.useQuery(
    { userId: selectedUserId! },
    { enabled: !!selectedUserId }
  );
  const { data: engagementMetrics } = trpc.admin.getEngagementMetrics.useQuery();
  const { data: engagementTrends } = trpc.admin.getEngagementTrends.useQuery();

  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("User role has been updated successfully.");
      setRoleChangeUserId(null);
      // Invalidate queries to refresh data
      trpc.useUtils().admin.getAllUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update user role");
    },
  });

  if (statsLoading || usersLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleRoleChange = () => {
    if (roleChangeUserId) {
      updateRoleMutation.mutate({
        userId: roleChangeUserId,
        role: newRole,
      });
    }
  };

  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Manage users and monitor system-wide statistics
        </p>
      </div>

      {/* Alert Dashboard Widget */}
      <AlertDashboardWidget />

      {/* System Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Users
            </CardDescription>
            <CardTitle className="text-3xl">{systemStats?.totalUsers || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Files className="h-4 w-4" />
              Total Files
            </CardDescription>
            <CardTitle className="text-3xl">{systemStats?.totalFiles || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Total Activities
            </CardDescription>
            <CardTitle className="text-3xl">{systemStats?.totalActivities || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Last 24h
            </CardDescription>
            <CardTitle className="text-3xl">{systemStats?.recentActivities || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              New Users (7d)
            </CardDescription>
            <CardTitle className="text-3xl">{systemStats?.newUsers || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Engagement Metrics Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            User Engagement Metrics
          </CardTitle>
          <CardDescription>Track user activity and retention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Active Users */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Active Users</h4>
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Daily Active Users</CardDescription>
                    <CardTitle className="text-2xl">{engagementMetrics?.dau || 0}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Weekly Active Users</CardDescription>
                    <CardTitle className="text-2xl">{engagementMetrics?.wau || 0}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Monthly Active Users</CardDescription>
                    <CardTitle className="text-2xl">{engagementMetrics?.mau || 0}</CardTitle>
                  </CardHeader>
                </Card>
              </div>
            </div>

            {/* Retention Rates */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Retention Rates</h4>
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Day 1 Retention</CardDescription>
                    <CardTitle className="text-2xl">
                      {engagementMetrics?.retentionDay1.toFixed(1) || 0}%
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Day 7 Retention</CardDescription>
                    <CardTitle className="text-2xl">
                      {engagementMetrics?.retentionDay7.toFixed(1) || 0}%
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Day 30 Retention</CardDescription>
                    <CardTitle className="text-2xl">
                      {engagementMetrics?.retentionDay30.toFixed(1) || 0}%
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>
            </div>

            {/* Feature Adoption */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Feature Adoption</h4>
              <div className="space-y-2">
                {engagementMetrics?.featureAdoption.map((feature) => (
                  <div key={feature.feature} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{feature.feature}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {feature.userCount} users
                      </span>
                      <Badge variant="secondary">{feature.percentage.toFixed(1)}%</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Engagement Trend Chart */}
            {engagementTrends && (
              <div>
                <h4 className="text-sm font-semibold mb-3">Daily Active Users Trend (30 Days)</h4>
                <Line
                  data={{
                    labels: engagementTrends.dates,
                    datasets: [
                      {
                        label: "Daily Active Users",
                        data: engagementTrends.dauTrend,
                        borderColor: "rgb(75, 192, 192)",
                        backgroundColor: "rgba(75, 192, 192, 0.2)",
                        tension: 0.4,
                      },
                    ],
                  }}
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
                        ticks: {
                          precision: 0,
                        },
                      },
                    },
                  }}
                  height={200}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Activity Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Activity Reports
          </CardTitle>
          <CardDescription>Download activity data in CSV or Excel format</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <input
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <input
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">User ID (optional)</label>
                <input
                  type="number"
                  value={exportUserId}
                  onChange={(e) => setExportUserId(e.target.value)}
                  placeholder="All users"
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Activity Type (optional)</label>
                <Select value={exportActivityType} onValueChange={setExportActivityType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All types</SelectItem>
                    <SelectItem value="upload">Upload</SelectItem>
                    <SelectItem value="view">View</SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                    <SelectItem value="delete">Delete</SelectItem>
                    <SelectItem value="share">Share</SelectItem>
                    <SelectItem value="tag">Tag</SelectItem>
                    <SelectItem value="enrich">Enrich</SelectItem>
                    <SelectItem value="export">Export</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <ExportCSVButton
                startDate={exportStartDate}
                endDate={exportEndDate}
                userId={exportUserId ? parseInt(exportUserId) : undefined}
                activityType={exportActivityType || undefined}
              />
              <ExportExcelButton
                startDate={exportStartDate}
                endDate={exportEndDate}
                userId={exportUserId ? parseInt(exportUserId) : undefined}
                activityType={exportActivityType || undefined}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Management Table */}
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>View and manage all users in the system</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Activities</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allUsers?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.fileCount}</TableCell>
                  <TableCell>{user.activityCount}</TableCell>
                  <TableCell>
                    {user.lastActivity
                      ? new Date(user.lastActivity).toLocaleDateString()
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        View Details
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRoleChangeUserId(user.id);
                          setNewRole(user.role === "admin" ? "user" : "admin");
                        }}
                      >
                        {user.role === "admin" ? (
                          <ShieldOff className="h-4 w-4" />
                        ) : (
                          <Shield className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* User Details Dialog */}
      <Dialog open={!!selectedUserId} onOpenChange={() => setSelectedUserId(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              Detailed statistics and activity for {userStats?.user.name}
            </DialogDescription>
          </DialogHeader>

          {userStats && (
            <div className="space-y-6">
              {/* User Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{userStats.user.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Role</p>
                  <Badge variant={userStats.user.role === "admin" ? "default" : "secondary"}>
                    {userStats.user.role}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Joined</p>
                  <p className="font-medium">
                    {new Date(userStats.user.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Sign In</p>
                  <p className="font-medium">
                    {userStats.user.lastSignedIn
                      ? new Date(userStats.user.lastSignedIn).toLocaleDateString()
                      : "Never"}
                  </p>
                </div>
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total Files</CardDescription>
                    <CardTitle className="text-2xl">{userStats.fileCount}</CardTitle>
                  </CardHeader>
                </Card>
                {userStats.activityByType.map((activity: any) => (
                  <Card key={activity.type}>
                    <CardHeader className="pb-2">
                      <CardDescription className="capitalize">{activity.type}</CardDescription>
                      <CardTitle className="text-2xl">{activity.count}</CardTitle>
                    </CardHeader>
                  </Card>
                ))}
              </div>

              {/* Activity Chart */}
              {userActivityStats && userActivityStats.dailyActivity.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Activity Trend (Last 30 Days)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[200px]">
                      <Line
                        data={{
                          labels: userActivityStats.dailyActivity.map((d: any) => d.date),
                          datasets: [
                            {
                              label: "Activities",
                              data: userActivityStats.dailyActivity.map((d: any) => d.count),
                              borderColor: "rgb(16, 185, 129)",
                              backgroundColor: "rgba(16, 185, 129, 0.1)",
                              fill: true,
                            },
                          ],
                        }}
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
              )}

              {/* Recent Activities */}
              <div>
                <h3 className="font-semibold mb-3">Recent Activities</h3>
                <div className="space-y-2">
                  {userStats.recentActivities.map((activity: any) => (
                    <div
                      key={activity.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium capitalize">{activity.activityType}</p>
                        {activity.details && (
                          <p className="text-sm text-muted-foreground">{activity.details}</p>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(activity.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Role Change Dialog */}
      <Dialog open={!!roleChangeUserId} onOpenChange={() => setRoleChangeUserId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Update the role for{" "}
              {allUsers?.find((u) => u.id === roleChangeUserId)?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">New Role</label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as "user" | "admin")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRoleChangeUserId(null)}>
                Cancel
              </Button>
              <Button onClick={handleRoleChange} disabled={updateRoleMutation.isPending}>
                {updateRoleMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Update Role
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Export CSV Button Component
function ExportCSVButton(props: {
  startDate?: string;
  endDate?: string;
  userId?: number;
  activityType?: string;
}) {
  const exportMutation = trpc.admin.exportActivityCSV.useMutation();

  const handleExport = async () => {
    try {
      const result = await exportMutation.mutateAsync({
        startDate: props.startDate || undefined,
        endDate: props.endDate || undefined,
        userId: props.userId,
        activityType: props.activityType,
      });

      // Create download link
      const blob = new Blob([result.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("CSV report downloaded successfully");
    } catch (error) {
      toast.error("Failed to export CSV");
    }
  };

  return (
    <Button onClick={handleExport} disabled={exportMutation.isPending}>
      {exportMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      <Download className="mr-2 h-4 w-4" />
      Export CSV
    </Button>
  );
}

// Export Excel Button Component
function ExportExcelButton(props: {
  startDate?: string;
  endDate?: string;
  userId?: number;
  activityType?: string;
}) {
  const exportMutation = trpc.admin.exportActivityExcel.useMutation();

  const handleExport = async () => {
    try {
      const result = await exportMutation.mutateAsync({
        startDate: props.startDate || undefined,
        endDate: props.endDate || undefined,
        userId: props.userId,
        activityType: props.activityType,
      });

      // Decode base64 and create download link
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Excel report downloaded successfully");
    } catch (error) {
      toast.error("Failed to export Excel");
    }
  };

  return (
    <Button onClick={handleExport} disabled={exportMutation.isPending} variant="outline">
      {exportMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      <FileSpreadsheet className="mr-2 h-4 w-4" />
      Export Excel
    </Button>
  );
}
