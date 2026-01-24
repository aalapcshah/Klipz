import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Plus, Edit, Trash2, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface AnnotationHistoryTimelineProps {
  fileId: number;
}

export function AnnotationHistoryTimeline({ fileId }: AnnotationHistoryTimelineProps) {
  const [filterType, setFilterType] = useState<"all" | "created" | "edited" | "deleted">("all");
  
  const { data: history = [], refetch } = trpc.visualAnnotations.getHistory.useQuery({ fileId });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, '0')}`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'created':
        return <Plus className="h-4 w-4" />;
      case 'edited':
        return <Edit className="h-4 w-4" />;
      case 'deleted':
        return <Trash2 className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getChangeBadgeVariant = (changeType: string) => {
    switch (changeType) {
      case 'created':
        return 'default';
      case 'edited':
        return 'secondary';
      case 'deleted':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const filteredHistory = filterType === "all" 
    ? history 
    : history.filter(h => h.changeType === filterType);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Annotation History</h3>
        <div className="flex gap-1">
          <Button
            variant={filterType === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("all")}
            className="h-7 text-xs"
          >
            All
          </Button>
          <Button
            variant={filterType === "created" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("created")}
            className="h-7 text-xs"
          >
            Created
          </Button>
          <Button
            variant={filterType === "deleted" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("deleted")}
            className="h-7 text-xs"
          >
            Deleted
          </Button>
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No history found
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredHistory.map((item) => {
            const state = item.previousState as any;
            return (
              <Card key={item.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <div className="mt-0.5">
                      {getChangeIcon(item.changeType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={getChangeBadgeVariant(item.changeType) as "default" | "secondary" | "destructive" | "outline"}>
                          {item.changeType}
                        </Badge>
                        {state?.videoTimestamp !== undefined && (
                          <span className="text-xs text-muted-foreground">
                            at {formatTime(state.videoTimestamp)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(item.createdAt)}
                      </p>

                      {state?.duration && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Duration: {state.duration}s
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {(item.changeType === "deleted" && item.previousState) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        toast.info("Revert functionality coming soon");
                      }}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Revert
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
