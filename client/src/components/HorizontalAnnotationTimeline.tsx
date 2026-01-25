import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Mic, PenLine } from "lucide-react";

interface VoiceAnnotation {
  id: number;
  videoTimestamp: number;
  transcript?: string | null;
  audioUrl?: string;
}

interface VisualAnnotation {
  id: number;
  videoTimestamp: number;
  duration: number;
  imageUrl: string;
}

interface HorizontalAnnotationTimelineProps {
  voiceAnnotations: VoiceAnnotation[];
  visualAnnotations: VisualAnnotation[];
  videoDuration: number;
  currentTime: number;
  onJumpToTime: (timestamp: number) => void;
}

export function HorizontalAnnotationTimeline({
  voiceAnnotations,
  visualAnnotations,
  videoDuration,
  currentTime,
  onJumpToTime,
}: HorizontalAnnotationTimelineProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter annotations by search query
  const filteredVoiceAnnotations = useMemo(() => {
    if (!searchQuery.trim()) return voiceAnnotations;
    const query = searchQuery.toLowerCase();
    return voiceAnnotations.filter(ann => 
      ann.transcript?.toLowerCase().includes(query)
    );
  }, [voiceAnnotations, searchQuery]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getPositionPercent = (timestamp: number) => {
    if (videoDuration === 0) return 0;
    return (timestamp / videoDuration) * 100;
  };

  return (
    <Card className="p-4 space-y-3">
      {/* Search Box */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search annotations by transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {searchQuery && (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {filteredVoiceAnnotations.length} of {voiceAnnotations.length} voice notes
          </span>
        )}
      </div>

      {/* Horizontal Timeline */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0:00</span>
          <span className="text-primary font-medium">{formatTime(currentTime)}</span>
          <span>{formatTime(videoDuration)}</span>
        </div>

        {/* Timeline Bar */}
        <div className="relative h-12 bg-muted rounded-lg overflow-hidden">
          {/* Current Time Indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary z-20"
            style={{ left: `${getPositionPercent(currentTime)}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary rounded-full" />
          </div>

          {/* Voice Annotation Markers */}
          {(searchQuery ? filteredVoiceAnnotations : voiceAnnotations).map((ann) => (
            <button
              key={`voice-${ann.id}`}
              className="absolute top-0 bottom-0 w-1 bg-yellow-500 hover:bg-yellow-400 transition-colors group cursor-pointer z-10"
              style={{ left: `${getPositionPercent(ann.videoTimestamp)}%` }}
              onClick={() => onJumpToTime(ann.videoTimestamp)}
              title={`Voice note at ${formatTime(ann.videoTimestamp)}`}
            >
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block">
                <div className="bg-popover text-popover-foreground text-xs rounded-md shadow-lg p-2 max-w-xs whitespace-normal border">
                  <div className="flex items-center gap-1 mb-1">
                    <Mic className="h-3 w-3 text-yellow-500" />
                    <span className="font-medium">{formatTime(ann.videoTimestamp)}</span>
                  </div>
                  {(ann as any).userName && (
                    <div className="text-[10px] text-muted-foreground mb-1">
                      by {(ann as any).userName}
                    </div>
                  )}
                  {ann.transcript && (
                    <p className="line-clamp-3">{ann.transcript}</p>
                  )}
                </div>
              </div>
            </button>
          ))}

          {/* Visual Annotation Markers */}
          {visualAnnotations.map((ann) => (
            <button
              key={`visual-${ann.id}`}
              className="absolute top-0 bottom-0 bg-blue-500/30 hover:bg-blue-500/50 transition-colors group cursor-pointer z-10 border-l-2 border-r-2 border-blue-500"
              style={{
                left: `${getPositionPercent(ann.videoTimestamp)}%`,
                width: `${getPositionPercent(ann.duration)}%`,
              }}
              onClick={() => onJumpToTime(ann.videoTimestamp)}
              title={`Drawing at ${formatTime(ann.videoTimestamp)} (${ann.duration}s)`}
            >
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block">
                <div className="bg-popover text-popover-foreground text-xs rounded-md shadow-lg p-2 border">
                  <div className="flex items-center gap-1 mb-1">
                    <PenLine className="h-3 w-3 text-blue-500" />
                    <span className="font-medium">{formatTime(ann.videoTimestamp)}</span>
                    <span className="text-muted-foreground">({ann.duration}s)</span>
                  </div>
                  {(ann as any).userName && (
                    <div className="text-[10px] text-muted-foreground mb-1">
                      by {(ann as any).userName}
                    </div>
                  )}
                  <img
                    src={ann.imageUrl}
                    alt="Drawing preview"
                    className="w-32 h-20 object-contain rounded border"
                  />
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-yellow-500 rounded-sm" />
            <span>Voice Notes ({voiceAnnotations.length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-blue-500 rounded-sm" />
            <span>Drawings ({visualAnnotations.length})</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
