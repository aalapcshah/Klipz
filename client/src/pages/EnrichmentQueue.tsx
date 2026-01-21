import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle, XCircle, Clock, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function EnrichmentQueue() {
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  
  const { data: filesData, isLoading, refetch } = trpc.files.list.useQuery();
  const enrichMutation = trpc.files.enrich.useMutation({
    onSuccess: () => {
      toast.success("File enrichment started");
      refetch();
    },
    onError: (error) => {
      toast.error(`Enrichment failed: ${error.message}`);
    },
  });

  const files = filesData || [];
  
  // Filter files by enrichment status
  const filteredFiles = selectedStatus === "all" 
    ? files 
    : files.filter(f => f.enrichmentStatus === selectedStatus);

  const statusCounts = {
    all: files.length,
    pending: files.filter(f => f.enrichmentStatus === "pending").length,
    processing: files.filter(f => f.enrichmentStatus === "processing").length,
    completed: files.filter(f => f.enrichmentStatus === "completed").length,
    failed: files.filter(f => f.enrichmentStatus === "failed").length,
  };

  const handleRetry = async (fileId: number) => {
    await enrichMutation.mutateAsync({ id: fileId });
  };

  const handleRetryAll = async () => {
    const failedFiles = files.filter(f => f.enrichmentStatus === "failed");
    toast.info(`Retrying ${failedFiles.length} failed enrichments...`);
    
    for (const file of failedFiles) {
      try {
        await enrichMutation.mutateAsync({ id: file.id });
      } catch (error) {
        console.error(`Failed to retry file ${file.id}:`, error);
      }
    }
    
    toast.success("Retry complete");
    refetch();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      processing: "default",
      completed: "outline",
      failed: "destructive",
    };
    
    return (
      <Badge variant={variants[status] || "default"} className="gap-1">
        {getStatusIcon(status)}
        {status}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Enrichment Queue</h1>
          <p className="text-muted-foreground mt-1">
            Monitor and manage AI enrichment status for all files
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          {statusCounts.failed > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRetryAll}
              className="gap-2"
              disabled={enrichMutation.isPending}
            >
              <RefreshCw className="h-4 w-4" />
              Retry All Failed ({statusCounts.failed})
            </Button>
          )}
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(statusCounts).map(([status, count]) => (
          <Button
            key={status}
            variant={selectedStatus === status ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedStatus(status)}
            className="gap-2"
          >
            {status !== "all" && getStatusIcon(status)}
            {status.charAt(0).toUpperCase() + status.slice(1)} ({count})
          </Button>
        ))}
      </div>

      {/* Files List */}
      <div className="grid gap-4">
        {filteredFiles.length === 0 ? (
          <Card className="p-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No files found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedStatus === "all" 
                ? "Upload some files to get started" 
                : `No files with status: ${selectedStatus}`}
            </p>
          </Card>
        ) : (
          filteredFiles.map((file) => (
            <Card key={file.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-medium truncate">{file.title || file.filename}</h3>
                    {getStatusBadge(file.enrichmentStatus)}
                  </div>
                  
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                    {file.description || "No description"}
                  </p>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{file.filename}</span>
                    <span>{(file.fileSize / 1024).toFixed(2)} KB</span>
                    {(file as any).enrichedAt && (
                      <span>Enriched: {new Date((file as any).enrichedAt).toLocaleString()}</span>
                    )}
                  </div>
                </div>

                {file.enrichmentStatus === "failed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRetry(file.id)}
                    disabled={enrichMutation.isPending}
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
