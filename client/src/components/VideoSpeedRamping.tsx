import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Pause, RotateCcw, Zap, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpeedKeyframe {
  id: string;
  time: number; // percentage of video duration (0-100)
  speed: number; // playback speed (0.25 - 4)
}

interface VideoSpeedRampingProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  currentTime: number;
  onTimeUpdate?: (time: number) => void;
  className?: string;
}

const SPEED_PRESETS = [
  { name: 'Slow Motion', keyframes: [{ time: 0, speed: 0.25 }, { time: 100, speed: 0.25 }] },
  { name: 'Speed Up', keyframes: [{ time: 0, speed: 0.5 }, { time: 50, speed: 1 }, { time: 100, speed: 2 }] },
  { name: 'Slow Down', keyframes: [{ time: 0, speed: 2 }, { time: 50, speed: 1 }, { time: 100, speed: 0.5 }] },
  { name: 'Dramatic Slow-Mo', keyframes: [{ time: 0, speed: 1 }, { time: 30, speed: 0.25 }, { time: 70, speed: 0.25 }, { time: 100, speed: 1 }] },
  { name: 'Time Lapse', keyframes: [{ time: 0, speed: 4 }, { time: 100, speed: 4 }] },
  { name: 'Pulse', keyframes: [{ time: 0, speed: 1 }, { time: 25, speed: 2 }, { time: 50, speed: 0.5 }, { time: 75, speed: 2 }, { time: 100, speed: 1 }] },
];

export function VideoSpeedRamping({
  videoRef,
  duration,
  currentTime,
  onTimeUpdate,
  className
}: VideoSpeedRampingProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [keyframes, setKeyframes] = useState<SpeedKeyframe[]>([
    { id: '1', time: 0, speed: 1 },
    { id: '2', time: 100, speed: 1 }
  ]);
  const [selectedKeyframe, setSelectedKeyframe] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transitionSmoothing, setTransitionSmoothing] = useState(50); // 0-100, affects easing
  const animationRef = useRef<number | null>(null);

  // Calculate current speed based on keyframes and current time
  const getCurrentSpeed = useCallback((timePercent: number): number => {
    if (!isEnabled || keyframes.length < 2) return 1;

    const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);
    
    // Find surrounding keyframes
    let prevKeyframe = sortedKeyframes[0];
    let nextKeyframe = sortedKeyframes[sortedKeyframes.length - 1];
    
    for (let i = 0; i < sortedKeyframes.length - 1; i++) {
      if (timePercent >= sortedKeyframes[i].time && timePercent <= sortedKeyframes[i + 1].time) {
        prevKeyframe = sortedKeyframes[i];
        nextKeyframe = sortedKeyframes[i + 1];
        break;
      }
    }

    // Linear interpolation with optional smoothing
    const range = nextKeyframe.time - prevKeyframe.time;
    if (range === 0) return prevKeyframe.speed;
    
    let t = (timePercent - prevKeyframe.time) / range;
    
    // Apply easing based on smoothing value
    const smoothingFactor = transitionSmoothing / 100;
    if (smoothingFactor > 0) {
      // Smooth step interpolation
      t = t * t * (3 - 2 * t) * smoothingFactor + t * (1 - smoothingFactor);
    }
    
    return prevKeyframe.speed + (nextKeyframe.speed - prevKeyframe.speed) * t;
  }, [isEnabled, keyframes, transitionSmoothing]);

  // Apply speed ramping during playback
  useEffect(() => {
    if (!videoRef.current || !isEnabled) return;

    const video = videoRef.current;
    const timePercent = duration > 0 ? (currentTime / duration) * 100 : 0;
    const newSpeed = getCurrentSpeed(timePercent);
    
    // Clamp speed to valid range
    const clampedSpeed = Math.max(0.25, Math.min(4, newSpeed));
    video.playbackRate = clampedSpeed;
  }, [videoRef, currentTime, duration, isEnabled, getCurrentSpeed]);

  // Reset speed when disabled
  useEffect(() => {
    if (!isEnabled && videoRef.current) {
      videoRef.current.playbackRate = 1;
    }
  }, [isEnabled, videoRef]);

  const addKeyframe = () => {
    const timePercent = duration > 0 ? (currentTime / duration) * 100 : 50;
    const newKeyframe: SpeedKeyframe = {
      id: Date.now().toString(),
      time: Math.round(timePercent),
      speed: 1
    };
    setKeyframes(prev => [...prev, newKeyframe].sort((a, b) => a.time - b.time));
    setSelectedKeyframe(newKeyframe.id);
  };

  const updateKeyframe = (id: string, updates: Partial<SpeedKeyframe>) => {
    setKeyframes(prev => prev.map(kf => 
      kf.id === id ? { ...kf, ...updates } : kf
    ).sort((a, b) => a.time - b.time));
  };

  const removeKeyframe = (id: string) => {
    if (keyframes.length <= 2) return; // Keep at least 2 keyframes
    setKeyframes(prev => prev.filter(kf => kf.id !== id));
    if (selectedKeyframe === id) setSelectedKeyframe(null);
  };

  const applyPreset = (presetIndex: number) => {
    const preset = SPEED_PRESETS[presetIndex];
    setKeyframes(preset.keyframes.map((kf, i) => ({
      id: `preset-${i}`,
      time: kf.time,
      speed: kf.speed
    })));
    setSelectedKeyframe(null);
  };

  const resetKeyframes = () => {
    setKeyframes([
      { id: '1', time: 0, speed: 1 },
      { id: '2', time: 100, speed: 1 }
    ]);
    setSelectedKeyframe(null);
  };

  const currentSpeed = getCurrentSpeed(duration > 0 ? (currentTime / duration) * 100 : 0);

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
            Speed Ramping
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="speed-ramp-toggle" className="text-xs sm:text-sm">Enable</Label>
            <Switch
              id="speed-ramp-toggle"
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Speed Display */}
        <div className="flex items-center justify-between p-2 sm:p-3 bg-muted rounded-lg">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs sm:text-sm text-muted-foreground">Current Speed:</span>
          </div>
          <span className={cn(
            "text-lg sm:text-xl font-bold",
            currentSpeed < 1 ? "text-blue-500" : currentSpeed > 1 ? "text-orange-500" : "text-foreground"
          )}>
            {currentSpeed.toFixed(2)}x
          </span>
        </div>

        {/* Presets */}
        <div className="space-y-2">
          <Label className="text-xs sm:text-sm">Presets</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SPEED_PRESETS.map((preset, index) => (
              <Button
                key={preset.name}
                variant="outline"
                size="sm"
                className="text-xs h-8 sm:h-9"
                onClick={() => applyPreset(index)}
                disabled={!isEnabled}
              >
                {preset.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Keyframe Timeline */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs sm:text-sm">Keyframes</Label>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={addKeyframe}
                disabled={!isEnabled}
              >
                + Add
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={resetKeyframes}
                disabled={!isEnabled}
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>
          </div>
          
          {/* Visual Timeline */}
          <div className="relative h-12 sm:h-16 bg-muted rounded-lg overflow-hidden">
            {/* Speed curve visualization */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="speedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgb(59, 130, 246)" />
                  <stop offset="50%" stopColor="rgb(34, 197, 94)" />
                  <stop offset="100%" stopColor="rgb(249, 115, 22)" />
                </linearGradient>
              </defs>
              <path
                d={(() => {
                  const sortedKf = [...keyframes].sort((a, b) => a.time - b.time);
                  const points = sortedKf.map(kf => {
                    const x = kf.time;
                    const y = 100 - ((kf.speed - 0.25) / 3.75) * 100; // Normalize speed to 0-100
                    return `${x},${y}`;
                  });
                  return `M ${points.join(' L ')}`;
                })()}
                fill="none"
                stroke="url(#speedGradient)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            
            {/* Keyframe markers */}
            {keyframes.map(kf => (
              <button
                key={kf.id}
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 rounded-full border-2 transition-all",
                  selectedKeyframe === kf.id
                    ? "bg-primary border-primary scale-125"
                    : "bg-background border-muted-foreground hover:border-primary"
                )}
                style={{ left: `${kf.time}%`, transform: `translateX(-50%) translateY(-50%)` }}
                onClick={() => setSelectedKeyframe(kf.id)}
                disabled={!isEnabled}
              />
            ))}
            
            {/* Current time indicator */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500"
              style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Selected Keyframe Editor */}
        {selectedKeyframe && (
          <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between">
              <Label className="text-xs sm:text-sm font-medium">Edit Keyframe</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-destructive hover:text-destructive"
                onClick={() => removeKeyframe(selectedKeyframe)}
                disabled={keyframes.length <= 2}
              >
                Remove
              </Button>
            </div>
            
            {keyframes.filter(kf => kf.id === selectedKeyframe).map(kf => (
              <div key={kf.id} className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Position</span>
                    <span>{kf.time}%</span>
                  </div>
                  <Slider
                    value={[kf.time]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([value]) => updateKeyframe(kf.id, { time: value })}
                    disabled={!isEnabled}
                  />
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Speed</span>
                    <span className={cn(
                      kf.speed < 1 ? "text-blue-500" : kf.speed > 1 ? "text-orange-500" : ""
                    )}>
                      {kf.speed.toFixed(2)}x
                    </span>
                  </div>
                  <Slider
                    value={[kf.speed]}
                    min={0.25}
                    max={4}
                    step={0.05}
                    onValueChange={([value]) => updateKeyframe(kf.id, { speed: value })}
                    disabled={!isEnabled}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Transition Smoothing */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs sm:text-sm">
            <Label>Transition Smoothing</Label>
            <span className="text-muted-foreground">{transitionSmoothing}%</span>
          </div>
          <Slider
            value={[transitionSmoothing]}
            min={0}
            max={100}
            step={5}
            onValueChange={([value]) => setTransitionSmoothing(value)}
            disabled={!isEnabled}
          />
          <p className="text-xs text-muted-foreground">
            Higher values create smoother speed transitions between keyframes
          </p>
        </div>

        {/* Speed Legend */}
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-blue-500" />
            <span>Slow</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span>Normal</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-orange-500" />
            <span>Fast</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default VideoSpeedRamping;
