import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  HardDrive,
  FileVideo,
  Image,
  FileText,
  Music,
  File,
  Trash2,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { StorageQuotaSettings } from "./StorageQuotaSettings";

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// Get icon for file type category
function getTypeIcon(type: string) {
  switch (type) {
    case "Videos":
      return <FileVideo className="w-4 h-4" />;
    case "Images":
      return <Image className="w-4 h-4" />;
    case "Documents":
      return <FileText className="w-4 h-4" />;
    case "Audio":
      return <Music className="w-4 h-4" />;
    default:
      return <File className="w-4 h-4" />;
  }
}

// Get color for file type category
function getTypeColor(type: string): string {
  switch (type) {
    case "Videos":
      return "bg-blue-500";
    case "Images":
      return "bg-green-500";
    case "Documents":
      return "bg-yellow-500";
    case "Audio":
      return "bg-purple-500";
    default:
      return "bg-gray-500";
  }
}

interface StorageUsageDashboardProps {
  className?: string;
}

export function StorageUsageDashboard({ className }: StorageUsageDashboardProps) {
  const { data: stats, isLoading, refetch } = trpc.storageStats.getStats.useQuery();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    toast.success("Storage stats refreshed");
  };

  if (isLoading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-muted-foreground">
          Unable to load storage statistics
        </CardContent>
      </Card>
    );
  }

  const totalItems = stats.fileCount + stats.videoCount;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Storage Usage</h2>
          <p className="text-muted-foreground">Monitor your storage consumption and manage files</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards - 3 columns on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Storage */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <HardDrive className="w-4 h-4" />
              Total Storage Used
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatBytes(stats.totalBytes)}</div>
            <p className="text-sm text-muted-foreground mt-1">
              Across {totalItems} item{totalItems !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        {/* Files Count */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <File className="w-4 h-4" />
              Files
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.fileCount}</div>
            <p className="text-sm text-muted-foreground mt-1">
              Documents, images & more
            </p>
          </CardContent>
        </Card>

        {/* Videos Count */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <FileVideo className="w-4 h-4" />
              Videos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.videoCount}</div>
            <p className="text-sm text-muted-foreground mt-1">
              Recorded & uploaded videos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Storage Breakdown and Largest Files - 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Storage Breakdown by Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Storage by Type</CardTitle>
            <CardDescription>Breakdown of storage usage by file category</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.breakdown.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No files uploaded yet</p>
            ) : (
              <div className="space-y-4">
                {stats.breakdown.map((item) => {
                  const percentage = stats.totalBytes > 0 
                    ? (item.bytes / stats.totalBytes) * 100 
                    : 0;
                  
                  return (
                    <div key={item.type} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(item.type)}
                          <span className="font-medium">{item.type}</span>
                          <span className="text-muted-foreground">
                            ({item.count} item{item.count !== 1 ? "s" : ""})
                          </span>
                        </div>
                        <span className="font-medium">{formatBytes(item.bytes)}</span>
                      </div>
                      <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`absolute left-0 top-0 h-full ${getTypeColor(item.type)} transition-all`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground text-right">
                        {percentage.toFixed(1)}% of total
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Largest Files */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Largest Files
            </CardTitle>
            <CardDescription>Top 10 files by size - consider cleaning up if needed</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.largestFiles.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No files to display</p>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {stats.largestFiles.map((file, index) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-muted-foreground text-sm w-5">
                          {index + 1}.
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate text-sm">{file.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(file.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium whitespace-nowrap">
                          {formatBytes(file.fileSize)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upload Trend */}
      {stats.recentUploads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload Activity (Last 30 Days)</CardTitle>
            <CardDescription>Daily upload volume over the past month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[120px] flex items-end gap-1">
              {stats.recentUploads.map((day, index) => {
                const maxBytes = Math.max(...stats.recentUploads.map(d => d.bytes));
                const height = maxBytes > 0 ? (day.bytes / maxBytes) * 100 : 0;
                
                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center gap-1"
                    title={`${day.date}: ${formatBytes(day.bytes)} (${day.count} files)`}
                  >
                    <div
                      className="w-full bg-primary/80 rounded-t transition-all hover:bg-primary"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>{stats.recentUploads[0]?.date}</span>
              <span>{stats.recentUploads[stats.recentUploads.length - 1]?.date}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quota Settings */}
      <StorageQuotaSettings />

      {/* Storage Tips */}
      <Card className="border-yellow-500/50 bg-yellow-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            Storage Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>• Review and delete unused large files to free up space</li>
            <li>• Consider compressing videos before uploading to save storage</li>
            <li>• Use the "Clean Up Storage" feature in Files to find duplicates</li>
            <li>• Export and archive old files you no longer need quick access to</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
