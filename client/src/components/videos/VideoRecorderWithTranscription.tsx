import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Video,
  VideoOff,
  Circle,
  Square,
  Loader2,
  Upload,
  Mic,
  MicOff,
  FileText,
  Sparkles,
  Zap,
  Palette,
  Headphones,
  Paintbrush,
  ChevronDown,
  ChevronUp,
  Settings,
  SwitchCamera,
  Monitor,
  FlipHorizontal,
  Mic2,
  Camera,
  Timer,
  AlertTriangle,
  Pause,
  Play,
  Scissors,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
// uploadFileToStorage removed - using chunked upload for large recordings
import { VideoSpeedRamping } from "../VideoSpeedRamping";
import { VideoEffectsLibrary } from "../VideoEffectsLibrary";
import { MultiTrackAudioMixer } from "../MultiTrackAudioMixer";
import { GreenScreenChromaKey } from "../GreenScreenChromaKey";

interface TranscriptSegment {
  text: string;
  timestamp: number;
  isFinal: boolean;
}

interface MatchedFile {
  id: number;
  title: string;
  confidence: number;
  matchedKeywords: string[];
}

interface ResolutionOption {
  label: string;
  width: number;
  height: number;
}

const RESOLUTION_OPTIONS: ResolutionOption[] = [
  { label: "480p", width: 854, height: 480 },
  { label: "720p", width: 1280, height: 720 },
  { label: "1080p", width: 1920, height: 1080 },
  { label: "4K", width: 3840, height: 2160 },
];

interface TimerLimitOption {
  label: string;
  seconds: number; // 0 = no limit
}

const TIMER_LIMIT_OPTIONS: TimerLimitOption[] = [
  { label: "No limit", seconds: 0 },
  { label: "1 min", seconds: 60 },
  { label: "5 min", seconds: 300 },
  { label: "15 min", seconds: 900 },
  { label: "30 min", seconds: 1800 },
  { label: "60 min", seconds: 3600 },
];

export function VideoRecorderWithTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Upload uses resumable upload system via trpcCall (no React mutation hooks needed)

  // Trimming state
  const [isTrimming, setIsTrimming] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimmedBlob, setTrimmedBlob] = useState<Blob | null>(null);
  const [isTrimProcessing, setIsTrimProcessing] = useState(false);
  
  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const isTranscribingRef = useRef(false);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [matchedFiles, setMatchedFiles] = useState<MatchedFile[]>([]);
  
  // Camera settings state
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('videoFacingMode') : null;
    return (saved === 'environment' ? 'environment' : 'user') as 'user' | 'environment';
  });
  const [resolution, setResolution] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('videoResolution') : null;
    return saved || '720p';
  });
  const [mirrorFrontCamera, setMirrorFrontCamera] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('videoMirrorFront') : null;
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('videoAudioDevice') || 'default' : 'default';
  });
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('videoVideoDevice') || '' : '';
  });
  const [showCameraSettings, setShowCameraSettings] = useState(false);

  // Countdown state
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Recording timer limit state
  const [timerLimit, setTimerLimit] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('videoTimerLimit') || '0' : '0';
  });
  const timerLimitWarningShown = useRef(false);

  // Feature panels state
  const [showAdvancedFeatures, setShowAdvancedFeatures] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('videoAdvancedFeaturesExpanded') : null;
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [activeFeatureTab, setActiveFeatureTab] = useState<string>("effects");

  // Toggle advanced features and persist to localStorage
  const toggleAdvancedFeatures = () => {
    const newValue = !showAdvancedFeatures;
    setShowAdvancedFeatures(newValue);
    localStorage.setItem('videoAdvancedFeaturesExpanded', JSON.stringify(newValue));
  };
  
  // Active effects state
  const [activeEffects, setActiveEffects] = useState<string[]>([]);
  const [greenScreenEnabled, setGreenScreenEnabled] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);

  const createVideoMutation = trpc.videos.create.useMutation();
  const { data: allFilesData } = trpc.files.list.useQuery({ page: 1, pageSize: 100 });
  const allFiles = allFilesData?.files || [];
  const trpcUtils = trpc.useUtils();

  // Detect best supported recording mime type for cross-browser compatibility
  const getRecordingMimeType = useCallback((): string => {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=h264,aac',
      'video/mp4',
    ];
    for (const type of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }, []);

  const getRecordingFileExtension = useCallback((): string => {
    const mimeType = getRecordingMimeType();
    if (mimeType.startsWith('video/mp4')) return 'mp4';
    return 'webm';
  }, [getRecordingMimeType]);

  const getRecordingBlobType = useCallback((): string => {
    const mimeType = getRecordingMimeType();
    if (mimeType.startsWith('video/mp4')) return 'video/mp4';
    return 'video/webm';
  }, [getRecordingMimeType]);

  // Enumerate available devices
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setAudioDevices(audioInputs);
      setVideoDevices(videoInputs);
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
    }
  }, []);

  // Enumerate devices on mount and when permissions change
  useEffect(() => {
    enumerateDevices();
    // Re-enumerate when devices change (e.g., plugging in a mic)
    navigator.mediaDevices?.addEventListener?.('devicechange', enumerateDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', enumerateDevices);
    };
  }, [enumerateDevices]);

  // Persist camera settings to localStorage
  useEffect(() => {
    localStorage.setItem('videoFacingMode', facingMode);
  }, [facingMode]);

  useEffect(() => {
    localStorage.setItem('videoResolution', resolution);
  }, [resolution]);

  useEffect(() => {
    localStorage.setItem('videoMirrorFront', JSON.stringify(mirrorFrontCamera));
  }, [mirrorFrontCamera]);

  useEffect(() => {
    localStorage.setItem('videoAudioDevice', selectedAudioDevice);
  }, [selectedAudioDevice]);

  useEffect(() => {
    if (selectedVideoDevice) {
      localStorage.setItem('videoVideoDevice', selectedVideoDevice);
    }
  }, [selectedVideoDevice]);

  useEffect(() => {
    localStorage.setItem('videoTimerLimit', timerLimit);
  }, [timerLimit]);

  // Warn before leaving with unsaved recording
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (recordedBlob) {
        e.preventDefault();
        e.returnValue = 'You have an unsaved recording. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [recordedBlob]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'r':
          if (!recordedBlob) {
            if (isRecording) {
              stopRecording();
              toast.success('Recording stopped (R)');
            } else if (countdown !== null) {
              cancelCountdown();
              toast.success('Countdown cancelled (R)');
            } else if (isPreviewing) {
              initiateRecording();
              toast.success('Countdown started (R)');
            }
          }
          break;
        case 'c':
          if (!isPreviewing && !recordedBlob) {
            startCamera();
            toast.success('Camera started (C)');
          }
          break;
        case 'e':
          toggleAdvancedFeatures();
          toast.success(showAdvancedFeatures ? 'Advanced features collapsed (E)' : 'Advanced features expanded (E)');
          break;
        case 'f':
          if (isPreviewing && !isRecording) {
            flipCamera();
            toast.success('Camera flipped (F)');
          }
          break;
        case 'p':
          if (isRecording) {
            if (isPaused) {
              resumeRecording();
            } else {
              pauseRecording();
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, isPaused, isPreviewing, recordedBlob, showAdvancedFeatures, facingMode, countdown]);

  useEffect(() => {
    // Initialize Web Speech API
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }
        
        if (finalTranscript) {
          const timestamp = Date.now() - startTimeRef.current;
          setTranscript(prev => [...prev, {
            text: finalTranscript.trim(),
            timestamp: Math.floor(timestamp / 1000),
            isFinal: true
          }]);
          
          matchFilesFromTranscript(finalTranscript);
        }
        
        setCurrentTranscript(interimTranscript);
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          return;
        }
        toast.error(`Transcription error: ${event.error}`);
      };
      
      recognition.onend = () => {
        if (isTranscribingRef.current) {
          try {
            recognition.start();
          } catch (e) {
            // Already started, ignore
          }
        }
      };
      
      recognitionRef.current = recognition;
    }
    
    return () => {
      stopCamera();
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const matchFilesFromTranscript = async (text: string) => {
    if (!allFiles || allFiles.length === 0) return;
    
    try {
      const keywords = extractKeywords(text);
      const searchTerms = text.toLowerCase();
      
      const matched = allFiles
        .map((file: any) => {
          const matchedKeywords = keywords.filter(keyword =>
            file.title?.toLowerCase().includes(keyword.toLowerCase()) ||
            file.description?.toLowerCase().includes(keyword.toLowerCase()) ||
            file.aiDescription?.toLowerCase().includes(keyword.toLowerCase())
          );
          
          let score = 0;
          if (file.title?.toLowerCase().includes(searchTerms)) score += 30;
          if (file.description?.toLowerCase().includes(searchTerms)) score += 20;
          if (file.aiDescription?.toLowerCase().includes(searchTerms)) score += 15;
          score += matchedKeywords.length * 10;
          
          return {
            id: file.id,
            title: file.title || file.filename,
            confidence: Math.min(95, score),
            matchedKeywords: matchedKeywords.slice(0, 3),
            score
          };
        })
        .filter((m: any) => m.score > 0)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 5);
      
      if (matched.length > 0) {
        setMatchedFiles(prev => {
          const existing = new Map(prev.map((f: MatchedFile) => [f.id, f]));
          matched.forEach((m: any) => {
            if (!existing.has(m.id) || existing.get(m.id)!.confidence < m.confidence) {
              existing.set(m.id, m);
            }
          });
          return Array.from(existing.values())
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 10);
        });
      }
    } catch (error) {
      console.error('File matching error:', error);
    }
  };

  const extractKeywords = (text: string): string[] => {
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they']);
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word))
      .slice(0, 10);
  };

  const getResolution = () => {
    const res = RESOLUTION_OPTIONS.find(r => r.label === resolution);
    return res || RESOLUTION_OPTIONS[1]; // Default to 720p
  };

  const startCamera = async () => {
    try {
      const res = getResolution();
      let stream;
      
      // Build video constraints
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: res.width },
        height: { ideal: res.height },
      };

      // Use specific device if selected, otherwise use facingMode
      if (selectedVideoDevice) {
        videoConstraints.deviceId = { exact: selectedVideoDevice };
      } else {
        videoConstraints.facingMode = facingMode;
      }

      // Build audio constraints
      const audioConstraints: MediaTrackConstraints | boolean = selectedAudioDevice && selectedAudioDevice !== 'default'
        ? { deviceId: { exact: selectedAudioDevice } }
        : true;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints,
        });
      } catch (err) {
        console.warn('Preferred camera constraints failed, trying basic constraints:', err);
        // Fallback: try with just facingMode
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facingMode },
            audio: true,
          });
        } catch (err2) {
          console.warn('FacingMode constraints failed, trying basic:', err2);
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
        }
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsPreviewing(true);
      
      // Re-enumerate devices now that we have permission
      enumerateDevices();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('not found') || errorMessage.includes('NotFoundError')) {
        toast.error("No camera found. Please connect a camera and try again.");
      } else if (errorMessage.includes('Permission') || errorMessage.includes('NotAllowedError')) {
        toast.error("Camera access denied. Please allow camera permissions.");
      } else {
        toast.error("Failed to access camera: " + errorMessage);
      }
      console.error('Camera error:', error);
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
  };

  const flipCamera = useCallback(() => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    // Clear specific device selection when flipping
    setSelectedVideoDevice('');
    localStorage.removeItem('videoVideoDevice');
    
    if (isPreviewing && !isRecording) {
      // Restart camera with new facing mode
      stopCamera();
      // Small delay to ensure tracks are fully stopped
      setTimeout(() => {
        startCamera();
      }, 200);
    }
  }, [facingMode, isPreviewing, isRecording]);

  // Restart camera when settings change (only if previewing and not recording)
  const restartCameraWithSettings = useCallback(() => {
    if (isPreviewing && !isRecording) {
      stopCamera();
      setTimeout(() => {
        startCamera();
      }, 200);
    }
  }, [isPreviewing, isRecording]);

  // Start countdown then begin recording
  const initiateRecording = () => {
    if (!streamRef.current) return;
    
    // Start 3-2-1 countdown
    setCountdown(3);
    timerLimitWarningShown.current = false;
    
    let count = 3;
    countdownRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        setCountdown(null);
        actuallyStartRecording();
      } else {
        setCountdown(count);
      }
    }, 1000);
  };

  // Cancel countdown
  const cancelCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  };

  const actuallyStartRecording = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    const recordMimeType = getRecordingMimeType();
    const recorderOptions: MediaRecorderOptions = recordMimeType ? { mimeType: recordMimeType } : {};
    const mediaRecorder = new MediaRecorder(streamRef.current, recorderOptions);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blobType = getRecordingBlobType();
      const blob = new Blob(chunksRef.current, { type: blobType });
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
    setTranscript([]);
    setCurrentTranscript("");
    setMatchedFiles([]);
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);

    if (recognitionRef.current) {
      setIsTranscribing(true);
      isTranscribingRef.current = true;
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error('Failed to start transcription:', error);
        toast.error('Transcription not available in this browser');
      }
    }
  };

  // Alias for keyboard shortcut compatibility
  const startRecording = initiateRecording;

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      // Pause the timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // Pause transcription
      if (recognitionRef.current && isTranscribing) {
        isTranscribingRef.current = false;
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
      toast.info('Recording paused');
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      // Resume the timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
      // Resume transcription
      if (recognitionRef.current) {
        isTranscribingRef.current = true;
        try {
          recognitionRef.current.start();
        } catch (e) {
          // ignore - may already be running
        }
      }
      toast.info('Recording resumed');
    }
  };

  const stopRecording = () => {
    // Clear countdown if still running
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
    stopCamera();

    if (recognitionRef.current && isTranscribing) {
      recognitionRef.current.stop();
      setIsTranscribing(false);
      isTranscribingRef.current = false;
    }
  };

  // Timer limit: auto-stop recording and show warnings
  const timerLimitSeconds = useMemo(() => parseInt(timerLimit) || 0, [timerLimit]);
  const timeRemaining = timerLimitSeconds > 0 ? timerLimitSeconds - recordingTime : null;

  useEffect(() => {
    if (!isRecording || timerLimitSeconds === 0) return;

    // Show warning at 30 seconds remaining
    if (timeRemaining !== null && timeRemaining === 30 && !timerLimitWarningShown.current) {
      timerLimitWarningShown.current = true;
      toast.warning('30 seconds remaining before auto-stop', {
        duration: 5000,
      });
    }

    // Auto-stop at limit
    if (timeRemaining !== null && timeRemaining <= 0) {
      toast.info(`Recording auto-stopped at ${TIMER_LIMIT_OPTIONS.find(o => o.seconds === timerLimitSeconds)?.label || 'limit'}`);
      stopRecording();
    }
  }, [isRecording, recordingTime, timerLimitSeconds, timeRemaining]);

  const readChunkAsBase64 = (blob: Blob, start: number, end: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        const slice = blob.slice(start, end);
        reader.onload = () => {
          try {
            const result = reader.result as string;
            const commaIndex = result.indexOf(",");
            const base64 = commaIndex >= 0 ? result.substring(commaIndex + 1) : result;
            resolve(base64);
          } catch (e) {
            reject(new Error("Failed to encode chunk data"));
          }
        };
        reader.onerror = () => reject(new Error("Failed to read chunk from file"));
        reader.readAsDataURL(slice);
      } catch (e) {
        reject(new Error("Failed to initialize chunk reader"));
      }
    });
  };

  const handleUpload = async () => {
    const blobToUpload = trimmedBlob || recordedBlob;
    if (!blobToUpload) return;

    setUploading(true);
    setUploadProgress(0);
    try {
      const ext = getRecordingFileExtension();
      const filename = `recording-${Date.now()}.${ext}`;
      const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunks (matches resumable upload system)

      let url: string;
      let fileKey: string;

      if (blobToUpload.size > CHUNK_SIZE) {
        // Use resumable upload system for chunked uploads
        const { trpcCall } = await import('@/lib/trpcCall');
        const totalChunks = Math.ceil(blobToUpload.size / CHUNK_SIZE);

        const session = await trpcCall<{
          sessionId: number;
          uploadedChunks: number[];
        }>('resumableUpload.createSession', {
          filename,
          fileSize: blobToUpload.size,
          mimeType: blobToUpload.type || getRecordingBlobType(),
          uploadType: 'video',
          chunkSize: CHUNK_SIZE,
        });

        const uploadedSet = new Set(session.uploadedChunks || []);

        for (let i = 0; i < totalChunks; i++) {
          if (uploadedSet.has(i)) continue;

          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, blobToUpload.size);

          let retries = 0;
          const maxRetries = 5;
          while (retries < maxRetries) {
            try {
              const chunkData = await readChunkAsBase64(blobToUpload, start, end);
              await trpcCall<{ success: boolean }>('resumableUpload.uploadChunk', {
                sessionId: session.sessionId,
                chunkIndex: i,
                chunkData,
              });
              break;
            } catch (error: any) {
              retries++;
              if (retries >= maxRetries) {
                throw new Error(`Failed to upload chunk ${i} after ${maxRetries} retries`);
              }
              await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
            }
          }

          setUploadProgress(Math.round(((i + 1) / totalChunks) * 90));
        }

        const result = await trpcCall<{
          fileId?: number;
          url?: string;
          fileKey?: string;
          status?: string;
        }>('resumableUpload.finalizeUpload', {
          sessionId: session.sessionId,
        });

        // Poll for async finalization if needed
        if (result.status === 'processing') {
          let pollAttempts = 0;
          const maxPollAttempts = 120;
          while (pollAttempts < maxPollAttempts) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await trpcCall<{
              status: string;
              fileId?: number;
              url?: string;
              fileKey?: string;
              error?: string;
            }>('resumableUpload.getFinalizeStatus', {
              sessionId: session.sessionId,
            }, 'query');

            if (status.status === 'completed') {
              Object.assign(result, status);
              break;
            } else if (status.status === 'failed') {
              throw new Error(status.error || 'Finalization failed');
            }
            pollAttempts++;
          }
          if (pollAttempts >= maxPollAttempts) {
            throw new Error('Finalization timed out');
          }
        }

        url = result.url || '';
        fileKey = result.fileKey || '';
      } else {
        // Small file: use simple base64 upload via storage helper
        const { uploadFileToStorage } = await import("@/lib/storage");
        const result = await uploadFileToStorage(blobToUpload, filename, trpcUtils);
        url = result.url;
        fileKey = result.fileKey;
      }

      setUploadProgress(95);

      const fullTranscript = transcript.map(s => s.text).join(' ');
      const uploadDuration = trimmedBlob ? Math.floor(trimEnd - trimStart) : recordingTime;
      await createVideoMutation.mutateAsync({
        fileKey,
        url,
        filename,
        duration: uploadDuration,
        title: `Recording ${new Date().toLocaleString()}`,
        transcript: fullTranscript || undefined,
        mimeType: blobToUpload.type || getRecordingBlobType(),
      });

      setUploadProgress(100);
      toast.success("Video uploaded successfully!");
      
      setRecordedBlob(null);
      setTrimmedBlob(null);
      setIsTrimming(false);
      setTrimStart(0);
      setTrimEnd(0);
      setVideoDuration(0);
      setRecordingTime(0);
      setTranscript([]);
      setMatchedFiles([]);
      if (videoRef.current) {
        videoRef.current.src = "";
      }
    } catch (error: any) {
      console.error(error);
      
      // If upload failed, try to save to offline cache
      const blobToCache = trimmedBlob || recordedBlob;
      if (blobToCache) {
        try {
          const { saveRecordingToCache } = await import("@/lib/offlineRecordingCache");
          const cacheExt = getRecordingFileExtension();
          const filename = `recording_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.${cacheExt}`;
          await saveRecordingToCache({
            blob: blobToCache,
            filename,
            duration: recordingTime,
            transcript: transcript.map(s => s.text).join(" "),
          });
          toast.warning("Upload failed — recording saved locally. It will auto-upload when connection is restored.", {
            duration: 6000,
          });
        } catch (cacheError) {
          console.error("Failed to cache recording:", cacheError);
          toast.error("Failed to upload video. Please try again.");
        }
      } else {
        toast.error("Failed to upload video");
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDiscard = () => {
    setRecordedBlob(null);
    setTrimmedBlob(null);
    setIsTrimming(false);
    setTrimStart(0);
    setTrimEnd(0);
    setVideoDuration(0);
    setRecordingTime(0);
    setTranscript([]);
    setMatchedFiles([]);
    if (videoRef.current) {
      videoRef.current.src = "";
    }
  };

  // Trimming functions
  const openTrimEditor = () => {
    if (!recordedBlob || !videoRef.current) return;
    const vid = videoRef.current;
    const dur = vid.duration || recordingTime;
    setVideoDuration(dur);
    setTrimStart(0);
    setTrimEnd(dur);
    setTrimmedBlob(null);
    setIsTrimming(true);
  };

  const applyTrim = async () => {
    if (!recordedBlob) return;
    setIsTrimProcessing(true);
    try {
      // Use MediaSource / OffscreenCanvas approach for client-side trimming
      // For webm, we re-record the trimmed portion using a video element + MediaRecorder
      const sourceUrl = URL.createObjectURL(recordedBlob);
      const tempVideo = document.createElement('video');
      tempVideo.src = sourceUrl;
      tempVideo.muted = true;
      tempVideo.preload = 'auto';

      await new Promise<void>((resolve, reject) => {
        tempVideo.onloadeddata = () => resolve();
        tempVideo.onerror = () => reject(new Error('Failed to load video for trimming'));
      });

      tempVideo.currentTime = trimStart;
      await new Promise<void>((resolve) => {
        tempVideo.onseeked = () => resolve();
      });

      // Create a canvas to capture frames
      const canvas = document.createElement('canvas');
      canvas.width = tempVideo.videoWidth;
      canvas.height = tempVideo.videoHeight;
      const ctx = canvas.getContext('2d')!;

      // Capture the canvas stream + original audio
      const canvasStream = canvas.captureStream(30);

      // Try to get audio from original blob
      const audioCtx = new AudioContext();
      const arrayBuffer = await recordedBlob.arrayBuffer();
      let combinedStream: MediaStream;
      try {
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        source.start(0, trimStart, trimEnd - trimStart);
        combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ]);
      } catch {
        // No audio or decode failed, use video only
        combinedStream = canvasStream;
      }

      const trimChunks: Blob[] = [];
      const trimMimeType = getRecordingMimeType();
      const trimRecorderOptions: MediaRecorderOptions = trimMimeType ? { mimeType: trimMimeType } : {};
      const trimRecorder = new MediaRecorder(combinedStream, trimRecorderOptions);

      trimRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) trimChunks.push(e.data);
      };

      const trimPromise = new Promise<Blob>((resolve) => {
        trimRecorder.onstop = () => {
          resolve(new Blob(trimChunks, { type: getRecordingBlobType() }));
        };
      });

      trimRecorder.start(100);
      tempVideo.play();

      // Draw frames to canvas
      const drawFrame = () => {
        if (tempVideo.currentTime >= trimEnd || tempVideo.ended) {
          trimRecorder.stop();
          tempVideo.pause();
          audioCtx.close();
          return;
        }
        ctx.drawImage(tempVideo, 0, 0);
        requestAnimationFrame(drawFrame);
      };
      drawFrame();

      const result = await trimPromise;
      URL.revokeObjectURL(sourceUrl);

      setTrimmedBlob(result);
      // Update the video preview
      if (videoRef.current) {
        videoRef.current.src = URL.createObjectURL(result);
      }
      toast.success(`Video trimmed! ${formatTime(Math.floor(trimEnd - trimStart))} duration`);
    } catch (err) {
      console.error('Trim error:', err);
      toast.error('Failed to trim video. The original will be used.');
    } finally {
      setIsTrimProcessing(false);
    }
  };

  const cancelTrim = () => {
    setIsTrimming(false);
    setTrimmedBlob(null);
    // Restore original preview
    if (recordedBlob && videoRef.current) {
      videoRef.current.src = URL.createObjectURL(recordedBlob);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const shouldMirror = facingMode === 'user' && mirrorFrontCamera && !recordedBlob;

  return (
    <div className="space-y-4">
      {/* Main Recording Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Video Area */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4 md:p-6">
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden mb-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={!recordedBlob}
                controls={!!recordedBlob}
                className={`w-full h-full object-contain ${shouldMirror ? 'scale-x-[-1]' : ''}`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Countdown Overlay */}
              {countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                  <div className="text-center">
                    <div className="text-8xl font-bold text-white tabular-nums animate-pulse">
                      {countdown}
                    </div>
                    <p className="text-white/80 text-lg mt-2">Get ready...</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancelCountdown}
                      className="mt-4 text-white border-white/40 hover:bg-white/20"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {isRecording && (
                <div className={`absolute top-4 left-4 flex items-center gap-2 px-3 py-2 rounded-md ${isPaused ? 'bg-yellow-600 text-white' : 'bg-destructive text-destructive-foreground'}`}>
                  {isPaused ? (
                    <Pause className="h-4 w-4 fill-current" />
                  ) : (
                    <Circle className="h-4 w-4 fill-current animate-pulse" />
                  )}
                  <span className="font-mono font-bold">{formatTime(recordingTime)}</span>
                  {isPaused && <span className="text-xs font-semibold ml-1">PAUSED</span>}
                  {!isPaused && timeRemaining !== null && (
                    <span className={`font-mono text-xs ml-1 ${timeRemaining <= 30 ? 'text-yellow-200 animate-pulse' : 'opacity-75'}`}>
                      ({formatTime(timeRemaining)} left)
                    </span>
                  )}
                </div>
              )}

              {/* Paused overlay */}
              {isRecording && isPaused && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
                  <div className="text-center">
                    <Pause className="h-16 w-16 text-white mx-auto mb-2" />
                    <p className="text-white text-lg font-semibold">Recording Paused</p>
                    <p className="text-white/70 text-sm">Click Resume to continue</p>
                  </div>
                </div>
              )}

              {isTranscribing && (
                <div className="absolute top-4 right-4 flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-md">
                  <Mic className="h-4 w-4 animate-pulse" />
                  <span className="text-sm font-medium">Transcribing</span>
                </div>
              )}

              {/* Camera mode indicator */}
              {isPreviewing && !recordedBlob && (
                <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-black/60 text-white px-2 py-1 rounded text-xs">
                  <Camera className="h-3 w-3" />
                  {facingMode === 'user' ? 'Front' : 'Back'} • {resolution}
                </div>
              )}

              {/* Active Effects Indicator */}
              {isPreviewing && (activeEffects.length > 0 || greenScreenEnabled) && (
                <div className="absolute bottom-4 left-4 flex flex-wrap gap-1 max-w-[70%]">
                  {activeEffects.map((effect, idx) => (
                    <span key={idx} className="px-2 py-1 bg-primary/80 text-primary-foreground text-xs rounded flex items-center gap-1">
                      <Palette className="h-3 w-3" />
                      {effect}
                    </span>
                  ))}
                  {greenScreenEnabled && (
                    <span className="px-2 py-1 bg-emerald-500/80 text-white text-xs rounded flex items-center gap-1">
                      <Paintbrush className="h-3 w-3" />
                      Green Screen
                    </span>
                  )}
                </div>
              )}

              {!isPreviewing && !recordedBlob && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-white">
                    <VideoOff className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg opacity-75">Camera Off</p>
                    <p className="text-sm opacity-50 mt-1">
                      {facingMode === 'environment' ? 'Back camera' : 'Front camera'} • {resolution}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Quick camera controls - inline below preview */}
            {!recordedBlob && !isRecording && (
              <div className="flex items-center gap-1.5 mt-2">
                <Button
                  variant={facingMode === 'environment' ? 'default' : 'outline'}
                  size="sm"
                  onClick={flipCamera}
                  disabled={isRecording}
                  className="gap-1 h-8 px-2.5 shrink-0"
                >
                  <SwitchCamera className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{facingMode === 'user' ? 'Back' : 'Front'}</span>
                </Button>

                <Select value={resolution} onValueChange={(val) => {
                  setResolution(val);
                  if (isPreviewing && !isRecording) {
                    restartCameraWithSettings();
                  }
                }}>
                  <SelectTrigger className="w-[80px] h-8 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOLUTION_OPTIONS.map(opt => (
                      <SelectItem key={opt.label} value={opt.label}>
                        <div className="flex items-center gap-1.5">
                          <Monitor className="h-3 w-3" />
                          {opt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={timerLimit} onValueChange={setTimerLimit}>
                  <SelectTrigger className="w-[90px] h-8 shrink-0">
                    <div className="flex items-center gap-1">
                      <Timer className="h-3 w-3" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {TIMER_LIMIT_OPTIONS.map(opt => (
                      <SelectItem key={opt.seconds.toString()} value={opt.seconds.toString()}>
                        <div className="flex items-center gap-1.5">
                          <Timer className="h-3 w-3" />
                          {opt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                  <Switch
                    id="mirror-toggle-inline"
                    checked={mirrorFrontCamera}
                    onCheckedChange={setMirrorFrontCamera}
                    disabled={facingMode !== 'user'}
                  />
                  <Label htmlFor="mirror-toggle-inline" className="text-xs cursor-pointer flex items-center gap-1">
                    <FlipHorizontal className="h-3 w-3" />
                    <span className="hidden sm:inline">Mirror</span>
                  </Label>
                </div>
              </div>
            )}

            <div className="recording-controls flex items-center justify-center gap-3 flex-wrap mt-3">
              {!isPreviewing && !recordedBlob && (
                <Button onClick={startCamera} size="lg" className="min-h-[48px] px-6">
                  <Video className="h-5 w-5 mr-2" />
                  Start Camera
                </Button>
              )}

              {isPreviewing && !isRecording && countdown === null && (
                <>
                  <Button onClick={stopCamera} variant="outline" className="min-h-[44px] min-w-[44px] px-4">
                    <VideoOff className="h-4 w-4 mr-2" />
                    Stop
                  </Button>
                  <Button onClick={flipCamera} variant="outline" className="min-h-[44px] min-w-[44px] px-4">
                    <SwitchCamera className="h-4 w-4 mr-2" />
                    Flip
                  </Button>
                  <Button
                    onClick={() => {
                      if (!streamRef.current) {
                        console.warn('Stream not ready, restarting camera...');
                        startCamera().then(() => {
                          setTimeout(() => initiateRecording(), 500);
                        });
                        return;
                      }
                      initiateRecording();
                    }}
                    size="lg"
                    className="bg-destructive hover:bg-destructive/90 active:scale-95 transition-transform min-h-[52px] px-8 text-base"
                  >
                    <Circle className="h-5 w-5 mr-2" />
                    Start Recording
                  </Button>
                </>
              )}

              {/* Countdown in progress - show cancel */}
              {countdown !== null && (
                <Button
                  onClick={cancelCountdown}
                  variant="outline"
                  className="min-h-[44px] px-6"
                >
                  Cancel Countdown
                </Button>
              )}

              {isRecording && (
                <>
                  <Button
                    onClick={isPaused ? resumeRecording : pauseRecording}
                    size="lg"
                    variant="outline"
                    className="active:scale-95 transition-transform min-h-[52px] px-6 text-base"
                  >
                    {isPaused ? (
                      <><Play className="h-5 w-5 mr-2" />Resume</>
                    ) : (
                      <><Pause className="h-5 w-5 mr-2" />Pause</>
                    )}
                  </Button>
                  <Button
                    onClick={stopRecording}
                    size="lg"
                    variant="destructive"
                    className="active:scale-95 transition-transform min-h-[52px] px-8 text-base"
                  >
                    <Square className="h-5 w-5 mr-2" />
                    Stop Recording
                  </Button>
                </>
              )}

              {recordedBlob && !uploading && (
                <>
                  <Button onClick={handleDiscard} variant="outline" className="min-h-[44px]">
                    Discard
                  </Button>
                  <Button
                    onClick={openTrimEditor}
                    variant="outline"
                    className="min-h-[44px] gap-1.5"
                    disabled={isTrimming}
                  >
                    <Scissors className="h-4 w-4" />
                    {trimmedBlob ? 'Re-Trim' : 'Trim'}
                  </Button>
                  <Button onClick={handleUpload} size="lg" className="min-h-[48px] px-6">
                    <Upload className="h-5 w-5 mr-2" />
                    {trimmedBlob ? 'Upload Trimmed' : 'Upload Video'}
                  </Button>
                </>
              )}

              {uploading && (
                <Button disabled size="lg">
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Uploading{uploadProgress > 0 ? ` ${uploadProgress}%` : '...'}
                </Button>
              )}
            </div>

            {/* Advanced Camera Settings - Below controls */}
            {!recordedBlob && (
              <div className="mt-3 pt-3 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCameraSettings(!showCameraSettings)}
                  className="h-7 w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Settings className="h-3 w-3" />
                  {showCameraSettings ? 'Hide Device Settings' : 'Device Settings'}
                  {showCameraSettings ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>

                {/* Expanded device settings */}
                {showCameraSettings && (
                  <div className="mt-3 space-y-3">
                    {/* Video device selector */}
                    {videoDevices.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Video className="h-3 w-3" />
                          Camera Device
                        </Label>
                        <Select value={selectedVideoDevice || 'auto'} onValueChange={(val) => {
                          setSelectedVideoDevice(val === 'auto' ? '' : val);
                          if (isPreviewing && !isRecording) {
                            restartCameraWithSettings();
                          }
                        }}>
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Auto (based on facing mode)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto (based on facing mode)</SelectItem>
                            {videoDevices.map((device, idx) => (
                              <SelectItem key={device.deviceId} value={device.deviceId}>
                                {device.label || `Camera ${idx + 1}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Audio device selector */}
                    {audioDevices.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Mic2 className="h-3 w-3" />
                          Microphone
                        </Label>
                        <Select value={selectedAudioDevice} onValueChange={(val) => {
                          setSelectedAudioDevice(val);
                          if (isPreviewing && !isRecording) {
                            restartCameraWithSettings();
                          }
                        }}>
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Default microphone" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Default microphone</SelectItem>
                            {audioDevices.map((device, idx) => (
                              <SelectItem key={device.deviceId} value={device.deviceId}>
                                {device.label || `Microphone ${idx + 1}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Current camera info */}
                    {isPreviewing && streamRef.current && (
                      <div className="p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <span>Camera: {facingMode === 'user' ? 'Front' : 'Back'}</span>
                          <span>Resolution: {resolution}</span>
                          <span>Mirror: {shouldMirror ? 'On' : 'Off'}</span>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Tip: Press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">F</kbd> to flip camera, <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">C</kbd> to start camera, <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">R</kbd> to record, <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">P</kbd> to pause/resume
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Advanced Recording Features Toggle - Below Camera Preview */}
            <div className="mt-3 pt-3 border-t">
              {isPreviewing && !showAdvancedFeatures && (
                <div className="mb-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-600 dark:text-blue-400">
                  <strong>Tip:</strong> Video effects and filters are applied in real-time to your camera feed. Expand to configure.
                </div>
              )}
              <Button
                variant="outline"
                className="w-full flex items-center justify-between"
                onClick={toggleAdvancedFeatures}
              >
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <span className="font-medium text-sm">Advanced Recording Features</span>
                  <span className="hidden md:inline text-xs text-muted-foreground">(E)</span>
                  {(activeEffects.length > 0 || greenScreenEnabled) && (
                    <span className="px-1.5 py-0.5 bg-primary text-primary-foreground text-xs rounded">
                      {activeEffects.length + (greenScreenEnabled ? 1 : 0)} active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                    <Zap className="h-3 w-3" />
                    <span>Speed</span>
                    <Palette className="h-3 w-3 ml-2" />
                    <span>Effects</span>
                    <Headphones className="h-3 w-3 ml-2" />
                    <span>Audio</span>
                    <Paintbrush className="h-3 w-3 ml-2" />
                    <span>Green Screen</span>
                  </div>
                  {showAdvancedFeatures ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </Button>

              {/* Advanced Features Panel */}
              {showAdvancedFeatures && (
                <div className="mt-3">
                  <Tabs value={activeFeatureTab} onValueChange={setActiveFeatureTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1">
                      <TabsTrigger value="speed" className="text-xs sm:text-sm py-1.5">
                        <Zap className="h-3 w-3 mr-1" />
                        Speed
                      </TabsTrigger>
                      <TabsTrigger value="effects" className="text-xs sm:text-sm py-1.5">
                        <Palette className="h-3 w-3 mr-1" />
                        Effects
                      </TabsTrigger>
                      <TabsTrigger value="audio" className="text-xs sm:text-sm py-1.5">
                        <Headphones className="h-3 w-3 mr-1" />
                        Audio
                      </TabsTrigger>
                      <TabsTrigger value="greenscreen" className="text-xs sm:text-sm py-1.5">
                        <Paintbrush className="h-3 w-3 mr-1" />
                        Chroma
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="speed" className="mt-4">
                      <VideoSpeedRamping
                        videoRef={videoRef}
                        duration={recordingTime}
                        currentTime={0}
                      />
                    </TabsContent>

                    <TabsContent value="effects" className="mt-4">
                      <VideoEffectsLibrary
                        videoRef={videoRef}
                        canvasRef={canvasRef}
                        onEffectsChange={(effects) => {
                          setActiveEffects(effects.map(e => e.name));
                        }}
                      />
                    </TabsContent>

                    <TabsContent value="audio" className="mt-4">
                      <MultiTrackAudioMixer
                        onTracksChange={(tracks) => {
                          console.log('Audio tracks changed:', tracks);
                        }}
                      />
                    </TabsContent>

                    <TabsContent value="greenscreen" className="mt-4">
                      <GreenScreenChromaKey
                        videoRef={videoRef}
                        canvasRef={canvasRef}
                        onSettingsChange={(settings) => {
                          setGreenScreenEnabled(settings.enabled);
                        }}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </div>

            {recordedBlob && (
              <>
                {/* Trimming UI */}
                {isTrimming && (
                  <div className="mt-4 p-4 border rounded-lg space-y-4">
                    <div className="flex items-center gap-2">
                      <Scissors className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm">Trim Video</h3>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Start: {formatTime(Math.floor(trimStart))}</span>
                          <span>End: {formatTime(Math.floor(trimEnd))}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <SkipBack className="h-3 w-3 text-muted-foreground shrink-0" />
                          <input
                            type="range"
                            min={0}
                            max={videoDuration}
                            step={0.1}
                            value={trimStart}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setTrimStart(Math.min(val, trimEnd - 0.5));
                              if (videoRef.current) videoRef.current.currentTime = val;
                            }}
                            className="flex-1 accent-primary"
                          />
                          <span className="text-xs font-mono w-12 text-right">{formatTime(Math.floor(trimStart))}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <SkipForward className="h-3 w-3 text-muted-foreground shrink-0" />
                          <input
                            type="range"
                            min={0}
                            max={videoDuration}
                            step={0.1}
                            value={trimEnd}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setTrimEnd(Math.max(val, trimStart + 0.5));
                              if (videoRef.current) videoRef.current.currentTime = val;
                            }}
                            className="flex-1 accent-primary"
                          />
                          <span className="text-xs font-mono w-12 text-right">{formatTime(Math.floor(trimEnd))}</span>
                        </div>
                      </div>

                      <div className="text-center">
                        <Badge variant="outline">
                          Trimmed duration: {formatTime(Math.floor(trimEnd - trimStart))} of {formatTime(Math.floor(videoDuration))}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={cancelTrim}
                          disabled={isTrimProcessing}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={applyTrim}
                          disabled={isTrimProcessing || (trimStart === 0 && trimEnd === videoDuration)}
                        >
                          {isTrimProcessing ? (
                            <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Processing...</>
                          ) : (
                            <><Scissors className="h-4 w-4 mr-1" />Apply Trim</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500 mb-2">
                    <Upload className="h-4 w-4" />
                    <span className="font-semibold">Don't forget to save your recording!</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {trimmedBlob
                      ? 'Your trimmed video is ready to upload. Click "Upload Trimmed" to save it.'
                      : 'Click "Upload Video" to save your recording permanently. Use "Trim" to cut the start/end before uploading.'}
                  </p>
                </div>
                <div className="mt-2 text-center flex items-center justify-center gap-2 flex-wrap">
                  <Badge variant="secondary">
                    Duration: {formatTime(recordingTime)} • Size:{" "}
                    {(recordedBlob.size / 1024 / 1024).toFixed(2)} MB
                  </Badge>
                  {trimmedBlob && (
                    <Badge variant="default" className="bg-green-600">
                      Trimmed: {formatTime(Math.floor(trimEnd - trimStart))} • {(trimmedBlob.size / 1024 / 1024).toFixed(2)} MB
                    </Badge>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* Live Transcript */}
          {(isRecording || transcript.length > 0) && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Live Transcript</h3>
                {isRecording && (
                  <Badge variant="outline" className="ml-auto">
                    <Mic className="h-3 w-3 mr-1" />
                    Listening
                  </Badge>
                )}
              </div>
              <ScrollArea className="h-48">
                <div className="space-y-2 pr-4">
                  {transcript.map((segment, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {formatTime(segment.timestamp)}
                      </Badge>
                      <p className="text-sm">{segment.text}</p>
                    </div>
                  ))}
                  {currentTranscript && (
                    <div className="flex gap-2">
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {formatTime(recordingTime)}
                      </Badge>
                      <p className="text-sm text-muted-foreground italic">
                        {currentTranscript}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </Card>
          )}
        </div>

        {/* Matched Files Sidebar */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Matched Files</h3>
              <Badge variant="secondary" className="ml-auto">
                {matchedFiles.length}
              </Badge>
            </div>
            
            {matchedFiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {isRecording
                  ? "Start speaking to see matched files..."
                  : "No matches yet"}
              </div>
            ) : (
              <ScrollArea className="h-[300px] lg:h-[500px]">
                <div className="space-y-3 pr-4">
                  {matchedFiles.map((file) => (
                    <Card key={file.id} className="p-3 bg-accent/5">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-sm line-clamp-2">
                          {file.title}
                        </h4>
                        <Badge
                          variant={
                            file.confidence > 70
                              ? "default"
                              : file.confidence > 50
                                ? "secondary"
                                : "outline"
                          }
                          className="ml-2 shrink-0"
                        >
                          {file.confidence}%
                        </Badge>
                      </div>
                      {file.matchedKeywords.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {file.matchedKeywords.map((keyword, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="text-xs"
                            >
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </Card>

          {recognitionRef.current === null && (
            <Card className="p-4 bg-yellow-500/10 border-yellow-500/20">
              <div className="flex items-start gap-2">
                <MicOff className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-yellow-600">
                    Transcription unavailable
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your browser doesn't support live transcription. Try Chrome or Edge.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

    </div>
  );
}
