import { useState } from "react";
import { History, RotateCcw, Clock, User } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { HistoryDiffViewer } from "./HistoryDiffViewer";
import { GitCompare } from "lucide-react";

interface AnnotationHistoryViewerProps {
  annotationId: number;
  annotationType: "voice" | "visual";
}

export function AnnotationHistoryViewer({
  annotationId,
  annotationType,
}: AnnotationHistoryViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [compareVersions, setCompareVersions] = useState<[number, number] | null>(null);

  const utils = trpc.useUtils();

  const { data: history = [], isLoading } = trpc.annotationHistory.getHistory.useQuery(
    { annotationId, annotationType },
    { enabled: isOpen }
  );

  const { data: historyCount } = trpc.annotationHistory.getHistoryCount.useQuery({
    annotationId,
    annotationType,
  });

  const revertMutation = trpc.annotationHistory.revertToVersion.useMutation({
    onSuccess: () => {
      setRevertDialogOpen(false);
      setSelectedHistoryId(null);
      utils.annotationHistory.getHistory.invalidate();
      utils.voiceAnnotations.getAnnotations.invalidate();
      utils.visualAnnotations.getAnnotations.invalidate();
    },
  });

  const handleRevert = () => {
    if (selectedHistoryId) {
      revertMutation.mutate({
        historyId: selectedHistoryId,
        annotationId,
        annotationType,
      });
    }
  };

  const getChangeTypeColor = (changeType: string) => {
    switch (changeType) {
      case "created":
        return "bg-green-500";
      case "edited":
        return "bg-blue-500";
      case "deleted":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getChangeTypeLabel = (changeType: string) => {
    switch (changeType) {
      case "created":
        return "Created";
      case "edited":
        return "Edited";
      case "deleted":
        return "Deleted";
      default:
        return changeType;
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <History className="h-4 w-4" />
            History {historyCount && historyCount.count > 0 && `(${historyCount.count})`}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Annotation History</DialogTitle>
            <DialogDescription>
              View all changes made to this annotation and revert to previous versions
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No history available for this annotation
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((record, index) => (
                <Card key={record.id} className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div
                        className={`h-10 w-10 rounded-full ${getChangeTypeColor(
                          record.changeType
                        )} flex items-center justify-center text-white`}
                      >
                        {record.changeType === "created" && <Clock className="h-5 w-5" />}
                        {record.changeType === "edited" && <History className="h-5 w-5" />}
                        {record.changeType === "deleted" && <RotateCcw className="h-5 w-5" />}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary">{getChangeTypeLabel(record.changeType)}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(record.createdAt as any), { addSuffix: true })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                        <User className="h-4 w-4" />
                        <span>User ID: {record.userId}</span>
                      </div>

                      {(record.previousState as any) && (
                        <div className="bg-muted p-3 rounded-md text-sm">
                          <div className="font-medium mb-2">Previous State:</div>
                          <pre className="text-xs overflow-x-auto">
                            {JSON.stringify(record.previousState, null, 2)}
                          </pre>
                        </div>
                      )}

                      {index > 0 && (record.previousState as any) && (
                        <div className="flex gap-2 mt-3">
                          {index < history.length - 1 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setCompareVersions([history[index + 1].id, record.id]);
                              }}
                            >
                              <GitCompare className="h-4 w-4 mr-2" />
                              Compare with previous
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedHistoryId(record.id);
                              setRevertDialogOpen(true);
                            }}
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Revert to this version
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          
          {/* Diff Viewer */}
          {compareVersions && (() => {
            const oldRecord = history.find(h => h.id === compareVersions[0]);
            const newRecord = history.find(h => h.id === compareVersions[1]);
            if (oldRecord && newRecord && oldRecord.previousState && newRecord.previousState) {
              return (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">Version Comparison</h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCompareVersions(null)}
                    >
                      Close
                    </Button>
                  </div>
                  <HistoryDiffViewer
                    oldVersion={oldRecord.previousState as Record<string, any>}
                    newVersion={newRecord.previousState as Record<string, any>}
                    oldTimestamp={new Date(oldRecord.createdAt as any)}
                    newTimestamp={new Date(newRecord.createdAt as any)}
                  />
                </div>
              );
            }
            return null;
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Revert</DialogTitle>
            <DialogDescription>
              Are you sure you want to revert this annotation to the selected version? This action
              will create a new history entry with the current state before reverting.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevertDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRevert} disabled={revertMutation.isPending}>
              {revertMutation.isPending ? "Reverting..." : "Revert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
