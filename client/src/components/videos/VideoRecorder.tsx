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
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { uploadFileToStorage } from "@/lib/storage";

type CameraFacing = "user" | "environment";
type CaptureMode = "video" | "photo";
type VideoQuality = "720p" | "1080p" | "4k";
type FilterPreset = "normal" | "vivid" | "warm" | "cool" | "bw" | "sepia";

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

  // Photo filters
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filterCanvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const createVideoMutation = trpc.videos.create.useMutation();
  const createFileMutation = trpc.files.create.useMutation();
  const trpcUtils = trpc.useUtils();

  // Get active filters
  const activeFilters = useCustomFilters ? customFilters : FILTER_PRESETS[filterPreset];

  // CSS filter string for live preview
  const getCssFilterString = () => {
    const f = activeFilters;
    let filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%)`;
    if (f.warmth !== 0) {
      filter += ` sepia(${Math.abs(f.warmth)}%)`;
      if (f.warmth < 0) {
        filter += ` hue-rotate(180deg)`;
      }
    }
    return filter;
  };

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
      // Stop any existing stream first
      stopCamera();
      
      const constraints = getVideoConstraints();
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsPreviewing(true);
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
  const applyFiltersToCanvas = (sourceCanvas: HTMLCanvasElement): Promise<Blob | null> => {
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

      // Apply CSS-like filters
      ctx.filter = getCssFilterString();
      ctx.drawImage(sourceCanvas, 0, 0);
      
      filterCanvas.toBlob((blob) => {
        resolve(blob);
      }, "image/jpeg", 0.95);
    });
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
    
    // Apply filters
    const blob = await applyFiltersToCanvas(canvas);
    
    if (blob) {
      setCapturedPhoto(blob);
      const url = URL.createObjectURL(blob);
      setPhotoPreviewUrl(url);
      stopCamera();
      toast.success("Photo captured!");
    }
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

    // Capture photos with delay
    for (let i = 0; i < burstCount; i++) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await applyFiltersToCanvas(canvas);
      
      if (blob) {
        photos.push({
          blob,
          url: URL.createObjectURL(blob),
          selected: i === 0, // Select first by default
        });
      }
      
      // Small delay between captures (100ms)
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
          
          <div className="flex items-center gap-2">
            {captureMode === "photo" && (
              <>
                <Button
                  variant={showFilters ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Palette className="h-4 w-4" />
                </Button>
                <Button
                  variant={burstMode ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setBurstMode(!burstMode)}
                  disabled={!!capturedPhoto || burstPhotos.length > 0}
                >
                  <Zap className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filter Controls */}
        {showFilters && captureMode === "photo" && (
          <div className="mb-4 p-4 bg-accent/20 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Photo Filters</span>
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
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden mb-4">
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
              style={{ filter: captureMode === "photo" && isPreviewing ? getCssFilterString() : undefined }}
            />
          )}

          {/* Camera Switch Button (overlay) */}
          {isPreviewing && hasMultipleCameras && !isRecording && (
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
          {isPreviewing && captureMode === "video" && !isRecording && (
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
              <Button onClick={startRecording} size="lg" className="bg-destructive hover:bg-destructive/90">
                <Circle className="h-5 w-5 mr-2" />
                Record
              </Button>
            </>
          )}

          {/* Camera Active - Photo Mode */}
          {isPreviewing && captureMode === "photo" && !isBurstCapturing && (
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
                <Button onClick={captureBurst} size="lg" className="bg-primary hover:bg-primary/90">
                  <Zap className="h-5 w-5 mr-2" />
                  Burst ({burstCount})
                </Button>
              ) : (
                <Button onClick={capturePhoto} size="lg" className="bg-primary hover:bg-primary/90">
                  <Camera className="h-5 w-5 mr-2" />
                  Capture
                </Button>
              )}
            </>
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
            <li>For photos: Use filter icon for effects, lightning icon for burst mode</li>
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
