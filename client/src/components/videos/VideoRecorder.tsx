import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { uploadFileToStorage } from "@/lib/storage";

type CameraFacing = "user" | "environment";
type CaptureMode = "video" | "photo";
type VideoQuality = "720p" | "1080p" | "4k";

interface QualitySettings {
  width: number;
  height: number;
  label: string;
}

const QUALITY_PRESETS: Record<VideoQuality, QualitySettings> = {
  "720p": { width: 1280, height: 720, label: "HD 720p" },
  "1080p": { width: 1920, height: 1080, label: "Full HD 1080p" },
  "4k": { width: 3840, height: 2160, label: "4K Ultra HD" },
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const createVideoMutation = trpc.videos.create.useMutation();
  const createFileMutation = trpc.files.create.useMutation();
  const trpcUtils = trpc.useUtils();

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
    };
  }, []);

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem("camera-facing", cameraFacing);
  }, [cameraFacing]);

  useEffect(() => {
    localStorage.setItem("camera-quality", videoQuality);
  }, [videoQuality]);

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
      // Restart camera with new facing mode
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

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    if (!ctx) return;
    
    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to blob
    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedPhoto(blob);
        const url = URL.createObjectURL(blob);
        setPhotoPreviewUrl(url);
        stopCamera();
        toast.success("Photo captured!");
      }
    }, "image/jpeg", 0.95);
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
      
      // Show preview
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = URL.createObjectURL(blob);
      }
    };

    mediaRecorder.start(1000); // Collect data every second
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
    setRecordingTime(0);

    // Start timer
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
      // Upload video to S3
      const filename = `recording-${Date.now()}.webm`;
      const { url, fileKey } = await uploadFileToStorage(
        recordedBlob,
        filename,
        trpcUtils
      );

      // Create video record
      await createVideoMutation.mutateAsync({
        fileKey,
        url,
        filename,
        duration: recordingTime,
        title: `Recording ${new Date().toLocaleString()}`,
      });

      toast.success("Video uploaded successfully!");
      
      // Reset
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
      // Upload photo to S3
      const filename = `photo-${Date.now()}.jpg`;
      const { url, fileKey } = await uploadFileToStorage(
        capturedPhoto,
        filename,
        trpcUtils
      );

      // Create file record
      await createFileMutation.mutateAsync({
        filename: `photo-${Date.now()}.jpg`,
        mimeType: "image/jpeg",
        fileSize: capturedPhoto.size,
        url,
        fileKey,
        title: `Photo ${new Date().toLocaleString()}`,
      });

      toast.success("Photo uploaded successfully!");
      
      // Reset
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
              disabled={isPreviewing || !!recordedBlob || !!capturedPhoto}
            >
              <Video className="h-4 w-4 mr-1" />
              Video
            </Button>
            <Button
              variant={captureMode === "photo" ? "default" : "outline"}
              size="sm"
              onClick={() => setCaptureMode("photo")}
              disabled={isPreviewing || !!recordedBlob || !!capturedPhoto}
            >
              <Image className="h-4 w-4 mr-1" />
              Photo
            </Button>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

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

        {/* Video/Photo Preview */}
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden mb-4">
          {/* Hidden canvas for photo capture */}
          <canvas ref={canvasRef} className="hidden" />
          
          {/* Photo preview */}
          {photoPreviewUrl ? (
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

          {/* Status Badge */}
          {!isPreviewing && !recordedBlob && !photoPreviewUrl && (
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
          {!isPreviewing && !recordedBlob && !photoPreviewUrl && (
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
          {isPreviewing && captureMode === "photo" && (
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
              <Button onClick={capturePhoto} size="lg" className="bg-primary hover:bg-primary/90">
                <Camera className="h-5 w-5 mr-2" />
                Capture
              </Button>
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
            <li>Adjust quality settings if needed (gear icon)</li>
            <li>Click "Start Camera" to enable your camera</li>
            <li>Use the switch button to toggle front/back camera</li>
            <li>{captureMode === "video" 
              ? "Click Record to start, Stop when finished" 
              : "Click Capture to take a photo"}</li>
            <li>Review and upload or discard</li>
          </ol>
        </div>
      </Card>
    </div>
  );
}
