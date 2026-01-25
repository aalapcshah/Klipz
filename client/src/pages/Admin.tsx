import { useState } from "react";
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
import { Loader2, Users, Files, Activity, TrendingUp, Shield, ShieldOff } from "lucide-react";
import { Line } from "react-chartjs-2";
import { toast } from "sonner";

export function Admin() {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [roleChangeUserId, setRoleChangeUserId] = useState<number | null>(null);
  const [newRole, setNewRole] = useState<"user" | "admin">("user");

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
