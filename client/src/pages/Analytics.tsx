import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  TrendingUp,
  Database,
  Zap,
  FileText,
  Tag,
  Clock,
} from "lucide-react";

export function Analytics() {
  const { data: stats, isLoading } = trpc.analytics.getEnrichmentStats.useQuery();

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

  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Enrichment Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Track your file enrichment performance and knowledge graph usage
        </p>
      </div>

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
    </div>
  );
}
