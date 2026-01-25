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
import { CommentThread } from "./CommentThread";
import { ApprovalWorkflow } from "./ApprovalWorkflow";
import { AnnotationHistoryViewer } from "./AnnotationHistoryViewer";
import { useWebSocket } from "@/hooks/useWebSocket";
import { UserPresenceIndicator } from "./UserPresenceIndicator";

import { BatchActionsToolbar } from "./BatchActionsToolbar";
import { VoiceAnnotationExport } from "./VoiceAnnotationExport";
import { HighlightedText } from "./HighlightedText";

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
  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    const saved = localStorage.getItem('videoPlaybackSpeed');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [showRecorder, setShowRecorder] = useState(false);
  const [recordingTimestamp, setRecordingTimestamp] = useState(0);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [visibleAnnotationIds, setVisibleAnnotationIds] = useState<number[]>([]);
  const [drawToggleRequest, setDrawToggleRequest] = useState<boolean>();
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

  const { data: annotations = [], refetch: refetchAnnotations } = trpc.voiceAnnotations.getAnnotations.useQuery({ fileId });
  
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
        
        const newAnnotation = await saveAnnotation.mutateAsync({
          fileId,
          audioDataUrl,
          duration,
          videoTimestamp: Math.floor(recordingTimestamp),
        });

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
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const decisecs = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${decisecs}`;
  };

  const handleSaveVisualAnnotation = async (imageDataUrl: string, timestamp: number, duration: number) => {
    try {
      const newAnnotation = await saveVisualAnnotation.mutateAsync({
        fileId,
        imageDataUrl,
        videoTimestamp: Math.floor(timestamp),
        duration,
      });
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
    <div className="space-y-4">
      {/* User Presence Indicator */}
      {activeUsers.length > 0 && (
        <Card className="p-3">
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
          <div className="flex items-center gap-2 flex-wrap video-controls">
            <Button size="default" className="h-11 px-4 md:h-9 md:px-3" variant="outline" onClick={togglePlay}>
              {isPlaying ? <Pause className="h-5 w-5 md:h-4 md:w-4" /> : <Play className="h-5 w-5 md:h-4 md:w-4" />}
            </Button>
            <Button size="default" className="h-11 px-4 md:h-9 md:px-3" variant="outline" onClick={toggleMute}>
              {isMuted ? <VolumeX className="h-5 w-5 md:h-4 md:w-4" /> : <Volume2 className="h-5 w-5 md:h-4 md:w-4" />}
            </Button>
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
                className="h-9 px-3 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setDrawToggleRequest(!drawToggleRequest)}
              >
                <PenLine className="h-4 w-4 mr-2" />
                Draw / Text
              </Button>
            </div>
          </div>
          
          {/* Mobile Floating Action Buttons for Annotation Tools */}
          <div className="md:hidden fixed bottom-20 right-4 z-50 flex flex-col gap-3">
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
              className="h-14 w-14 rounded-full shadow-lg bg-green-600 hover:bg-green-700 text-white p-0"
              onClick={() => setDrawToggleRequest(!drawToggleRequest)}
            >
              <PenLine className="h-6 w-6" />
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


        </div>
      </Card>

      {/* Voice Recorder - appears immediately below Show Timeline */}
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

      {/* Drawing Canvas Controls */}
      <VideoDrawingCanvas
        videoRef={videoRef}
        currentTime={currentTime}
        onSaveAnnotation={handleSaveVisualAnnotation}
        onDrawingModeChange={setIsDrawingMode}
        onToggleRequest={drawToggleRequest}
        fileId={fileId}
      />

      {/* Drawing Annotations List */}
      {visualAnnotations.length > 0 && (
        <Card className="p-4">
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
                <input
                  type="checkbox"
                  checked={visualAnnotations.length > 0 && selectedVisualIds.length === visualAnnotations.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedVisualIds(visualAnnotations.map(a => a.id).filter((id): id is number => id !== undefined));
                    } else {
                      setSelectedVisualIds([]);
                    }
                  }}
                  className="w-4 h-4"
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
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelected([...selectedIds, annotation.id]);
                      } else {
                        setSelected(selectedIds.filter(id => id !== annotation.id));
                      }
                    }}
                    className="h-4 w-4 cursor-pointer"
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
                
                {/* Approval Workflow */}
                <ApprovalWorkflow
                  annotationId={annotation.id}
                  annotationType="visual"
                />
                
                {/* History Viewer */}
                <AnnotationHistoryViewer
                  annotationId={annotation.id}
                  annotationType="visual"
                />
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
        <Card className="p-4">
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
                  <input
                    type="checkbox"
                    checked={annotations.length > 0 && selectedVoiceIds.length === annotations.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedVoiceIds(annotations.map(a => a.id).filter((id): id is number => id !== undefined));
                      } else {
                        setSelectedVoiceIds([]);
                      }
                    }}
                    className="w-4 h-4"
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
            
            {/* Search and Filter Bar */}
            <div className="mb-4 space-y-3">
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
          </div>
          
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
                className={`p-3 rounded-lg transition-colors space-y-2 ${
                  isSelected ? 'bg-primary/10 border-2 border-primary' : 'bg-muted/50 hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelected([...selectedIds, annotation.id]);
                      } else {
                        setSelected(selectedIds.filter(id => id !== annotation.id));
                      }
                    }}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <div className="flex items-center justify-between flex-1">
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
                  <div className="pl-2 border-l-2 border-primary/30 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-foreground flex-1">
                        <HighlightedText text={annotation.transcript} searchQuery={searchQuery} />
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSpeak(annotation.id, annotation.transcript!)}
                        className="shrink-0"
                      >
                        {speakingAnnotationId === annotation.id ? (
                          <VolumeX className="h-4 w-4" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
                
                {/* Comment Thread */}
                <CommentThread
                  annotationId={annotation.id}
                  annotationType="voice"
                />
                
                {/* Approval Workflow */}
                <ApprovalWorkflow
                  annotationId={annotation.id}
                  annotationType="voice"
                />
                
                {/* History Viewer */}
                <AnnotationHistoryViewer
                  annotationId={annotation.id}
                  annotationType="voice"
                />
                </div>
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
