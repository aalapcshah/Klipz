import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, Search, FolderPlus, Image, Video, File, Info, Captions, FileSearch, Loader2, CheckCircle2, XCircle, BarChart3, Hash, TrendingUp, Link2, Clock, Zap, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { StorageAlert } from "@/components/StorageAlert";
import { toast } from "sonner";

export default function ActivityDashboard() {
  const { data: stats, isLoading: statsLoading } = trpc.activity.getStats.useQuery();
  const { data: recentActivity, isLoading: activityLoading } = trpc.activity.getRecentActivity.useQuery({ limit: 10 });
  const { data: captionAnalytics, isLoading: analyticsLoading } = trpc.videoVisualCaptions.getCaptionAnalytics.useQuery();
  const [bulkMatchLoading, setBulkMatchLoading] = useState(false);
  const [autoCaptionLoading, setAutoCaptionLoading] = useState(false);
  const { data: autoCaptionStatus } = trpc.videoVisualCaptions.getAutoCaptioningStatus.useQuery();
  const queryClient = useQueryClient();

  const triggerAutoCaptioning = trpc.videoVisualCaptions.triggerAutoCaptioning.useMutation({
    onSuccess: (data) => {
      setAutoCaptionLoading(false);
      if (data.captioned > 0) {
        toast.success(`Auto-captioned ${data.captioned} video${data.captioned !== 1 ? 's' : ''} (${data.totalCaptions} captions generated)`);
      } else if (data.processed === 0) {
        toast.info('No uncaptioned videos found');
      } else {
        toast.warning(`Processed ${data.processed} videos, ${data.failed} failed`);
      }
      // Refresh analytics
      queryClient.invalidateQueries();
    },
    onError: (error) => {
      setAutoCaptionLoading(false);
      toast.error(`Auto-captioning failed: ${error.message}`);
    },
  });

  const handleTriggerAutoCaptioning = () => {
    setAutoCaptionLoading(true);
    triggerAutoCaptioning.mutate();
  };

  const bulkFileMatch = trpc.videoVisualCaptions.bulkFileMatch.useMutation({
    onSuccess: (data) => {
      setBulkMatchLoading(false);
      toast.success(data.message);
    },
    onError: (error) => {
      setBulkMatchLoading(false);
      toast.error(`Bulk matching failed: ${error.message}`);
    },
  });

  const handleBulkMatch = () => {
    setBulkMatchLoading(true);
    bulkFileMatch.mutate({ minRelevanceScore: 0.3 });
  };

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

        {/* Storage Alert */}
        {!statsLoading && stats && (
          <div className="mb-6">
            <StorageAlert 
              totalStorage={stats.totalStorage} 
              storageLimit={storageLimit}
            />
          </div>
        )}

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
              <CardTitle className="flex items-center gap-2">
                Storage Usage
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Your total storage usage across all uploaded files. The free tier includes 10GB of storage.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
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
              <CardTitle className="flex items-center gap-2">
                File Statistics
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Total number of files in your library, broken down by type (images, videos, and other file formats).</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
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

        {/* Caption Analytics */}
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Captions className="h-6 w-6" />
          Caption Analytics
        </h2>

        {analyticsLoading ? (
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Loading...</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : captionAnalytics ? (
          <>
            {/* Caption Stats Row */}
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Videos Captioned</CardTitle>
                  <Video className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{captionAnalytics.videosCaptioned}</div>
                  <div className="flex gap-2 mt-2">
                    {captionAnalytics.videosProcessing > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        {captionAnalytics.videosProcessing} processing
                      </Badge>
                    )}
                    {captionAnalytics.videosFailed > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        <XCircle className="h-3 w-3 mr-1" />
                        {captionAnalytics.videosFailed} failed
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Captions</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{captionAnalytics.totalCaptions}</div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Avg confidence: {(captionAnalytics.avgConfidence * 100).toFixed(0)}%
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Unique Entities</CardTitle>
                  <Hash className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{captionAnalytics.uniqueEntities}</div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Extracted from visual analysis
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* File Match Stats + Bulk Match */}
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link2 className="h-5 w-5" />
                    File Match Statistics
                  </CardTitle>
                  <CardDescription>How your files connect to video content</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Matches</p>
                      <p className="text-2xl font-bold">{captionAnalytics.fileMatches.total}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Avg Relevance</p>
                      <p className="text-2xl font-bold">{(captionAnalytics.fileMatches.avgRelevance * 100).toFixed(0)}%</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">Accepted</p>
                        <p className="text-lg font-semibold">{captionAnalytics.fileMatches.accepted}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">Dismissed</p>
                        <p className="text-lg font-semibold">{captionAnalytics.fileMatches.dismissed}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t">
                    <Button
                      onClick={handleBulkMatch}
                      disabled={bulkMatchLoading || captionAnalytics.videosCaptioned === 0}
                      className="w-full"
                      variant="outline"
                    >
                      {bulkMatchLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Running Bulk Match...
                        </>
                      ) : (
                        <>
                          <FileSearch className="h-4 w-4 mr-2" />
                          Bulk Match Files Across All Videos
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Re-runs file matching on all {captionAnalytics.videosCaptioned} captioned videos
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Top Entities */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Top Entities
                  </CardTitle>
                  <CardDescription>Most frequently detected entities across all videos</CardDescription>
                </CardHeader>
                <CardContent>
                  {captionAnalytics.topEntities.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {captionAnalytics.topEntities.slice(0, 20).map((entity, idx) => (
                        <Link
                          key={idx}
                          href={`/caption-search?q=${encodeURIComponent(entity.entity)}`}
                        >
                          <Badge
                            variant={idx < 3 ? "default" : "secondary"}
                            className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            <Search className="h-3 w-3 mr-1" />
                            {entity.entity}
                            <span className="ml-1 opacity-70">({entity.count})</span>
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No entities extracted yet. Generate visual captions on your videos to see entity analytics.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Auto-Captioning Status */}
            {autoCaptionStatus && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Scheduled Auto-Captioning
                  </CardTitle>
                  <CardDescription>
                    Automatically captions uncaptioned videos every 6 hours
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Uncaptioned</p>
                      <p className="text-2xl font-bold">
                        {autoCaptionStatus.uncaptionedCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Processing</p>
                      <p className="text-2xl font-bold flex items-center gap-1">
                        {autoCaptionStatus.processingCount}
                        {autoCaptionStatus.processingCount > 0 && (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Completed</p>
                      <p className="text-2xl font-bold text-green-600">
                        {autoCaptionStatus.completedCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Failed</p>
                      <p className="text-2xl font-bold text-red-500">
                        {autoCaptionStatus.failedCount}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleTriggerAutoCaptioning}
                      disabled={autoCaptionLoading || autoCaptionStatus.uncaptionedCount === 0}
                      variant="outline"
                      className="flex-1"
                    >
                      {autoCaptionLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Captioning...
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Caption Uncaptioned Videos Now
                        </>
                      )}
                    </Button>
                    {autoCaptionStatus.uncaptionedCount === 0 && (
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        All videos captioned
                      </Badge>
                    )}
                  </div>
                  {autoCaptionStatus.failedCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {autoCaptionStatus.failedCount} videos failed captioning. They will be retried on the next scheduled run.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card className="mb-8">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                No caption analytics available yet. Upload and caption videos to see analytics here.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Recent Activity
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Your most recent file uploads and activity. Shows the last 10 actions in chronological order.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
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
