import { CheckCircle2, XCircle, Trash2, Download, X, ChevronDown } from "lucide-react";
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

  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const exportCSVMutation = trpc.export.exportCSV.useMutation({
    onSuccess: (data) => {
      downloadFile(data.content, data.filename, data.mimeType);
    },
  });

  const exportJSONMutation = trpc.export.exportJSON.useMutation({
    onSuccess: (data) => {
      downloadFile(data.content, data.filename, data.mimeType);
    },
  });

  const exportPDFMutation = trpc.export.exportPDF.useMutation({
    onSuccess: (data) => {
      downloadFile(data.content, data.filename, data.mimeType);
    },
  });

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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

  const handleExport = (format: "csv" | "json" | "pdf") => {
    const params = { annotationIds: selectedIds, annotationType };
    
    if (format === "csv") {
      exportCSVMutation.mutate(params);
    } else if (format === "json") {
      exportJSONMutation.mutate(params);
    } else {
      exportPDFMutation.mutate(params);
    }
    
    setExportMenuOpen(false);
  };

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="fixed bottom-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:right-auto p-3 md:p-4 shadow-lg z-50 bg-background border-2 batch-actions-toolbar">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4">
          <div className="flex items-center justify-between md:justify-start gap-2">
            <span className="font-medium text-sm md:text-base">{selectedIds.length} selected</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="hidden md:block h-8 w-px bg-border" />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleApprove}
              disabled={bulkApproveMutation.isPending}
              className="gap-1 md:gap-2 flex-1 md:flex-none h-11 md:h-9"
            >
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="hidden sm:inline">Approve All</span>
              <span className="sm:hidden">Approve</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleReject}
              disabled={bulkRejectMutation.isPending}
              className="gap-1 md:gap-2 flex-1 md:flex-none h-11 md:h-9"
            >
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="hidden sm:inline">Reject All</span>
              <span className="sm:hidden">Reject</span>
            </Button>

            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="gap-1 md:gap-2 flex-1 md:flex-none h-11 md:h-9"
              >
                <Download className="h-4 w-4" />
                Export
                <ChevronDown className="h-3 w-3" />
              </Button>
              
              {exportMenuOpen && (
                <div className="absolute bottom-full mb-2 left-0 bg-popover border rounded-lg shadow-lg p-2 min-w-[200px] z-50">
                  <div className="space-y-1">
                    <button
                      onClick={() => handleExport("csv")}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded transition-colors"
                    >
                      Export as CSV
                    </button>
                    <button
                      onClick={() => handleExport("json")}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded transition-colors"
                    >
                      Export as JSON
                    </button>
                    <button
                      onClick={() => handleExport("pdf")}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded transition-colors"
                    >
                      Export as PDF
                    </button>
                    <div className="border-t my-1" />
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      💡 Tip: After downloading, upload to Google Drive or Dropbox for cloud backup
                    </div>
                  </div>
                </div>
              )}
            </div>

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
