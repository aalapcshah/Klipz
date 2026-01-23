import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Volume2, VolumeX, Mic, Trash2, MessageSquare } from "lucide-react";
import { VoiceRecorder } from "./VoiceRecorder";
import { VideoDrawingCanvas } from "./VideoDrawingCanvas";
import { AnnotationTimeline } from "./AnnotationTimeline";
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

  const { data: annotations = [], refetch: refetchAnnotations } = trpc.voiceAnnotations.getAnnotations.useQuery({ fileId });
  const { data: visualAnnotations = [], refetch: refetchVisualAnnotations } = trpc.visualAnnotations.getAnnotations.useQuery({ fileId });
  const saveAnnotation = trpc.voiceAnnotations.saveAnnotation.useMutation();
  const saveVisualAnnotation = trpc.visualAnnotations.saveAnnotation.useMutation();
  const deleteAnnotation = trpc.voiceAnnotations.deleteAnnotation.useMutation();
  const deleteVisualAnnotation = trpc.visualAnnotations.deleteAnnotation.useMutation();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
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
  }, []);

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
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSaveVisualAnnotation = async (imageDataUrl: string, timestamp: number) => {
    try {
      await saveVisualAnnotation.mutateAsync({
        fileId,
        imageDataUrl,
        videoTimestamp: Math.floor(timestamp),
      });
      toast.success("Drawing annotation saved!");
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
            className="w-full max-h-[500px] object-contain"
            onClick={isDrawingMode ? undefined : togglePlay}
            style={{ pointerEvents: isDrawingMode ? 'none' : 'auto' }}
          />
          
          {/* Voice annotation markers on timeline */}
          {annotations.length > 0 && duration > 0 && (
            <div className="absolute bottom-16 left-0 right-0 h-1 bg-transparent pointer-events-none">
              {annotations.map((annotation) => (
                <div
                  key={annotation.id}
                  className="absolute top-0 w-1 h-3 bg-yellow-500 rounded-full"
                  style={{ left: `${(annotation.videoTimestamp / duration) * 100}%` }}
                  title={`Annotation at ${formatTime(annotation.videoTimestamp)}`}
                />
              ))}
            </div>
          )}
          
          {/* Visual annotation markers on timeline */}
          {visualAnnotations.length > 0 && duration > 0 && (
            <div className="absolute bottom-16 left-0 right-0 h-1 bg-transparent pointer-events-none">
              {visualAnnotations.map((annotation) => (
                <div
                  key={annotation.id}
                  className="absolute top-0 w-1 h-3 bg-blue-500 rounded-full"
                  style={{ left: `${(annotation.videoTimestamp / duration) * 100}%` }}
                  title={`Drawing at ${formatTime(annotation.videoTimestamp)}`}
                />
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
            <Button size="default" className="md:h-9 md:px-3" variant="default" onClick={startAnnotation} disabled={showRecorder}>
              <Mic className="h-5 w-5 md:h-4 md:w-4 mr-2" />
              <span className="hidden sm:inline">Add Voice Note</span>
              <span className="sm:hidden">Voice</span>
            </Button>
            <Button size="default" className="md:h-9 md:px-3" variant="outline" onClick={() => setShowTimeline(!showTimeline)}>
              <MessageSquare className="h-5 w-5 md:h-4 md:w-4 mr-2" />
              <span className="hidden sm:inline">Timeline</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Drawing Canvas Controls */}
      <VideoDrawingCanvas
        videoRef={videoRef}
        currentTime={currentTime}
        onSaveAnnotation={handleSaveVisualAnnotation}
        onDrawingModeChange={setIsDrawingMode}
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
                    <Badge variant="secondary">{formatTime(annotation.videoTimestamp)}</Badge>
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

      {/* Annotation Timeline */}
      {showTimeline && (
        <AnnotationTimeline
          fileId={fileId}
          onJumpToTimestamp={(timestamp) => {
            if (videoRef.current) {
              videoRef.current.currentTime = timestamp;
              videoRef.current.play();
            }
          }}
        />
      )}
    </div>
  );
}
