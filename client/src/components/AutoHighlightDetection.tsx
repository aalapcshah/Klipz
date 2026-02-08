import { useState, useEffect, useCallback, useRef } from "react";
import { usePersistedBoolean } from "@/hooks/usePersistedState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { 
  Sparkles, 
  Volume2, 
  Activity, 
  User, 
  Bookmark,
  ChevronDown, 
  ChevronUp,
  Loader2,
  RefreshCw,
  Check,
  X
} from "lucide-react";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";

export interface Highlight {
  id: string;
  timestamp: number;
  type: "audio" | "motion" | "scene";
  confidence: number;
  description: string;
  saved: boolean;
}

interface AutoHighlightDetectionProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  onSaveBookmark?: (timestamp: number, label: string, color: string) => void;
  onHighlightsChange?: (highlights: Highlight[]) => void;
}

export function AutoHighlightDetection({ 
  videoRef, 
  duration, 
  currentTime, 
  onSeek,
  onSaveBookmark,
  onHighlightsChange
}: AutoHighlightDetectionProps) {
  const [isExpanded, setIsExpanded] = usePersistedBoolean('tool-highlights-expanded', false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [sensitivity, setSensitivity] = useState(50);
  
  // Detection toggles
  const [detectAudio, setDetectAudio] = useState(true);
  const [detectMotion, setDetectMotion] = useState(true);
  const [detectSceneChange, setDetectSceneChange] = useState(true);
  
  // Notify parent when highlights change
  useEffect(() => {
    onHighlightsChange?.(highlights);
  }, [highlights, onHighlightsChange]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastFrameRef = useRef<ImageData | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getHighlightColor = (type: Highlight["type"]) => {
    switch (type) {
      case "audio": return "#22c55e"; // green
      case "motion": return "#3b82f6"; // blue
      case "scene": return "#f59e0b"; // amber
      default: return "#8b5cf6"; // purple
    }
  };

  const getHighlightIcon = (type: Highlight["type"]) => {
    switch (type) {
      case "audio": return <Volume2 className="h-3 w-3" />;
      case "motion": return <Activity className="h-3 w-3" />;
      case "scene": return <User className="h-3 w-3" />;
      default: return <Sparkles className="h-3 w-3" />;
    }
  };

  // Analyze video for highlights
  const analyzeVideo = useCallback(async () => {
    const video = videoRef.current;
    if (!video || duration <= 0) {
      toast.error("Video not ready for analysis");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setHighlights([]);
    triggerHaptic("medium");

    const detectedHighlights: Highlight[] = [];
    // Adaptive sample interval: for longer videos, sample less frequently to avoid
    // the analysis appearing stuck. Max ~300 samples (5 min video = every 1s, 30 min = every 6s)
    const maxSamples = 300;
    const sampleInterval = Math.max(1, Math.ceil(duration / maxSamples));
    const totalSamples = Math.floor(duration / sampleInterval);
    const sensitivityThreshold = (100 - sensitivity) / 100; // Higher sensitivity = lower threshold

    // Create canvas for frame analysis
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setIsAnalyzing(false);
      toast.error("Failed to create analysis context");
      return;
    }

    canvas.width = 160; // Low res for faster analysis
    canvas.height = 90;

    // Set up audio analysis
    let audioAnalyser: AnalyserNode | null = null;
    let audioData: any = null;
    
    try {
      if (detectAudio && !audioContextRef.current) {
        audioContextRef.current = new AudioContext();
        const source = audioContextRef.current.createMediaElementSource(video);
        audioAnalyser = audioContextRef.current.createAnalyser();
        audioAnalyser.fftSize = 256;
        source.connect(audioAnalyser);
        audioAnalyser.connect(audioContextRef.current.destination);
        audioData = new Uint8Array(audioAnalyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      }
    } catch (e) {
      console.warn("Audio analysis not available:", e);
    }

    const originalTime = video.currentTime;
    const wasPlaying = !video.paused;
    if (wasPlaying) video.pause();

    let lastFrameData: ImageData | null = null;
    let lastAudioLevel = 0;

    let canvasAccessible = true;

    for (let i = 0; i < totalSamples; i++) {
      const timestamp = i * sampleInterval;
      
      // Seek to timestamp
      video.currentTime = timestamp;
      await new Promise(resolve => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve(null);
        };
        video.addEventListener("seeked", onSeeked);
        // Timeout fallback
        setTimeout(resolve, 500);
      });

      // Allow UI to update between frames
      await new Promise(resolve => setTimeout(resolve, 10));

      // Draw current frame (may fail for cross-origin videos)
      let currentFrameData: ImageData | null = null;
      if (canvasAccessible) {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          currentFrameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch (e) {
          // Cross-origin video: canvas is tainted, skip visual analysis
          console.warn("Canvas tainted by cross-origin video, skipping visual analysis");
          canvasAccessible = false;
        }
      }

      // Audio peak detection
      if (detectAudio && audioAnalyser && audioData) {
        audioAnalyser.getByteFrequencyData(audioData);
        const avgLevel = audioData.reduce((a: number, b: number) => a + b, 0) / audioData.length;
        const normalizedLevel = avgLevel / 255;
        
        // Detect audio spike
        if (normalizedLevel > sensitivityThreshold * 0.7 && normalizedLevel > lastAudioLevel * 1.5) {
          detectedHighlights.push({
            id: `audio-${timestamp}`,
            timestamp,
            type: "audio",
            confidence: Math.min(normalizedLevel * 100, 100),
            description: "Loud audio detected",
            saved: false,
          });
        }
        lastAudioLevel = normalizedLevel;
      }

      // Motion/scene change detection (only if canvas is accessible)
      if (canvasAccessible && currentFrameData && (detectMotion || detectSceneChange) && lastFrameData) {
        let diffSum = 0;
        const pixelCount = currentFrameData.data.length / 4;
        
        for (let j = 0; j < currentFrameData.data.length; j += 4) {
          const rDiff = Math.abs(currentFrameData.data[j] - lastFrameData.data[j]);
          const gDiff = Math.abs(currentFrameData.data[j + 1] - lastFrameData.data[j + 1]);
          const bDiff = Math.abs(currentFrameData.data[j + 2] - lastFrameData.data[j + 2]);
          diffSum += (rDiff + gDiff + bDiff) / 3;
        }
        
        const avgDiff = diffSum / pixelCount / 255; // Normalize to 0-1
        
        // Detect significant motion
        if (detectMotion && avgDiff > sensitivityThreshold * 0.15 && avgDiff < 0.5) {
          detectedHighlights.push({
            id: `motion-${timestamp}`,
            timestamp,
            type: "motion",
            confidence: Math.min(avgDiff * 200, 100),
            description: "Significant motion detected",
            saved: false,
          });
        }
        
        // Detect scene change (very large difference)
        if (detectSceneChange && avgDiff > 0.4) {
          detectedHighlights.push({
            id: `scene-${timestamp}`,
            timestamp,
            type: "scene",
            confidence: Math.min(avgDiff * 150, 100),
            description: "Scene change detected",
            saved: false,
          });
        }
      }

      if (canvasAccessible && currentFrameData) {
        lastFrameData = currentFrameData;
      }
      setAnalysisProgress(((i + 1) / totalSamples) * 100);
    }

    // Warn user if visual analysis was skipped
    if (!canvasAccessible) {
      toast.info("Visual analysis (motion/scene) was limited for this video. Audio analysis completed.", { duration: 5000 });
    }

    // Restore video state
    video.currentTime = originalTime;
    if (wasPlaying) video.play();

    // Deduplicate highlights that are too close together
    const deduped = detectedHighlights.reduce((acc: Highlight[], curr) => {
      const nearby = acc.find(h => Math.abs(h.timestamp - curr.timestamp) < 2 && h.type === curr.type);
      if (!nearby) {
        acc.push(curr);
      } else if (curr.confidence > nearby.confidence) {
        // Replace with higher confidence detection
        const idx = acc.indexOf(nearby);
        acc[idx] = curr;
      }
      return acc;
    }, []);

    // Sort by timestamp
    deduped.sort((a, b) => a.timestamp - b.timestamp);

    setHighlights(deduped);
    setIsAnalyzing(false);
    setAnalysisProgress(100);
    triggerHaptic("success");
    toast.success(`Found ${deduped.length} highlights`);
  }, [videoRef, duration, sensitivity, detectAudio, detectMotion, detectSceneChange]);

  const saveAsBookmark = useCallback((highlight: Highlight) => {
    if (onSaveBookmark) {
      onSaveBookmark(highlight.timestamp, highlight.description, getHighlightColor(highlight.type));
      setHighlights(prev => prev.map(h => 
        h.id === highlight.id ? { ...h, saved: true } : h
      ));
      triggerHaptic("success");
      toast.success("Saved as bookmark");
    }
  }, [onSaveBookmark]);

  const dismissHighlight = useCallback((id: string) => {
    setHighlights(prev => prev.filter(h => h.id !== id));
    triggerHaptic("light");
  }, []);

  const saveAllHighlights = useCallback(() => {
    if (!onSaveBookmark) return;
    
    highlights.filter(h => !h.saved).forEach(highlight => {
      onSaveBookmark(highlight.timestamp, highlight.description, getHighlightColor(highlight.type));
    });
    
    setHighlights(prev => prev.map(h => ({ ...h, saved: true })));
    triggerHaptic("success");
    toast.success(`Saved ${highlights.filter(h => !h.saved).length} bookmarks`);
  }, [highlights, onSaveBookmark]);

  return (
    <Card className="p-3 max-w-full overflow-hidden">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className={`h-4 w-4 ${isAnalyzing ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
          <span className="font-medium text-sm">Auto-Highlight Detection</span>
          {highlights.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {highlights.length} found
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Detection Options */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="detect-audio" className="text-sm flex items-center gap-2">
                <Volume2 className="h-3 w-3 text-green-500" />
                Audio Peaks
              </Label>
              <Switch
                id="detect-audio"
                checked={detectAudio}
                onCheckedChange={setDetectAudio}
                disabled={isAnalyzing}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="detect-motion" className="text-sm flex items-center gap-2">
                <Activity className="h-3 w-3 text-blue-500" />
                Motion Detection
              </Label>
              <Switch
                id="detect-motion"
                checked={detectMotion}
                onCheckedChange={setDetectMotion}
                disabled={isAnalyzing}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="detect-scene" className="text-sm flex items-center gap-2">
                <User className="h-3 w-3 text-amber-500" />
                Scene Changes
              </Label>
              <Switch
                id="detect-scene"
                checked={detectSceneChange}
                onCheckedChange={setDetectSceneChange}
                disabled={isAnalyzing}
              />
            </div>
          </div>

          {/* Sensitivity Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Sensitivity</span>
              <span>{sensitivity}%</span>
            </div>
            <Slider
              value={[sensitivity]}
              min={10}
              max={90}
              step={5}
              onValueChange={([value]) => setSensitivity(value)}
              disabled={isAnalyzing}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Fewer highlights</span>
              <span>More highlights</span>
            </div>
          </div>

          {/* Analyze Button */}
          <Button 
            onClick={analyzeVideo} 
            disabled={isAnalyzing || duration <= 0}
            className="w-full"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing... {Math.round(analysisProgress)}%
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Analyze Video
              </>
            )}
          </Button>

          {/* Progress Bar */}
          {isAnalyzing && (
            <Progress value={analysisProgress} className="h-2" />
          )}

          {/* Highlights List */}
          {highlights.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Detected Highlights</span>
                {onSaveBookmark && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={saveAllHighlights}
                    disabled={highlights.every(h => h.saved)}
                  >
                    <Bookmark className="h-3 w-3 mr-1" />
                    Save All
                  </Button>
                )}
              </div>
              
              <div className="max-h-48 overflow-y-auto space-y-1">
                {highlights.map((highlight) => (
                  <div 
                    key={highlight.id}
                    className={`flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${highlight.saved ? 'opacity-60' : ''}`}
                    onClick={() => onSeek(highlight.timestamp)}
                  >
                    <div 
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white"
                      style={{ backgroundColor: getHighlightColor(highlight.type) }}
                    >
                      {getHighlightIcon(highlight.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{highlight.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatTime(highlight.timestamp)} • {Math.round(highlight.confidence)}% confidence
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {highlight.saved ? (
                        <Badge variant="secondary" className="text-xs">
                          <Check className="h-2 w-2 mr-0.5" /> Saved
                        </Badge>
                      ) : (
                        <>
                          {onSaveBookmark && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                saveAsBookmark(highlight);
                              }}
                            >
                              <Bookmark className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissHighlight(highlight.id);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isAnalyzing && highlights.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-4">
              Click "Analyze Video" to detect key moments automatically
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
