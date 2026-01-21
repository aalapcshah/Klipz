import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DuplicateFile {
  id: number;
  filename: string;
  url: string;
  similarity: number;
  hammingDistance: number;
  createdAt: Date;
}

interface DuplicateDetectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicates: DuplicateFile[];
  onSkip: () => void;
  onReplace: (fileId: number) => void;
  onKeepBoth: () => void;
}

export function DuplicateDetectionDialog({
  open,
  onOpenChange,
  duplicates,
  onSkip,
  onReplace,
  onKeepBoth,
}: DuplicateDetectionDialogProps) {
  if (duplicates.length === 0) return null;

  const highestSimilarity = Math.max(...duplicates.map(d => d.similarity));
  const isExactDuplicate = highestSimilarity >= 95;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <DialogTitle>
              {isExactDuplicate ? "Exact Duplicate Detected" : "Similar Files Found"}
            </DialogTitle>
          </div>
          <DialogDescription>
            {isExactDuplicate
              ? "This file appears to be an exact duplicate of an existing file."
              : `Found ${duplicates.length} similar file${duplicates.length > 1 ? 's' : ''} in your library.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {duplicates.map((duplicate) => (
            <div
              key={duplicate.id}
              className="flex gap-4 p-4 border border-border rounded-lg bg-card hover:bg-accent/50 transition-colors"
            >
              {/* Thumbnail */}
              <div className="flex-shrink-0">
                <img
                  src={duplicate.url}
                  alt={duplicate.filename}
                  className="w-24 h-24 object-cover rounded-md"
                />
              </div>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{duplicate.filename}</p>
                    <p className="text-sm text-muted-foreground">
                      Uploaded {new Date(duplicate.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge
                    variant={duplicate.similarity >= 95 ? "destructive" : duplicate.similarity >= 85 ? "default" : "secondary"}
                  >
                    {duplicate.similarity.toFixed(0)}% similar
                  </Badge>
                </div>

                {/* Replace Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    onReplace(duplicate.id);
                    onOpenChange(false);
                  }}
                >
                  Replace this file
                </Button>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onSkip();
              onOpenChange(false);
            }}
            className="w-full sm:w-auto"
          >
            <X className="h-4 w-4 mr-2" />
            Skip Upload
          </Button>
          <Button
            onClick={() => {
              onKeepBoth();
              onOpenChange(false);
            }}
            className="w-full sm:w-auto"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Keep Both
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
