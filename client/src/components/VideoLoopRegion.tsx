import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Repeat, SkipBack, SkipForward, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";

interface VideoLoopRegionProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

export function VideoLoopRegion({ videoRef, duration, currentTime, onSeek }: VideoLoopRegionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(duration || 10);
  const [loopCount, setLoopCount] = useState(0);
  const loopCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update loop end when duration changes
  useEffect(() => {
    if (duration > 0 && loopEnd === 10) {
      setLoopEnd(duration);
    }
  }, [duration, loopEnd]);

  // Handle loop logic
  useEffect(() => {
    if (!loopEnabled || !videoRef.current) {
      if (loopCheckIntervalRef.current) {
        clearInterval(loopCheckIntervalRef.current);
        loopCheckIntervalRef.current = null;
      }
      return;
    }

    // Check every 100ms if we need to loop
    loopCheckIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;

      if (video.currentTime >= loopEnd) {
        video.currentTime = loopStart;
        setLoopCount(prev => prev + 1);
        triggerHaptic("light");
      }
    }, 100);

    return () => {
      if (loopCheckIntervalRef.current) {
        clearInterval(loopCheckIntervalRef.current);
        loopCheckIntervalRef.current = null;
      }
    };
  }, [loopEnabled, loopStart, loopEnd, videoRef]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
  };

  const setPointA = useCallback(() => {
    setLoopStart(currentTime);
    if (currentTime >= loopEnd) {
      setLoopEnd(Math.min(currentTime + 5, duration));
    }
    triggerHaptic("medium");
    toast.success(`Loop start set to ${formatTime(currentTime)}`);
  }, [currentTime, loopEnd, duration]);

  const setPointB = useCallback(() => {
    if (currentTime <= loopStart) {
      toast.error("End point must be after start point");
      return;
    }
    setLoopEnd(currentTime);
    triggerHaptic("medium");
    toast.success(`Loop end set to ${formatTime(currentTime)}`);
  }, [currentTime, loopStart]);

  const jumpToStart = useCallback(() => {
    onSeek(loopStart);
    triggerHaptic("light");
  }, [loopStart, onSeek]);

  const jumpToEnd = useCallback(() => {
    onSeek(loopEnd);
    triggerHaptic("light");
  }, [loopEnd, onSeek]);

  const clearLoop = useCallback(() => {
    setLoopEnabled(false);
    setLoopStart(0);
    setLoopEnd(duration);
    setLoopCount(0);
    triggerHaptic("medium");
    toast.info("Loop region cleared");
  }, [duration]);

  const toggleLoop = useCallback((enabled: boolean) => {
    setLoopEnabled(enabled);
    if (enabled) {
      setLoopCount(0);
      triggerHaptic("success");
      toast.success("Loop enabled");
    } else {
      triggerHaptic("light");
      toast.info("Loop disabled");
    }
  }, []);

  // Calculate if current time is within loop region
  const isInLoopRegion = currentTime >= loopStart && currentTime <= loopEnd;
  const loopDuration = loopEnd - loopStart;

  return (
    <Card className="p-3 max-w-full overflow-hidden">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Repeat className={`h-4 w-4 ${loopEnabled ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
          <span className="font-medium text-sm">Loop Region</span>
          {loopEnabled && (
            <Badge variant="secondary" className="text-xs">
              {formatTime(loopDuration)} • {loopCount} loops
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Loop Enable Toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="loop-toggle" className="text-sm">Enable Loop</Label>
            <Switch
              id="loop-toggle"
              checked={loopEnabled}
              onCheckedChange={toggleLoop}
            />
          </div>

          {/* Visual Loop Region on Timeline */}
          <div className="relative h-8 bg-muted rounded-lg overflow-hidden">
            {/* Loop region highlight */}
            <div 
              className={`absolute top-0 bottom-0 ${loopEnabled ? 'bg-primary/30' : 'bg-muted-foreground/20'} transition-colors`}
              style={{
                left: `${(loopStart / duration) * 100}%`,
                width: `${((loopEnd - loopStart) / duration) * 100}%`,
              }}
            />
            {/* Start marker */}
            <div 
              className="absolute top-0 bottom-0 w-1 bg-green-500 cursor-ew-resize"
              style={{ left: `${(loopStart / duration) * 100}%` }}
              title={`Start: ${formatTime(loopStart)}`}
            />
            {/* End marker */}
            <div 
              className="absolute top-0 bottom-0 w-1 bg-red-500 cursor-ew-resize"
              style={{ left: `${(loopEnd / duration) * 100}%` }}
              title={`End: ${formatTime(loopEnd)}`}
            />
            {/* Current position */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-white"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            />
          </div>

          {/* Time Display */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="text-green-500">A: {formatTime(loopStart)}</span>
            <span>{formatTime(loopDuration)} duration</span>
            <span className="text-red-500">B: {formatTime(loopEnd)}</span>
          </div>

          {/* Dual Range Slider for precise control */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Start Point (A)</Label>
            <Slider
              value={[loopStart]}
              min={0}
              max={duration}
              step={0.1}
              onValueChange={([value]) => {
                if (value < loopEnd) {
                  setLoopStart(value);
                }
              }}
              className="[&_[role=slider]]:bg-green-500"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">End Point (B)</Label>
            <Slider
              value={[loopEnd]}
              min={0}
              max={duration}
              step={0.1}
              onValueChange={([value]) => {
                if (value > loopStart) {
                  setLoopEnd(value);
                }
              }}
              className="[&_[role=slider]]:bg-red-500"
            />
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={setPointA}
              className="flex-1 min-w-[80px]"
            >
              <span className="text-green-500 mr-1">A</span> Set Start
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={setPointB}
              className="flex-1 min-w-[80px]"
            >
              <span className="text-red-500 mr-1">B</span> Set End
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={jumpToStart}
              className="flex-1"
            >
              <SkipBack className="h-3 w-3 mr-1" /> Go to A
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={jumpToEnd}
              className="flex-1"
            >
              <SkipForward className="h-3 w-3 mr-1" /> Go to B
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearLoop}
              className="text-destructive hover:text-destructive"
            >
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>

          {/* Status */}
          {loopEnabled && (
            <div className={`text-xs text-center p-2 rounded ${isInLoopRegion ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {isInLoopRegion ? 'Currently in loop region' : 'Outside loop region'}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
