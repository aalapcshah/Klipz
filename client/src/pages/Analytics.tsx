import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Database,
  Zap,
  FileText,
  Tag,
  Clock,
  Activity,
  Upload,
  Eye,
  Edit,
  Share2,
  Trash2,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { LiveActivityFeed } from "@/components/LiveActivityFeed";
import { ActivityStatistics } from "@/components/ActivityStatistics";

export function Analytics() {
  const { data: stats, isLoading } = trpc.analytics.getEnrichmentStats.useQuery();  const [activityType, setActivityType] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("30d");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const utils = trpc.useUtils();
  
  const handleExport = async (format: "csv" | "json") => {
    try {
      const result = await utils.client.activityLogs.export.query({
        format,
        activityType: activityType === "all" ? undefined : activityType,
        startDate: dateRange !== "all" ? new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000).toISOString() : undefined,
      });
      
      // Create download link
      const blob = new Blob([result.data], { type: format === "csv" ? "text/csv" : "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Activity logs exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error("Failed to export activity logs");
    }
  };
  
  const { data: activityLogs } = trpc.activityLogs.list.useQuery({
    limit: 50,
    activityType: activityType === "all" ? undefined : activityType,
    startDate: dateRange !== "all" ? new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000).toISOString() : undefined,
  });
  
  const { data: activityStats } = trpc.activityLogs.stats.useQuery();

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading analytics...</div>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Files",
      value: stats?.totalFiles || 0,
      icon: FileText,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Enriched Files",
      value: stats?.enrichedFiles || 0,
      icon: Zap,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      subtitle: `${stats?.enrichmentRate || 0}% enrichment rate`,
    },
    {
      title: "Total Tags",
      value: stats?.totalTags || 0,
      icon: Tag,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Knowledge Graphs",
      value: stats?.knowledgeGraphCount || 0,
      icon: Database,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      title: "Avg Query Time",
      value: `${stats?.avgQueryTime || 0}ms`,
      icon: Clock,
      color: "text-cyan-500",
      bgColor: "bg-cyan-500/10",
    },
    {
      title: "Quality Score",
      value: `${stats?.avgQualityScore || 0}%`,
      icon: TrendingUp,
      color: "text-pink-500",
      bgColor: "bg-pink-500/10",
    },
  ];

  const activityIcons: Record<string, any> = {
    upload: Upload,
    view: Eye,
    edit: Edit,
    tag: Tag,
    share: Share2,
    delete: Trash2,
    enrich: Zap,
    export: FileText,
  };

  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Analytics & Activity</h1>
        <p className="text-muted-foreground mt-2">
          Track enrichment performance and file activity
        </p>
      </div>

      <Tabs defaultValue="enrichment" className="space-y-6">
        <TabsList>
          <TabsTrigger value="enrichment">Enrichment Stats</TabsTrigger>
          <TabsTrigger value="activity">Activity Timeline</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
        </TabsList>

        <TabsContent value="enrichment" className="space-y-6">

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold mt-2">{stat.value}</p>
                  {stat.subtitle && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {stat.subtitle}
                    </p>
                  )}
                </div>
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Enrichment Status Breakdown */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Enrichment Status Breakdown
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {stats?.enrichmentStatusBreakdown?.map((status: any) => (
            <div key={status.status} className="flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground capitalize">
                  {status.status}
                </span>
                <Badge variant="secondary">{status.count}</Badge>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{
                    width: `${
                      ((status.count / (stats?.totalFiles || 1)) * 100).toFixed(0)
                    }%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Knowledge Graph Usage */}
      {stats?.knowledgeGraphUsage && stats.knowledgeGraphUsage.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Database className="h-5 w-5" />
            Knowledge Graph Usage
          </h2>
          <div className="space-y-4">
            {stats.knowledgeGraphUsage.map((kg: any) => (
              <div
                key={kg.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{kg.name}</h3>
                    <Badge variant="outline" className="text-xs">
                      {kg.type}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {kg.usageCount} queries • Avg {kg.avgResponseTime}ms
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{kg.usageCount}</div>
                  <div className="text-xs text-muted-foreground">queries</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Top Tags */}
      {stats?.topTags && stats.topTags.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Most Used Tags
          </h2>
          <div className="flex flex-wrap gap-2">
            {stats.topTags.map((tag: any) => (
              <Badge key={tag.name} variant="secondary" className="text-sm py-2 px-3">
                {tag.name} ({tag.count})
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Recent Enrichments */}
      {stats?.recentEnrichments && stats.recentEnrichments.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Enrichments
          </h2>
          <div className="space-y-3">
            {stats.recentEnrichments.map((file: any) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex-1">
                  <h3 className="font-medium">{file.title || file.filename}</h3>
                  <p className="text-xs text-muted-foreground">
                    {new Date(file.updatedAt).toLocaleString()}
                  </p>
                </div>
                <Badge
                  variant={
                    file.enrichmentStatus === "completed"
                      ? "default"
                      : file.enrichmentStatus === "processing"
                      ? "secondary"
                      : "outline"
                  }
                >
                  {file.enrichmentStatus}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          {/* Live Activity Feed */}
          <LiveActivityFeed />

          {/* Activity Filters */}
          <Card className="p-6">
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search activities by file name or details..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {/* Filter Row */}
              <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Activity Type</label>
                <Select value={activityType} onValueChange={setActivityType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Activities</SelectItem>
                    <SelectItem value="upload">Uploads</SelectItem>
                    <SelectItem value="view">Views</SelectItem>
                    <SelectItem value="edit">Edits</SelectItem>
                    <SelectItem value="tag">Tags</SelectItem>
                    <SelectItem value="share">Shares</SelectItem>
                    <SelectItem value="enrich">Enrichments</SelectItem>
                    <SelectItem value="export">Exports</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Date Range</label>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1d">Last 24 hours</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                    <SelectItem value="all">All time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport("csv")}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport("json")}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export JSON
                </Button>
              </div>
            </div>
            </div>
          </Card>

          {/* Activity Stats Summary */}
          {activityStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="text-2xl font-bold">{activityStats.totalActivities}</div>
                <div className="text-sm text-muted-foreground">Total Activities</div>
              </Card>
              {activityStats.activityByType.map((stat: any) => (
                <Card key={stat.activityType} className="p-4">
                  <div className="text-2xl font-bold">{stat.count}</div>
                  <div className="text-sm text-muted-foreground capitalize">{stat.activityType}s</div>
                </Card>
              ))}
            </div>
          )}

          {/* Activity Timeline */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Timeline
            </h2>
            <div className="space-y-3">
              {activityLogs && activityLogs.length > 0 ? (
                activityLogs
                  .filter((log: any) => {
                    if (!searchQuery) return true;
                    const query = searchQuery.toLowerCase();
                    const filename = log.file?.filename?.toLowerCase() || "";
                    const details = log.details?.toLowerCase() || "";
                    const activityType = log.activityType?.toLowerCase() || "";
                    return filename.includes(query) || details.includes(query) || activityType.includes(query);
                  })
                  .map((log: any) => {
                  const Icon = activityIcons[log.activityType] || Activity;
                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">{log.activityType}</span>
                          {log.file && (
                            <span className="text-sm text-muted-foreground">
                              • {log.file.filename}
                            </span>
                          )}
                        </div>
                        {log.details && (
                          <p className="text-sm text-muted-foreground mt-1">{log.details}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(log.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? (
                    <div>
                      <p>No activities match your search "{searchQuery}"</p>
                      <Button
                        variant="link"
                        onClick={() => setSearchQuery("")}
                        className="mt-2"
                      >
                        Clear search
                      </Button>
                    </div>
                  ) : (
                    "No activity found for the selected filters"
                  )}
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="statistics" className="space-y-6">
          <ActivityStatistics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
