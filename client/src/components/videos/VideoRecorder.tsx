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
  Image,
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
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { uploadFileToStorage } from "@/lib/storage";

type CameraFacing = "user" | "environment";
type CaptureMode = "video" | "photo";
type VideoQuality = "720p" | "1080p" | "4k";
type FilterPreset = "normal" | "vivid" | "warm" | "cool" | "bw" | "sepia";
type TimerDuration = 0 | 3 | 5 | 10;
type AspectRatio = "16:9" | "4:3" | "1:1";

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

  // Update custom filters when preset changes
  useEffect(() => {
    if (!useCustomFilters) {
      setCustomFilters(FILTER_PRESETS[filterPreset]);
    }
  }, [filterPreset, useCustomFilters]);

  const getVideoConstraints = useCallback(() => {
    const quality = QUALITY_PRESETS[videoQuality];
    return {
      video: {
        facingMode: cameraFacing,
        width: { ideal: quality.width },
        height: { ideal: quality.height },
      },
      audio: captureMode === "video",
    };
  }, [cameraFacing, videoQuality, captureMode]);

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
              <Image className="h-4 w-4 mr-1" />
              Photo
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
            
            {/* Settings */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
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
          {!isPreviewing && !recordedBlob && !photoPreviewUrl && burstPhotos.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white">
                {captureMode === "video" ? (
                  <VideoOff className="h-16 w-16 mx-auto mb-4 opacity-50" />
                ) : (
                  <Camera className="h-16 w-16 mx-auto mb-4 opacity-50" />
                )}
                <p className="text-lg opacity-75">Camera Off</p>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {/* Start Camera */}
          {!isPreviewing && !recordedBlob && !photoPreviewUrl && burstPhotos.length === 0 && (
            <Button onClick={startCamera} size="lg">
              <Camera className="h-5 w-5 mr-2" />
              Start Camera
            </Button>
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
          {recordedBlob && !uploading && (
            <>
              <Button onClick={handleDiscardVideo} variant="outline">
                Discard
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
