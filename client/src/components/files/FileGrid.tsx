import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileIcon,
  ImageIcon,
  VideoIcon,
  FileTextIcon,
  Sparkles,
  Loader2,
  Trash2,
  Eye,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface FileGridProps {
  onFileClick?: (fileId: number) => void;
}

export function FileGrid({ onFileClick }: FileGridProps) {
  const { data: files, isLoading, refetch } = trpc.files.list.useQuery();
  const deleteMutation = trpc.files.delete.useMutation();
  const enrichMutation = trpc.files.enrich.useMutation();

  const handleDelete = async (fileId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this file?")) return;

    try {
      await deleteMutation.mutateAsync({ id: fileId });
      toast.success("File deleted");
      refetch();
    } catch (error) {
      toast.error("Failed to delete file");
    }
  };

  const handleEnrich = async (fileId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await enrichMutation.mutateAsync({ id: fileId });
      toast.success("File enriched with AI");
      refetch();
    } catch (error) {
      toast.error("Failed to enrich file");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div className="text-center py-12">
        <FileIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-medium mb-2">No files yet</h3>
        <p className="text-muted-foreground">
          Upload your first file to get started
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {files.map((file) => (
        <Card
          key={file.id}
          className="p-4 hover:border-primary cursor-pointer transition-colors group"
          onClick={() => onFileClick?.(file.id)}
        >
          <div className="space-y-3">
            {/* File Icon and Type */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  {getFileIcon(file.mimeType)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">
                    {file.title || file.filename}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {(file.fileSize / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
            </div>

            {/* Enrichment Status */}
            <div className="flex items-center gap-2">
              {file.enrichmentStatus === "completed" && (
                <Badge variant="secondary" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI Enriched
                </Badge>
              )}
              {file.enrichmentStatus === "processing" && (
                <Badge variant="secondary" className="text-xs">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Processing
                </Badge>
              )}
              {file.enrichmentStatus === "pending" && (
                <Badge variant="outline" className="text-xs">
                  Not Enriched
                </Badge>
              )}

            </div>

            {/* Tags */}
            {file.tags && file.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {file.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag.id} variant="secondary" className="text-xs">
                    {tag.name}
                  </Badge>
                ))}
                {file.tags.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{file.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileClick?.(file.id);
                }}
              >
                <Eye className="h-3 w-3 mr-1" />
                View
              </Button>
              {file.enrichmentStatus === "pending" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => handleEnrich(file.id, e)}
                  disabled={enrichMutation.isPending}
                >
                  <Sparkles className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => handleDelete(file.id, e)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return <ImageIcon className="h-5 w-5 text-blue-400" />;
  }
  if (mimeType.startsWith("video/")) {
    return <VideoIcon className="h-5 w-5 text-purple-400" />;
  }
  if (mimeType.includes("pdf")) {
    return <FileTextIcon className="h-5 w-5 text-red-400" />;
  }
  return <FileIcon className="h-5 w-5 text-green-400" />;
}
