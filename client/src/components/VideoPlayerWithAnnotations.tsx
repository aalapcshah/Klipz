import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Volume2, VolumeX, Mic, Trash2, MessageSquare, PenLine } from "lucide-react";
import { VoiceRecorder } from "./VoiceRecorder";
import { VideoDrawingCanvas } from "./VideoDrawingCanvas";
import { AnnotationTimeline } from "./AnnotationTimeline";
import { HorizontalAnnotationTimeline } from "./HorizontalAnnotationTimeline";
import { AnnotationHistoryTimeline } from "./AnnotationHistoryTimeline";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface VideoPlayerWithAnnotationsProps {
  fileId: number;
  videoUrl: string;
}

export function VideoPlayerWithAnnotations({ fileId, videoUrl }: VideoPlayerWithAnnotationsProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showRecorder, setShowRecorder] = useState(false);
  const [recordingTimestamp, setRecordingTimestamp] = useState(0);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [visibleAnnotationIds, setVisibleAnnotationIds] = useState<number[]>([]);
  const [drawToggleRequest, setDrawToggleRequest] = useState<boolean>();
  const [copiedAnnotation, setCopiedAnnotation] = useState<typeof visualAnnotations[0] | null>(null);

  const { data: annotations = [], refetch: refetchAnnotations } = trpc.voiceAnnotations.getAnnotations.useQuery({ fileId });
  const { data: visualAnnotations = [], refetch: refetchVisualAnnotations } = trpc.visualAnnotations.getAnnotations.useQuery({ fileId });
  const saveAnnotation = trpc.voiceAnnotations.saveAnnotation.useMutation();
  const saveVisualAnnotation = trpc.visualAnnotations.saveAnnotation.useMutation();
  const deleteAnnotation = trpc.voiceAnnotations.deleteAnnotation.useMutation();
  const deleteVisualAnnotation = trpc.visualAnnotations.deleteAnnotation.useMutation();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const time = video.currentTime;
      setCurrentTime(time);
      
      // Calculate which visual annotations should be visible
      const visible = visualAnnotations
        .filter(ann => {
          const startTime = ann.videoTimestamp;
          const endTime = startTime + (ann.duration || 5);
          return time >= startTime && time < endTime;
        })
        .map(ann => ann.id);
      setVisibleAnnotationIds(visible);
    };
    const handleLoadedMetadata = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [visualAnnotations]);

  // Keyboard shortcuts for video navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case ' ': // Space bar - play/pause
          e.preventDefault();
          togglePlay();
          break;
        case 'k': // K key - play/pause (video editor standard)
        case 'K':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft': // Left arrow - rewind 1 second
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 1);
          break;
        case 'ArrowRight': // Right arrow - forward 1 second
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 1);
          break;
        case 'j': // J key - rewind 5 seconds
        case 'J':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          break;
        case 'l': // L key - forward 5 seconds
        case 'L':
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 5);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying]); // Include isPlaying to ensure togglePlay has latest state

  // Copy/Paste functionality for annotations
  useEffect(() => {
    const handleCopyPaste = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Ctrl+C or Cmd+C - Copy last annotation
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        if (visualAnnotations.length > 0) {
          const lastAnnotation = visualAnnotations[visualAnnotations.length - 1];
          setCopiedAnnotation(lastAnnotation);
          toast.success('Annotation copied! Press Ctrl+V to paste at current time.');
        } else {
          toast.info('No annotations to copy');
        }
      }

      // Ctrl+V or Cmd+V - Paste annotation at current timestamp
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        if (copiedAnnotation) {
          // Create a new annotation at the current timestamp
          saveVisualAnnotation.mutateAsync({
            fileId,
            imageDataUrl: copiedAnnotation.imageUrl,
            videoTimestamp: currentTime,
            duration: copiedAnnotation.duration || 5,
          }).then(() => {
            toast.success(`Annotation pasted at ${formatTime(currentTime)}`);
            refetchVisualAnnotations();
          }).catch(() => {
            toast.error('Failed to paste annotation');
          });
        } else {
          toast.info('No annotation copied. Press Ctrl+C to copy an annotation first.');
        }
      }
    };

    window.addEventListener('keydown', handleCopyPaste);
    return () => window.removeEventListener('keydown', handleCopyPaste);
  }, [visualAnnotations, copiedAnnotation, currentTime, fileId, saveVisualAnnotation, refetchVisualAnnotations]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const startAnnotation = () => {
    setRecordingTimestamp(currentTime);
    setShowRecorder(true);
    if (videoRef.current && isPlaying) {
      videoRef.current.pause();
    }
  };

  const handleRecordingComplete = async (audioBlob: Blob, duration: number) => {
    try {
      // Convert blob to base64 data URL
      const reader = new FileReader();
      reader.onloadend = async () => {
        const audioDataUrl = reader.result as string;
        
        await saveAnnotation.mutateAsync({
          fileId,
          audioDataUrl,
          duration,
          videoTimestamp: Math.floor(recordingTimestamp),
        });

        toast.success("Voice annotation saved!");
        refetchAnnotations();
        setShowRecorder(false);
      };
      reader.readAsDataURL(audioBlob);
    } catch (error) {
      toast.error("Failed to save annotation");
    }
  };

  const handleDeleteAnnotation = async (annotationId: number) => {
    try {
      await deleteAnnotation.mutateAsync({ annotationId });
      toast.success("Annotation deleted");
      refetchAnnotations();
    } catch (error) {
      toast.error("Failed to delete annotation");
    }
  };

  const jumpToAnnotation = (timestamp: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timestamp;
      setCurrentTime(timestamp);
      videoRef.current.play();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const decisecs = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${decisecs}`;
  };

  const handleSaveVisualAnnotation = async (imageDataUrl: string, timestamp: number, duration: number) => {
    try {
      await saveVisualAnnotation.mutateAsync({
        fileId,
        imageDataUrl,
        videoTimestamp: Math.floor(timestamp),
        duration,
      });
      toast.success(`Drawing saved (${duration}s duration)`);
      refetchVisualAnnotations();
    } catch (error) {
      toast.error("Failed to save drawing annotation");
    }
  };

  const handleDeleteVisualAnnotation = async (annotationId: number) => {
    try {
      await deleteVisualAnnotation.mutateAsync({ annotationId });
      toast.success("Drawing annotation deleted");
      refetchVisualAnnotations();
    } catch (error) {
      toast.error("Failed to delete drawing annotation");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="relative bg-black" id="video-container">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full max-h-[360px] object-contain"
            onClick={isDrawingMode ? undefined : togglePlay}
            style={{ pointerEvents: isDrawingMode ? 'none' : 'auto' }}
          />
          
          {/* Visible annotation overlays */}
          {visualAnnotations
            .filter(ann => visibleAnnotationIds.includes(ann.id))
            .map(ann => (
              <img
                key={ann.id}
                src={ann.imageUrl}
                alt="Annotation"
                className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
                style={{ zIndex: 10 }}
              />
            ))}
          
          {/* Voice annotation markers on timeline */}
          {annotations.length > 0 && duration > 0 && (
            <div className="absolute bottom-16 left-0 right-0 h-1 bg-transparent">
              {annotations.map((annotation) => (
                <div
                  key={annotation.id}
                  className="absolute top-0 w-1 h-3 bg-yellow-500 rounded-full cursor-pointer pointer-events-auto group"
                  style={{ left: `${(annotation.videoTimestamp / duration) * 100}%` }}
                  onClick={() => jumpToAnnotation(annotation.videoTimestamp)}
                >
                  {/* Hover Preview Tooltip */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    <div className="bg-popover border border-border rounded-lg shadow-lg p-2 min-w-[120px] max-w-[200px]">
                      <div className="text-xs space-y-1">
                        <div className="font-medium text-center">{formatTime(annotation.videoTimestamp)}</div>
                        <div className="text-muted-foreground line-clamp-3">{annotation.transcript || 'Voice note'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Visual annotation markers on timeline */}
          {visualAnnotations.length > 0 && duration > 0 && (
            <div className="absolute bottom-16 left-0 right-0 h-1 bg-transparent">
              {visualAnnotations.map((annotation) => (
                <div
                  key={annotation.id}
                  className="absolute top-0 w-1 h-3 bg-blue-500 rounded-full cursor-pointer pointer-events-auto group"
                  style={{ left: `${(annotation.videoTimestamp / duration) * 100}%` }}
                  onClick={() => jumpToAnnotation(annotation.videoTimestamp)}
                >
                  {/* Hover Preview Tooltip */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    <div className="bg-popover border border-border rounded-lg shadow-lg p-2 min-w-[120px]">
                      <img
                        src={annotation.imageUrl}
                        alt="Drawing preview"
                        className="w-32 h-24 object-contain bg-black/10 rounded mb-1"
                      />
                      <div className="text-xs text-center space-y-0.5">
                        <div className="font-medium">{formatTime(annotation.videoTimestamp)}</div>
                        <div className="text-muted-foreground">Duration: {annotation.duration || 5}s</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 space-y-3 bg-card">
          {/* Timeline */}
          <div className="space-y-1">
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="default" className="md:h-9 md:px-3" variant="outline" onClick={togglePlay}>
              {isPlaying ? <Pause className="h-5 w-5 md:h-4 md:w-4" /> : <Play className="h-5 w-5 md:h-4 md:w-4" />}
            </Button>
            <Button size="default" className="md:h-9 md:px-3" variant="outline" onClick={toggleMute}>
              {isMuted ? <VolumeX className="h-5 w-5 md:h-4 md:w-4" /> : <Volume2 className="h-5 w-5 md:h-4 md:w-4" />}
            </Button>
            <div className="flex-1" />
            {/* Annotation Tools - Green Buttons */}
            <Button 
              size="default" 
              className="md:h-9 md:px-3 bg-green-600 hover:bg-green-700 text-white" 
              onClick={startAnnotation} 
              disabled={showRecorder}
            >
              <Mic className="h-5 w-5 md:h-4 md:w-4 mr-2" />
              <span className="hidden sm:inline">Voice Note</span>
              <span className="sm:hidden">Voice</span>
            </Button>
            <Button 
              size="default" 
              className="md:h-9 md:px-3 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setDrawToggleRequest(!drawToggleRequest)}
            >
              <PenLine className="h-5 w-5 md:h-4 md:w-4 mr-2" />
              <span className="hidden sm:inline">Draw / Text</span>
              <span className="sm:hidden">Draw</span>
            </Button>
          </div>
          
          {/* Timeline Toggle */}
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setShowTimeline(!showTimeline)}
              className="w-full"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              {showTimeline ? 'Hide' : 'Show'} Timeline
            </Button>
          </div>

          {/* Keyboard Shortcuts Help */}
          <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
            <div className="font-medium mb-1">Keyboard Shortcuts:</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span><kbd className="px-1 py-0.5 bg-background rounded text-[10px]">Space</kbd> / <kbd className="px-1 py-0.5 bg-background rounded text-[10px]">K</kbd> Play/Pause</span>
              <span><kbd className="px-1 py-0.5 bg-background rounded text-[10px]">←</kbd> / <kbd className="px-1 py-0.5 bg-background rounded text-[10px]">→</kbd> ±1s</span>
              <span><kbd className="px-1 py-0.5 bg-background rounded text-[10px]">J</kbd> Rewind 5s</span>
              <span><kbd className="px-1 py-0.5 bg-background rounded text-[10px]">L</kbd> Forward 5s</span>
              <span><kbd className="px-1 py-0.5 bg-background rounded text-[10px]">Ctrl+C</kbd> Copy</span>
              <span><kbd className="px-1 py-0.5 bg-background rounded text-[10px]">Ctrl+V</kbd> Paste</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Drawing Canvas Controls */}
      <VideoDrawingCanvas
        videoRef={videoRef}
        currentTime={currentTime}
        onSaveAnnotation={handleSaveVisualAnnotation}
        onDrawingModeChange={setIsDrawingMode}
        onToggleRequest={drawToggleRequest}
      />

      {/* Voice Recorder */}
      {showRecorder && (
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <span className="font-medium">Recording at {formatTime(recordingTimestamp)}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setShowRecorder(false)}>
                Cancel
              </Button>
            </div>
            <VoiceRecorder
              onSave={handleRecordingComplete}
              onCancel={() => setShowRecorder(false)}
              maxDuration={300}
            />
          </div>
        </Card>
      )}

      {/* Visual Annotations List */}
      {visualAnnotations.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Drawing Annotations ({visualAnnotations.length})
          </h3>
          <div className="space-y-2">
            {visualAnnotations.map((annotation) => (
              <div
                key={annotation.id}
                className="p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors space-y-2"
              >
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => jumpToAnnotation(annotation.videoTimestamp)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <div className="flex flex-col gap-1">
                      <Badge variant="secondary">{formatTime(annotation.videoTimestamp)}</Badge>
                      <span className="text-xs text-muted-foreground">Duration: {annotation.duration || 5}s</span>
                    </div>
                    <img
                      src={annotation.imageUrl}
                      alt="Drawing annotation"
                      className="h-16 w-24 object-contain bg-black/10 rounded"
                    />
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteVisualAnnotation(annotation.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Voice Annotations List */}
      {annotations.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Voice Annotations ({annotations.length})
          </h3>
          <div className="space-y-2">
            {annotations.map((annotation) => (
              <div
                key={annotation.id}
                className="p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors space-y-2"
              >
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => jumpToAnnotation(annotation.videoTimestamp)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <Badge variant="secondary">{formatTime(annotation.videoTimestamp)}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {annotation.duration}s recording
                    </span>
                    <audio
                      src={annotation.audioUrl}
                      controls
                      className="h-8 max-w-xs"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteAnnotation(annotation.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {annotation.transcript && (
                  <div className="pl-2 border-l-2 border-primary/30">
                    <p className="text-sm text-foreground">{annotation.transcript}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Annotation History Timeline */}
      {(visualAnnotations.length > 0 || annotations.length > 0) && (
        <Card className="p-4">
          <AnnotationHistoryTimeline fileId={fileId} />
        </Card>
      )}

      {/* Horizontal Annotation Timeline */}
      {showTimeline && (
        <HorizontalAnnotationTimeline
          voiceAnnotations={annotations}
          visualAnnotations={visualAnnotations}
          videoDuration={duration}
          currentTime={currentTime}
          onJumpToTime={(timestamp) => {
            if (videoRef.current) {
              videoRef.current.currentTime = timestamp;
              videoRef.current.play();
            }
          }}
        />
      )}

      {/* Detailed Annotation Timeline (Old) - Keep for reference */}
      {false && showTimeline && (
        <AnnotationTimeline
          fileId={fileId}
          videoTitle={videoUrl.split('/').pop() || 'Video'}
          onJumpToTimestamp={(timestamp) => {
            if (videoRef.current) {
              videoRef.current.currentTime = timestamp;
              videoRef.current.play();
            }
          }}
          onEditAnnotation={(annotation) => {
            // Jump to timestamp and enable drawing mode for editing
            if (videoRef.current) {
              videoRef.current.currentTime = annotation.videoTimestamp;
              videoRef.current.pause();
            }
            // TODO: Load existing drawing for editing
            toast.info("Edit mode: Draw your changes and save");
          }}
          onDeleteAnnotation={async (id, type) => {
            try {
              if (type === 'voice') {
                await deleteAnnotation.mutateAsync({ annotationId: id });
                refetchAnnotations();
                toast.success("Voice annotation deleted");
              } else {
                await deleteVisualAnnotation.mutateAsync({ annotationId: id });
                refetchVisualAnnotations();
                toast.success("Drawing annotation deleted");
              }
            } catch (error) {
              toast.error(`Failed to delete ${type} annotation`);
            }
          }}
        />
      )}
    </div>
  );
}
