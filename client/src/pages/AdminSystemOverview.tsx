import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, HardDrive, FileText, Video, FolderOpen, Image, FileArchive, FileAudio, Sparkles, Clock, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { Pie, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

export function AdminSystemOverview() {
  return (
    <AdminLayout>
      <SystemOverviewDashboard />
    </AdminLayout>
  );
}

function SystemOverviewDashboard() {
  const { data: overview, isLoading } = trpc.admin.getSystemOverview.useQuery();

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

  const getFileTypeIcon = (type: string) => {
    switch (type) {
      case "image":
        return <Image className="h-4 w-4" />;
      case "video":
        return <Video className="h-4 w-4" />;
      case "audio":
        return <FileAudio className="h-4 w-4" />;
      case "application":
        return <FileArchive className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getEnrichmentIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "processing":
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Aggregate files by type category
  const typeCategories = overview?.filesByType.reduce((acc, file) => {
    const type = file.type;
    if (!acc[type]) {
      acc[type] = { count: 0, size: 0 };
    }
    acc[type].count += file.count;
    acc[type].size += file.sizeBytes;
    return acc;
  }, {} as Record<string, { count: number; size: number }>) || {};

  const typeLabels = Object.keys(typeCategories);
  const typeCounts = typeLabels.map((t) => typeCategories[t].count);
  const typeSizes = typeLabels.map((t) => typeCategories[t].size);

  const pieData = {
    labels: typeLabels.map((t) => t.charAt(0).toUpperCase() + t.slice(1)),
    datasets: [
      {
        data: typeCounts,
        backgroundColor: [
          "rgba(59, 130, 246, 0.8)",
          "rgba(16, 185, 129, 0.8)",
          "rgba(245, 158, 11, 0.8)",
          "rgba(239, 68, 68, 0.8)",
          "rgba(139, 92, 246, 0.8)",
          "rgba(236, 72, 153, 0.8)",
        ],
        borderWidth: 0,
      },
    ],
  };

  const barData = {
    labels: typeLabels.map((t) => t.charAt(0).toUpperCase() + t.slice(1)),
    datasets: [
      {
        label: "Storage (MB)",
        data: typeSizes.map((s) => s / (1024 * 1024)),
        backgroundColor: "rgba(59, 130, 246, 0.8)",
      },
    ],
  };

  const enrichmentData = overview?.enrichmentStatus || [];
  const enrichmentLabels = enrichmentData.map((e) => e.status);
  const enrichmentCounts = enrichmentData.map((e) => e.count);

  const enrichmentPieData = {
    labels: enrichmentLabels.map((s) => s.charAt(0).toUpperCase() + s.slice(1)),
    datasets: [
      {
        data: enrichmentCounts,
        backgroundColor: [
          "rgba(16, 185, 129, 0.8)", // completed - green
          "rgba(59, 130, 246, 0.8)", // processing - blue
          "rgba(245, 158, 11, 0.8)", // pending - yellow
          "rgba(239, 68, 68, 0.8)", // failed - red
        ],
        borderWidth: 0,
      },
    ],
  };

  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">System Overview</h1>
        <p className="text-muted-foreground mt-2">
          Monitor storage usage, file distribution, and system resources
        </p>
      </div>

      {/* Storage Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Total Storage
            </CardDescription>
            <CardTitle className="text-3xl">{overview?.storage.totalGB} GB</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Total Files
            </CardDescription>
            <CardTitle className="text-3xl">
              {Object.values(typeCategories).reduce((sum, t) => sum + t.count, 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              Videos
            </CardDescription>
            <CardTitle className="text-3xl">{overview?.videosCount || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Collections
            </CardDescription>
            <CardTitle className="text-3xl">{overview?.collectionsCount || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Files by Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Files by Type</CardTitle>
            <CardDescription>Distribution of file types</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] flex items-center justify-center">
              {typeLabels.length > 0 ? (
                <Pie
                  data={pieData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: "bottom",
                      },
                    },
                  }}
                />
              ) : (
                <p className="text-muted-foreground">No files yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Storage by Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Storage by Type</CardTitle>
            <CardDescription>Storage usage per file type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {typeLabels.length > 0 ? (
                <Bar
                  data={barData}
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
                        title: {
                          display: true,
                          text: "MB",
                        },
                      },
                    },
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">No files yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Enrichment Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Enrichment Status
            </CardTitle>
            <CardDescription>File enrichment progress</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] flex items-center justify-center">
              {enrichmentLabels.length > 0 ? (
                <Pie
                  data={enrichmentPieData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: "bottom",
                      },
                    },
                  }}
                />
              ) : (
                <p className="text-muted-foreground">No enrichment data</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enrichment Status Details */}
      <Card>
        <CardHeader>
          <CardTitle>Enrichment Status Breakdown</CardTitle>
          <CardDescription>Detailed view of AI enrichment progress</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {enrichmentData.map((item) => (
              <div
                key={item.status}
                className="flex items-center gap-3 p-4 rounded-lg bg-muted/50"
              >
                {getEnrichmentIcon(item.status)}
                <div>
                  <p className="font-medium capitalize">{item.status}</p>
                  <p className="text-2xl font-bold">{item.count}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Users by Storage */}
      <Card>
        <CardHeader>
          <CardTitle>Top Users by Storage</CardTitle>
          <CardDescription>Users consuming the most storage space</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Storage Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview?.topUsersByStorage.map((user, index) => (
                <TableRow key={user.userId}>
                  <TableCell>
                    <Badge variant={index < 3 ? "default" : "secondary"}>
                      #{index + 1}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{user.userName || "Unknown"}</TableCell>
                  <TableCell className="text-muted-foreground">{user.userEmail}</TableCell>
                  <TableCell>{user.fileCount}</TableCell>
                  <TableCell>
                    <span className="font-medium">{formatBytes(user.totalSize)}</span>
                  </TableCell>
                </TableRow>
              ))}
              {(!overview?.topUsersByStorage || overview.topUsersByStorage.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No user data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* File Types Detail */}
      <Card>
        <CardHeader>
          <CardTitle>File Types Detail</CardTitle>
          <CardDescription>Breakdown of all file types in the system</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>MIME Type</TableHead>
                <TableHead>Count</TableHead>
                <TableHead>Storage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview?.filesByType.map((file) => (
                <TableRow key={file.mimeType}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getFileTypeIcon(file.type)}
                      <span className="capitalize">{file.type}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{file.mimeType}</TableCell>
                  <TableCell>{file.count}</TableCell>
                  <TableCell>{formatBytes(file.sizeBytes)}</TableCell>
                </TableRow>
              ))}
              {(!overview?.filesByType || overview.filesByType.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No files in the system
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminSystemOverview;
