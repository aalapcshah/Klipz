import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Download, ExternalLink, Calendar, FileIcon, Tag as TagIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface FileQuickViewModalProps {
  file: {
    id: number;
    filename: string;
    url: string;
    mimeType: string | null;
    fileSize: number;
    title: string | null;
    description: string | null;
    createdAt: Date;
    tags?: Array<{ id: number; name: string; color: string | null }>;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewDetails?: () => void;
}

export function FileQuickViewModal({
  file,
  open,
  onOpenChange,
  onViewDetails,
}: FileQuickViewModalProps) {
  if (!file) return null;

  const isImage = file.mimeType?.startsWith("image/");
  const isVideo = file.mimeType?.startsWith("video/");
  const isAudio = file.mimeType?.startsWith("audio/");

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-4">
              <DialogTitle className="text-lg font-semibold truncate">
                {file.title || file.filename}
              </DialogTitle>
              {file.title && (
                <p className="text-sm text-muted-foreground truncate mt-1">
                  {file.filename}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(file.url, "_blank")}
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              {onViewDetails && (
                <Button variant="ghost" size="sm" onClick={onViewDetails}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Full Details
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview */}
          <div className="bg-muted rounded-lg overflow-hidden">
            {isImage && (
              <img
                src={file.url}
                alt={file.filename}
                className="w-full h-auto max-h-[500px] object-contain"
              />
            )}
            {isVideo && (
              <video
                src={file.url}
                controls
                className="w-full h-auto max-h-[500px]"
              />
            )}
            {isAudio && (
              <div className="p-8 flex flex-col items-center justify-center">
                <FileIcon className="w-16 h-16 text-muted-foreground mb-4" />
                <audio src={file.url} controls className="w-full max-w-md" />
              </div>
            )}
            {!isImage && !isVideo && !isAudio && (
              <div className="p-12 flex flex-col items-center justify-center">
                <FileIcon className="w-16 h-16 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">
                  Preview not available for this file type
                </p>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground">File Size</p>
              <p className="font-medium">{formatFileSize(file.fileSize)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Type</p>
              <p className="font-medium">{file.mimeType || "Unknown"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Uploaded</p>
              <p className="font-medium">
                {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">File ID</p>
              <p className="font-medium">#{file.id}</p>
            </div>
          </div>

          {/* Description */}
          {file.description && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Description</p>
              <p className="text-sm text-muted-foreground">{file.description}</p>
            </div>
          )}

          {/* Tags */}
          {file.tags && file.tags.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <TagIcon className="w-4 h-4" />
                Tags
              </p>
              <div className="flex flex-wrap gap-2">
                {file.tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    style={{
                      backgroundColor: tag.color ? `${tag.color}20` : undefined,
                      borderColor: tag.color || undefined,
                    }}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
