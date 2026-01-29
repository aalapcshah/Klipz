import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Pause, Volume2, VolumeX, Mic, Trash2, MessageSquare, PenLine, Eye, EyeOff, Download, Repeat, Sparkles, FileDown, MoreHorizontal, ChevronUp } from "lucide-react";
import { VoiceRecorder } from "./VoiceRecorder";
import { VideoDrawingCanvas, VideoDrawingCanvasHandle } from "./VideoDrawingCanvas";
import { AnnotationTimeline } from "./AnnotationTimeline";
import { HorizontalAnnotationTimeline } from "./HorizontalAnnotationTimeline";
import { AnnotationHistoryTimeline } from "./AnnotationHistoryTimeline";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CommentThread } from "./CommentThread";
import { ApprovalWorkflow } from "./ApprovalWorkflow";
import { AnnotationHistoryViewer } from "./AnnotationHistoryViewer";
import { useWebSocket } from "@/hooks/useWebSocket";
import { UserPresenceIndicator } from "./UserPresenceIndicator";

import { BatchActionsToolbar } from "./BatchActionsToolbar";
import { VoiceAnnotationExport } from "./VoiceAnnotationExport";
import { HighlightedText } from "./HighlightedText";
import { AnnotationSearch } from "./videos/AnnotationSearch";
import { FileSuggestions } from "./FileSuggestions";
import { VideoChapters } from "./VideoChapters";
import { VideoLoopRegion } from "./VideoLoopRegion";
import { AutoHighlightDetection } from "./AutoHighlightDetection";
import { BookmarkChapterExport } from "./BookmarkChapterExport";

interface VideoPlayerWithAnnotationsProps {
  fileId: number;
  videoUrl: string;
}

export function VideoPlayerWithAnnotations({ fileId, videoUrl }: VideoPlayerWithAnnotationsProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasComponentRef = useRef<VideoDrawingCanvasHandle>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    const saved = localStorage.getItem('videoPlaybackSpeed');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [showRecorder, setShowRecorder] = useState(false);
  const [recordingTimestamp, setRecordingTimestamp] = useState(0);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [showMobileTools, setShowMobileTools] = useState(false);
  // Simple drawing state for direct canvas interaction
  const [isCanvasDrawing, setIsCanvasDrawing] = useState(false);
  const [lastDrawPoint, setLastDrawPoint] = useState<{x: number, y: number} | null>(null);
  const [drawingColor] = useState('#00ff00'); // Green for visibility
  const [drawingStrokeWidth] = useState(5);

  // Direct canvas drawing handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode) return;
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsCanvasDrawing(true);
    setLastDrawPoint({x, y});
    
    // Start drawing
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = drawingColor;
      ctx.lineWidth = drawingStrokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode || !isCanvasDrawing) return;
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const ctx = canvas.getContext('2d');
    if (ctx && lastDrawPoint) {
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
    setLastDrawPoint({x, y});
  };

  const handleCanvasMouseUp = () => {
    setIsCanvasDrawing(false);
    setLastDrawPoint(null);
  };

  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode) return;
    e.preventDefault();
    const canvas = drawingCanvasRef.current;
    if (!canvas || e.touches.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    setIsCanvasDrawing(true);
    setLastDrawPoint({x, y});
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = drawingColor;
      ctx.lineWidth = drawingStrokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode || !isCanvasDrawing) return;
    e.preventDefault();
    const canvas = drawingCanvasRef.current;
    if (!canvas || e.touches.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    const ctx = canvas.getContext('2d');
    if (ctx && lastDrawPoint) {
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
    setLastDrawPoint({x, y});
  };

  const handleCanvasTouchEnd = () => {
    setIsCanvasDrawing(false);
    setLastDrawPoint(null);
  };
  
  // Debug logging for drawing mode changes
  useEffect(() => {
    console.log('[VideoPlayerWithAnnotations] isDrawingMode changed to:', isDrawingMode);
  }, [isDrawingMode]);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showAnnotationPreview, setShowAnnotationPreview] = useState(true);
  const [visibleAnnotationIds, setVisibleAnnotationIds] = useState<number[]>([]);
  const [drawToggleRequest, setDrawToggleRequest] = useState(0);
  const [copiedAnnotation, setCopiedAnnotation] = useState<typeof visualAnnotations[0] | null>(null);
  const [speakingAnnotationId, setSpeakingAnnotationId] = useState<number | null>(null);
  const [speechRate, setSpeechRate] = useState(1.0);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [minTimestamp, setMinTimestamp] = useState<number | null>(null);
  const [maxTimestamp, setMaxTimestamp] = useState<number | null>(null);
  const [minDuration, setMinDuration] = useState<number | null>(null);
  const [maxDuration, setMaxDuration] = useState<number | null>(null);
  
  // Sorting state
  const [visualSortBy, setVisualSortBy] = useState<"timestamp" | "duration" | "date">("timestamp");
  const [voiceSortBy, setVoiceSortBy] = useState<"timestamp" | "duration" | "date">("timestamp");
  
  // Multi-select state
  const [selectedVisualIds, setSelectedVisualIds] = useState<number[]>([]);
  const [selectedVoiceIds, setSelectedVoiceIds] = useState<number[]>([]);
  
  // Collapsible sections state
  const [drawingAnnotationsCollapsed, setDrawingAnnotationsCollapsed] = useState(true);
  const [voiceFiltersCollapsed, setVoiceFiltersCollapsed] = useState(true);
  
  // Auto-save indicator
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const { data: annotations = [], refetch: refetchAnnotations } = trpc.voiceAnnotations.getAnnotations.useQuery({ fileId });
  const { data: chapters = [] } = trpc.videoChapters.getChapters.useQuery({ fileId });
  const exportAnnotationsMutation = trpc.annotationExport.exportAnnotations.useMutation();
  const uploadToGoogleDriveMutation = trpc.cloudStorage.uploadToGoogleDrive.useMutation();
  const uploadToDropboxMutation = trpc.cloudStorage.uploadToDropbox.useMutation();
  
  // WebSocket for real-time collaboration
  const { isConnected, activeUsers, broadcastAnnotation } = useWebSocket({
    fileId,
    onAnnotationCreated: () => {
      refetchAnnotations();
      refetchVisualAnnotations();
      toast.success("New annotation added by collaborator");
    },
    onAnnotationDeleted: () => {
      refetchAnnotations();
      refetchVisualAnnotations();
      toast.info("Annotation removed by collaborator");
    },
    onUserJoined: (data) => {
      toast.info(`${data.userName} joined`);
    },
    onUserLeft: (data) => {
      toast.info(`${data.userName} left`);
    },
  });
  const { data: visualAnnotations = [], refetch: refetchVisualAnnotations } = trpc.visualAnnotations.getAnnotations.useQuery({ fileId });
  const saveAnnotation = trpc.voiceAnnotations.saveAnnotation.useMutation();
  const saveVisualAnnotation = trpc.visualAnnotations.saveAnnotation.useMutation();
  const deleteAnnotation = trpc.voiceAnnotations.deleteAnnotation.useMutation();
  const deleteVisualAnnotation = trpc.visualAnnotations.deleteAnnotation.useMutation();

  // Apply playback speed to video element and persist to localStorage
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = playbackSpeed;
    }
    localStorage.setItem('videoPlaybackSpeed', playbackSpeed.toString());
  }, [playbackSpeed]);

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
          const duration = ann.duration || 5;
          const endTime = startTime + duration;
          const isVisible = time >= startTime && time < endTime;
          console.log('[Annotation Visibility]', { id: ann.id, startTime, duration, endTime, currentTime: time, isVisible });
          return isVisible;
        })
        .map(ann => ann.id);
      setVisibleAnnotationIds(visible);
    };
    const handleLoadedMetadata = () => {
      const dur = video.duration;
      // Only set duration if it's a valid finite number
      if (isFinite(dur) && !isNaN(dur) && dur > 0) {
        setDuration(dur);
      } else {
        // Fallback: try again after a short delay
        setTimeout(() => {
          const retryDur = video.duration;
          if (isFinite(retryDur) && !isNaN(retryDur) && retryDur > 0) {
            setDuration(retryDur);
          }
        }, 100);
      }
    };
    
    // Also handle durationchange event for more reliable duration detection
    const handleDurationChange = () => {
      const dur = video.duration;
      if (isFinite(dur) && !isNaN(dur) && dur > 0) {
        setDuration(dur);
      }
    };
    
    // Handle loadeddata as another fallback
    const handleLoadedData = () => {
      const dur = video.duration;
      if (isFinite(dur) && !isNaN(dur) && dur > 0 && duration === 0) {
        setDuration(dur);
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    
    // Also try to get duration immediately if video is already loaded
    if (video.readyState >= 1 && isFinite(video.duration) && video.duration > 0) {
      setDuration(video.duration);
    }
    
    // Fallback polling for duration if events don't fire
    const pollDuration = setInterval(() => {
      if (video && isFinite(video.duration) && video.duration > 0) {
        setDuration(prev => prev === 0 ? video.duration : prev);
        clearInterval(pollDuration);
      }
    }, 500);
    
    // Clear polling after 10 seconds
    const clearPolling = setTimeout(() => clearInterval(pollDuration), 10000);

    return () => {
      clearInterval(pollDuration);
      clearTimeout(clearPolling);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("loadeddata", handleLoadedData);
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
        
        setSaveStatus("saving");
        const newAnnotation = await saveAnnotation.mutateAsync({
          fileId,
          audioDataUrl,
          duration,
          videoTimestamp: Math.floor(recordingTimestamp),
        });

        setSaveStatus("saved");
        setLastSaved(new Date());
        setTimeout(() => setSaveStatus("idle"), 2000);
        toast.success("Voice annotation saved!");
        refetchAnnotations();
        
        // Broadcast to collaborators
        broadcastAnnotation("annotation_created", "voice", newAnnotation);
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
      
      // Broadcast to collaborators
      broadcastAnnotation("annotation_deleted", "voice", { id: annotationId });
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

  const handleSpeak = (annotationId: number, text: string) => {
    // Stop any ongoing speech
    if (speechSynthesisRef.current) {
      window.speechSynthesis.cancel();
    }

    if (speakingAnnotationId === annotationId) {
      // If already speaking this annotation, stop it
      setSpeakingAnnotationId(null);
      return;
    }

    // Create new speech synthesis utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speechRate;
    utterance.onend = () => {
      setSpeakingAnnotationId(null);
      speechSynthesisRef.current = null;
    };
    utterance.onerror = () => {
      setSpeakingAnnotationId(null);
      speechSynthesisRef.current = null;
      toast.error("Text-to-speech failed");
    };

    speechSynthesisRef.current = utterance;
    setSpeakingAnnotationId(annotationId);
    window.speechSynthesis.speak(utterance);
  };

  // Cleanup speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (speechSynthesisRef.current) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    // Handle invalid values
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) {
      return "0:00.0";
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const decisecs = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${decisecs}`;
  };

  const handleSaveVisualAnnotation = async (imageDataUrl: string, timestamp: number, duration: number) => {
    try {
      setSaveStatus("saving");
      const newAnnotation = await saveVisualAnnotation.mutateAsync({
        fileId,
        imageDataUrl,
        videoTimestamp: Math.floor(timestamp),
        duration,
      });
      
      setSaveStatus("saved");
      setLastSaved(new Date());
      setTimeout(() => setSaveStatus("idle"), 2000);
      toast.success(`Drawing saved (${duration}s duration)`);
      refetchVisualAnnotations();
      
      // Broadcast to collaborators
      broadcastAnnotation("annotation_created", "visual", newAnnotation);
    } catch (error) {
      toast.error("Failed to save drawing annotation");
    }
  };

  const handleDeleteVisualAnnotation = async (annotationId: number) => {
    try {
      await deleteVisualAnnotation.mutateAsync({ annotationId });
      toast.success("Drawing annotation deleted");
      refetchVisualAnnotations();
      
      // Broadcast to collaborators
      broadcastAnnotation("annotation_deleted", "visual", { id: annotationId });
    } catch (error) {
      toast.error("Failed to delete drawing annotation");
    }
  };

  return (
    <div className="space-y-2 md:space-y-4 max-w-full overflow-x-hidden">
      {/* User Presence Indicator */}
      {activeUsers.length > 0 && (
        <Card className="p-3 max-w-full overflow-x-hidden">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="text-sm font-medium">
                {isConnected ? `${activeUsers.length + 1} viewing` : 'Connecting...'}
              </span>
            </div>
            <UserPresenceIndicator activeUsers={activeUsers} maxDisplay={5} />
          </div>
        </Card>
      )}
      
      {/* Batch Actions Toolbar - Visual Annotations */}
      {selectedVisualIds.length > 0 && (
        <BatchActionsToolbar
          selectedIds={selectedVisualIds}
          annotationType="visual"
          onClearSelection={() => setSelectedVisualIds([])}
          onActionComplete={() => {
            refetchVisualAnnotations();
            toast.success("Batch action completed");
          }}
        />
      )}
      
      {/* Batch Actions Toolbar - Voice Annotations */}
      {selectedVoiceIds.length > 0 && (
        <BatchActionsToolbar
          selectedIds={selectedVoiceIds}
          annotationType="voice"
          onClearSelection={() => setSelectedVoiceIds([])}
          onActionComplete={() => {
            refetchAnnotations();
            toast.success("Batch action completed");
          }}
        />
      )}
      
      <Card className="overflow-hidden max-w-full">
        <div className="relative bg-black" id="video-container" style={{ position: 'relative' }}>
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full max-h-[360px] object-contain"
            onClick={isDrawingMode ? undefined : togglePlay}
            style={{ pointerEvents: isDrawingMode ? 'none' : 'auto' }}
          />
          
          {/* Drawing canvas overlay - VideoDrawingCanvas handles all drawing events */}
          <canvas
            ref={drawingCanvasRef}
            id="drawing-canvas"
            width={videoRef.current?.clientWidth || 800}
            height={videoRef.current?.clientHeight || 600}
            onMouseDown={(e) => drawingCanvasComponentRef.current?.handleMouseDown(e)}
            onMouseMove={(e) => drawingCanvasComponentRef.current?.handleMouseMove(e)}
            onMouseUp={() => drawingCanvasComponentRef.current?.handleMouseUp()}
            onMouseLeave={() => drawingCanvasComponentRef.current?.handleMouseUp()}
            onTouchStart={(e) => {
              e.preventDefault();
              console.log('[Canvas] Touch start, ref exists:', !!drawingCanvasComponentRef.current);
              drawingCanvasComponentRef.current?.handleTouchStart(e);
            }}
            onTouchMove={(e) => {
              e.preventDefault();
              drawingCanvasComponentRef.current?.handleTouchMove(e);
            }}
            onTouchEnd={() => {
              console.log('[Canvas] Touch end');
              drawingCanvasComponentRef.current?.handleTouchEnd();
            }}
            onTouchCancel={() => drawingCanvasComponentRef.current?.handleTouchEnd()}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: isDrawingMode ? 'auto' : 'none',
              display: isDrawingMode ? 'block' : 'none',
              zIndex: 9999,
              touchAction: 'none',
              backgroundColor: isDrawingMode ? 'rgba(0, 255, 0, 0.1)' : 'transparent',
              cursor: isDrawingMode ? 'crosshair' : 'default',
              border: isDrawingMode ? '3px solid lime' : 'none',
            }}
          />
          
          {/* Visible annotation overlays */}
          {showAnnotationPreview && visualAnnotations
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
          {showAnnotationPreview && annotations.length > 0 && duration > 0 && (
            <div className="absolute bottom-16 left-0 right-0 h-1 bg-transparent">
              {annotations.map((annotation) => (
                <div
                  key={annotation.id}
                  className="absolute top-0 w-2 h-4 md:w-1 md:h-3 bg-yellow-500 rounded-full cursor-pointer pointer-events-auto group"
                  style={{ left: `${(annotation.videoTimestamp / duration) * 100}%` }}
                  onClick={() => jumpToAnnotation(annotation.videoTimestamp)}
                >
                  {/* Hover Preview Tooltip */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity pointer-events-none z-50">
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
                  className="absolute top-0 w-2 h-4 md:w-1 md:h-3 bg-blue-500 rounded-full cursor-pointer pointer-events-auto group"
                  style={{ left: `${(annotation.videoTimestamp / duration) * 100}%` }}
                  onClick={() => jumpToAnnotation(annotation.videoTimestamp)}
                >
                  {/* Hover Preview Tooltip */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity pointer-events-none z-50">
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

        <div className="p-2 md:p-4 space-y-2 md:space-y-3 bg-card max-w-full overflow-x-hidden">
          {/* Timeline */}
          <div className="space-y-1">
            <div className="relative">
              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              {/* Chapter markers */}
              {chapters.map((chapter) => {
                const position = duration > 0 ? (chapter.timestamp / duration) * 100 : 0;
                return (
                  <div
                    key={chapter.id}
                    className="absolute top-0 bottom-0 w-1 bg-primary hover:w-2 transition-all cursor-pointer group"
                    style={{ left: `${position}%` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (videoRef.current) {
                        videoRef.current.currentTime = chapter.timestamp;
                      }
                    }}
                    title={chapter.name}
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg border">
                      {chapter.name}
                      <div className="text-[10px] text-muted-foreground">{formatTime(chapter.timestamp)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap video-controls max-w-full">
            {/* Auto-save indicator */}
            {saveStatus !== "idle" && (
              <Badge variant={saveStatus === "saved" ? "default" : "secondary"} className="h-9 px-3">
                {saveStatus === "saving" ? "Saving..." : "Saved"}
              </Badge>
            )}
            
            <Button size="default" className="h-11 px-4 md:h-9 md:px-3" variant="outline" onClick={togglePlay}>
              {isPlaying ? <Pause className="h-5 w-5 md:h-4 md:w-4" /> : <Play className="h-5 w-5 md:h-4 md:w-4" />}
            </Button>
            <Button size="default" className="h-11 px-4 md:h-9 md:px-3" variant="outline" onClick={toggleMute}>
              {isMuted ? <VolumeX className="h-5 w-5 md:h-4 md:w-4" /> : <Volume2 className="h-5 w-5 md:h-4 md:w-4" />}
            </Button>
            
            {/* Annotation Preview Toggle */}
            <Button 
              size="default" 
              className="h-11 px-4 md:h-9 md:px-3" 
              variant={showAnnotationPreview ? "default" : "outline"}
              onClick={() => {
                setShowAnnotationPreview(!showAnnotationPreview);
                toast.success(showAnnotationPreview ? "Annotations hidden" : "Annotations visible");
              }}
              title={showAnnotationPreview ? "Hide annotations" : "Show annotations"}
            >
              {showAnnotationPreview ? <Eye className="h-5 w-5 md:h-4 md:w-4" /> : <EyeOff className="h-5 w-5 md:h-4 md:w-4" />}
            </Button>

            {/* Export Annotations Button */}
            <Select onValueChange={async (value: string) => {
              const [action, format] = value.split(":") as ["download" | "gdrive" | "dropbox", "pdf" | "csv"];
              
              try {
                toast.loading("Generating export...");
                const result = await exportAnnotationsMutation.mutateAsync({
                  fileId,
                  format,
                });
                
                if (action === "download") {
                  // Download the file locally
                  if (result.format === "pdf") {
                    const blob = new Blob([Uint8Array.from(atob(result.content), c => c.charCodeAt(0))], { type: "application/pdf" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = result.filename;
                    a.click();
                    URL.revokeObjectURL(url);
                  } else {
                    const blob = new Blob([result.content], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = result.filename;
                    a.click();
                    URL.revokeObjectURL(url);
                  }
                  toast.dismiss();
                  toast.success(`Downloaded annotations as ${format.toUpperCase()}`);
                } else if (action === "gdrive") {
                  // Upload to Google Drive
                  toast.dismiss();
                  toast.loading("Uploading to Google Drive...");
                  const uploadResult = await uploadToGoogleDriveMutation.mutateAsync({
                    filename: result.filename,
                    content: result.content,
                    mimeType: format === "pdf" ? "application/pdf" : "text/csv",
                  });
                  toast.dismiss();
                  toast.success("Uploaded to Google Drive!", {
                    action: {
                      label: "Open",
                      onClick: () => window.open(uploadResult.webViewLink, "_blank"),
                    },
                  });
                } else if (action === "dropbox") {
                  // Upload to Dropbox
                  toast.dismiss();
                  toast.loading("Uploading to Dropbox...");
                  const uploadResult = await uploadToDropboxMutation.mutateAsync({
                    filename: result.filename,
                    content: result.content,
                    mimeType: format === "pdf" ? "application/pdf" : "text/csv",
                  });
                  toast.dismiss();
                  toast.success("Uploaded to Dropbox!", {
                    action: uploadResult.sharedLink ? {
                      label: "Open",
                      onClick: () => window.open(uploadResult.sharedLink, "_blank"),
                    } : undefined,
                  });
                }
              } catch (error: any) {
                toast.dismiss();
                if (error?.message?.includes("not connected")) {
                  toast.error(error.message, {
                    action: {
                      label: "Connect",
                      onClick: () => {
                        // Open settings or connection modal
                        toast.info("Please connect your cloud storage account in Settings");
                      },
                    },
                  });
                } else {
                  toast.error("Failed to export annotations");
                }
              }
            }}>
              <SelectTrigger className="w-auto h-11 md:h-9 gap-2">
                <Download className="h-5 w-5 md:h-4 md:w-4" />
                <span className="hidden md:inline">Export</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="download:pdf">📥 Download PDF</SelectItem>
                <SelectItem value="download:csv">📥 Download CSV</SelectItem>
                <SelectItem value="gdrive:pdf">☁️ Google Drive (PDF)</SelectItem>
                <SelectItem value="gdrive:csv">☁️ Google Drive (CSV)</SelectItem>
                <SelectItem value="dropbox:pdf">📦 Dropbox (PDF)</SelectItem>
                <SelectItem value="dropbox:csv">📦 Dropbox (CSV)</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Playback Speed Control */}
            <Select value={playbackSpeed.toString()} onValueChange={(value) => {
              const speed = parseFloat(value);
              setPlaybackSpeed(speed);
              localStorage.setItem('videoPlaybackSpeed', value);
              if (videoRef.current) {
                videoRef.current.playbackRate = speed;
              }
            }}>
              <SelectTrigger className="w-20 h-11 md:h-9">
                <SelectValue>{playbackSpeed}x</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.25">0.25x</SelectItem>
                <SelectItem value="0.5">0.5x</SelectItem>
                <SelectItem value="1">1x</SelectItem>
                <SelectItem value="1.5">1.5x</SelectItem>
                <SelectItem value="2">2x</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="flex-1" />
            {/* Annotation Tools - Visible on desktop */}
            <div className="hidden md:flex items-center gap-2">
              <Button 
                size="default" 
                className="h-9 px-3 bg-green-600 hover:bg-green-700 text-white" 
                onClick={startAnnotation} 
                disabled={showRecorder}
              >
                <Mic className="h-4 w-4 mr-2" />
                Voice Note
              </Button>
              <Button 
                size="default" 
                className={`h-9 px-3 ${isDrawingMode ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'} text-white`}
                onClick={() => setDrawToggleRequest(prev => prev + 1)}
              >
                <PenLine className="h-4 w-4 mr-2" />
                {isDrawingMode ? 'Drawing...' : 'Draw / Text'}
              </Button>
            </div>
          </div>
          
          {/* Mobile Floating Action Buttons for Annotation Tools */}
          <div className={`md:hidden fixed right-4 flex flex-col gap-3 transition-all duration-300 ${showRecorder ? 'bottom-64' : 'bottom-20'}`} style={{ zIndex: 9999, pointerEvents: 'auto' }}>
            {/* Expandable tools menu */}
            {showMobileTools && (
              <>
                <Button 
                  size="lg"
                  className="h-12 w-12 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 text-white p-0"
                  onClick={() => {
                    setShowMobileTools(false);
                    document.getElementById('loop-region-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  title="Loop Region"
                >
                  <Repeat className="h-5 w-5" />
                </Button>
                <Button 
                  size="lg"
                  className="h-12 w-12 rounded-full shadow-lg bg-amber-600 hover:bg-amber-700 text-white p-0"
                  onClick={() => {
                    setShowMobileTools(false);
                    document.getElementById('auto-highlight-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  title="Auto Highlights"
                >
                  <Sparkles className="h-5 w-5" />
                </Button>
                <Button 
                  size="lg"
                  className="h-12 w-12 rounded-full shadow-lg bg-teal-600 hover:bg-teal-700 text-white p-0"
                  onClick={() => {
                    setShowMobileTools(false);
                    document.getElementById('export-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  title="Export"
                >
                  <FileDown className="h-5 w-5" />
                </Button>
              </>
            )}
            <Button 
              size="lg"
              className="h-14 w-14 rounded-full shadow-lg bg-green-600 hover:bg-green-700 text-white p-0"
              onClick={startAnnotation}
              disabled={showRecorder}
            >
              <Mic className="h-6 w-6" />
            </Button>
            <Button 
              size="lg"
              className={`h-14 w-14 rounded-full shadow-lg ${isDrawingMode ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'} text-white p-0`}
              onClick={() => setDrawToggleRequest(prev => prev + 1)}
            >
              <PenLine className="h-6 w-6" />
            </Button>
            <Button 
              size="lg"
              className={`h-12 w-12 rounded-full shadow-lg ${showMobileTools ? 'bg-gray-600' : 'bg-gray-700'} hover:bg-gray-600 text-white p-0`}
              onClick={() => setShowMobileTools(!showMobileTools)}
              title="More Tools"
            >
              {showMobileTools ? <ChevronUp className="h-5 w-5" /> : <MoreHorizontal className="h-5 w-5" />}
            </Button>
          </div>
          
          {/* Drawing Canvas Controls - inside card for minimal spacing */}
          <VideoDrawingCanvas
            ref={drawingCanvasComponentRef}
            videoRef={videoRef}
            canvasRef={drawingCanvasRef}
            currentTime={currentTime}
            onSaveAnnotation={handleSaveVisualAnnotation}
            onDrawingModeChange={setIsDrawingMode}
            onToggleRequest={drawToggleRequest}
            fileId={fileId}
          />
        </div>
      </Card>

      {/* Voice Recorder */}
      {showRecorder && (
        <Card className="p-4 max-w-full overflow-x-hidden">
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



      {/* Drawing Annotations List */}
      {visualAnnotations.length > 0 && (
        <Card className="p-4 max-w-full overflow-x-hidden">
          <h3 className="font-semibold mb-3 flex items-center justify-between cursor-pointer" onClick={() => setDrawingAnnotationsCollapsed(!drawingAnnotationsCollapsed)}>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Drawing Annotations ({visualAnnotations.length})
              <span className="text-xs text-muted-foreground">{drawingAnnotationsCollapsed ? '(Click to expand)' : '(Click to collapse)'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-normal">
              {selectedVisualIds.length > 0 && (
                <span className="text-muted-foreground">
                  {selectedVisualIds.length} of {visualAnnotations.length} selected
                </span>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={visualAnnotations.length > 0 && selectedVisualIds.length === visualAnnotations.length}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedVisualIds(visualAnnotations.map(a => a.id).filter((id): id is number => id !== undefined));
                    } else {
                      setSelectedVisualIds([]);
                    }
                  }}
                  className="h-3 w-3 md:h-4 md:w-4"
                />
                <span className="text-xs">Select All</span>
              </label>
            </div>
          </h3>
          
          {!drawingAnnotationsCollapsed && (
          <>
          {/* Search and Filter Bar */}
          <div className="mb-4 space-y-3">
            <input
              type="text"
              placeholder="Search annotations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-base md:text-sm"
            />
            <div>
              <label className="text-xs text-muted-foreground">Approval Status:</label>
              <select
                value={approvalStatusFilter}
                onChange={(e) => setApprovalStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-md text-base md:text-sm"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Sort By:</label>
              <select
                value={visualSortBy}
                onChange={(e) => setVisualSortBy(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-md text-base md:text-sm"
              >
                <option value="timestamp">Timestamp</option>
                <option value="duration">Duration</option>
                <option value="date">Date Created</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-muted-foreground">Min Time (s):</label>
                <input
                  type="number"
                  placeholder="0"
                  value={minTimestamp ?? ""}
                  onChange={(e) => setMinTimestamp(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground">Max Time (s):</label>
                <input
                  type="number"
                  placeholder="∞"
                  value={maxTimestamp ?? ""}
                  onChange={(e) => setMaxTimestamp(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground">Min Duration (s):</label>
                <input
                  type="number"
                  placeholder="0"
                  value={minDuration ?? ""}
                  onChange={(e) => setMinDuration(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground">Max Duration (s):</label>
                <input
                  type="number"
                  placeholder="∞"
                  value={maxDuration ?? ""}
                  onChange={(e) => setMaxDuration(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
            </div>
            {(searchQuery || minTimestamp !== null || maxTimestamp !== null || minDuration !== null || maxDuration !== null || approvalStatusFilter !== "all") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setApprovalStatusFilter("all");
                  setMinTimestamp(null);
                  setMaxTimestamp(null);
                  setMinDuration(null);
                  setMaxDuration(null);
                }}
                className="w-full"
              >
                Clear Filters
              </Button>
            )}
          </div>
          
          {(() => {
            const filteredVisualAnnotations = visualAnnotations.filter((annotation) => {
              // Filter by timestamp range
              if (minTimestamp !== null && annotation.videoTimestamp < minTimestamp) return false;
              if (maxTimestamp !== null && annotation.videoTimestamp > maxTimestamp) return false;
              
              // Filter by duration range
              const duration = annotation.duration || 5;
              if (minDuration !== null && duration < minDuration) return false;
              if (maxDuration !== null && duration > maxDuration) return false;
              
              // Filter by search query (description)
              if (searchQuery && annotation.description) {
                if (!annotation.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
              }
              
              // Note: Approval status filtering requires fetching approval data
              // For now, showing all annotations when filter is applied
              // TODO: Fetch approval statuses and filter accordingly
              
              return true;
            });
            
            // Sort annotations
            const sortedVisualAnnotations = [...filteredVisualAnnotations].sort((a, b) => {
              if (visualSortBy === "timestamp") {
                return a.videoTimestamp - b.videoTimestamp;
              } else if (visualSortBy === "duration") {
                return (a.duration || 5) - (b.duration || 5);
              } else { // date
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              }
            });
            
            return (
              <>
                <div className="text-sm text-muted-foreground mb-2">
                  Showing {filteredVisualAnnotations.length} of {visualAnnotations.length} annotations
                </div>
                <div className="space-y-2">
                  {sortedVisualAnnotations.map((annotation) => {
                    const isSelected = !!annotation.id && selectedVisualIds.includes(annotation.id);
                    const setSelected = setSelectedVisualIds;
                    const selectedIds = selectedVisualIds;
                    return (
              <div
                key={annotation.id}
                className={`p-3 rounded-lg transition-colors space-y-2 ${
                  isSelected ? 'bg-primary/10 border-2 border-primary' : 'bg-muted/50 hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelected([...selectedIds, annotation.id]);
                      } else {
                        setSelected(selectedIds.filter(id => id !== annotation.id));
                      }
                    }}
                    className="h-3 w-3 md:h-4 md:w-4"
                  />
                  <div className="flex items-center justify-between flex-1">
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
                
                {/* Comment Thread */}
                <CommentThread
                  annotationId={annotation.id}
                  annotationType="visual"
                />
                
                {/* Approval Workflow and History Viewer in same row */}
                <div className="flex items-start justify-between gap-2 border-t pt-2 mt-2">
                  <div className="flex-1 min-w-0">
                    <ApprovalWorkflow
                      annotationId={annotation.id}
                      annotationType="visual"
                    />
                  </div>
                  <div className="flex-shrink-0">
                    <AnnotationHistoryViewer
                      annotationId={annotation.id}
                      annotationType="visual"
                    />
                  </div>
                </div>
                </div>
              </div>
            );
              })}
                </div>
              </>
            );
          })()}
          </>
          )}
        </Card>
      )}

      {/* Voice Annotations List */}
      {annotations.length > 0 && (
        <Card className="p-4 max-w-full overflow-x-hidden">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Voice Annotations ({annotations.length})
              </div>
              <div className="flex items-center gap-3 text-sm font-normal">
                {selectedVoiceIds.length > 0 && (
                  <span className="text-muted-foreground">
                    {selectedVoiceIds.length} of {annotations.length} selected
                  </span>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={annotations.length > 0 && selectedVoiceIds.length === annotations.length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedVoiceIds(annotations.map(a => a.id).filter((id): id is number => id !== undefined));
                      } else {
                        setSelectedVoiceIds([]);
                      }
                    }}
                    className="h-3 w-3 md:h-4 md:w-4"
                  />
                  <span className="text-xs">Select All</span>
                </label>
                {selectedVoiceIds.length > 0 && (
                  <VoiceAnnotationExport
                    annotations={annotations
                      .filter(a => a.id && selectedVoiceIds.includes(a.id))
                      .map(a => ({
                        ...a,
                        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt
                      }))}
                    videoTitle={fileId.toString()}
                  />
                )}
              </div>
            </h3>
          </div>
            
            {/* Filters Toggle Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setVoiceFiltersCollapsed(!voiceFiltersCollapsed)}
              className="w-full mb-3"
            >
              {voiceFiltersCollapsed ? 'Show' : 'Hide'} Filters & Controls
            </Button>
            
            {/* Search and Filter Bar - Collapsible */}
            {!voiceFiltersCollapsed && (
            <div className="mb-4 space-y-3 border-t pt-3">
              <input
                type="text"
                placeholder="Search voice annotations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
              <div>
                <label className="text-xs text-muted-foreground">Approval Status:</label>
                <select
                  value={approvalStatusFilter}
                  onChange={(e) => setApprovalStatusFilter(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Sort By:</label>
                <select
                  value={voiceSortBy}
                  onChange={(e) => setVoiceSortBy(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-md text-base md:text-sm"
                >
                  <option value="timestamp">Timestamp</option>
                  <option value="duration">Duration</option>
                  <option value="date">Date Created</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-muted-foreground">Min Time (s):</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={minTimestamp ?? ""}
                    onChange={(e) => setMinTimestamp(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground">Max Time (s):</label>
                  <input
                    type="number"
                    placeholder="∞"
                    value={maxTimestamp ?? ""}
                    onChange={(e) => setMaxTimestamp(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground">Min Duration (s):</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={minDuration ?? ""}
                    onChange={(e) => setMinDuration(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground">Max Duration (s):</label>
                  <input
                    type="number"
                    placeholder="∞"
                    value={maxDuration ?? ""}
                    onChange={(e) => setMaxDuration(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
              </div>
              {(searchQuery || minTimestamp !== null || maxTimestamp !== null || minDuration !== null || maxDuration !== null || approvalStatusFilter !== "all") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setApprovalStatusFilter("all");
                    setMinTimestamp(null);
                    setMaxTimestamp(null);
                    setMinDuration(null);
                    setMaxDuration(null);
                  }}
                  className="w-full"
                >
                  Clear Filters
                </Button>
              )}
              <div className="flex items-center gap-2 pt-2 border-t">
                <label className="text-xs text-muted-foreground">Speech Rate:</label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={speechRate}
                  onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                  className="w-20 h-1"
                />
                <span className="text-xs text-muted-foreground w-8">{speechRate.toFixed(1)}x</span>
              </div>
            </div>
            )}
          
          {(() => {
            const filteredVoiceAnnotations = annotations.filter((annotation) => {
              // Filter by timestamp range
              if (minTimestamp !== null && annotation.videoTimestamp < minTimestamp) return false;
              if (maxTimestamp !== null && annotation.videoTimestamp > maxTimestamp) return false;
              
              // Filter by duration range
              const duration = annotation.duration || 5;
              if (minDuration !== null && duration < minDuration) return false;
              if (maxDuration !== null && duration > maxDuration) return false;
              
              // Filter by search query (transcript)
              if (searchQuery && annotation.transcript) {
                if (!annotation.transcript.toLowerCase().includes(searchQuery.toLowerCase())) return false;
              }
              
              return true;
            });
            
            // Sort annotations
            const sortedVoiceAnnotations = [...filteredVoiceAnnotations].sort((a, b) => {
              if (voiceSortBy === "timestamp") {
                return a.videoTimestamp - b.videoTimestamp;
              } else if (voiceSortBy === "duration") {
                return (a.duration || 5) - (b.duration || 5);
              } else { // date
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              }
            });
            
            return (
              <>
                <div className="text-sm text-muted-foreground mb-2">
                  Showing {filteredVoiceAnnotations.length} of {annotations.length} annotations
                </div>
                <div className="space-y-2">
                  {sortedVoiceAnnotations.map((annotation) => {
                const isSelected = !!annotation.id && selectedVoiceIds.includes(annotation.id);
                const setSelected = setSelectedVoiceIds;
                const selectedIds = selectedVoiceIds;
                return (
              <div
                key={annotation.id}
                className={`p-2 rounded-lg transition-colors ${
                  isSelected ? 'bg-primary/10 border-2 border-primary' : 'bg-muted/50 hover:bg-muted'
                }`}
              >
                {/* Top Row: Checkbox + Transcript */}
                <div className="flex items-start gap-2 mb-2">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelected([...selectedIds, annotation.id]);
                      } else {
                        setSelected(selectedIds.filter(id => id !== annotation.id));
                      }
                    }}
                    className="h-3 w-3 md:h-4 md:w-4 mt-1"
                  />
                  {annotation.transcript && (
                    <div className="flex-1 text-sm text-foreground" style={{ wordBreak: 'normal', whiteSpace: 'normal', display: 'block' }}>
                      <HighlightedText text={annotation.transcript.replace(/[\r\n]+/g, ' ')} searchQuery={searchQuery} />
                    </div>
                  )}
                </div>

                {/* Middle Row: Audio Player + Status Button */}
                <div className="flex items-center gap-2 mb-2">
                  {/* Left: Audio Player */}
                  <audio
                    src={annotation.audioUrl}
                    controls
                    className="h-8 flex-1"
                    onClick={(e) => e.stopPropagation()}
                  />

                  {/* Right: Status Button */}
                  <ApprovalWorkflow
                    annotationId={annotation.id}
                    annotationType="voice"
                  />
                </div>

                {/* Bottom Row: Time + Duration + Icons */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => jumpToAnnotation(annotation.videoTimestamp)}
                    className="flex items-center gap-2 text-left hover:underline"
                  >
                    <Badge variant="secondary" className="text-xs">{formatTime(annotation.videoTimestamp)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {annotation.duration}s recording
                    </span>
                  </button>
                  <div className="flex items-center gap-1">
                    <AnnotationHistoryViewer
                      annotationId={annotation.id}
                      annotationType="voice"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSpeak(annotation.id, annotation.transcript!)}
                      className="h-7 w-7 p-0"
                    >
                      {speakingAnnotationId === annotation.id ? (
                        <VolumeX className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteAnnotation(annotation.id)}
                      className="h-7 w-7 p-0"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                
                {/* Comment Thread */}
                <CommentThread
                  annotationId={annotation.id}
                  annotationType="voice"
                />
              </div>
            );
              })}
                </div>
              </>
            );
          })()}
        </Card>
      )}

      {/* Annotation History Timeline */}
      {(visualAnnotations.length > 0 || annotations.length > 0) && (
        <Card className="p-4 max-w-full overflow-x-hidden">
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

      {/* Annotation Search - moved to bottom */}
      {annotations.length > 0 && (
        <Card className="p-4 max-w-full overflow-x-hidden">
          <AnnotationSearch
            annotations={annotations}
            onJumpToTimestamp={jumpToAnnotation}
            formatTime={formatTime}
          />
        </Card>
      )}

      {/* Timeline Toggle - moved to bottom */}
      <Card className="p-4 max-w-full overflow-x-hidden">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => setShowTimeline(!showTimeline)}
          className="w-full"
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          {showTimeline ? 'Hide' : 'Show'} Timeline
        </Button>
      </Card>

      {/* Video Chapters Section */}
      <VideoChapters
        fileId={fileId}
        currentTime={currentTime}
        onSeek={(time) => {
          if (videoRef.current) {
            videoRef.current.currentTime = time;
          }
        }}
      />

      {/* Video Loop Region */}
      <div id="loop-region-section">
      <VideoLoopRegion
        videoRef={videoRef}
        duration={duration}
        currentTime={currentTime}
        onSeek={(time) => {
          if (videoRef.current) {
            videoRef.current.currentTime = time;
          }
        }}
      />
      </div>

      {/* Auto-Highlight Detection */}
      <div id="auto-highlight-section">
      <AutoHighlightDetection
        videoRef={videoRef}
        duration={duration}
        currentTime={currentTime}
        onSeek={(time) => {
          if (videoRef.current) {
            videoRef.current.currentTime = time;
          }
        }}
      />
      </div>

      {/* Bookmark/Chapter Export */}
      <div id="export-section">
      <BookmarkChapterExport
        fileId={fileId}
        videoTitle={`Video_${fileId}`}
      />
      </div>

      {/* File Suggestions Section */}
      <FileSuggestions
        fileId={fileId}
        onJumpToTimestamp={(timestamp) => {
          if (videoRef.current) {
            videoRef.current.currentTime = timestamp;
            setCurrentTime(timestamp);
            if (!isPlaying) {
              videoRef.current.play();
            }
          }
        }}
      />
    </div>
  );
}
