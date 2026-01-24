import { CheckCircle2, XCircle, Trash2, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

interface BatchActionsToolbarProps {
  selectedIds: number[];
  annotationType: "voice" | "visual";
  onClearSelection: () => void;
  onActionComplete: () => void;
}

export function BatchActionsToolbar({
  selectedIds,
  annotationType,
  onClearSelection,
  onActionComplete,
}: BatchActionsToolbarProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const utils = trpc.useUtils();

  const bulkApproveMutation = trpc.batchOperations.bulkApprove.useMutation({
    onSuccess: () => {
      utils.annotationApprovals.getApprovalStatus.invalidate();
      onActionComplete();
      onClearSelection();
    },
  });

  const bulkRejectMutation = trpc.batchOperations.bulkReject.useMutation({
    onSuccess: () => {
      utils.annotationApprovals.getApprovalStatus.invalidate();
      onActionComplete();
      onClearSelection();
    },
  });

  const bulkDeleteMutation = trpc.batchOperations.bulkDelete.useMutation({
    onSuccess: () => {
      if (annotationType === "voice") {
        utils.voiceAnnotations.getAnnotations.invalidate();
      } else {
        utils.visualAnnotations.getAnnotations.invalidate();
      }
      onActionComplete();
      onClearSelection();
      setDeleteDialogOpen(false);
    },
  });

  const { refetch: exportAnnotations } = trpc.batchOperations.exportAnnotations.useQuery(
    { annotationIds: selectedIds, annotationType },
    { enabled: false }
  );

  const handleApprove = () => {
    bulkApproveMutation.mutate({
      annotationIds: selectedIds,
      annotationType,
    });
  };

  const handleReject = () => {
    bulkRejectMutation.mutate({
      annotationIds: selectedIds,
      annotationType,
    });
  };

  const handleDelete = () => {
    bulkDeleteMutation.mutate({
      annotationIds: selectedIds,
      annotationType,
    });
  };

  const handleExport = async () => {
    const result = await exportAnnotations();
    if (result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `annotations-${annotationType}-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="fixed bottom-6 left-1/2 -translate-x-1/2 p-4 shadow-lg z-50 bg-background border-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-medium">{selectedIds.length} selected</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="h-8 w-px bg-border" />

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleApprove}
              disabled={bulkApproveMutation.isPending}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Approve All
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleReject}
              disabled={bulkRejectMutation.isPending}
              className="gap-2"
            >
              <XCircle className="h-4 w-4 text-red-500" />
              Reject All
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.length} annotations?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected annotations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
