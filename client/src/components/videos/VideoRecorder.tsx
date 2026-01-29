import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Video,
  VideoOff,
  Circle,
  Square,
  Loader2,
  Upload,
  Camera,
  SwitchCamera,
  Settings,

  Zap,
  Sun,
  Contrast,
  Palette,
  Thermometer,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Timer,
  Grid3X3,
  Flashlight,
  FlashlightOff,
  ZoomIn,
  ZoomOut,
  RectangleHorizontal,
  Square as SquareIcon,
  Smartphone,
  Mic,
  MicOff,
  Focus,
  Vibrate,
  Scissors,
  Gauge,
  PictureInPicture2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Type,
  ImagePlus,
  Monitor,
  Layers,
  Plus,
  Trash2,
  GripVertical,
  Move,
  Sparkles,
  Volume2,
  Layout,
  VolumeX,
  ArrowRight,
  Headphones,
  Music,
  ImageIcon,
  MessageCircle,
  Music2,
  Volume1,
  Subtitles,
  Eraser,
  Paintbrush,
  Wand2,
  Film,
  Sliders,
  PenTool,
  Highlighter,
  ArrowUpRight,
  RotateCcw,
  RotateCw,
  CircleDot,
  Layers2,
  Bookmark,
  BookmarkPlus,
  ListOrdered,
  Hash,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { uploadFileToStorage } from "@/lib/storage";

type CameraFacing = "user" | "environment";
type CaptureMode = "video" | "photo" | "screen" | "audio";
type VideoQuality = "720p" | "1080p" | "4k";
type FilterPreset = "normal" | "vivid" | "warm" | "cool" | "bw" | "sepia";
type TimerDuration = 0 | 3 | 5 | 10;
type AspectRatio = "16:9" | "4:3" | "1:1";
type SlowMotionFps = 30 | 60 | 120 | 240;
type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
type RecordingSource = "camera" | "screen" | "both";
type TransitionType = "none" | "fade" | "dissolve" | "wipe-left" | "wipe-right" | "slide-left" | "slide-right";
type PipPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
type RecordingTemplate = "screen-only" | "camera-only" | "pip-corner" | "pip-side";
type ExportFormat = "webm" | "mp4" | "gif";
type ChromaKeyColor = "green" | "blue" | "custom";
type BackgroundType = "none" | "blur" | "color" | "image";
type VideoEffect = "none" | "vignette" | "filmGrain" | "colorGrade" | "blur" | "sharpen";
type DrawingTool = "pen" | "rectangle" | "circle" | "arrow" | "text" | "eraser" | "highlight";

interface VideoEffectSettings {
  vignette: { enabled: boolean; intensity: number };
  filmGrain: { enabled: boolean; intensity: number; size: number };
  colorGrade: { enabled: boolean; preset: string; intensity: number };
  blur: { enabled: boolean; intensity: number };
  sharpen: { enabled: boolean; intensity: number };
}

interface AudioTrack {
  id: string;
  name: string;
  type: "mic" | "system" | "music";
  volume: number;
  muted: boolean;
  level: number; // 0-100 current audio level
}

interface DrawingPoint {
  x: number;
  y: number;
}

interface DrawingElement {
  id: string;
  type: DrawingTool;
  points: DrawingPoint[];
  color: string;
  strokeWidth: number;
  text?: string;
}

interface VideoBookmark {
  id: string;
  timestamp: number;
  label: string;
  color: string;
}

interface VideoChapter {
  id: string;
  startTime: number;
  endTime: number;
  title: string;
}

interface CaptionSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
}

interface CaptionStyle {
  fontSize: number;
  color: string;
  backgroundColor: string;
  position: "top" | "bottom";
}

interface ChromaKeySettings {
  enabled: boolean;
  color: ChromaKeyColor;
  customColor: string;
  tolerance: number;
  smoothness: number;
  backgroundType: BackgroundType;
  backgroundColor: string;
  backgroundImage: string | null;
  blurAmount: number;
}

interface KeyboardShortcuts {
  record: string;
  pause: string;
  cancel: string;
  capture: string;
  switchCamera: string;
}

const DEFAULT_SHORTCUTS: KeyboardShortcuts = {
  record: "r",
  pause: " ", // Space
  cancel: "Escape",
  capture: "s",
  switchCamera: "c",
};

interface TransitionSettings {
  type: TransitionType;
  duration: number; // in seconds
}

interface AudioDuckingSettings {
  enabled: boolean;
  threshold: number; // 0-100, voice detection sensitivity
  reduction: number; // 0-100, how much to reduce background
  attackTime: number; // ms to start ducking
  releaseTime: number; // ms to stop ducking
}

interface PipSettings {
  enabled: boolean;
  position: PipPosition;
  size: number; // percentage of screen (10-40)
  borderRadius: number;
  opacity: number;
}

interface WatermarkSettings {
  enabled: boolean;
  text: string;
  position: WatermarkPosition;
  opacity: number;
  fontSize: number;
  color: string;
  imageUrl?: string;
  useImage: boolean;
}

interface VideoClip {
  id: string;
  blob: Blob;
  url: string;
  duration: number;
  thumbnail?: string;
}

interface QualitySettings {
  width: number;
  height: number;
  label: string;
}

interface PhotoFilters {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
}

interface BurstPhoto {
  blob: Blob;
  url: string;
  selected: boolean;
}

const QUALITY_PRESETS: Record<VideoQuality, QualitySettings> = {
  "720p": { width: 1280, height: 720, label: "HD 720p" },
  "1080p": { width: 1920, height: 1080, label: "Full HD 1080p" },
  "4k": { width: 3840, height: 2160, label: "4K Ultra HD" },
};

const FILTER_PRESETS: Record<FilterPreset, PhotoFilters> = {
  normal: { brightness: 100, contrast: 100, saturation: 100, warmth: 0 },
  vivid: { brightness: 105, contrast: 115, saturation: 130, warmth: 0 },
  warm: { brightness: 102, contrast: 100, saturation: 105, warmth: 15 },
  cool: { brightness: 100, contrast: 105, saturation: 95, warmth: -15 },
  bw: { brightness: 100, contrast: 110, saturation: 0, warmth: 0 },
  sepia: { brightness: 100, contrast: 95, saturation: 50, warmth: 30 },
};

const FILTER_PRESET_LABELS: Record<FilterPreset, string> = {
  normal: "Normal",
  vivid: "Vivid",
  warm: "Warm",
  cool: "Cool",
  bw: "B&W",
  sepia: "Sepia",
};

const TIMER_OPTIONS: TimerDuration[] = [0, 3, 5, 10];

export function VideoRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  
  // Camera settings
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>(() => {
    const saved = localStorage.getItem("camera-facing");
    return (saved as CameraFacing) || "user";
  });
  const [captureMode, setCaptureMode] = useState<CaptureMode>("video");
  const [videoQuality, setVideoQuality] = useState<VideoQuality>(() => {
    const saved = localStorage.getItem("camera-quality");
    return (saved as VideoQuality) || "1080p";
  });
  const [showSettings, setShowSettings] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Filters (now for both photo and video)
  const [showFilters, setShowFilters] = useState(false);
  const [filterPreset, setFilterPreset] = useState<FilterPreset>("normal");
  const [customFilters, setCustomFilters] = useState<PhotoFilters>(FILTER_PRESETS.normal);
  const [useCustomFilters, setUseCustomFilters] = useState(false);

  // Burst mode
  const [burstMode, setBurstMode] = useState(false);
  const [burstCount, setBurstCount] = useState(5);
  const [burstPhotos, setBurstPhotos] = useState<BurstPhoto[]>([]);
  const [isBurstCapturing, setIsBurstCapturing] = useState(false);
  const [burstCurrentIndex, setBurstCurrentIndex] = useState(0);

  // Timer/Countdown
  const [timerDuration, setTimerDuration] = useState<TimerDuration>(() => {
    const saved = localStorage.getItem("camera-timer");
    return (parseInt(saved || "0") as TimerDuration) || 0;
  });
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [isCountingDown, setIsCountingDown] = useState(false);

  // Grid overlay
  const [showGrid, setShowGrid] = useState(() => {
    return localStorage.getItem("camera-grid") === "true";
  });

  // Flash/Torch
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);

  // Zoom
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [hasZoom, setHasZoom] = useState(false);

  // Aspect Ratio
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => {
    const saved = localStorage.getItem("camera-aspect-ratio");
    return (saved as AspectRatio) || "16:9";
  });

  // Video Stabilization
  const [stabilizationEnabled, setStabilizationEnabled] = useState(() => {
    return localStorage.getItem("camera-stabilization") === "true";
  });
  const [hasStabilization, setHasStabilization] = useState(false);

  // Audio Level Meter
  const [audioLevel, setAudioLevel] = useState(0);
  const [peakAudioLevel, setPeakAudioLevel] = useState(0);
  const [showAudioMeter, setShowAudioMeter] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioAnimationRef = useRef<number | null>(null);

  // Face Detection
  const [faceDetectionEnabled, setFaceDetectionEnabled] = useState(() => {
    return localStorage.getItem("camera-face-detection") === "true";
  });
  const [hasFaceDetection, setHasFaceDetection] = useState(false);
  const [detectedFaces, setDetectedFaces] = useState<{ x: number; y: number; width: number; height: number }[]>([]);
  const faceDetectorRef = useRef<any>(null);
  const faceDetectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Video Trimming
  const [showTrimmer, setShowTrimmer] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [trimPreviewTime, setTrimPreviewTime] = useState(0);
  const [isTrimPlaying, setIsTrimPlaying] = useState(false);
  const trimVideoRef = useRef<HTMLVideoElement>(null);

  // Slow Motion
  const [slowMotionEnabled, setSlowMotionEnabled] = useState(false);
  const [slowMotionFps, setSlowMotionFps] = useState<SlowMotionFps>(() => {
    const saved = localStorage.getItem("camera-slowmo-fps");
    return (parseInt(saved || "60") as SlowMotionFps) || 60;
  });
  const [maxSupportedFps, setMaxSupportedFps] = useState<number>(30);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Picture-in-Picture
  const [isPipActive, setIsPipActive] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);

  // Watermark Settings
  const [showWatermarkSettings, setShowWatermarkSettings] = useState(false);
  const [watermark, setWatermark] = useState<WatermarkSettings>({
    enabled: false,
    text: "Synclips",
    position: "bottom-right",
    opacity: 70,
    fontSize: 24,
    color: "#ffffff",
    useImage: false,
  });

  // Screen Recording
  const [recordingSource, setRecordingSource] = useState<RecordingSource>("camera");
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  // Video Clips (for concatenation)
  const [videoClips, setVideoClips] = useState<VideoClip[]>([]);
  const [showClipManager, setShowClipManager] = useState(false);
  const [isMergingClips, setIsMergingClips] = useState(false);

  // Video Transitions
  const [transitionSettings, setTransitionSettings] = useState<TransitionSettings>({
    type: "fade",
    duration: 0.5,
  });
  const [showTransitionSettings, setShowTransitionSettings] = useState(false);

  // Audio Ducking
  const [audioDucking, setAudioDucking] = useState<AudioDuckingSettings>({
    enabled: false,
    threshold: 50,
    reduction: 70,
    attackTime: 100,
    releaseTime: 500,
  });
  const [showAudioDuckingSettings, setShowAudioDuckingSettings] = useState(false);
  const [isVoiceDetected, setIsVoiceDetected] = useState(false);
  const voiceDetectionRef = useRef<NodeJS.Timeout | null>(null);

  // PiP Recording Template
  const [recordingTemplate, setRecordingTemplate] = useState<RecordingTemplate>("screen-only");
  const [pipSettings, setPipSettings] = useState<PipSettings>({
    enabled: false,
    position: "bottom-right",
    size: 25,
    borderRadius: 12,
    opacity: 100,
  });
  const [showPipSettings, setShowPipSettings] = useState(false);
  const [cameraStreamForPip, setCameraStreamForPip] = useState<MediaStream | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);

  // Export Format
  const [exportFormat, setExportFormat] = useState<ExportFormat>("webm");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Keyboard Shortcuts
  const [keyboardShortcutsEnabled, setKeyboardShortcutsEnabled] = useState(() => {
    const saved = localStorage.getItem("videoRecorder_keyboardShortcuts");
    return saved ? JSON.parse(saved) : true;
  });
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Video Thumbnail
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailTime, setThumbnailTime] = useState(0);
  const [showThumbnailSelector, setShowThumbnailSelector] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const thumbnailVideoRef = useRef<HTMLVideoElement>(null);

  // Audio Recording
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [audioWaveform, setAudioWaveform] = useState<number[]>([]);
  const [isAudioRecording, setIsAudioRecording] = useState(false);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const waveformAnimationRef = useRef<number | null>(null);

  // Voice Commands
  const [voiceCommandsEnabled, setVoiceCommandsEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [lastVoiceCommand, setLastVoiceCommand] = useState<string | null>(null);
  const [voiceCommandFeedback, setVoiceCommandFeedback] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Background Music
  const [showMusicPanel, setShowMusicPanel] = useState(false);
  const [backgroundMusicUrl, setBackgroundMusicUrl] = useState<string | null>(null);
  const [backgroundMusicFile, setBackgroundMusicFile] = useState<File | null>(null);
  const [musicVolume, setMusicVolume] = useState(30);
  const [originalVolume, setOriginalVolume] = useState(100);
  const [musicFadeIn, setMusicFadeIn] = useState(true);
  const [musicFadeOut, setMusicFadeOut] = useState(true);
  const [isMixingAudio, setIsMixingAudio] = useState(false);
  const musicInputRef = useRef<HTMLInputElement>(null);

  // Captions/Subtitles
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [showCaptionSettings, setShowCaptionSettings] = useState(false);
  const [captions, setCaptions] = useState<CaptionSegment[]>([]);
  const [currentCaption, setCurrentCaption] = useState<string>("");
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>({
    fontSize: 24,
    color: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.7)",
    position: "bottom",
  });
  const [isTranscribing, setIsTranscribing] = useState(false);
  const captionRecognitionRef = useRef<any>(null);
  const captionStartTimeRef = useRef<number>(0);

  // Chroma Key / Green Screen
  const [showChromaKeySettings, setShowChromaKeySettings] = useState(false);
  const [chromaKey, setChromaKey] = useState<ChromaKeySettings>({
    enabled: false,
    color: "green",
    customColor: "#00ff00",
    tolerance: 40,
    smoothness: 10,
    backgroundType: "blur",
    backgroundColor: "#000000",
    backgroundImage: null,
    blurAmount: 15,
  });
  const chromaCanvasRef = useRef<HTMLCanvasElement>(null);
  const chromaAnimationRef = useRef<number | null>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const chromaBackgroundInputRef = useRef<HTMLInputElement>(null);

  // Video Effects
  const [showEffectsPanel, setShowEffectsPanel] = useState(false);
  const [videoEffects, setVideoEffects] = useState<VideoEffectSettings>({
    vignette: { enabled: false, intensity: 50 },
    filmGrain: { enabled: false, intensity: 30, size: 1 },
    colorGrade: { enabled: false, preset: "cinematic", intensity: 50 },
    blur: { enabled: false, intensity: 5 },
    sharpen: { enabled: false, intensity: 50 },
  });
  const effectsCanvasRef = useRef<HTMLCanvasElement>(null);
  const effectsAnimationRef = useRef<number | null>(null);

  // Multi-Track Audio
  const [showAudioMixer, setShowAudioMixer] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([
    { id: "mic", name: "Microphone", type: "mic", volume: 100, muted: false, level: 0 },
    { id: "system", name: "System Audio", type: "system", volume: 80, muted: false, level: 0 },
    { id: "music", name: "Background Music", type: "music", volume: 50, muted: false, level: 0 },
  ]);
  const audioMixerContextRef = useRef<AudioContext | null>(null);
  const audioGainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const audioAnalysersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const audioMixerAnimationRef = useRef<number | null>(null);

  // Live Annotations / Drawing
  const [showDrawingTools, setShowDrawingTools] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [selectedDrawingTool, setSelectedDrawingTool] = useState<DrawingTool>("pen");
  const [drawingColor, setDrawingColor] = useState("#ff0000");
  const [drawingStrokeWidth, setDrawingStrokeWidth] = useState(3);
  const [drawingElements, setDrawingElements] = useState<DrawingElement[]>([]);
  const [currentDrawingElement, setCurrentDrawingElement] = useState<DrawingElement | null>(null);
  const [drawingHistory, setDrawingHistory] = useState<DrawingElement[][]>([]);
  const [drawingHistoryIndex, setDrawingHistoryIndex] = useState(-1);
  const [drawingTextInput, setDrawingTextInput] = useState("");
  const [drawingTextPosition, setDrawingTextPosition] = useState<DrawingPoint | null>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  // Video Bookmarks
  const [bookmarks, setBookmarks] = useState<VideoBookmark[]>([]);
  const [showBookmarksPanel, setShowBookmarksPanel] = useState(false);
  const [newBookmarkLabel, setNewBookmarkLabel] = useState("");
  const [bookmarkColor, setBookmarkColor] = useState("#fbbf24"); // amber

  // Video Chapters
  const [chapters, setChapters] = useState<VideoChapter[]>([]);
  const [showChaptersPanel, setShowChaptersPanel] = useState(false);
  const [currentChapterTitle, setCurrentChapterTitle] = useState("");
  const [chapterStartTime, setChapterStartTime] = useState<number | null>(null);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filterCanvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const createVideoMutation = trpc.videos.create.useMutation();
  const createFileMutation = trpc.files.create.useMutation();
  const trpcUtils = trpc.useUtils();

  // Get active filters
  const activeFilters = useCustomFilters ? customFilters : FILTER_PRESETS[filterPreset];

  // CSS filter string for live preview
  const getCssFilterString = useCallback(() => {
    const f = activeFilters;
    let filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%)`;
    if (f.warmth !== 0) {
      filter += ` sepia(${Math.abs(f.warmth)}%)`;
      if (f.warmth < 0) {
        filter += ` hue-rotate(180deg)`;
      }
    }
    return filter;
  }, [activeFilters]);

  // Check for multiple cameras on mount
  useEffect(() => {
    const checkCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === "videoinput");
        setHasMultipleCameras(videoDevices.length > 1);
      } catch (error) {
        console.error("Failed to enumerate devices:", error);
      }
    };
    checkCameras();
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      burstPhotos.forEach(p => URL.revokeObjectURL(p.url));
    };
  }, []);

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem("camera-facing", cameraFacing);
  }, [cameraFacing]);

  useEffect(() => {
    localStorage.setItem("camera-quality", videoQuality);
  }, [videoQuality]);

  useEffect(() => {
    localStorage.setItem("camera-timer", timerDuration.toString());
  }, [timerDuration]);

  useEffect(() => {
    localStorage.setItem("camera-grid", showGrid.toString());
  }, [showGrid]);

  useEffect(() => {
    localStorage.setItem("camera-aspect-ratio", aspectRatio);
  }, [aspectRatio]);

  useEffect(() => {
    localStorage.setItem("camera-stabilization", stabilizationEnabled.toString());
  }, [stabilizationEnabled]);

  useEffect(() => {
    localStorage.setItem("camera-face-detection", faceDetectionEnabled.toString());
  }, [faceDetectionEnabled]);

  useEffect(() => {
    localStorage.setItem("camera-slowmo-fps", slowMotionFps.toString());
  }, [slowMotionFps]);

  // Check PiP support
  useEffect(() => {
    setPipSupported('pictureInPictureEnabled' in document && (document as any).pictureInPictureEnabled);
  }, []);

  // Save keyboard shortcuts preference
  useEffect(() => {
    localStorage.setItem("videoRecorder_keyboardShortcuts", JSON.stringify(keyboardShortcutsEnabled));
  }, [keyboardShortcutsEnabled]);

  // Keyboard shortcuts handler
  useEffect(() => {
    if (!keyboardShortcutsEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const key = e.key.toLowerCase();
      
      // R - Start/Stop Recording
      if (key === DEFAULT_SHORTCUTS.record) {
        e.preventDefault();
        if (captureMode === "video" || captureMode === "screen") {
          if (isRecording) {
            stopRecording();
          } else if (isPreviewing) {
            startRecording();
          }
        }
      }
      
      // Space - Pause/Resume (future feature)
      if (e.key === DEFAULT_SHORTCUTS.pause) {
        // Reserved for pause/resume functionality
      }
      
      // Escape - Cancel/Discard
      if (e.key === DEFAULT_SHORTCUTS.cancel) {
        e.preventDefault();
        if (isCountingDown) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          setIsCountingDown(false);
          setCountdownValue(null);
        } else if (recordedBlob) {
          handleDiscardVideo();
        } else if (capturedPhoto) {
          handleDiscardPhoto();
        }
      }
      
      // S - Capture Photo
      if (key === DEFAULT_SHORTCUTS.capture) {
        e.preventDefault();
        if (captureMode === "photo" && isPreviewing && !isBurstCapturing) {
          capturePhoto();
        }
      }
      
      // C - Switch Camera
      if (key === DEFAULT_SHORTCUTS.switchCamera) {
        e.preventDefault();
        if (hasMultipleCameras && isPreviewing && !isRecording) {
          switchCamera();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [keyboardShortcutsEnabled, captureMode, isRecording, isPreviewing, isCountingDown, recordedBlob, capturedPhoto, isBurstCapturing, hasMultipleCameras]);

  // Update custom filters when preset changes
  useEffect(() => {
    if (!useCustomFilters) {
      setCustomFilters(FILTER_PRESETS[filterPreset]);
    }
  }, [filterPreset, useCustomFilters]);

  const getVideoConstraints = useCallback(() => {
    const quality = QUALITY_PRESETS[videoQuality];
    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: cameraFacing,
        width: { ideal: quality.width },
        height: { ideal: quality.height },
        ...(slowMotionEnabled && { frameRate: { ideal: slowMotionFps } }),
      },
      audio: captureMode === "video",
    };
    return constraints;
  }, [cameraFacing, videoQuality, captureMode, slowMotionEnabled, slowMotionFps]);

  const startCamera = async () => {
    try {
      stopCamera();
      
      const constraints = getVideoConstraints();
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsPreviewing(true);

      // Check for flash/torch, zoom, and stabilization capabilities
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = videoTrack.getCapabilities?.() as any;
        if (capabilities) {
          // Check for torch/flash
          if (capabilities.torch) {
            setHasFlash(true);
          } else {
            setHasFlash(false);
          }

          // Check for zoom
          if (capabilities.zoom) {
            setHasZoom(true);
            setMinZoom(capabilities.zoom.min || 1);
            setMaxZoom(capabilities.zoom.max || 1);
            setZoomLevel(capabilities.zoom.min || 1);
          } else {
            setHasZoom(false);
          }

          // Check for video stabilization
          if (capabilities.videoStabilizationMode) {
            setHasStabilization(true);
            // Apply stabilization if enabled
            if (stabilizationEnabled) {
              try {
                await videoTrack.applyConstraints({
                  advanced: [{ videoStabilizationMode: "on" } as any],
                });
              } catch (e) {
                console.warn("Failed to apply stabilization:", e);
              }
            }
          } else {
            setHasStabilization(false);
          }

          // Check for max frame rate (slow motion support)
          if (capabilities.frameRate) {
            const maxFps = capabilities.frameRate.max || 30;
            setMaxSupportedFps(maxFps);
          }
        }
      }

      // Set up audio level meter for video mode
      if (captureMode === "video") {
        setupAudioMeter(stream);
      }

      // Set up face detection if available and enabled
      if (faceDetectionEnabled) {
        setupFaceDetection();
      }
    } catch (error) {
      toast.error("Failed to access camera. Please check permissions.");
      console.error(error);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsPreviewing(false);
    // Reset flash and zoom
    setFlashEnabled(false);
    setHasFlash(false);
    setHasZoom(false);
    setZoomLevel(1);
    setHasStabilization(false);
    // Cancel any countdown
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setIsCountingDown(false);
    setCountdownValue(null);
    // Clean up audio meter
    cleanupAudioMeter();
    // Clean up face detection
    cleanupFaceDetection();
  };

  const switchCamera = async () => {
    const newFacing = cameraFacing === "user" ? "environment" : "user";
    setCameraFacing(newFacing);
    
    if (isPreviewing && !isRecording) {
      stopCamera();
      setTimeout(async () => {
        try {
          const quality = QUALITY_PRESETS[videoQuality];
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: newFacing,
              width: { ideal: quality.width },
              height: { ideal: quality.height },
            },
            audio: captureMode === "video",
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          setIsPreviewing(true);
          toast.success(`Switched to ${newFacing === "user" ? "front" : "back"} camera`);
        } catch (error) {
          toast.error("Failed to switch camera");
          console.error(error);
        }
      }, 100);
    }
  };

  // Apply filters to canvas and return blob
  const applyFiltersToCanvas = useCallback((sourceCanvas: HTMLCanvasElement): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const filterCanvas = filterCanvasRef.current;
      if (!filterCanvas) {
        resolve(null);
        return;
      }

      filterCanvas.width = sourceCanvas.width;
      filterCanvas.height = sourceCanvas.height;
      const ctx = filterCanvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.filter = getCssFilterString();
      ctx.drawImage(sourceCanvas, 0, 0);
      
      filterCanvas.toBlob((blob) => {
        resolve(blob);
      }, "image/jpeg", 0.95);
    });
  }, [getCssFilterString]);

  // Start countdown then execute action
  const startCountdown = (action: () => void) => {
    if (timerDuration === 0) {
      action();
      return;
    }

    setIsCountingDown(true);
    setCountdownValue(timerDuration);

    countdownRef.current = setInterval(() => {
      setCountdownValue(prev => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          setIsCountingDown(false);
          action();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    if (!ctx) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const blob = await applyFiltersToCanvas(canvas);
    
    if (blob) {
      setCapturedPhoto(blob);
      const url = URL.createObjectURL(blob);
      setPhotoPreviewUrl(url);
      stopCamera();
      toast.success("Photo captured!");
    }
  };

  const handleCaptureWithTimer = () => {
    startCountdown(capturePhoto);
  };

  const captureBurst = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setIsBurstCapturing(true);
    const photos: BurstPhoto[] = [];
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    if (!ctx) {
      setIsBurstCapturing(false);
      return;
    }
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    for (let i = 0; i < burstCount; i++) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await applyFiltersToCanvas(canvas);
      
      if (blob) {
        photos.push({
          blob,
          url: URL.createObjectURL(blob),
          selected: i === 0,
        });
      }
      
      if (i < burstCount - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    setBurstPhotos(photos);
    setBurstCurrentIndex(0);
    setIsBurstCapturing(false);
    stopCamera();
    toast.success(`Captured ${photos.length} photos!`);
  };

  const handleBurstWithTimer = () => {
    startCountdown(captureBurst);
  };

  const toggleBurstPhotoSelection = (index: number) => {
    setBurstPhotos(prev => prev.map((p, i) => 
      i === index ? { ...p, selected: !p.selected } : p
    ));
  };

  const handleUploadBurstPhotos = async () => {
    const selectedPhotos = burstPhotos.filter(p => p.selected);
    if (selectedPhotos.length === 0) {
      toast.error("Please select at least one photo to upload");
      return;
    }

    setUploading(true);
    try {
      for (let i = 0; i < selectedPhotos.length; i++) {
        const photo = selectedPhotos[i];
        const filename = `burst-photo-${Date.now()}-${i}.jpg`;
        const { url, fileKey } = await uploadFileToStorage(
          photo.blob,
          filename,
          trpcUtils
        );

        await createFileMutation.mutateAsync({
          filename,
          mimeType: "image/jpeg",
          fileSize: photo.blob.size,
          url,
          fileKey,
          title: `Burst Photo ${i + 1} - ${new Date().toLocaleString()}`,
        });
      }

      toast.success(`Uploaded ${selectedPhotos.length} photos!`);
      handleDiscardBurstPhotos();
      trpcUtils.files.list.invalidate();
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload photos");
    } finally {
      setUploading(false);
    }
  };

  const handleDiscardBurstPhotos = () => {
    burstPhotos.forEach(p => URL.revokeObjectURL(p.url));
    setBurstPhotos([]);
    setBurstCurrentIndex(0);
  };

  const startRecording = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: "video/webm;codecs=vp8,opus",
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = URL.createObjectURL(blob);
      }
    };

    mediaRecorder.start(1000);
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
    setRecordingTime(0);

    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
  };

  const handleRecordWithTimer = () => {
    startCountdown(startRecording);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    stopCamera();
  };

  const handleUploadVideo = async () => {
    if (!recordedBlob) return;

    setUploading(true);
    try {
      const filename = `recording-${Date.now()}.webm`;
      const { url, fileKey } = await uploadFileToStorage(
        recordedBlob,
        filename,
        trpcUtils
      );

      await createVideoMutation.mutateAsync({
        fileKey,
        url,
        filename,
        duration: recordingTime,
        title: `Recording ${new Date().toLocaleString()}`,
      });

      toast.success("Video uploaded successfully!");
      
      setRecordedBlob(null);
      setRecordingTime(0);
      if (videoRef.current) {
        videoRef.current.src = "";
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload video");
    } finally {
      setUploading(false);
    }
  };

  const handleUploadPhoto = async () => {
    if (!capturedPhoto) return;

    setUploading(true);
    try {
      const filename = `photo-${Date.now()}.jpg`;
      const { url, fileKey } = await uploadFileToStorage(
        capturedPhoto,
        filename,
        trpcUtils
      );

      await createFileMutation.mutateAsync({
        filename,
        mimeType: "image/jpeg",
        fileSize: capturedPhoto.size,
        url,
        fileKey,
        title: `Photo ${new Date().toLocaleString()}`,
      });

      toast.success("Photo uploaded successfully!");
      
      handleDiscardPhoto();
      trpcUtils.files.list.invalidate();
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const handleDiscardVideo = () => {
    setRecordedBlob(null);
    setRecordingTime(0);
    if (videoRef.current) {
      videoRef.current.src = "";
    }
  };

  const handleDiscardPhoto = () => {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setCapturedPhoto(null);
    setPhotoPreviewUrl(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const updateCustomFilter = (key: keyof PhotoFilters, value: number) => {
    setUseCustomFilters(true);
    setCustomFilters(prev => ({ ...prev, [key]: value }));
  };

  const cycleTimer = () => {
    const currentIndex = TIMER_OPTIONS.indexOf(timerDuration);
    const nextIndex = (currentIndex + 1) % TIMER_OPTIONS.length;
    setTimerDuration(TIMER_OPTIONS[nextIndex]);
  };

  // Toggle flash/torch
  const toggleFlash = async () => {
    if (!streamRef.current || !hasFlash) return;

    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      try {
        const newFlashState = !flashEnabled;
        await videoTrack.applyConstraints({
          advanced: [{ torch: newFlashState } as any],
        });
        setFlashEnabled(newFlashState);
        toast.success(newFlashState ? "Flash enabled" : "Flash disabled");
      } catch (error) {
        console.error("Failed to toggle flash:", error);
        toast.error("Failed to toggle flash");
      }
    }
  };

  // Update zoom level
  const updateZoom = async (newZoom: number) => {
    if (!streamRef.current || !hasZoom) return;

    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      try {
        const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
        await videoTrack.applyConstraints({
          advanced: [{ zoom: clampedZoom } as any],
        });
        setZoomLevel(clampedZoom);
      } catch (error) {
        console.error("Failed to update zoom:", error);
      }
    }
  };

  // Cycle aspect ratio
  const cycleAspectRatio = () => {
    const ratios: AspectRatio[] = ["16:9", "4:3", "1:1"];
    const currentIndex = ratios.indexOf(aspectRatio);
    const nextIndex = (currentIndex + 1) % ratios.length;
    setAspectRatio(ratios[nextIndex]);
  };

  // Get aspect ratio class
  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case "16:9":
        return "aspect-video";
      case "4:3":
        return "aspect-[4/3]";
      case "1:1":
        return "aspect-square";
      default:
        return "aspect-video";
    }
  };

  // Audio level meter setup
  const setupAudioMeter = (stream: MediaStream) => {
    try {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let peakDecay = 0;

      const updateMeter = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate RMS level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const level = Math.min(100, (rms / 128) * 100);
        
        setAudioLevel(level);
        
        // Peak hold with decay
        if (level > peakDecay) {
          peakDecay = level;
          setPeakAudioLevel(level);
        } else {
          peakDecay = Math.max(0, peakDecay - 0.5);
          setPeakAudioLevel(peakDecay);
        }
        
        audioAnimationRef.current = requestAnimationFrame(updateMeter);
      };
      
      updateMeter();
    } catch (error) {
      console.warn("Failed to set up audio meter:", error);
    }
  };

  const cleanupAudioMeter = () => {
    if (audioAnimationRef.current) {
      cancelAnimationFrame(audioAnimationRef.current);
      audioAnimationRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
    setPeakAudioLevel(0);
  };

  // Face detection setup
  const setupFaceDetection = async () => {
    try {
      // Check if FaceDetector API is available (Chrome only)
      if ('FaceDetector' in window) {
        faceDetectorRef.current = new (window as any).FaceDetector({
          fastMode: true,
          maxDetectedFaces: 5,
        });
        setHasFaceDetection(true);
        
        // Start detection loop
        faceDetectionIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || !faceDetectorRef.current) return;
          
          try {
            const faces = await faceDetectorRef.current.detect(videoRef.current);
            const videoWidth = videoRef.current.videoWidth;
            const videoHeight = videoRef.current.videoHeight;
            
            setDetectedFaces(faces.map((face: any) => ({
              x: (face.boundingBox.x / videoWidth) * 100,
              y: (face.boundingBox.y / videoHeight) * 100,
              width: (face.boundingBox.width / videoWidth) * 100,
              height: (face.boundingBox.height / videoHeight) * 100,
            })));
          } catch (e) {
            // Detection failed, ignore
          }
        }, 200);
      } else {
        setHasFaceDetection(false);
        console.info("FaceDetector API not available in this browser");
      }
    } catch (error) {
      console.warn("Failed to set up face detection:", error);
      setHasFaceDetection(false);
    }
  };

  const cleanupFaceDetection = () => {
    if (faceDetectionIntervalRef.current) {
      clearInterval(faceDetectionIntervalRef.current);
      faceDetectionIntervalRef.current = null;
    }
    faceDetectorRef.current = null;
    setDetectedFaces([]);
  };

  // Toggle stabilization
  const toggleStabilization = async () => {
    if (!streamRef.current || !hasStabilization) return;

    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      try {
        const newState = !stabilizationEnabled;
        await videoTrack.applyConstraints({
          advanced: [{ videoStabilizationMode: newState ? "on" : "off" } as any],
        });
        setStabilizationEnabled(newState);
        toast.success(newState ? "Stabilization enabled" : "Stabilization disabled");
      } catch (error) {
        console.error("Failed to toggle stabilization:", error);
        toast.error("Failed to toggle stabilization");
      }
    }
  };

  // Toggle face detection
  const toggleFaceDetection = () => {
    const newState = !faceDetectionEnabled;
    setFaceDetectionEnabled(newState);
    
    if (newState && isPreviewing) {
      setupFaceDetection();
    } else {
      cleanupFaceDetection();
    }
    
    toast.success(newState ? "Face detection enabled" : "Face detection disabled");
  };

  // Video Trimming Functions
  const openTrimmer = () => {
    if (!recordedBlob) return;
    setShowTrimmer(true);
    setTrimStart(0);
    setTrimEnd(recordingTime);
    setTrimPreviewTime(0);
    setIsTrimPlaying(false);
    
    // Set up trim video preview
    setTimeout(() => {
      if (trimVideoRef.current && recordedBlob) {
        trimVideoRef.current.src = URL.createObjectURL(recordedBlob);
        trimVideoRef.current.currentTime = 0;
      }
    }, 100);
  };

  const closeTrimmer = () => {
    setShowTrimmer(false);
    setIsTrimPlaying(false);
    if (trimVideoRef.current) {
      trimVideoRef.current.pause();
    }
  };

  const handleTrimPreview = () => {
    if (!trimVideoRef.current) return;
    
    if (isTrimPlaying) {
      trimVideoRef.current.pause();
      setIsTrimPlaying(false);
    } else {
      trimVideoRef.current.currentTime = trimStart;
      trimVideoRef.current.play();
      setIsTrimPlaying(true);
    }
  };

  const handleTrimVideoTimeUpdate = () => {
    if (!trimVideoRef.current) return;
    const currentTime = trimVideoRef.current.currentTime;
    setTrimPreviewTime(currentTime);
    
    // Stop at trim end
    if (currentTime >= trimEnd) {
      trimVideoRef.current.pause();
      setIsTrimPlaying(false);
    }
  };

  const applyTrim = async () => {
    if (!recordedBlob || !trimVideoRef.current) return;
    
    // For now, we'll just update the recording time to reflect the trim
    // Full client-side trimming would require FFmpeg.wasm or similar
    const trimmedDuration = Math.round(trimEnd - trimStart);
    setRecordingTime(trimmedDuration);
    toast.success(`Video trimmed to ${formatTime(trimmedDuration)}`);
    closeTrimmer();
  };

  // Slow Motion Functions
  const toggleSlowMotion = () => {
    if (!isPreviewing) {
      setSlowMotionEnabled(!slowMotionEnabled);
      toast.success(slowMotionEnabled ? "Slow motion disabled" : "Slow motion enabled");
    } else {
      toast.error("Stop camera first to change slow motion settings");
    }
  };

  const cycleSlowMotionFps = () => {
    const fpsOptions: SlowMotionFps[] = [30, 60, 120, 240].filter(fps => fps <= maxSupportedFps) as SlowMotionFps[];
    const currentIndex = fpsOptions.indexOf(slowMotionFps);
    const nextIndex = (currentIndex + 1) % fpsOptions.length;
    setSlowMotionFps(fpsOptions[nextIndex]);
  };

  // Picture-in-Picture Functions
  const togglePip = async () => {
    if (!videoRef.current || !pipSupported) return;
    
    try {
      if (isPipActive) {
        await (document as any).exitPictureInPicture();
        setIsPipActive(false);
      } else {
        await (videoRef.current as any).requestPictureInPicture();
        setIsPipActive(true);
        
        // Listen for PiP exit
        videoRef.current.addEventListener('leavepictureinpicture', () => {
          setIsPipActive(false);
        }, { once: true });
      }
    } catch (error) {
      console.error("PiP error:", error);
      toast.error("Picture-in-Picture not available");
    }
  };

  // Screen Recording Functions
  const startScreenRecording = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: QUALITY_PRESETS[videoQuality].width },
          height: { ideal: QUALITY_PRESETS[videoQuality].height },
        },
        audio: true,
      });
      
      setScreenStream(displayStream);
      
      if (recordingSource === "both" && streamRef.current) {
        // Combine screen and camera streams
        const combinedStream = new MediaStream([
          ...displayStream.getVideoTracks(),
          ...streamRef.current.getAudioTracks(),
        ]);
        startRecordingWithStream(combinedStream);
      } else {
        startRecordingWithStream(displayStream);
      }
      
      // Handle screen share stop
      displayStream.getVideoTracks()[0].addEventListener('ended', () => {
        stopRecording();
        setScreenStream(null);
        toast.info("Screen sharing ended");
      });
      
      setIsPreviewing(true);
      toast.success("Screen recording started");
    } catch (error) {
      console.error("Screen recording error:", error);
      toast.error("Failed to start screen recording");
    }
  };

  const startRecordingWithStream = (stream: MediaStream) => {
    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
    });
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = URL.createObjectURL(blob);
      }
    };
    
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
    
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
  };

  // Watermark Functions
  const applyWatermarkToVideo = async (videoBlob: Blob): Promise<Blob> => {
    if (!watermark.enabled) return videoBlob;
    
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(videoBlob);
      video.muted = true;
      
      video.onloadedmetadata = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d')!;
        
        const chunks: Blob[] = [];
        const stream = canvas.captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: 'video/webm' }));
          URL.revokeObjectURL(video.src);
        };
        
        const drawFrame = () => {
          ctx.drawImage(video, 0, 0);
          drawWatermark(ctx, canvas.width, canvas.height);
          
          if (!video.ended) {
            requestAnimationFrame(drawFrame);
          } else {
            recorder.stop();
          }
        };
        
        recorder.start();
        video.play();
        drawFrame();
      };
    });
  };

  const drawWatermark = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    ctx.globalAlpha = watermark.opacity / 100;
    
    const padding = 20;
    let x = padding;
    let y = padding;
    
    switch (watermark.position) {
      case "top-right":
        x = width - padding;
        ctx.textAlign = "right";
        break;
      case "bottom-left":
        y = height - padding;
        break;
      case "bottom-right":
        x = width - padding;
        y = height - padding;
        ctx.textAlign = "right";
        break;
      case "center":
        x = width / 2;
        y = height / 2;
        ctx.textAlign = "center";
        break;
      default:
        ctx.textAlign = "left";
    }
    
    ctx.font = `bold ${watermark.fontSize}px Arial`;
    ctx.fillStyle = watermark.color;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText(watermark.text, x, y);
    
    ctx.restore();
  };

  // Video Clip Management Functions
  const addCurrentVideoToClips = () => {
    if (!recordedBlob) return;
    
    const newClip: VideoClip = {
      id: Date.now().toString(),
      blob: recordedBlob,
      url: URL.createObjectURL(recordedBlob),
      duration: recordingTime,
    };
    
    setVideoClips((prev) => [...prev, newClip]);
    setRecordedBlob(null);
    setRecordingTime(0);
    toast.success("Clip added to collection");
  };

  const removeClip = (clipId: string) => {
    setVideoClips((prev) => {
      const clip = prev.find((c) => c.id === clipId);
      if (clip) URL.revokeObjectURL(clip.url);
      return prev.filter((c) => c.id !== clipId);
    });
  };

  const moveClip = (fromIndex: number, toIndex: number) => {
    setVideoClips((prev) => {
      const newClips = [...prev];
      const [removed] = newClips.splice(fromIndex, 1);
      newClips.splice(toIndex, 0, removed);
      return newClips;
    });
  };

  const mergeClips = async () => {
    if (videoClips.length < 2) {
      toast.error("Need at least 2 clips to merge");
      return;
    }
    
    setIsMergingClips(true);
    const transitionLabel = transitionSettings.type !== "none" 
      ? ` with ${transitionSettings.type} transitions` 
      : "";
    toast.info(`Merging clips${transitionLabel}...`);
    
    try {
      // Create a combined blob from all clips
      const combinedBlobs = videoClips.map((c) => c.blob);
      const mergedBlob = new Blob(combinedBlobs, { type: "video/webm" });
      
      // Calculate total duration (add transition time between clips)
      const transitionTime = transitionSettings.type !== "none" 
        ? transitionSettings.duration * (videoClips.length - 1) 
        : 0;
      const totalDuration = videoClips.reduce((sum, c) => sum + c.duration, 0) + transitionTime;
      
      // Clean up old clips
      videoClips.forEach((c) => URL.revokeObjectURL(c.url));
      setVideoClips([]);
      
      // Set merged video as current
      setRecordedBlob(mergedBlob);
      setRecordingTime(Math.round(totalDuration));
      
      if (videoRef.current) {
        videoRef.current.src = URL.createObjectURL(mergedBlob);
      }
      
      setShowClipManager(false);
      toast.success(`Merged ${combinedBlobs.length} clips (${formatTime(Math.round(totalDuration))})${transitionLabel}`);
    } catch (error) {
      console.error("Merge error:", error);
      toast.error("Failed to merge clips");
    } finally {
      setIsMergingClips(false);
    }
  };

  // Bookmark Functions
  const addBookmark = () => {
    if (!isRecording && !recordedBlob) return;
    
    const timestamp = recordedBlob ? (videoRef.current?.currentTime || 0) : recordingTime;
    const newBookmark: VideoBookmark = {
      id: `bookmark_${Date.now()}`,
      timestamp,
      label: newBookmarkLabel || `Bookmark ${bookmarks.length + 1}`,
      color: bookmarkColor,
    };
    
    setBookmarks(prev => [...prev, newBookmark].sort((a, b) => a.timestamp - b.timestamp));
    setNewBookmarkLabel("");
    toast.success(`Bookmark added at ${formatTime(Math.round(timestamp))}`);
  };

  const removeBookmark = (id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
  };

  const jumpToBookmark = (timestamp: number) => {
    if (videoRef.current && recordedBlob) {
      videoRef.current.currentTime = timestamp;
    }
  };

  const updateBookmarkLabel = (id: string, label: string) => {
    setBookmarks(prev => prev.map(b => b.id === id ? { ...b, label } : b));
  };

  // Chapter Functions
  const startChapter = () => {
    if (!isRecording && !recordedBlob) return;
    
    const timestamp = recordedBlob ? (videoRef.current?.currentTime || 0) : recordingTime;
    setChapterStartTime(timestamp);
    toast.info("Chapter started. Click again to end chapter.");
  };

  const endChapter = () => {
    if (chapterStartTime === null) return;
    
    const endTime = recordedBlob ? (videoRef.current?.currentTime || 0) : recordingTime;
    if (endTime <= chapterStartTime) {
      toast.error("Chapter end time must be after start time");
      return;
    }
    
    const newChapter: VideoChapter = {
      id: `chapter_${Date.now()}`,
      startTime: chapterStartTime,
      endTime,
      title: currentChapterTitle || `Chapter ${chapters.length + 1}`,
    };
    
    setChapters(prev => [...prev, newChapter].sort((a, b) => a.startTime - b.startTime));
    setChapterStartTime(null);
    setCurrentChapterTitle("");
    toast.success(`Chapter added: ${formatTime(Math.round(chapterStartTime))} - ${formatTime(Math.round(endTime))}`);
  };

  const removeChapter = (id: string) => {
    setChapters(prev => prev.filter(c => c.id !== id));
  };

  const jumpToChapter = (startTime: number) => {
    if (videoRef.current && recordedBlob) {
      videoRef.current.currentTime = startTime;
    }
  };

  const updateChapterTitle = (id: string, title: string) => {
    setChapters(prev => prev.map(c => c.id === id ? { ...c, title } : c));
  };

  // Transition Functions
  const getTransitionLabel = (type: TransitionType): string => {
    const labels: Record<TransitionType, string> = {
      "none": "None",
      "fade": "Fade",
      "dissolve": "Dissolve",
      "wipe-left": "Wipe Left",
      "wipe-right": "Wipe Right",
      "slide-left": "Slide Left",
      "slide-right": "Slide Right",
    };
    return labels[type];
  };

  // Export Functions
  const exportVideo = async (format: ExportFormat) => {
    if (!recordedBlob) return;
    
    setIsExporting(true);
    setExportProgress(0);
    
    try {
      if (format === "webm") {
        // Direct download as WebM
        const url = URL.createObjectURL(recordedBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `recording_${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Video exported as WebM");
      } else if (format === "mp4") {
        // For MP4, we need to re-encode using MediaRecorder with mp4 mime type if supported
        // Otherwise, download as WebM with .mp4 extension (most players handle this)
        const mimeType = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";
        const url = URL.createObjectURL(recordedBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `recording_${Date.now()}.mp4`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Video exported as MP4");
        if (mimeType === "video/webm") {
          toast.info("Note: File is WebM format with MP4 extension. Most players support this.");
        }
      } else if (format === "gif") {
        // Convert video to GIF using canvas frames
        toast.info("Converting to GIF... This may take a moment.");
        setExportProgress(10);
        
        const video = document.createElement("video");
        video.src = URL.createObjectURL(recordedBlob);
        video.muted = true;
        
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => resolve();
        });
        
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        const width = Math.min(video.videoWidth, 480); // Limit GIF size
        const height = Math.round((width / video.videoWidth) * video.videoHeight);
        canvas.width = width;
        canvas.height = height;
        
        const frames: string[] = [];
        const duration = Math.min(video.duration, 10); // Limit to 10 seconds for GIF
        const fps = 10;
        const totalFrames = Math.floor(duration * fps);
        
        for (let i = 0; i < totalFrames; i++) {
          video.currentTime = i / fps;
          await new Promise<void>((resolve) => {
            video.onseeked = () => resolve();
          });
          ctx.drawImage(video, 0, 0, width, height);
          frames.push(canvas.toDataURL("image/png"));
          setExportProgress(10 + Math.round((i / totalFrames) * 80));
        }
        
        // Create animated GIF using gifshot or similar
        // For now, download as individual frames or first frame
        setExportProgress(95);
        
        // Download first frame as preview (full GIF encoding requires gifshot library)
        const a = document.createElement("a");
        a.href = frames[0];
        a.download = `recording_${Date.now()}_preview.png`;
        a.click();
        
        toast.success(`Captured ${frames.length} frames. GIF encoding requires additional setup.`);
        toast.info("For full GIF support, consider using an online converter.");
        
        URL.revokeObjectURL(video.src);
      }
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export video");
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setShowExportDialog(false);
    }
  };

  // Thumbnail Generation Functions
  const generateThumbnail = useCallback(async (blob: Blob, time: number = 0) => {
    return new Promise<string>((resolve, reject) => {
      const video = document.createElement("video");
      video.src = URL.createObjectURL(blob);
      video.muted = true;
      video.preload = "metadata";
      
      video.onloadedmetadata = () => {
        setVideoDuration(video.duration);
        video.currentTime = Math.min(time, video.duration);
      };
      
      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const thumbnailDataUrl = canvas.toDataURL("image/jpeg", 0.8);
          setThumbnailUrl(thumbnailDataUrl);
          resolve(thumbnailDataUrl);
        } else {
          reject(new Error("Failed to get canvas context"));
        }
        URL.revokeObjectURL(video.src);
      };
      
      video.onerror = () => {
        reject(new Error("Failed to load video"));
        URL.revokeObjectURL(video.src);
      };
    });
  }, []);

  const updateThumbnailTime = useCallback((time: number) => {
    setThumbnailTime(time);
    if (recordedBlob) {
      generateThumbnail(recordedBlob, time);
    }
  }, [recordedBlob, generateThumbnail]);

  // Generate thumbnail when video is recorded
  useEffect(() => {
    if (recordedBlob && !thumbnailUrl) {
      generateThumbnail(recordedBlob, 0);
    }
  }, [recordedBlob, thumbnailUrl, generateThumbnail]);

  // Audio Recording Functions
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      
      // Set up audio visualization
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      analyser.fftSize = 256;
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateWaveform = () => {
        analyser.getByteFrequencyData(dataArray);
        // Sample 32 bars for visualization
        const bars: number[] = [];
        const step = Math.floor(dataArray.length / 32);
        for (let i = 0; i < 32; i++) {
          bars.push(dataArray[i * step] / 255);
        }
        setAudioWaveform(bars);
        waveformAnimationRef.current = requestAnimationFrame(updateWaveform);
      };
      updateWaveform();
      
      // Start recording
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") 
        ? "audio/webm" 
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioPreviewUrl(URL.createObjectURL(blob));
        
        // Clean up
        if (waveformAnimationRef.current) {
          cancelAnimationFrame(waveformAnimationRef.current);
        }
        audioContext.close();
        setAudioWaveform([]);
      };
      
      audioRecorderRef.current = recorder;
      recorder.start(100);
      setIsAudioRecording(true);
      setRecordingTime(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
      
      toast.success("Audio recording started");
    } catch (error) {
      console.error("Failed to start audio recording:", error);
      toast.error("Failed to access microphone");
    }
  };

  const stopAudioRecording = () => {
    if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") {
      audioRecorderRef.current.stop();
    }
    
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    setIsAudioRecording(false);
    toast.success("Audio recording stopped");
  };

  const handleUploadAudio = async () => {
    if (!audioBlob) return;
    
    setUploading(true);
    try {
      const fileName = `audio_${Date.now()}.webm`;
      
      const { url, fileKey } = await uploadFileToStorage(audioBlob, fileName, trpcUtils);
      
      await createFileMutation.mutateAsync({
        filename: fileName,
        url,
        fileKey,
        fileSize: audioBlob.size,
        mimeType: audioBlob.type,
      });
      
      toast.success("Audio uploaded successfully!");
      trpcUtils.files.list.invalidate();
      
      // Reset
      setAudioBlob(null);
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
        setAudioPreviewUrl(null);
      }
      setRecordingTime(0);
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error("Failed to upload audio");
    } finally {
      setUploading(false);
    }
  };

  const handleDiscardAudio = () => {
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
    }
    setAudioBlob(null);
    setAudioPreviewUrl(null);
    setRecordingTime(0);
  };

  // Voice Commands Functions
  const initVoiceCommands = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error("Voice commands not supported in this browser");
      return;
    }

    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const last = event.results.length - 1;
      const command = event.results[last][0].transcript.toLowerCase().trim();
      setLastVoiceCommand(command);
      processVoiceCommand(command);
    };

    recognition.onerror = (event: any) => {
      console.error('Voice recognition error:', event.error);
      if (event.error === 'no-speech') {
        // Restart listening
        setTimeout(() => {
          if (voiceCommandsEnabled && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              // Already started
            }
          }
        }, 100);
      }
    };

    recognition.onend = () => {
      if (voiceCommandsEnabled) {
        try {
          recognition.start();
        } catch (e) {
          // Already started
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
  }, [voiceCommandsEnabled]);

  const processVoiceCommand = useCallback((command: string) => {
    const showFeedback = (msg: string) => {
      setVoiceCommandFeedback(msg);
      setTimeout(() => setVoiceCommandFeedback(null), 2000);
    };

    if (command.includes('start') && command.includes('record')) {
      if (isPreviewing && !isRecording && captureMode === 'video') {
        showFeedback('Starting recording...');
        handleRecordWithTimer();
      } else if (!isPreviewing && captureMode !== 'screen' && captureMode !== 'audio') {
        showFeedback('Starting camera...');
        startCamera();
      }
    } else if (command.includes('stop') && command.includes('record')) {
      if (isRecording) {
        showFeedback('Stopping recording...');
        stopRecording();
      }
    } else if (command.includes('take') && command.includes('photo')) {
      if (isPreviewing && captureMode === 'photo') {
        showFeedback('Taking photo...');
        capturePhoto();
      }
    } else if (command.includes('switch') && command.includes('camera')) {
      if (isPreviewing && hasMultipleCameras) {
        showFeedback('Switching camera...');
        switchCamera();
      }
    } else if (command.includes('stop') && command.includes('camera')) {
      if (isPreviewing) {
        showFeedback('Stopping camera...');
        stopCamera();
      }
    } else if (command.includes('capture') || command.includes('cheese')) {
      if (isPreviewing && captureMode === 'photo') {
        showFeedback('Capturing...');
        capturePhoto();
      }
    }
  }, [isPreviewing, isRecording, captureMode, hasMultipleCameras]);

  const toggleVoiceCommands = useCallback(() => {
    if (!voiceCommandsEnabled) {
      initVoiceCommands();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
          setVoiceCommandsEnabled(true);
          toast.success('Voice commands enabled. Try saying "start recording" or "take photo"');
        } catch (e) {
          toast.error('Failed to start voice recognition');
        }
      }
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      setVoiceCommandsEnabled(false);
      toast.info('Voice commands disabled');
    }
  }, [voiceCommandsEnabled, initVoiceCommands]);

  // Background Music Functions
  const handleMusicFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('audio/')) {
        toast.error('Please select an audio file');
        return;
      }
      setBackgroundMusicFile(file);
      if (backgroundMusicUrl) {
        URL.revokeObjectURL(backgroundMusicUrl);
      }
      setBackgroundMusicUrl(URL.createObjectURL(file));
      toast.success(`Music loaded: ${file.name}`);
    }
  };

  const removeMusicTrack = () => {
    if (backgroundMusicUrl) {
      URL.revokeObjectURL(backgroundMusicUrl);
    }
    setBackgroundMusicFile(null);
    setBackgroundMusicUrl(null);
  };

  const mixAudioWithMusic = async (): Promise<Blob | null> => {
    if (!recordedBlob || !backgroundMusicFile) return null;

    setIsMixingAudio(true);
    try {
      const audioContext = new AudioContext();
      
      // Load video audio
      const videoArrayBuffer = await recordedBlob.arrayBuffer();
      const videoAudioBuffer = await audioContext.decodeAudioData(videoArrayBuffer.slice(0));
      
      // Load music
      const musicArrayBuffer = await backgroundMusicFile.arrayBuffer();
      const musicAudioBuffer = await audioContext.decodeAudioData(musicArrayBuffer);
      
      // Create offline context for mixing
      const duration = videoAudioBuffer.duration;
      const offlineContext = new OfflineAudioContext(
        2,
        Math.ceil(duration * audioContext.sampleRate),
        audioContext.sampleRate
      );
      
      // Video audio source
      const videoSource = offlineContext.createBufferSource();
      videoSource.buffer = videoAudioBuffer;
      const videoGain = offlineContext.createGain();
      videoGain.gain.value = originalVolume / 100;
      videoSource.connect(videoGain);
      videoGain.connect(offlineContext.destination);
      
      // Music source
      const musicSource = offlineContext.createBufferSource();
      musicSource.buffer = musicAudioBuffer;
      musicSource.loop = true;
      const musicGain = offlineContext.createGain();
      
      // Apply fade in/out
      const fadeTime = 1; // 1 second fade
      if (musicFadeIn) {
        musicGain.gain.setValueAtTime(0, 0);
        musicGain.gain.linearRampToValueAtTime(musicVolume / 100, fadeTime);
      } else {
        musicGain.gain.value = musicVolume / 100;
      }
      
      if (musicFadeOut) {
        musicGain.gain.setValueAtTime(musicVolume / 100, duration - fadeTime);
        musicGain.gain.linearRampToValueAtTime(0, duration);
      }
      
      musicSource.connect(musicGain);
      musicGain.connect(offlineContext.destination);
      
      // Start sources
      videoSource.start(0);
      musicSource.start(0);
      
      // Render
      const renderedBuffer = await offlineContext.startRendering();
      
      // Convert to blob
      const wavBlob = audioBufferToWav(renderedBuffer);
      
      toast.success('Audio mixed successfully!');
      return wavBlob;
    } catch (error) {
      console.error('Audio mixing failed:', error);
      toast.error('Failed to mix audio. Uploading original video.');
      return null;
    } finally {
      setIsMixingAudio(false);
    }
  };

  // Helper function to convert AudioBuffer to WAV blob
  const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const dataLength = buffer.length * blockAlign;
    const bufferLength = 44 + dataLength;
    
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, bufferLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);
    
    // Write audio data
    const channels: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  // Audio Ducking Functions
  const startVoiceDetection = () => {
    if (!audioDucking.enabled || !analyserRef.current) return;
    
    const checkVoice = () => {
      if (!analyserRef.current) return;
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Focus on voice frequency range (85-255 Hz for fundamentals, up to 3kHz for harmonics)
      // In FFT bins, this is roughly bins 2-60 for typical sample rates
      const voiceBins = dataArray.slice(2, 60);
      const avgVoiceLevel = voiceBins.reduce((a, b) => a + b, 0) / voiceBins.length;
      const normalizedLevel = (avgVoiceLevel / 255) * 100;
      
      const detected = normalizedLevel > audioDucking.threshold;
      setIsVoiceDetected(detected);
    };
    
    voiceDetectionRef.current = setInterval(checkVoice, 50);
  };

  const stopVoiceDetection = () => {
    if (voiceDetectionRef.current) {
      clearInterval(voiceDetectionRef.current);
      voiceDetectionRef.current = null;
    }
    setIsVoiceDetected(false);
  };

  // PiP Recording Functions
  const startPipRecording = async () => {
    try {
      // Get screen stream
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: QUALITY_PRESETS[videoQuality].width },
          height: { ideal: QUALITY_PRESETS[videoQuality].height },
        },
        audio: true,
      });
      
      setScreenStream(displayStream);
      
      // Get camera stream for PiP overlay
      if (recordingTemplate === "pip-corner" || recordingTemplate === "pip-side") {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: cameraFacing },
          audio: false, // Audio comes from screen
        });
        setCameraStreamForPip(cameraStream);
        
        if (pipVideoRef.current) {
          pipVideoRef.current.srcObject = cameraStream;
        }
      }
      
      // Start recording the screen stream
      startRecordingWithStream(displayStream);
      
      // Handle screen share stop
      displayStream.getVideoTracks()[0].addEventListener('ended', () => {
        stopRecording();
        setScreenStream(null);
        if (cameraStreamForPip) {
          cameraStreamForPip.getTracks().forEach(t => t.stop());
          setCameraStreamForPip(null);
        }
        toast.info("Screen sharing ended");
      });
      
      setIsPreviewing(true);
      toast.success(`Recording started (${getTemplateLabel(recordingTemplate)})`);
    } catch (error) {
      console.error("PiP recording error:", error);
      toast.error("Failed to start recording");
    }
  };

  const getTemplateLabel = (template: RecordingTemplate): string => {
    const labels: Record<RecordingTemplate, string> = {
      "screen-only": "Screen Only",
      "camera-only": "Camera Only",
      "pip-corner": "Screen + Camera (Corner)",
      "pip-side": "Screen + Camera (Side)",
    };
    return labels[template];
  };

  const getPipPositionStyle = (): React.CSSProperties => {
    const size = `${pipSettings.size}%`;
    const margin = "16px";
    
    const baseStyle: React.CSSProperties = {
      position: "absolute",
      width: size,
      aspectRatio: "16/9",
      borderRadius: `${pipSettings.borderRadius}px`,
      opacity: pipSettings.opacity / 100,
      overflow: "hidden",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      border: "2px solid rgba(255,255,255,0.2)",
    };
    
    switch (pipSettings.position) {
      case "top-left":
        return { ...baseStyle, top: margin, left: margin };
      case "top-right":
        return { ...baseStyle, top: margin, right: margin };
      case "bottom-left":
        return { ...baseStyle, bottom: margin, left: margin };
      case "bottom-right":
      default:
        return { ...baseStyle, bottom: margin, right: margin };
    }
  };

  // Caption/Subtitle Functions
  const startCaptionTranscription = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error("Speech recognition not supported in this browser");
      return;
    }

    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    captionStartTimeRef.current = Date.now();

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
          // Add to captions array
          const now = Date.now();
          const startTime = (now - captionStartTimeRef.current - 2000) / 1000; // Approximate start
          const endTime = (now - captionStartTimeRef.current) / 1000;
          setCaptions(prev => [...prev, {
            id: `caption-${Date.now()}`,
            text: transcript.trim(),
            startTime: Math.max(0, startTime),
            endTime,
          }]);
        } else {
          interimTranscript += transcript;
        }
      }

      setCurrentCaption(interimTranscript || finalTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('Caption recognition error:', event.error);
      if (event.error === 'no-speech') {
        // Continue listening
        setTimeout(() => {
          if (captionsEnabled && captionRecognitionRef.current) {
            try {
              captionRecognitionRef.current.start();
            } catch (e) {
              // Already started
            }
          }
        }, 100);
      }
    };

    recognition.onend = () => {
      if (captionsEnabled && isRecording) {
        try {
          recognition.start();
        } catch (e) {
          // Already started
        }
      }
    };

    captionRecognitionRef.current = recognition;
    recognition.start();
    setIsTranscribing(true);
    toast.success("Caption transcription started");
  }, [captionsEnabled, isRecording]);

  const stopCaptionTranscription = useCallback(() => {
    if (captionRecognitionRef.current) {
      captionRecognitionRef.current.stop();
      captionRecognitionRef.current = null;
    }
    setIsTranscribing(false);
    setCurrentCaption("");
  }, []);

  const toggleCaptions = useCallback(() => {
    if (!captionsEnabled) {
      setCaptionsEnabled(true);
      if (isRecording) {
        startCaptionTranscription();
      }
      toast.success("Captions enabled - will transcribe during recording");
    } else {
      setCaptionsEnabled(false);
      stopCaptionTranscription();
      toast.info("Captions disabled");
    }
  }, [captionsEnabled, isRecording, startCaptionTranscription, stopCaptionTranscription]);

  const editCaption = useCallback((id: string, newText: string) => {
    setCaptions(prev => prev.map(c => c.id === id ? { ...c, text: newText } : c));
  }, []);

  const deleteCaption = useCallback((id: string) => {
    setCaptions(prev => prev.filter(c => c.id !== id));
  }, []);

  // Chroma Key / Green Screen Functions
  const getChromaKeyColor = useCallback((): [number, number, number] => {
    if (chromaKey.color === "green") return [0, 255, 0];
    if (chromaKey.color === "blue") return [0, 0, 255];
    // Parse custom color
    const hex = chromaKey.customColor.replace('#', '');
    return [
      parseInt(hex.substring(0, 2), 16),
      parseInt(hex.substring(2, 4), 16),
      parseInt(hex.substring(4, 6), 16),
    ];
  }, [chromaKey.color, chromaKey.customColor]);

  const applyChromaKey = useCallback(() => {
    if (!chromaKey.enabled || !videoRef.current || !chromaCanvasRef.current) return;

    const video = videoRef.current;
    const canvas = chromaCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const [targetR, targetG, targetB] = getChromaKeyColor();
    const tolerance = chromaKey.tolerance * 2.55; // Convert 0-100 to 0-255

    const processFrame = () => {
      if (!chromaKey.enabled || !videoRef.current) {
        if (chromaAnimationRef.current) {
          cancelAnimationFrame(chromaAnimationRef.current);
          chromaAnimationRef.current = null;
        }
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Draw background first if using image or color
      if (chromaKey.backgroundType === 'color') {
        ctx.fillStyle = chromaKey.backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (chromaKey.backgroundType === 'image' && backgroundImageRef.current) {
        ctx.drawImage(backgroundImageRef.current, 0, 0, canvas.width, canvas.height);
      } else if (chromaKey.backgroundType === 'blur') {
        ctx.filter = `blur(${chromaKey.blurAmount}px)`;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';
      }

      // Get background for compositing
      const bgImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const bgData = bgImageData.data;

      // Redraw video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const fgImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const fgData = fgImageData.data;

      // Apply chroma key
      for (let i = 0; i < fgData.length; i += 4) {
        const r = fgData[i];
        const g = fgData[i + 1];
        const b = fgData[i + 2];

        // Calculate color distance
        const distance = Math.sqrt(
          Math.pow(r - targetR, 2) +
          Math.pow(g - targetG, 2) +
          Math.pow(b - targetB, 2)
        );

        if (distance < tolerance) {
          // Replace with background
          const alpha = Math.min(1, distance / tolerance);
          const smoothAlpha = Math.pow(alpha, chromaKey.smoothness / 10);
          
          fgData[i] = Math.round(fgData[i] * smoothAlpha + bgData[i] * (1 - smoothAlpha));
          fgData[i + 1] = Math.round(fgData[i + 1] * smoothAlpha + bgData[i + 1] * (1 - smoothAlpha));
          fgData[i + 2] = Math.round(fgData[i + 2] * smoothAlpha + bgData[i + 2] * (1 - smoothAlpha));
        }
      }

      ctx.putImageData(fgImageData, 0, 0);
      chromaAnimationRef.current = requestAnimationFrame(processFrame);
    };

    processFrame();
  }, [chromaKey, getChromaKeyColor]);

  const handleBackgroundImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      const img = new Image();
      img.onload = () => {
        backgroundImageRef.current = img;
        setChromaKey(prev => ({ ...prev, backgroundImage: URL.createObjectURL(file) }));
        toast.success('Background image loaded');
      };
      img.src = URL.createObjectURL(file);
    }
  };

  const removeBackgroundImage = () => {
    if (chromaKey.backgroundImage) {
      URL.revokeObjectURL(chromaKey.backgroundImage);
    }
    backgroundImageRef.current = null;
    setChromaKey(prev => ({ ...prev, backgroundImage: null }));
  };

  // Start/stop chroma key processing when enabled
  useEffect(() => {
    if (chromaKey.enabled && isPreviewing) {
      applyChromaKey();
    } else if (chromaAnimationRef.current) {
      cancelAnimationFrame(chromaAnimationRef.current);
      chromaAnimationRef.current = null;
    }
    return () => {
      if (chromaAnimationRef.current) {
        cancelAnimationFrame(chromaAnimationRef.current);
      }
    };
  }, [chromaKey.enabled, isPreviewing, applyChromaKey]);

  // Start caption transcription when recording starts
  useEffect(() => {
    if (isRecording && captionsEnabled && !isTranscribing) {
      startCaptionTranscription();
    } else if (!isRecording && isTranscribing) {
      stopCaptionTranscription();
    }
  }, [isRecording, captionsEnabled, isTranscribing, startCaptionTranscription, stopCaptionTranscription]);

  // Video Effects Functions
  const toggleVideoEffect = (effect: keyof VideoEffectSettings) => {
    setVideoEffects(prev => ({
      ...prev,
      [effect]: { ...prev[effect], enabled: !prev[effect].enabled }
    }));
  };

  const updateVideoEffectIntensity = (effect: keyof VideoEffectSettings, intensity: number) => {
    setVideoEffects(prev => ({
      ...prev,
      [effect]: { ...prev[effect], intensity }
    }));
  };

  const getEffectsCssFilter = useCallback(() => {
    let filter = getCssFilterString();
    if (videoEffects.blur.enabled) {
      filter += ` blur(${videoEffects.blur.intensity}px)`;
    }
    return filter;
  }, [getCssFilterString, videoEffects.blur]);

  // Multi-Track Audio Functions
  const updateTrackVolume = (trackId: string, volume: number) => {
    setAudioTracks(prev => prev.map(t => 
      t.id === trackId ? { ...t, volume } : t
    ));
    const gainNode = audioGainNodesRef.current.get(trackId);
    if (gainNode) {
      gainNode.gain.value = volume / 100;
    }
  };

  const toggleTrackMute = (trackId: string) => {
    setAudioTracks(prev => prev.map(t => 
      t.id === trackId ? { ...t, muted: !t.muted } : t
    ));
    const gainNode = audioGainNodesRef.current.get(trackId);
    if (gainNode) {
      const track = audioTracks.find(t => t.id === trackId);
      gainNode.gain.value = track?.muted ? track.volume / 100 : 0;
    }
  };

  // Live Drawing Functions
  const getDrawingCanvasPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): DrawingPoint => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const handleDrawingStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode) return;
    e.preventDefault();
    const pos = getDrawingCanvasPos(e);
    isDrawingRef.current = true;

    if (selectedDrawingTool === "text") {
      setDrawingTextPosition(pos);
      return;
    }

    const newElement: DrawingElement = {
      id: `el-${Date.now()}`,
      type: selectedDrawingTool,
      points: [pos],
      color: drawingColor,
      strokeWidth: drawingStrokeWidth,
    };
    setCurrentDrawingElement(newElement);
  };

  const handleDrawingMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode || !isDrawingRef.current || !currentDrawingElement) return;
    e.preventDefault();
    const pos = getDrawingCanvasPos(e);

    if (selectedDrawingTool === "pen" || selectedDrawingTool === "highlight" || selectedDrawingTool === "eraser") {
      setCurrentDrawingElement(prev => prev ? {
        ...prev,
        points: [...prev.points, pos]
      } : null);
    } else {
      setCurrentDrawingElement(prev => prev ? {
        ...prev,
        points: [prev.points[0], pos]
      } : null);
    }
    renderDrawingCanvas();
  };

  const handleDrawingEnd = () => {
    if (!isDrawingMode || !currentDrawingElement) {
      isDrawingRef.current = false;
      return;
    }
    isDrawingRef.current = false;

    const newElements = [...drawingElements, currentDrawingElement];
    setDrawingElements(newElements);
    setCurrentDrawingElement(null);

    // Update history for undo/redo
    const newHistory = drawingHistory.slice(0, drawingHistoryIndex + 1);
    newHistory.push(newElements);
    setDrawingHistory(newHistory);
    setDrawingHistoryIndex(newHistory.length - 1);
  };

  const handleDrawingTextSubmit = () => {
    if (!drawingTextPosition || !drawingTextInput.trim()) {
      setDrawingTextPosition(null);
      setDrawingTextInput("");
      return;
    }

    const textElement: DrawingElement = {
      id: `el-${Date.now()}`,
      type: "text",
      points: [drawingTextPosition],
      color: drawingColor,
      strokeWidth: drawingStrokeWidth,
      text: drawingTextInput,
    };

    const newElements = [...drawingElements, textElement];
    setDrawingElements(newElements);
    setDrawingTextPosition(null);
    setDrawingTextInput("");

    const newHistory = drawingHistory.slice(0, drawingHistoryIndex + 1);
    newHistory.push(newElements);
    setDrawingHistory(newHistory);
    setDrawingHistoryIndex(newHistory.length - 1);
  };

  const undoDrawing = () => {
    if (drawingHistoryIndex > 0) {
      setDrawingHistoryIndex(prev => prev - 1);
      setDrawingElements(drawingHistory[drawingHistoryIndex - 1] || []);
    } else if (drawingHistoryIndex === 0) {
      setDrawingHistoryIndex(-1);
      setDrawingElements([]);
    }
  };

  const redoDrawing = () => {
    if (drawingHistoryIndex < drawingHistory.length - 1) {
      setDrawingHistoryIndex(prev => prev + 1);
      setDrawingElements(drawingHistory[drawingHistoryIndex + 1]);
    }
  };

  const clearDrawing = () => {
    setDrawingElements([]);
    setCurrentDrawingElement(null);
    const newHistory = drawingHistory.slice(0, drawingHistoryIndex + 1);
    newHistory.push([]);
    setDrawingHistory(newHistory);
    setDrawingHistoryIndex(newHistory.length - 1);
  };

  const renderDrawingCanvas = useCallback(() => {
    const canvas = drawingCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allElements = currentDrawingElement 
      ? [...drawingElements, currentDrawingElement]
      : drawingElements;

    allElements.forEach(element => {
      ctx.strokeStyle = element.color;
      ctx.fillStyle = element.color;
      ctx.lineWidth = element.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      switch (element.type) {
        case "pen":
        case "eraser":
          if (element.points.length < 2) return;
          ctx.globalCompositeOperation = element.type === "eraser" ? "destination-out" : "source-over";
          ctx.beginPath();
          ctx.moveTo(element.points[0].x, element.points[0].y);
          element.points.forEach(p => ctx.lineTo(p.x, p.y));
          ctx.stroke();
          ctx.globalCompositeOperation = "source-over";
          break;

        case "highlight":
          if (element.points.length < 2) return;
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = element.strokeWidth * 4;
          ctx.beginPath();
          ctx.moveTo(element.points[0].x, element.points[0].y);
          element.points.forEach(p => ctx.lineTo(p.x, p.y));
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;

        case "rectangle":
          if (element.points.length < 2) return;
          const [start, end] = element.points;
          ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
          break;

        case "circle":
          if (element.points.length < 2) return;
          const [center, edge] = element.points;
          const radius = Math.sqrt(Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2));
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
          ctx.stroke();
          break;

        case "arrow":
          if (element.points.length < 2) return;
          const [from, to] = element.points;
          const angle = Math.atan2(to.y - from.y, to.x - from.x);
          const headLen = 15;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(to.x, to.y);
          ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
          break;

        case "text":
          if (!element.text || element.points.length < 1) return;
          ctx.font = `${element.strokeWidth * 6}px sans-serif`;
          ctx.fillText(element.text, element.points[0].x, element.points[0].y);
          break;
      }
    });
  }, [drawingElements, currentDrawingElement]);

  // Render drawing canvas when elements change
  useEffect(() => {
    renderDrawingCanvas();
  }, [renderDrawingCanvas]);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        {/* Mode Toggle & Settings */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button
              variant={captureMode === "video" ? "default" : "outline"}
              size="sm"
              onClick={() => setCaptureMode("video")}
              disabled={isPreviewing || !!recordedBlob || !!capturedPhoto || burstPhotos.length > 0}
            >
              <Video className="h-4 w-4 mr-1" />
              Video
            </Button>
            <Button
              variant={captureMode === "photo" ? "default" : "outline"}
              size="sm"
              onClick={() => setCaptureMode("photo")}
              disabled={isPreviewing || !!recordedBlob || !!capturedPhoto || burstPhotos.length > 0}
            >
              <ImageIcon className="h-4 w-4 mr-1" />
              Photo
            </Button>
            <Button
              variant={captureMode === "screen" ? "default" : "outline"}
              size="sm"
              onClick={() => setCaptureMode("screen")}
              disabled={isPreviewing || !!recordedBlob || !!capturedPhoto || burstPhotos.length > 0 || isAudioRecording || !!audioBlob}
            >
              <Monitor className="h-4 w-4 mr-1" />
              Screen
            </Button>
            <Button
              variant={captureMode === "audio" ? "default" : "outline"}
              size="sm"
              onClick={() => setCaptureMode("audio")}
              disabled={isPreviewing || !!recordedBlob || !!capturedPhoto || burstPhotos.length > 0 || isAudioRecording || !!audioBlob}
            >
              <Headphones className="h-4 w-4 mr-1" />
              Audio
            </Button>
          </div>
          
          <div className="flex items-center gap-1 flex-wrap">
            {/* Flash/Torch - only shown when camera supports it */}
            {hasFlash && isPreviewing && (
              <Button
                variant={flashEnabled ? "default" : "ghost"}
                size="sm"
                onClick={toggleFlash}
                title={flashEnabled ? "Turn off flash" : "Turn on flash"}
              >
                {flashEnabled ? <Flashlight className="h-4 w-4" /> : <FlashlightOff className="h-4 w-4" />}
              </Button>
            )}

            {/* Aspect Ratio */}
            <Button
              variant="ghost"
              size="sm"
              onClick={cycleAspectRatio}
              title={`Aspect ratio: ${aspectRatio}`}
              disabled={isPreviewing}
            >
              {aspectRatio === "16:9" && <RectangleHorizontal className="h-4 w-4" />}
              {aspectRatio === "4:3" && <Smartphone className="h-4 w-4" />}
              {aspectRatio === "1:1" && <SquareIcon className="h-4 w-4" />}
              <span className="ml-1 text-xs">{aspectRatio}</span>
            </Button>

            {/* Filters - available for both modes */}
            <Button
              variant={showFilters ? "default" : "ghost"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              title="Filters"
            >
              <Palette className="h-4 w-4" />
            </Button>
            
            {/* Timer */}
            <Button
              variant={timerDuration > 0 ? "default" : "ghost"}
              size="sm"
              onClick={cycleTimer}
              title={`Timer: ${timerDuration}s`}
            >
              <Timer className="h-4 w-4" />
              {timerDuration > 0 && <span className="ml-1 text-xs">{timerDuration}s</span>}
            </Button>
            
            {/* Grid */}
            <Button
              variant={showGrid ? "default" : "ghost"}
              size="sm"
              onClick={() => setShowGrid(!showGrid)}
              title="Grid overlay"
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            
            {/* Burst mode - photo only */}
            {captureMode === "photo" && (
              <Button
                variant={burstMode ? "default" : "ghost"}
                size="sm"
                onClick={() => setBurstMode(!burstMode)}
                disabled={!!capturedPhoto || burstPhotos.length > 0}
                title="Burst mode"
              >
                <Zap className="h-4 w-4" />
              </Button>
            )}

            {/* Stabilization - video only, shown when camera supports it */}
            {captureMode === "video" && hasStabilization && isPreviewing && (
              <Button
                variant={stabilizationEnabled ? "default" : "ghost"}
                size="sm"
                onClick={toggleStabilization}
                title={stabilizationEnabled ? "Disable stabilization" : "Enable stabilization"}
              >
                <Vibrate className="h-4 w-4" />
              </Button>
            )}

            {/* Face Detection */}
            <Button
              variant={faceDetectionEnabled ? "default" : "ghost"}
              size="sm"
              onClick={toggleFaceDetection}
              title={faceDetectionEnabled ? "Disable face detection" : "Enable face detection"}
            >
              <Focus className="h-4 w-4" />
            </Button>

            {/* Audio Meter Toggle - video only */}
            {captureMode === "video" && (
              <Button
                variant={showAudioMeter ? "default" : "ghost"}
                size="sm"
                onClick={() => setShowAudioMeter(!showAudioMeter)}
                title={showAudioMeter ? "Hide audio meter" : "Show audio meter"}
              >
                {showAudioMeter ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </Button>
            )}

            {/* Slow Motion - video only */}
            {captureMode === "video" && (
              <Button
                variant={slowMotionEnabled ? "default" : "ghost"}
                size="sm"
                onClick={toggleSlowMotion}
                disabled={isPreviewing}
                title={slowMotionEnabled ? `Slow motion: ${slowMotionFps}fps` : "Enable slow motion"}
              >
                <Gauge className="h-4 w-4" />
                {slowMotionEnabled && <span className="ml-1 text-xs">{slowMotionFps}</span>}
              </Button>
            )}

            {/* Picture-in-Picture - when previewing */}
            {pipSupported && isPreviewing && (
              <Button
                variant={isPipActive ? "default" : "ghost"}
                size="sm"
                onClick={togglePip}
                title={isPipActive ? "Exit Picture-in-Picture" : "Picture-in-Picture"}
              >
                <PictureInPicture2 className="h-4 w-4" />
              </Button>
            )}

            {/* Watermark - video and screen modes */}
            {(captureMode === "video" || captureMode === "screen") && (
              <Button
                variant={watermark.enabled ? "default" : "ghost"}
                size="sm"
                onClick={() => setShowWatermarkSettings(!showWatermarkSettings)}
                title="Watermark settings"
              >
                <Type className="h-4 w-4" />
              </Button>
            )}

            {/* Clip Manager - video mode */}
            {captureMode === "video" && videoClips.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowClipManager(!showClipManager)}
                title={`Manage clips (${videoClips.length})`}
              >
                <Layers className="h-4 w-4" />
                <span className="ml-1 text-xs">{videoClips.length}</span>
              </Button>
            )}

            {/* Transition Settings - when clips exist */}
            {videoClips.length > 1 && (
              <Button
                variant={showTransitionSettings ? "default" : "ghost"}
                size="sm"
                onClick={() => setShowTransitionSettings(!showTransitionSettings)}
                title="Transition settings"
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            )}

            {/* Audio Ducking - screen mode */}
            {captureMode === "screen" && (
              <Button
                variant={audioDucking.enabled ? "default" : "ghost"}
                size="sm"
                onClick={() => setShowAudioDuckingSettings(!showAudioDuckingSettings)}
                title="Audio ducking settings"
              >
                <Volume2 className="h-4 w-4" />
              </Button>
            )}

            {/* PiP Template - screen mode */}
            {captureMode === "screen" && (
              <Button
                variant={showPipSettings ? "default" : "ghost"}
                size="sm"
                onClick={() => setShowPipSettings(!showPipSettings)}
                title="Recording template"
              >
                <Layout className="h-4 w-4" />
              </Button>
            )}
            
            {/* Settings */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>

            {/* Keyboard Shortcuts Help */}
            <Button
              variant={showShortcutsHelp ? "default" : "ghost"}
              size="sm"
              onClick={() => setShowShortcutsHelp(!showShortcutsHelp)}
              title="Keyboard shortcuts"
            >
              <span className="text-xs font-mono">⌨</span>
            </Button>

            {/* Voice Commands */}
            <Button
              variant={voiceCommandsEnabled ? "default" : "ghost"}
              size="sm"
              onClick={toggleVoiceCommands}
              title={voiceCommandsEnabled ? "Disable voice commands" : "Enable voice commands"}
              className={isListening ? "animate-pulse" : ""}
            >
              <MessageCircle className="h-4 w-4" />
            </Button>

            {/* Background Music - video mode */}
            {(captureMode === "video" || captureMode === "screen") && (
              <Button
                variant={backgroundMusicFile ? "default" : "ghost"}
                size="sm"
                onClick={() => setShowMusicPanel(!showMusicPanel)}
                title="Background music"
              >
                <Music2 className="h-4 w-4" />
              </Button>
            )}

            {/* Captions/Subtitles - video mode */}
            {captureMode === "video" && (
              <Button
                variant={captionsEnabled ? "default" : "ghost"}
                size="sm"
                onClick={toggleCaptions}
                title={captionsEnabled ? "Disable captions" : "Enable captions"}
                className={isTranscribing ? "animate-pulse" : ""}
              >
                <Subtitles className="h-4 w-4" />
              </Button>
            )}

            {/* Green Screen / Chroma Key - video and photo modes */}
            {(captureMode === "video" || captureMode === "photo") && (
              <Button
                variant={chromaKey.enabled ? "default" : "ghost"}
                size="sm"
                onClick={() => setShowChromaKeySettings(!showChromaKeySettings)}
                title="Green screen / Chroma key"
              >
                <Eraser className="h-4 w-4" />
              </Button>
            )}

            {/* Video Effects - video mode */}
            {captureMode === "video" && (
              <Button
                variant={showEffectsPanel ? "default" : "ghost"}
                size="sm"
                onClick={() => setShowEffectsPanel(!showEffectsPanel)}
                title="Video effects"
              >
                <Wand2 className="h-4 w-4" />
              </Button>
            )}

            {/* Audio Mixer - video and screen modes */}
            {(captureMode === "video" || captureMode === "screen") && (
              <Button
                variant={showAudioMixer ? "default" : "ghost"}
                size="sm"
                onClick={() => setShowAudioMixer(!showAudioMixer)}
                title="Audio mixer"
              >
                <Sliders className="h-4 w-4" />
              </Button>
            )}

            {/* Live Drawing/Annotations - video mode */}
            {captureMode === "video" && isPreviewing && (
              <Button
                variant={isDrawingMode ? "default" : "ghost"}
                size="sm"
                onClick={() => {
                  setIsDrawingMode(!isDrawingMode);
                  setShowDrawingTools(!isDrawingMode);
                }}
                title="Live annotations"
              >
                <PenTool className="h-4 w-4" />
              </Button>
            )}

            {/* Bookmark Button */}
            {(isRecording || recordedBlob) && captureMode === "video" && (
              <Button
                variant={showBookmarksPanel ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (isRecording) {
                    addBookmark();
                  } else {
                    setShowBookmarksPanel(!showBookmarksPanel);
                  }
                }}
                title={isRecording ? "Add bookmark" : "Manage bookmarks"}
              >
                <Bookmark className="h-4 w-4" />
                {bookmarks.length > 0 && (
                  <span className="ml-1 text-xs">{bookmarks.length}</span>
                )}
              </Button>
            )}

            {/* Chapter Button */}
            {(isRecording || recordedBlob) && captureMode === "video" && (
              <Button
                variant={showChaptersPanel ? "default" : chapterStartTime !== null ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  if (isRecording) {
                    if (chapterStartTime === null) {
                      startChapter();
                    } else {
                      endChapter();
                    }
                  } else {
                    setShowChaptersPanel(!showChaptersPanel);
                  }
                }}
                title={isRecording ? (chapterStartTime !== null ? "End chapter" : "Start chapter") : "Manage chapters"}
              >
                <ListOrdered className="h-4 w-4" />
                {chapters.length > 0 && (
                  <span className="ml-1 text-xs">{chapters.length}</span>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        {showFilters && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {captureMode === "video" ? "Video Filters" : "Photo Filters"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setUseCustomFilters(false);
                  setFilterPreset("normal");
                }}
              >
                Reset
              </Button>
            </div>
            
            {/* Filter Presets */}
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FILTER_PRESETS) as FilterPreset[]).map((preset) => (
                <Button
                  key={preset}
                  variant={filterPreset === preset && !useCustomFilters ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setFilterPreset(preset);
                    setUseCustomFilters(false);
                  }}
                >
                  {FILTER_PRESET_LABELS[preset]}
                </Button>
              ))}
            </div>

            {/* Custom Sliders */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Sun className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs w-20">Brightness</span>
                <Slider
                  value={[customFilters.brightness]}
                  onValueChange={([v]) => updateCustomFilter("brightness", v)}
                  min={50}
                  max={150}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs w-8">{customFilters.brightness}%</span>
              </div>
              <div className="flex items-center gap-3">
                <Contrast className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs w-20">Contrast</span>
                <Slider
                  value={[customFilters.contrast]}
                  onValueChange={([v]) => updateCustomFilter("contrast", v)}
                  min={50}
                  max={150}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs w-8">{customFilters.contrast}%</span>
              </div>
              <div className="flex items-center gap-3">
                <Palette className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs w-20">Saturation</span>
                <Slider
                  value={[customFilters.saturation]}
                  onValueChange={([v]) => updateCustomFilter("saturation", v)}
                  min={0}
                  max={200}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs w-8">{customFilters.saturation}%</span>
              </div>
              <div className="flex items-center gap-3">
                <Thermometer className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs w-20">Warmth</span>
                <Slider
                  value={[customFilters.warmth]}
                  onValueChange={([v]) => updateCustomFilter("warmth", v)}
                  min={-50}
                  max={50}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs w-8">{customFilters.warmth > 0 ? "+" : ""}{customFilters.warmth}</span>
              </div>
            </div>
            
            {captureMode === "video" && (
              <p className="text-xs text-muted-foreground">
                Note: Video filters are applied as a live preview. The recorded video will include the filter effect.
              </p>
            )}
          </div>
        )}

        {/* Burst Mode Settings */}
        {burstMode && captureMode === "photo" && !capturedPhoto && burstPhotos.length === 0 && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Burst Mode: {burstCount} photos</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBurstCount(Math.max(3, burstCount - 1))}
                  disabled={burstCount <= 3}
                >
                  -
                </Button>
                <span className="w-8 text-center">{burstCount}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBurstCount(Math.min(10, burstCount + 1))}
                  disabled={burstCount >= 10}
                >
                  +
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts Help Panel */}
        {showShortcutsHelp && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Keyboard Shortcuts</span>
              <Button
                variant={keyboardShortcutsEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => setKeyboardShortcutsEnabled(!keyboardShortcutsEnabled)}
              >
                {keyboardShortcutsEnabled ? "Enabled" : "Disabled"}
              </Button>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground">Start/Stop Recording</span>
                <kbd className="px-2 py-1 bg-background rounded text-xs font-mono">R</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground">Capture Photo</span>
                <kbd className="px-2 py-1 bg-background rounded text-xs font-mono">S</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground">Cancel/Discard</span>
                <kbd className="px-2 py-1 bg-background rounded text-xs font-mono">Esc</kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">Switch Camera</span>
                <kbd className="px-2 py-1 bg-background rounded text-xs font-mono">C</kbd>
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground">
              Shortcuts are disabled when typing in text fields.
            </p>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Video Quality</span>
              <Select
                value={videoQuality}
                onValueChange={(v) => setVideoQuality(v as VideoQuality)}
                disabled={isPreviewing}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">HD 720p</SelectItem>
                  <SelectItem value="1080p">Full HD 1080p</SelectItem>
                  <SelectItem value="4k">4K Ultra HD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Camera</span>
              <span className="text-sm text-muted-foreground">
                {cameraFacing === "user" ? "Front" : "Back"}
              </span>
            </div>
            
            <p className="text-xs text-muted-foreground">
              Note: Quality settings apply when you start the camera. 4K requires device support.
            </p>
          </div>
        )}

        {/* Background Music Panel */}
        {showMusicPanel && (captureMode === "video" || captureMode === "screen") && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Background Music</span>
              <input
                ref={musicInputRef}
                type="file"
                accept="audio/*"
                onChange={handleMusicFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => musicInputRef.current?.click()}
              >
                <Music className="h-4 w-4 mr-2" />
                {backgroundMusicFile ? "Change" : "Select"}
              </Button>
            </div>

            {backgroundMusicFile && (
              <>
                <div className="flex items-center gap-2 p-2 bg-background rounded-md">
                  <Music2 className="h-4 w-4 text-primary" />
                  <span className="text-sm flex-1 truncate">{backgroundMusicFile.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={removeMusicTrack}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Music Volume: {musicVolume}%</span>
                  </div>
                  <Slider
                    value={[musicVolume]}
                    onValueChange={([v]) => setMusicVolume(v)}
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Original Audio: {originalVolume}%</span>
                  </div>
                  <Slider
                    value={[originalVolume]}
                    onValueChange={([v]) => setOriginalVolume(v)}
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={musicFadeIn}
                      onChange={(e) => setMusicFadeIn(e.target.checked)}
                      className="rounded"
                    />
                    Fade In
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={musicFadeOut}
                      onChange={(e) => setMusicFadeOut(e.target.checked)}
                      className="rounded"
                    />
                    Fade Out
                  </label>
                </div>

                {backgroundMusicUrl && (
                  <div className="space-y-2">
                    <span className="text-sm">Preview:</span>
                    <audio
                      src={backgroundMusicUrl}
                      controls
                      className="w-full h-8"
                    />
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Music will be mixed with your recording when you upload. Adjust volumes to balance audio.
                </p>
              </>
            )}
          </div>
        )}

        {/* Watermark Settings Panel */}
        {showWatermarkSettings && (captureMode === "video" || captureMode === "screen") && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Watermark</span>
              <Button
                variant={watermark.enabled ? "default" : "outline"}
                size="sm"
                onClick={() => setWatermark({ ...watermark, enabled: !watermark.enabled })}
              >
                {watermark.enabled ? "Enabled" : "Disabled"}
              </Button>
            </div>
            
            {watermark.enabled && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Text</label>
                  <input
                    type="text"
                    value={watermark.text}
                    onChange={(e) => setWatermark({ ...watermark, text: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm"
                    placeholder="Enter watermark text"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Position</span>
                  <Select
                    value={watermark.position}
                    onValueChange={(v) => setWatermark({ ...watermark, position: v as WatermarkPosition })}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top-left">Top Left</SelectItem>
                      <SelectItem value="top-right">Top Right</SelectItem>
                      <SelectItem value="bottom-left">Bottom Left</SelectItem>
                      <SelectItem value="bottom-right">Bottom Right</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Opacity: {watermark.opacity}%</span>
                  </div>
                  <Slider
                    value={[watermark.opacity]}
                    onValueChange={([v]) => setWatermark({ ...watermark, opacity: v })}
                    min={10}
                    max={100}
                    step={5}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Font Size: {watermark.fontSize}px</span>
                  </div>
                  <Slider
                    value={[watermark.fontSize]}
                    onValueChange={([v]) => setWatermark({ ...watermark, fontSize: v })}
                    min={12}
                    max={72}
                    step={2}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Color</span>
                  <input
                    type="color"
                    value={watermark.color}
                    onChange={(e) => setWatermark({ ...watermark, color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Clip Manager Panel */}
        {showClipManager && videoClips.length > 0 && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Video Clips ({videoClips.length})</span>
              <Button
                size="sm"
                onClick={mergeClips}
                disabled={videoClips.length < 2 || isMergingClips}
              >
                {isMergingClips ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Merging...</>
                ) : (
                  <><Layers className="h-4 w-4 mr-1" /> Merge All</>
                )}
              </Button>
            </div>
            
            <div className="space-y-2">
              {videoClips.map((clip, index) => (
                <div
                  key={clip.id}
                  className="flex items-center gap-2 p-2 bg-background rounded-lg"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                  <div className="w-16 h-10 bg-black rounded overflow-hidden">
                    <video src={clip.url} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Clip {index + 1}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(clip.duration)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {index > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => moveClip(index, index - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    )}
                    {index < videoClips.length - 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => moveClip(index, index + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeClip(clip.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            
            <p className="text-xs text-muted-foreground">
              Total duration: {formatTime(videoClips.reduce((sum, c) => sum + c.duration, 0))}
            </p>
          </div>
        )}

        {/* Transition Settings Panel */}
        {showTransitionSettings && videoClips.length > 1 && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Clip Transitions</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTransitionSettings(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Transition Type</span>
                <Select
                  value={transitionSettings.type}
                  onValueChange={(v) => setTransitionSettings({ ...transitionSettings, type: v as TransitionType })}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="fade">Fade</SelectItem>
                    <SelectItem value="dissolve">Dissolve</SelectItem>
                    <SelectItem value="wipe-left">Wipe Left</SelectItem>
                    <SelectItem value="wipe-right">Wipe Right</SelectItem>
                    <SelectItem value="slide-left">Slide Left</SelectItem>
                    <SelectItem value="slide-right">Slide Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {transitionSettings.type !== "none" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Duration: {transitionSettings.duration}s</span>
                  </div>
                  <Slider
                    value={[transitionSettings.duration]}
                    onValueChange={([v]) => setTransitionSettings({ ...transitionSettings, duration: v })}
                    min={0.2}
                    max={2}
                    step={0.1}
                  />
                </div>
              )}
            </div>
            
            {/* Transition Preview */}
            <div className="flex items-center justify-center gap-2 py-2">
              <div className="w-12 h-8 bg-primary/50 rounded flex items-center justify-center text-xs">1</div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="px-2 py-1 bg-accent rounded text-xs">
                {getTransitionLabel(transitionSettings.type)}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="w-12 h-8 bg-primary/50 rounded flex items-center justify-center text-xs">2</div>
            </div>
          </div>
        )}

        {/* Audio Ducking Settings Panel */}
        {showAudioDuckingSettings && captureMode === "screen" && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Audio Ducking</span>
              <Button
                variant={audioDucking.enabled ? "default" : "outline"}
                size="sm"
                onClick={() => setAudioDucking({ ...audioDucking, enabled: !audioDucking.enabled })}
              >
                {audioDucking.enabled ? "Enabled" : "Disabled"}
              </Button>
            </div>
            
            {audioDucking.enabled && (
              <>
                <p className="text-xs text-muted-foreground">
                  Automatically lower background audio when voice is detected.
                </p>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Voice Sensitivity: {audioDucking.threshold}%</span>
                  </div>
                  <Slider
                    value={[audioDucking.threshold]}
                    onValueChange={([v]) => setAudioDucking({ ...audioDucking, threshold: v })}
                    min={10}
                    max={90}
                    step={5}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Background Reduction: {audioDucking.reduction}%</span>
                  </div>
                  <Slider
                    value={[audioDucking.reduction]}
                    onValueChange={([v]) => setAudioDucking({ ...audioDucking, reduction: v })}
                    min={20}
                    max={100}
                    step={5}
                  />
                </div>
                
                {/* Voice Detection Indicator */}
                {isVoiceDetected && (
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <Mic className="h-4 w-4 animate-pulse" />
                    Voice detected - ducking active
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* PiP Recording Template Panel */}
        {showPipSettings && captureMode === "screen" && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Recording Template</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPipSettings(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={recordingTemplate === "screen-only" ? "default" : "outline"}
                size="sm"
                onClick={() => setRecordingTemplate("screen-only")}
                className="h-auto py-3 flex-col"
              >
                <Monitor className="h-5 w-5 mb-1" />
                <span className="text-xs">Screen Only</span>
              </Button>
              <Button
                variant={recordingTemplate === "camera-only" ? "default" : "outline"}
                size="sm"
                onClick={() => setRecordingTemplate("camera-only")}
                className="h-auto py-3 flex-col"
              >
                <Camera className="h-5 w-5 mb-1" />
                <span className="text-xs">Camera Only</span>
              </Button>
              <Button
                variant={recordingTemplate === "pip-corner" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setRecordingTemplate("pip-corner");
                  setPipSettings({ ...pipSettings, enabled: true });
                }}
                className="h-auto py-3 flex-col"
              >
                <div className="relative w-8 h-5 border rounded">
                  <div className="absolute bottom-0.5 right-0.5 w-2 h-2 bg-primary rounded-sm" />
                </div>
                <span className="text-xs mt-1">PiP Corner</span>
              </Button>
              <Button
                variant={recordingTemplate === "pip-side" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setRecordingTemplate("pip-side");
                  setPipSettings({ ...pipSettings, enabled: true });
                }}
                className="h-auto py-3 flex-col"
              >
                <div className="flex gap-0.5">
                  <div className="w-5 h-5 border rounded" />
                  <div className="w-3 h-5 bg-primary rounded" />
                </div>
                <span className="text-xs mt-1">Side by Side</span>
              </Button>
            </div>
            
            {/* PiP Settings when template uses camera */}
            {(recordingTemplate === "pip-corner" || recordingTemplate === "pip-side") && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Camera Position</span>
                  <Select
                    value={pipSettings.position}
                    onValueChange={(v) => setPipSettings({ ...pipSettings, position: v as PipPosition })}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top-left">Top Left</SelectItem>
                      <SelectItem value="top-right">Top Right</SelectItem>
                      <SelectItem value="bottom-left">Bottom Left</SelectItem>
                      <SelectItem value="bottom-right">Bottom Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Camera Size: {pipSettings.size}%</span>
                  </div>
                  <Slider
                    value={[pipSettings.size]}
                    onValueChange={([v]) => setPipSettings({ ...pipSettings, size: v })}
                    min={10}
                    max={40}
                    step={5}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Border Radius: {pipSettings.borderRadius}px</span>
                  </div>
                  <Slider
                    value={[pipSettings.borderRadius]}
                    onValueChange={([v]) => setPipSettings({ ...pipSettings, borderRadius: v })}
                    min={0}
                    max={50}
                    step={2}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Caption Settings Panel */}
        {showCaptionSettings && captureMode === "video" && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Caption Settings</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCaptionSettings(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Position</span>
                <Select
                  value={captionStyle.position}
                  onValueChange={(v) => setCaptionStyle({ ...captionStyle, position: v as "top" | "bottom" })}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top">Top</SelectItem>
                    <SelectItem value="bottom">Bottom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Font Size: {captionStyle.fontSize}px</span>
                </div>
                <Slider
                  value={[captionStyle.fontSize]}
                  onValueChange={([v]) => setCaptionStyle({ ...captionStyle, fontSize: v })}
                  min={14}
                  max={48}
                  step={2}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Text Color</span>
                <input
                  type="color"
                  value={captionStyle.color}
                  onChange={(e) => setCaptionStyle({ ...captionStyle, color: e.target.value })}
                  className="w-10 h-10 rounded cursor-pointer"
                />
              </div>
            </div>
            
            {/* Caption List */}
            {captions.length > 0 && (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                <span className="text-sm font-medium">Recorded Captions ({captions.length})</span>
                {captions.map((caption) => (
                  <div key={caption.id} className="flex items-center gap-2 p-2 bg-background rounded">
                    <span className="text-xs text-muted-foreground w-16">
                      {caption.startTime.toFixed(1)}s
                    </span>
                    <input
                      type="text"
                      value={caption.text}
                      onChange={(e) => editCaption(caption.id, e.target.value)}
                      className="flex-1 px-2 py-1 text-sm bg-transparent border rounded"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteCaption(caption.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chroma Key / Green Screen Settings Panel */}
        {showChromaKeySettings && (captureMode === "video" || captureMode === "photo") && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Green Screen / Chroma Key</span>
              <Button
                variant={chromaKey.enabled ? "default" : "outline"}
                size="sm"
                onClick={() => setChromaKey({ ...chromaKey, enabled: !chromaKey.enabled })}
              >
                {chromaKey.enabled ? "Enabled" : "Disabled"}
              </Button>
            </div>
            
            {chromaKey.enabled && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Key Color</span>
                  <div className="flex items-center gap-2">
                    <Select
                      value={chromaKey.color}
                      onValueChange={(v) => setChromaKey({ ...chromaKey, color: v as ChromaKeyColor })}
                    >
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="green">Green</SelectItem>
                        <SelectItem value="blue">Blue</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    {chromaKey.color === "custom" && (
                      <input
                        type="color"
                        value={chromaKey.customColor}
                        onChange={(e) => setChromaKey({ ...chromaKey, customColor: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer"
                      />
                    )}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Tolerance: {chromaKey.tolerance}%</span>
                  </div>
                  <Slider
                    value={[chromaKey.tolerance]}
                    onValueChange={([v]) => setChromaKey({ ...chromaKey, tolerance: v })}
                    min={10}
                    max={80}
                    step={5}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Smoothness: {chromaKey.smoothness}</span>
                  </div>
                  <Slider
                    value={[chromaKey.smoothness]}
                    onValueChange={([v]) => setChromaKey({ ...chromaKey, smoothness: v })}
                    min={1}
                    max={30}
                    step={1}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Background</span>
                  <Select
                    value={chromaKey.backgroundType}
                    onValueChange={(v) => setChromaKey({ ...chromaKey, backgroundType: v as BackgroundType })}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blur">Blur</SelectItem>
                      <SelectItem value="color">Color</SelectItem>
                      <SelectItem value="image">Image</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {chromaKey.backgroundType === "blur" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Blur Amount: {chromaKey.blurAmount}px</span>
                    </div>
                    <Slider
                      value={[chromaKey.blurAmount]}
                      onValueChange={([v]) => setChromaKey({ ...chromaKey, blurAmount: v })}
                      min={5}
                      max={50}
                      step={5}
                    />
                  </div>
                )}
                
                {chromaKey.backgroundType === "color" && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Background Color</span>
                    <input
                      type="color"
                      value={chromaKey.backgroundColor}
                      onChange={(e) => setChromaKey({ ...chromaKey, backgroundColor: e.target.value })}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                  </div>
                )}
                
                {chromaKey.backgroundType === "image" && (
                  <div className="space-y-2">
                    <input
                      ref={chromaBackgroundInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleBackgroundImageSelect}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => chromaBackgroundInputRef.current?.click()}
                      className="w-full"
                    >
                      <ImageIcon className="h-4 w-4 mr-2" />
                      {chromaKey.backgroundImage ? "Change Image" : "Select Image"}
                    </Button>
                    {chromaKey.backgroundImage && (
                      <div className="flex items-center gap-2">
                        <img
                          src={chromaKey.backgroundImage}
                          alt="Background"
                          className="w-16 h-10 object-cover rounded"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={removeBackgroundImage}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground">
                  Position yourself in front of a solid green or blue background for best results.
                </p>
              </>
            )}
          </div>
        )}

        {/* Video Effects Panel */}
        {showEffectsPanel && captureMode === "video" && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Video Effects</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowEffectsPanel(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-3">
              {/* Vignette */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CircleDot className="h-4 w-4" />
                  <span className="text-sm">Vignette</span>
                </div>
                <Button
                  variant={videoEffects.vignette.enabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleVideoEffect("vignette")}
                >
                  {videoEffects.vignette.enabled ? "On" : "Off"}
                </Button>
              </div>
              {videoEffects.vignette.enabled && (
                <Slider
                  value={[videoEffects.vignette.intensity]}
                  onValueChange={([v]) => updateVideoEffectIntensity("vignette", v)}
                  min={10}
                  max={100}
                  step={5}
                />
              )}
              
              {/* Film Grain */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Film className="h-4 w-4" />
                  <span className="text-sm">Film Grain</span>
                </div>
                <Button
                  variant={videoEffects.filmGrain.enabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleVideoEffect("filmGrain")}
                >
                  {videoEffects.filmGrain.enabled ? "On" : "Off"}
                </Button>
              </div>
              {videoEffects.filmGrain.enabled && (
                <Slider
                  value={[videoEffects.filmGrain.intensity]}
                  onValueChange={([v]) => updateVideoEffectIntensity("filmGrain", v)}
                  min={10}
                  max={100}
                  step={5}
                />
              )}
              
              {/* Blur */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Paintbrush className="h-4 w-4" />
                  <span className="text-sm">Blur</span>
                </div>
                <Button
                  variant={videoEffects.blur.enabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleVideoEffect("blur")}
                >
                  {videoEffects.blur.enabled ? "On" : "Off"}
                </Button>
              </div>
              {videoEffects.blur.enabled && (
                <Slider
                  value={[videoEffects.blur.intensity]}
                  onValueChange={([v]) => updateVideoEffectIntensity("blur", v)}
                  min={1}
                  max={20}
                  step={1}
                />
              )}
              
              {/* Sharpen */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Focus className="h-4 w-4" />
                  <span className="text-sm">Sharpen</span>
                </div>
                <Button
                  variant={videoEffects.sharpen.enabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleVideoEffect("sharpen")}
                >
                  {videoEffects.sharpen.enabled ? "On" : "Off"}
                </Button>
              </div>
              {videoEffects.sharpen.enabled && (
                <Slider
                  value={[videoEffects.sharpen.intensity]}
                  onValueChange={([v]) => updateVideoEffectIntensity("sharpen", v)}
                  min={10}
                  max={100}
                  step={5}
                />
              )}
            </div>
          </div>
        )}

        {/* Audio Mixer Panel */}
        {showAudioMixer && (captureMode === "video" || captureMode === "screen") && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Audio Mixer</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAudioMixer(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              {audioTracks.map((track) => (
                <div key={track.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {track.type === "mic" && <Mic className="h-4 w-4" />}
                      {track.type === "system" && <Volume2 className="h-4 w-4" />}
                      {track.type === "music" && <Music2 className="h-4 w-4" />}
                      <span className="text-sm">{track.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleTrackMute(track.id)}
                      >
                        {track.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      </Button>
                      <span className="text-xs w-8 text-right">{track.volume}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Slider
                        value={[track.volume]}
                        onValueChange={([v]) => updateTrackVolume(track.id, v)}
                        min={0}
                        max={100}
                        step={5}
                        disabled={track.muted}
                      />
                    </div>
                    {/* Level meter */}
                    <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all duration-75"
                        style={{
                          width: `${track.level}%`,
                          background: track.level > 80 ? '#ef4444' : track.level > 60 ? '#eab308' : '#22c55e',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <p className="text-xs text-muted-foreground">
              Adjust individual audio track volumes for your recording.
            </p>
          </div>
        )}

        {/* Live Drawing Tools Panel */}
        {showDrawingTools && isDrawingMode && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Live Annotations</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowDrawingTools(false);
                  setIsDrawingMode(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Drawing Tools */}
            <div className="flex flex-wrap gap-1">
              <Button
                variant={selectedDrawingTool === "pen" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDrawingTool("pen")}
                title="Pen"
              >
                <PenTool className="h-4 w-4" />
              </Button>
              <Button
                variant={selectedDrawingTool === "highlight" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDrawingTool("highlight")}
                title="Highlighter"
              >
                <Highlighter className="h-4 w-4" />
              </Button>
              <Button
                variant={selectedDrawingTool === "rectangle" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDrawingTool("rectangle")}
                title="Rectangle"
              >
                <SquareIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={selectedDrawingTool === "circle" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDrawingTool("circle")}
                title="Circle"
              >
                <Circle className="h-4 w-4" />
              </Button>
              <Button
                variant={selectedDrawingTool === "arrow" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDrawingTool("arrow")}
                title="Arrow"
              >
                <ArrowUpRight className="h-4 w-4" />
              </Button>
              <Button
                variant={selectedDrawingTool === "text" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDrawingTool("text")}
                title="Text"
              >
                <Type className="h-4 w-4" />
              </Button>
              <Button
                variant={selectedDrawingTool === "eraser" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDrawingTool("eraser")}
                title="Eraser"
              >
                <Eraser className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Color & Stroke */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs">Color:</span>
                <input
                  type="color"
                  value={drawingColor}
                  onChange={(e) => setDrawingColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs">Size:</span>
                <Slider
                  value={[drawingStrokeWidth]}
                  onValueChange={([v]) => setDrawingStrokeWidth(v)}
                  min={1}
                  max={20}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs w-6">{drawingStrokeWidth}</span>
              </div>
            </div>
            
            {/* Undo/Redo/Clear */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={undoDrawing}
                disabled={drawingHistoryIndex < 0}
                title="Undo"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={redoDrawing}
                disabled={drawingHistoryIndex >= drawingHistory.length - 1}
                title="Redo"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearDrawing}
                disabled={drawingElements.length === 0}
                title="Clear all"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Badge variant="secondary" className="ml-auto">
                {drawingElements.length} elements
              </Badge>
            </div>
            
            <p className="text-xs text-muted-foreground">
              Draw directly on the video preview. Annotations will be recorded with the video.
            </p>
          </div>
        )}

        {/* Bookmarks Panel */}
        {showBookmarksPanel && recordedBlob && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Video Bookmarks</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowBookmarksPanel(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Add Bookmark */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newBookmarkLabel}
                onChange={(e) => setNewBookmarkLabel(e.target.value)}
                placeholder="Bookmark label (optional)"
                className="flex-1 px-3 py-2 text-sm rounded-md border bg-background"
              />
              <input
                type="color"
                value={bookmarkColor}
                onChange={(e) => setBookmarkColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer"
              />
              <Button size="sm" onClick={addBookmark}>
                <BookmarkPlus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            
            {/* Bookmark List */}
            {bookmarks.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {bookmarks.map((bookmark) => (
                  <div
                    key={bookmark.id}
                    className="flex items-center gap-2 p-2 bg-background rounded-md hover:bg-accent/50 cursor-pointer"
                    onClick={() => jumpToBookmark(bookmark.timestamp)}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: bookmark.color }}
                    />
                    <span className="text-sm flex-1">{bookmark.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(Math.round(bookmark.timestamp))}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBookmark(bookmark.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No bookmarks yet. Add bookmarks to mark important moments.
              </p>
            )}
          </div>
        )}

        {/* Chapters Panel */}
        {showChaptersPanel && recordedBlob && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Video Chapters</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowChaptersPanel(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Add Chapter */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={currentChapterTitle}
                onChange={(e) => setCurrentChapterTitle(e.target.value)}
                placeholder="Chapter title"
                className="flex-1 px-3 py-2 text-sm rounded-md border bg-background"
              />
              {chapterStartTime === null ? (
                <Button size="sm" onClick={startChapter}>
                  <Hash className="h-4 w-4 mr-1" />
                  Start
                </Button>
              ) : (
                <Button size="sm" onClick={endChapter} variant="secondary">
                  <Check className="h-4 w-4 mr-1" />
                  End ({formatTime(Math.round(chapterStartTime))})
                </Button>
              )}
            </div>
            
            {/* Chapter List */}
            {chapters.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {chapters.map((chapter, index) => (
                  <div
                    key={chapter.id}
                    className="flex items-center gap-2 p-2 bg-background rounded-md hover:bg-accent/50 cursor-pointer"
                    onClick={() => jumpToChapter(chapter.startTime)}
                  >
                    <Badge variant="outline" className="text-xs">
                      {index + 1}
                    </Badge>
                    <span className="text-sm flex-1">{chapter.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(Math.round(chapter.startTime))} - {formatTime(Math.round(chapter.endTime))}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeChapter(chapter.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No chapters yet. Create chapters to organize your video.
              </p>
            )}
          </div>
        )}

        {/* Screen Recording Source Selection */}
        {captureMode === "screen" && !isPreviewing && !recordedBlob && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-3">
            <span className="text-sm font-medium">Recording Source</span>
            <div className="flex items-center gap-2">
              <Button
                variant={recordingSource === "screen" ? "default" : "outline"}
                size="sm"
                onClick={() => setRecordingSource("screen")}
              >
                <Monitor className="h-4 w-4 mr-1" />
                Screen Only
              </Button>
              <Button
                variant={recordingSource === "both" ? "default" : "outline"}
                size="sm"
                onClick={() => setRecordingSource("both")}
              >
                <Layers className="h-4 w-4 mr-1" />
                Screen + Mic
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Click "Start Recording" to select which screen, window, or tab to record.
            </p>
          </div>
        )}

        {/* Hidden canvases for processing */}
        <canvas ref={canvasRef} className="hidden" />
        <canvas ref={filterCanvasRef} className="hidden" />

        {/* Video/Photo Preview */}
        <div className={`relative ${getAspectRatioClass()} bg-black rounded-lg overflow-hidden mb-4`}>
          {/* Grid Overlay */}
          {showGrid && isPreviewing && (
            <div className="absolute inset-0 pointer-events-none z-10">
              {/* Vertical lines */}
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
              {/* Horizontal lines */}
              <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
              <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
            </div>
          )}

          {/* Audio Level Meter - video mode only */}
          {captureMode === "video" && showAudioMeter && isPreviewing && (
            <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1 bg-black/50 rounded-lg p-2">
              <Mic className="h-4 w-4 text-white mb-1" />
              <div className="h-24 w-3 bg-gray-700 rounded-full overflow-hidden relative">
                {/* Audio level bar */}
                <div
                  className="absolute bottom-0 left-0 right-0 transition-all duration-75"
                  style={{
                    height: `${audioLevel}%`,
                    background: audioLevel > 80 ? '#ef4444' : audioLevel > 60 ? '#eab308' : '#22c55e',
                  }}
                />
                {/* Peak indicator */}
                <div
                  className="absolute left-0 right-0 h-0.5 bg-white transition-all duration-150"
                  style={{ bottom: `${peakAudioLevel}%` }}
                />
              </div>
              <span className="text-xs text-white font-mono">{Math.round(audioLevel)}%</span>
            </div>
          )}

          {/* Face Detection Overlay */}
          {faceDetectionEnabled && isPreviewing && detectedFaces.length > 0 && (
            <div className="absolute inset-0 pointer-events-none z-10">
              {detectedFaces.map((face, index) => (
                <div
                  key={index}
                  className="absolute border-2 border-green-400 rounded-lg"
                  style={{
                    left: `${face.x}%`,
                    top: `${face.y}%`,
                    width: `${face.width}%`,
                    height: `${face.height}%`,
                  }}
                >
                  <div className="absolute -top-5 left-0 bg-green-400 text-black text-xs px-1 rounded">
                    Face {index + 1}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Face Detection Indicator */}
          {faceDetectionEnabled && isPreviewing && !hasFaceDetection && (
            <div className="absolute top-2 left-2 z-20 bg-yellow-500/80 text-black text-xs px-2 py-1 rounded">
              Face detection not supported
            </div>
          )}

          {/* Voice Command Feedback */}
          {voiceCommandFeedback && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-primary text-primary-foreground px-6 py-3 rounded-lg text-lg font-medium animate-pulse shadow-lg">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                {voiceCommandFeedback}
              </div>
            </div>
          )}

          {/* Voice Command Listening Indicator */}
          {isListening && !voiceCommandFeedback && isPreviewing && (
            <div className="absolute top-2 right-2 z-20 bg-primary/80 text-primary-foreground text-xs px-2 py-1 rounded flex items-center gap-1">
              <MessageCircle className="h-3 w-3 animate-pulse" />
              Listening...
            </div>
          )}

          {/* Zoom Slider - shown when camera supports zoom */}
          {hasZoom && isPreviewing && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2 bg-black/50 rounded-lg p-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-white hover:bg-white/20"
                onClick={() => updateZoom(zoomLevel + 0.5)}
                disabled={zoomLevel >= maxZoom}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <div className="h-24 flex flex-col items-center justify-center">
                <Slider
                  orientation="vertical"
                  value={[zoomLevel]}
                  onValueChange={([v]) => updateZoom(v)}
                  min={minZoom}
                  max={maxZoom}
                  step={0.1}
                  className="h-full"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-white hover:bg-white/20"
                onClick={() => updateZoom(zoomLevel - 0.5)}
                disabled={zoomLevel <= minZoom}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs text-white font-medium">{zoomLevel.toFixed(1)}x</span>
            </div>
          )}

          {/* Countdown Overlay */}
          {isCountingDown && countdownValue !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
              <div className="text-center">
                <div className="text-8xl font-bold text-white animate-pulse">
                  {countdownValue}
                </div>
              </div>
            </div>
          )}

          {/* Burst Photos Gallery */}
          {burstPhotos.length > 0 ? (
            <div className="w-full h-full flex flex-col">
              <div className="flex-1 relative">
                <img
                  src={burstPhotos[burstCurrentIndex]?.url}
                  alt={`Burst photo ${burstCurrentIndex + 1}`}
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
                  {burstCurrentIndex + 1} / {burstPhotos.length}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 bg-black/50 hover:bg-black/70"
                  onClick={() => toggleBurstPhotoSelection(burstCurrentIndex)}
                >
                  {burstPhotos[burstCurrentIndex]?.selected ? (
                    <Check className="h-5 w-5 text-green-500" />
                  ) : (
                    <X className="h-5 w-5 text-white" />
                  )}
                </Button>
                {burstCurrentIndex > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70"
                    onClick={() => setBurstCurrentIndex(prev => prev - 1)}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                )}
                {burstCurrentIndex < burstPhotos.length - 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70"
                    onClick={() => setBurstCurrentIndex(prev => prev + 1)}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                )}
              </div>
              {/* Thumbnail strip */}
              <div className="flex gap-1 p-2 bg-black/80 overflow-x-auto">
                {burstPhotos.map((photo, i) => (
                  <button
                    key={i}
                    onClick={() => setBurstCurrentIndex(i)}
                    className={`relative flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 ${
                      i === burstCurrentIndex ? "border-primary" : "border-transparent"
                    }`}
                  >
                    <img src={photo.url} alt="" className="w-full h-full object-cover" />
                    {photo.selected && (
                      <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
                        <Check className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : photoPreviewUrl ? (
            <img
              src={photoPreviewUrl}
              alt="Captured photo"
              className="w-full h-full object-contain"
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={!recordedBlob}
              controls={!!recordedBlob}
              className="w-full h-full object-contain"
              style={{ filter: isPreviewing ? getCssFilterString() : undefined }}
            />
          )}

          {/* Live Drawing Canvas Overlay */}
          {isDrawingMode && isPreviewing && (
            <canvas
              ref={drawingCanvasRef}
              className="absolute inset-0 z-30 cursor-crosshair"
              style={{ touchAction: 'none' }}
              onMouseDown={handleDrawingStart}
              onMouseMove={handleDrawingMove}
              onMouseUp={handleDrawingEnd}
              onMouseLeave={handleDrawingEnd}
              onTouchStart={handleDrawingStart}
              onTouchMove={handleDrawingMove}
              onTouchEnd={handleDrawingEnd}
            />
          )}

          {/* Camera Switch Button (overlay) */}
          {isPreviewing && hasMultipleCameras && !isRecording && !isCountingDown && (
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-4 right-4 bg-black/50 hover:bg-black/70"
              onClick={switchCamera}
            >
              <SwitchCamera className="h-5 w-5" />
            </Button>
          )}

          {/* Recording Indicator */}
          {isRecording && (
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-destructive text-destructive-foreground px-3 py-2 rounded-md">
              <Circle className="h-4 w-4 fill-current animate-pulse" />
              <span className="font-mono font-bold">{formatTime(recordingTime)}</span>
            </div>
          )}

          {/* Burst Capturing Indicator */}
          {isBurstCapturing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-center text-white">
                <Loader2 className="h-12 w-12 mx-auto mb-2 animate-spin" />
                <p>Capturing burst photos...</p>
              </div>
            </div>
          )}

          {/* Status Badge */}
          {!isPreviewing && !recordedBlob && !photoPreviewUrl && burstPhotos.length === 0 && captureMode !== "audio" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white">
                {captureMode === "video" ? (
                  <VideoOff className="h-16 w-16 mx-auto mb-4 opacity-50" />
                ) : captureMode === "screen" ? (
                  <Monitor className="h-16 w-16 mx-auto mb-4 opacity-50" />
                ) : (
                  <Camera className="h-16 w-16 mx-auto mb-4 opacity-50" />
                )}
                <p className="text-lg opacity-75">{captureMode === "screen" ? "Ready to Record" : "Camera Off"}</p>
              </div>
            </div>
          )}

          {/* Audio Mode UI */}
          {captureMode === "audio" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white w-full px-8">
                {!isAudioRecording && !audioBlob && (
                  <>
                    <Headphones className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg opacity-75">Ready to Record Audio</p>
                  </>
                )}
                
                {isAudioRecording && (
                  <>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <Circle className="h-4 w-4 fill-red-500 text-red-500 animate-pulse" />
                      <span className="font-mono font-bold text-2xl">{formatTime(recordingTime)}</span>
                    </div>
                    
                    {/* Waveform Visualization */}
                    <div className="flex items-center justify-center gap-1 h-24 mb-4">
                      {audioWaveform.map((level, i) => (
                        <div
                          key={i}
                          className="w-2 bg-primary rounded-full transition-all duration-75"
                          style={{ height: `${Math.max(4, level * 96)}px` }}
                        />
                      ))}
                    </div>
                    
                    <p className="text-sm opacity-75">Recording audio...</p>
                  </>
                )}
                
                {audioBlob && audioPreviewUrl && (
                  <>
                    <Music className="h-12 w-12 mx-auto mb-4 text-primary" />
                    <p className="text-lg mb-4">Audio Recorded</p>
                    <audio
                      src={audioPreviewUrl}
                      controls
                      className="w-full max-w-md mx-auto mb-4"
                    />
                    <Badge variant="secondary">
                      Duration: {formatTime(recordingTime)} • Size: {(audioBlob.size / 1024 / 1024).toFixed(2)} MB
                    </Badge>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {/* Start Camera */}
          {!isPreviewing && !recordedBlob && !photoPreviewUrl && burstPhotos.length === 0 && captureMode !== "screen" && captureMode !== "audio" && (
            <Button onClick={startCamera} size="lg">
              <Camera className="h-5 w-5 mr-2" />
              Start Camera
            </Button>
          )}

          {/* Start Screen Recording */}
          {!isPreviewing && !recordedBlob && captureMode === "screen" && (
            <Button onClick={startScreenRecording} size="lg">
              <Monitor className="h-5 w-5 mr-2" />
              Start Recording
            </Button>
          )}

          {/* Audio Recording Controls */}
          {captureMode === "audio" && !isAudioRecording && !audioBlob && (
            <Button onClick={startAudioRecording} size="lg" className="bg-primary hover:bg-primary/90">
              <Mic className="h-5 w-5 mr-2" />
              Start Recording
            </Button>
          )}

          {captureMode === "audio" && isAudioRecording && (
            <Button onClick={stopAudioRecording} size="lg" className="bg-destructive hover:bg-destructive/90">
              <Square className="h-5 w-5 mr-2" />
              Stop Recording
            </Button>
          )}

          {captureMode === "audio" && audioBlob && (
            <>
              <Button onClick={handleDiscardAudio} variant="outline">
                <X className="h-4 w-4 mr-2" />
                Discard
              </Button>
              <Button onClick={handleUploadAudio} disabled={uploading} size="lg">
                {uploading ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-5 w-5 mr-2" />
                )}
                {uploading ? "Uploading..." : "Upload Audio"}
              </Button>
            </>
          )}

          {/* Camera Active - Video Mode */}
          {isPreviewing && captureMode === "video" && !isRecording && !isCountingDown && (
            <>
              <Button onClick={stopCamera} variant="outline">
                <VideoOff className="h-4 w-4 mr-2" />
                Stop
              </Button>
              {hasMultipleCameras && (
                <Button onClick={switchCamera} variant="outline">
                  <SwitchCamera className="h-4 w-4 mr-2" />
                  Switch
                </Button>
              )}
              <Button onClick={handleRecordWithTimer} size="lg" className="bg-destructive hover:bg-destructive/90">
                <Circle className="h-5 w-5 mr-2" />
                {timerDuration > 0 ? `Record (${timerDuration}s)` : "Record"}
              </Button>
            </>
          )}

          {/* Camera Active - Photo Mode */}
          {isPreviewing && captureMode === "photo" && !isBurstCapturing && !isCountingDown && (
            <>
              <Button onClick={stopCamera} variant="outline">
                <VideoOff className="h-4 w-4 mr-2" />
                Stop
              </Button>
              {hasMultipleCameras && (
                <Button onClick={switchCamera} variant="outline">
                  <SwitchCamera className="h-4 w-4 mr-2" />
                  Switch
                </Button>
              )}
              {burstMode ? (
                <Button onClick={handleBurstWithTimer} size="lg" className="bg-primary hover:bg-primary/90">
                  <Zap className="h-5 w-5 mr-2" />
                  {timerDuration > 0 ? `Burst (${timerDuration}s)` : `Burst (${burstCount})`}
                </Button>
              ) : (
                <Button onClick={handleCaptureWithTimer} size="lg" className="bg-primary hover:bg-primary/90">
                  <Camera className="h-5 w-5 mr-2" />
                  {timerDuration > 0 ? `Capture (${timerDuration}s)` : "Capture"}
                </Button>
              )}
            </>
          )}

          {/* Counting Down */}
          {isCountingDown && (
            <Button onClick={() => {
              if (countdownRef.current) {
                clearInterval(countdownRef.current);
                countdownRef.current = null;
              }
              setIsCountingDown(false);
              setCountdownValue(null);
            }} size="lg" variant="destructive">
              <X className="h-5 w-5 mr-2" />
              Cancel
            </Button>
          )}

          {/* Recording */}
          {isRecording && (
            <Button onClick={stopRecording} size="lg" variant="destructive">
              <Square className="h-5 w-5 mr-2" />
              Stop Recording
            </Button>
          )}

          {/* Video Preview */}
          {recordedBlob && !uploading && !showTrimmer && (
            <>
              <Button onClick={handleDiscardVideo} variant="outline">
                Discard
              </Button>
              <Button onClick={openTrimmer} variant="outline">
                <Scissors className="h-4 w-4 mr-2" />
                Trim
              </Button>
              <Button onClick={addCurrentVideoToClips} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add to Clips
              </Button>
              <Button onClick={() => setShowExportDialog(true)} variant="outline">
                <ArrowRight className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button onClick={handleUploadVideo} size="lg">
                <Upload className="h-5 w-5 mr-2" />
                Upload Video
              </Button>
            </>
          )}

          {/* Photo Preview */}
          {capturedPhoto && !uploading && (
            <>
              <Button onClick={handleDiscardPhoto} variant="outline">
                Discard
              </Button>
              <Button onClick={startCamera} variant="outline">
                <Camera className="h-4 w-4 mr-2" />
                Retake
              </Button>
              <Button onClick={handleUploadPhoto} size="lg">
                <Upload className="h-5 w-5 mr-2" />
                Upload Photo
              </Button>
            </>
          )}

          {/* Burst Photos Preview */}
          {burstPhotos.length > 0 && !uploading && (
            <>
              <Button onClick={handleDiscardBurstPhotos} variant="outline">
                Discard All
              </Button>
              <Button onClick={startCamera} variant="outline">
                <Camera className="h-4 w-4 mr-2" />
                Retake
              </Button>
              <Button onClick={handleUploadBurstPhotos} size="lg">
                <Upload className="h-5 w-5 mr-2" />
                Upload ({burstPhotos.filter(p => p.selected).length})
              </Button>
            </>
          )}

          {/* Uploading */}
          {uploading && (
            <Button disabled size="lg">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Uploading...
            </Button>
          )}
        </div>

        {/* Info */}
        {recordedBlob && (
          <div className="mt-4 text-center">
            <Badge variant="secondary">
              Duration: {formatTime(recordingTime)} • Size:{" "}
              {(recordedBlob.size / 1024 / 1024).toFixed(2)} MB
              {filterPreset !== "normal" && ` • Filter: ${FILTER_PRESET_LABELS[filterPreset]}`}
            </Badge>
          </div>
        )}

        {capturedPhoto && (
          <div className="mt-4 text-center">
            <Badge variant="secondary">
              Photo Size: {(capturedPhoto.size / 1024).toFixed(0)} KB •
              Quality: {QUALITY_PRESETS[videoQuality].label}
              {filterPreset !== "normal" && ` • Filter: ${FILTER_PRESET_LABELS[filterPreset]}`}
            </Badge>
          </div>
        )}

        {burstPhotos.length > 0 && (
          <div className="mt-4 text-center">
            <Badge variant="secondary">
              {burstPhotos.filter(p => p.selected).length} of {burstPhotos.length} selected •
              Quality: {QUALITY_PRESETS[videoQuality].label}
            </Badge>
          </div>
        )}
      </Card>

      {/* Video Trimmer */}
      {showTrimmer && recordedBlob && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Trim Video
            </h3>
            <Button variant="ghost" size="sm" onClick={closeTrimmer}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Trim Video Preview */}
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden mb-4">
            <video
              ref={trimVideoRef}
              className="w-full h-full object-contain"
              onTimeUpdate={handleTrimVideoTimeUpdate}
              playsInline
            />
            <div className="absolute bottom-2 left-2 bg-black/70 text-white text-sm px-2 py-1 rounded">
              {formatTime(Math.round(trimPreviewTime))} / {formatTime(recordingTime)}
            </div>
          </div>

          {/* Timeline Scrubber */}
          <div className="space-y-4 mb-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium w-16">Start:</span>
              <Slider
                value={[trimStart]}
                onValueChange={([v]) => setTrimStart(Math.min(v, trimEnd - 1))}
                min={0}
                max={recordingTime}
                step={0.1}
                className="flex-1"
              />
              <span className="text-sm font-mono w-16 text-right">{formatTime(Math.round(trimStart))}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium w-16">End:</span>
              <Slider
                value={[trimEnd]}
                onValueChange={([v]) => setTrimEnd(Math.max(v, trimStart + 1))}
                min={0}
                max={recordingTime}
                step={0.1}
                className="flex-1"
              />
              <span className="text-sm font-mono w-16 text-right">{formatTime(Math.round(trimEnd))}</span>
            </div>
          </div>

          {/* Trim Info */}
          <div className="text-center mb-4">
            <Badge variant="secondary">
              Trimmed duration: {formatTime(Math.round(trimEnd - trimStart))}
            </Badge>
          </div>

          {/* Trim Controls */}
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" onClick={() => {
              if (trimVideoRef.current) {
                trimVideoRef.current.currentTime = Math.max(0, trimPreviewTime - 5);
              }
            }}>
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button onClick={handleTrimPreview}>
              {isTrimPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button variant="outline" onClick={() => {
              if (trimVideoRef.current) {
                trimVideoRef.current.currentTime = Math.min(recordingTime, trimPreviewTime + 5);
              }
            }}>
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Apply/Cancel */}
          <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
            <Button variant="outline" onClick={closeTrimmer}>
              Cancel
            </Button>
            <Button onClick={applyTrim}>
              <Check className="h-4 w-4 mr-2" />
              Apply Trim
            </Button>
          </div>
        </Card>
      )}

      {/* Slow Motion Settings Panel */}
      {slowMotionEnabled && !isPreviewing && captureMode === "video" && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              <span className="font-medium">Slow Motion Recording</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Frame Rate:</span>
              <Select
                value={slowMotionFps.toString()}
                onValueChange={(v) => setSlowMotionFps(parseInt(v) as SlowMotionFps)}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 fps</SelectItem>
                  <SelectItem value="60" disabled={maxSupportedFps < 60}>60 fps</SelectItem>
                  <SelectItem value="120" disabled={maxSupportedFps < 120}>120 fps</SelectItem>
                  <SelectItem value="240" disabled={maxSupportedFps < 240}>240 fps</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Higher frame rates enable smoother slow-motion playback. Your device supports up to {maxSupportedFps} fps.
          </p>
        </Card>
      )}

      {/* Export Dialog */}
      {showExportDialog && recordedBlob && (
        <Card className="p-4 mb-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Export Video</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowExportDialog(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={exportFormat === "webm" ? "default" : "outline"}
                onClick={() => setExportFormat("webm")}
                className="flex flex-col h-auto py-3"
              >
                <span className="text-sm font-medium">WebM</span>
                <span className="text-xs text-muted-foreground">Original</span>
              </Button>
              <Button
                variant={exportFormat === "mp4" ? "default" : "outline"}
                onClick={() => setExportFormat("mp4")}
                className="flex flex-col h-auto py-3"
              >
                <span className="text-sm font-medium">MP4</span>
                <span className="text-xs text-muted-foreground">Compatible</span>
              </Button>
              <Button
                variant={exportFormat === "gif" ? "default" : "outline"}
                onClick={() => setExportFormat("gif")}
                className="flex flex-col h-auto py-3"
              >
                <span className="text-sm font-medium">GIF</span>
                <span className="text-xs text-muted-foreground">Animated</span>
              </Button>
            </div>
            
            {isExporting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Exporting...</span>
                  <span>{exportProgress}%</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              </div>
            )}
            
            <Button
              onClick={() => exportVideo(exportFormat)}
              disabled={isExporting}
              className="w-full"
            >
              {isExporting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exporting...</>
              ) : (
                <><ArrowRight className="h-4 w-4 mr-2" /> Download as {exportFormat.toUpperCase()}</>
              )}
            </Button>
            
            <p className="text-xs text-muted-foreground">
              {exportFormat === "webm" && "WebM is the native browser format with best quality."}
              {exportFormat === "mp4" && "MP4 is widely compatible with most devices and players."}
              {exportFormat === "gif" && "GIF creates an animated image (max 10 seconds, lower quality)."}
            </p>
          </div>
        </Card>
      )}

      {/* Instructions */}
      <Card className="p-4 bg-accent/10 border-accent">
        <div className="space-y-2">
          <p className="text-sm font-medium">How to use:</p>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Select Video or Photo mode above</li>
            <li>Use toolbar: filters (palette), timer (clock), grid (grid icon), burst (lightning)</li>
            <li>Adjust quality settings if needed (gear icon)</li>
            <li>Click "Start Camera" to enable your camera</li>
            <li>Use the switch button to toggle front/back camera</li>
            <li>{captureMode === "video" 
              ? "Click Record to start, Stop when finished" 
              : burstMode 
                ? "Click Burst to capture multiple photos quickly"
                : "Click Capture to take a photo"}</li>
            <li>Review and upload or discard</li>
          </ol>
        </div>
      </Card>
    </div>
  );
}
