import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Upload, Search, FolderPlus, Image, Video, File } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function ActivityDashboard() {
  const { data: stats, isLoading: statsLoading } = trpc.activity.getStats.useQuery();
  const { data: recentActivity, isLoading: activityLoading } = trpc.activity.getRecentActivity.useQuery({ limit: 10 });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const storageLimit = 10 * 1024 * 1024 * 1024; // 10GB limit
  const storagePercent = stats ? (stats.totalStorage / storageLimit) * 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Link href="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-2">Activity Dashboard</h1>
        <p className="text-muted-foreground mb-8">Your personal statistics and recent activity</p>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Link href="/?view=files">
            <Card className="cursor-pointer hover:bg-accent transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Upload Files</CardTitle>
                <Upload className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Add new media to your library</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/?view=search">
            <Card className="cursor-pointer hover:bg-accent transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Search Files</CardTitle>
                <Search className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Find files by tags or content</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/?view=collections">
            <Card className="cursor-pointer hover:bg-accent transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Create Collection</CardTitle>
                <FolderPlus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Organize files into collections</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Statistics */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Storage Usage</CardTitle>
              <CardDescription>Your current storage consumption</CardDescription>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                <>
                  <div className="flex justify-between mb-2">
                    <span className="text-2xl font-bold">{formatBytes(stats?.totalStorage || 0)}</span>
                    <span className="text-sm text-muted-foreground">of {formatBytes(storageLimit)}</span>
                  </div>
                  <Progress value={storagePercent} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">{Math.round(storagePercent)}% used</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>File Statistics</CardTitle>
              <CardDescription>Total files in your library</CardDescription>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                <>
                  <div className="text-4xl font-bold mb-4">{stats?.totalFiles || 0}</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Image className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Images</span>
                      </div>
                      <span className="text-sm font-medium">{stats?.fileTypes.image || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Video className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Videos</span>
                      </div>
                      <span className="text-sm font-medium">{stats?.fileTypes.video || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <File className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Other</span>
                      </div>
                      <span className="text-sm font-medium">{stats?.fileTypes.other || 0}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest uploads and actions</CardDescription>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : recentActivity && recentActivity.length > 0 ? (
              <div className="space-y-4">
                {recentActivity.map((activity: any) => (
                  <div key={activity.id} className="flex items-center justify-between border-b border-border pb-3 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Upload className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{activity.filename}</p>
                        <p className="text-xs text-muted-foreground">Uploaded</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(activity.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
