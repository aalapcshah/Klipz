import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
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
import { Loader2, Link2, Eye, Download, FileText, Video, FolderOpen, Ban, ExternalLink, Clock, Shield } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export function AdminShareAnalytics() {
  return (
    <AdminLayout>
      <ShareAnalyticsDashboard />
    </AdminLayout>
  );
}

function ShareAnalyticsDashboard() {
  const [selectedShareId, setSelectedShareId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: analytics, isLoading } = trpc.admin.getShareAnalytics.useQuery();
  const { data: accessLogs, isLoading: logsLoading } = trpc.admin.getShareAccessLogs.useQuery(
    { shareLinkId: selectedShareId!, limit: 100 },
    { enabled: !!selectedShareId }
  );

  const revokeMutation = trpc.admin.revokeShareLink.useMutation({
    onSuccess: () => {
      toast.success("Share link has been revoked");
      utils.admin.getShareAnalytics.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to revoke share link");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case "file":
        return <FileText className="h-4 w-4" />;
      case "video":
        return <Video className="h-4 w-4" />;
      case "collection":
        return <FolderOpen className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Share Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Monitor all shared links, views, and downloads across the platform
        </p>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Total Shares
            </CardDescription>
            <CardTitle className="text-3xl">{analytics?.stats.totalShares || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-500" />
              Active Shares
            </CardDescription>
            <CardTitle className="text-3xl">{analytics?.stats.activeShares || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Total Views
            </CardDescription>
            <CardTitle className="text-3xl">{analytics?.stats.totalViews || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Total Downloads
            </CardDescription>
            <CardTitle className="text-3xl">{analytics?.stats.totalDownloads || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Access Logs
            </CardDescription>
            <CardTitle className="text-3xl">{analytics?.stats.totalAccessLogs || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Share Links Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Share Links</CardTitle>
          <CardDescription>View and manage all shared content across users</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Access</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics?.shares.map((share) => (
                <TableRow key={share.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {getItemIcon(share.itemType)}
                      <span className="truncate max-w-[200px]">{share.itemName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {share.itemType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>{share.userName || "Unknown"}</div>
                      <div className="text-muted-foreground text-xs">{share.userEmail}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Eye className="h-3 w-3 text-muted-foreground" />
                      {share.viewCount}
                      {share.maxViews && (
                        <span className="text-muted-foreground">/ {share.maxViews}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {!share.isActive ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : share.isExpired ? (
                      <Badge variant="secondary">Expired</Badge>
                    ) : share.maxViews && share.viewCount >= share.maxViews ? (
                      <Badge variant="secondary">Limit Reached</Badge>
                    ) : (
                      <Badge variant="default" className="bg-green-600">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {share.createdAt && (
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(share.createdAt), { addSuffix: true })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {share.lastAccessedAt ? (
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(share.lastAccessedAt), { addSuffix: true })}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Never</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedShareId(share.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(`/share/${share.token}`, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      {share.isActive && !share.isExpired && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => revokeMutation.mutate({ id: share.id })}
                          disabled={revokeMutation.isPending}
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!analytics?.shares || analytics.shares.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No share links found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Access Logs Dialog */}
      <Dialog open={!!selectedShareId} onOpenChange={() => setSelectedShareId(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Access Logs</DialogTitle>
            <DialogDescription>
              View detailed access history for this share link
            </DialogDescription>
          </DialogHeader>

          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>User Agent</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessLogs?.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant={log.action === "download" ? "default" : "secondary"}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{log.ipAddress || "Unknown"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {log.userAgent || "Unknown"}
                    </TableCell>
                    <TableCell>
                      {log.accessedAt && (
                        <span className="text-sm">
                          {new Date(log.accessedAt).toLocaleString()}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(!accessLogs || accessLogs.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No access logs found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminShareAnalytics;
