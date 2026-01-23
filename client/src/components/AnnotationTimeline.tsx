import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mic, PenLine, Play, Edit, Trash2, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface AnnotationTimelineProps {
  fileId: number;
  videoTitle?: string;
  onJumpToTimestamp?: (timestamp: number) => void;
  onEditAnnotation?: (annotation: any) => void;
  onDeleteAnnotation?: (id: number, type: 'voice' | 'visual') => void;
}

export function AnnotationTimeline({ fileId, videoTitle = "Video", onJumpToTimestamp, onEditAnnotation, onDeleteAnnotation }: AnnotationTimelineProps) {
  const { data: voiceAnnotations = [] } = trpc.voiceAnnotations.getByFileId.useQuery({ fileId });
  const { data: visualAnnotations = [] } = trpc.visualAnnotations.getByFileId.useQuery({ fileId });

  // Combine and sort all annotations by timestamp
  type VoiceAnnotation = typeof voiceAnnotations[number] & { type: 'voice' };
  type VisualAnnotation = typeof visualAnnotations[number] & { type: 'visual' };
  type CombinedAnnotation = VoiceAnnotation | VisualAnnotation;

  const allAnnotations: CombinedAnnotation[] = [
    ...voiceAnnotations.map((a): VoiceAnnotation => ({ ...a, type: 'voice' as const })),
    ...visualAnnotations.map((a): VisualAnnotation => ({ ...a, type: 'visual' as const })),
  ].sort((a, b) => a.videoTimestamp - b.videoTimestamp);

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (allAnnotations.length === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        <p>No annotations yet. Add voice notes or drawings to get started.</p>
      </Card>
    );
  }

  const handleExportPDF = async () => {
    const { exportAnnotationsPDF } = await import("@/lib/exportAnnotationsPDF");
    const { toast } = await import("sonner");
    
    try {
      await exportAnnotationsPDF({
        videoTitle,
        voiceAnnotations: voiceAnnotations,
        visualAnnotations: visualAnnotations,
      });
      toast.success("PDF exported successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export PDF");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Annotation Timeline</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPDF}
          disabled={allAnnotations.length === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
      </div>
      <div className="space-y-2">
        {allAnnotations.map((annotation, index) => (
          <Card
            key={`${annotation.type}-${annotation.id}`}
            className="p-4 hover:bg-accent/50 transition-colors cursor-pointer"
            onClick={() => onJumpToTimestamp?.(annotation.videoTimestamp)}
          >
            <div className="flex items-start gap-3">
              {/* Timestamp and Icon */}
              <div className="flex flex-col items-center gap-1 min-w-[60px]">
                <Badge variant="secondary" className="text-xs font-mono">
                  {formatTimestamp(annotation.videoTimestamp)}
                </Badge>
                {annotation.type === 'voice' ? (
                  <Mic className="h-4 w-4 text-primary" />
                ) : (
                  <PenLine className="h-4 w-4 text-primary" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 space-y-2">
                {annotation.type === 'voice' ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Voice Note</Badge>
                      {annotation.audioUrl && (
                        <audio
                          src={annotation.audioUrl}
                          controls
                          className="h-8"
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>
                    {annotation.transcript && (
                      <p className="text-sm text-muted-foreground">
                        {annotation.transcript}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="text-xs">Drawing</Badge>
                    {annotation.imageUrl && (
                      <img
                        src={annotation.imageUrl}
                        alt="Drawing annotation"
                        className="max-w-xs rounded border border-border"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-1">
                {onJumpToTimestamp && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onJumpToTimestamp(annotation.videoTimestamp);
                    }}
                    title="Jump to timestamp"
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )}
                {annotation.type === 'visual' && onEditAnnotation && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditAnnotation(annotation);
                    }}
                    title="Edit annotation"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
                {onDeleteAnnotation && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteAnnotation(annotation.id, annotation.type);
                    }}
                    title="Delete annotation"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
