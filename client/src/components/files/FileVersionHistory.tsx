import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { History, RotateCcw, Clock, User, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface FileVersionHistoryProps {
  fileId: number;
  onVersionRestored?: () => void;
}

export function FileVersionHistory({ fileId, onVersionRestored }: FileVersionHistoryProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [changeDescription, setChangeDescription] = useState("");
  
  const utils = trpc.useUtils();
  const versionsQuery = trpc.fileVersions.list.useQuery({ fileId });
  const versions = versionsQuery.data?.versions || [];
  const createVersionMutation = trpc.fileVersions.create.useMutation({
    onSuccess: () => {
      toast.success("Version created successfully");
      setShowCreateDialog(false);
      setChangeDescription("");
      versionsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Failed to create version: ${error.message}`);
    },
  });
  
  const restoreVersionMutation = trpc.fileVersions.restore.useMutation({
    onSuccess: () => {
      toast.success("Version restored successfully");
      versionsQuery.refetch();
      onVersionRestored?.();
    },
    onError: (error) => {
      toast.error(`Failed to restore version: ${error.message}`);
    },
  });
  
  const handleCreateVersion = () => {
    createVersionMutation.mutate({
      fileId,
      changeDescription: changeDescription || undefined,
    });
  };
  
  const handleRestoreVersion = (versionId: number, versionNumber: number) => {
    if (confirm(`Are you sure you want to restore version ${versionNumber}? This will create a backup of the current state.`)) {
      restoreVersionMutation.mutate({ fileId, versionId });
    }
  };
  
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Version History</h3>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          size="sm"
          disabled={createVersionMutation.isPending}
        >
          Create Snapshot
        </Button>
      </div>
      
      {versionsQuery.isLoading ? (
        <Card className="p-4 text-center text-muted-foreground">
          Loading versions...
        </Card>
      ) : versions.length > 0 ? (
        <div className="space-y-3">
          {versions.map((version: any) => (
            <Card key={version.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Version {version.versionNumber}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  
                  {version.changeDescription && (
                    <p className="text-sm text-muted-foreground flex items-start gap-2">
                      <FileText className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{version.changeDescription}</span>
                    </p>
                  )}
                  
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{version.filename}</span>
                    <span>•</span>
                    <span>{formatFileSize(version.fileSize)}</span>
                    {version.title && (
                      <>
                        <span>•</span>
                        <span className="truncate">{version.title}</span>
                      </>
                    )}
                  </div>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestoreVersion(version.id, version.versionNumber)}
                  disabled={restoreVersionMutation.isPending}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-muted-foreground">
          <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No versions yet</p>
          <p className="text-sm mt-1">Create a snapshot to track file history</p>
        </Card>
      )}
      
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Version Snapshot</DialogTitle>
            <DialogDescription>
              Save the current state of this file as a version you can restore later
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="changeDescription">Change Description (Optional)</Label>
              <Textarea
                id="changeDescription"
                placeholder="Describe what changed in this version..."
                value={changeDescription}
                onChange={(e) => setChangeDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateVersion}
              disabled={createVersionMutation.isPending}
            >
              Create Snapshot
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
