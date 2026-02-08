import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, SwitchCamera, X, Check, RotateCcw, Loader2, Sparkles, ImagePlus, Monitor, FlipHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface CameraCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptureComplete?: (fileId: number) => void;
}

const PHOTO_RESOLUTION_OPTIONS = [
  { label: '720p', width: 1280, height: 720 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '4K', width: 3840, height: 2160 },
];

export function CameraCapture({ open, onOpenChange, onCaptureComplete }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('cameraCaptureFacing') : null;
    return (saved === 'user' ? 'user' : 'environment') as 'user' | 'environment';
  });
  const [resolution, setResolution] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('cameraCaptureResolution') : null;
    return saved || '1080p';
  });
  const [mirrorFront, setMirrorFront] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('cameraCaptureMirror') : null;
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isUploading, setIsUploading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  
  const createFileMutation = trpc.files.create.useMutation();
  const utils = trpc.useUtils();

  // Persist settings
  useEffect(() => {
    localStorage.setItem('cameraCaptureFacing', facingMode);
  }, [facingMode]);

  useEffect(() => {
    localStorage.setItem('cameraCaptureResolution', resolution);
  }, [resolution]);

  useEffect(() => {
    localStorage.setItem('cameraCaptureMirror', JSON.stringify(mirrorFront));
  }, [mirrorFront]);

  // Enumerate devices
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setVideoDevices(videoInputs);
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
    }
  }, []);

  useEffect(() => {
    enumerateDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', enumerateDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', enumerateDevices);
    };
  }, [enumerateDevices]);

  const getResolution = () => {
    return PHOTO_RESOLUTION_OPTIONS.find(r => r.label === resolution) || PHOTO_RESOLUTION_OPTIONS[1];
  };

  // Start camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const res = getResolution();
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: res.width },
        height: { ideal: res.height },
      };

      // Use specific device if selected, otherwise use facingMode
      if (selectedDevice) {
        videoConstraints.deviceId = { exact: selectedDevice };
      } else {
        videoConstraints.facingMode = facingMode;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
      } catch (err) {
        console.warn('Preferred constraints failed, trying facingMode fallback:', err);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facingMode },
            audio: false,
          });
        } catch (err2) {
          console.warn('FacingMode fallback failed, trying basic:', err2);
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsStreaming(true);
      }

      // Re-enumerate devices now that we have permission
      enumerateDevices();
    } catch (err) {
      console.error('Camera error:', err);
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setCameraError('Camera access denied. Please allow camera permissions in your browser settings.');
        } else if (err.name === 'NotFoundError') {
          setCameraError('No camera found on this device.');
        } else if (err.name === 'NotReadableError') {
          setCameraError('Camera is in use by another application.');
        } else {
          setCameraError(`Camera error: ${err.message}`);
        }
      } else {
        setCameraError('Failed to access camera. Please check permissions.');
      }
    }
  }, [facingMode, selectedDevice, resolution]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  // Capture photo
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If using front camera with mirror, flip horizontally
    if (facingMode === 'user' && mirrorFront) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    
    ctx.drawImage(video, 0, 0);
    
    // Get image data URL
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(imageDataUrl);
    
    // Stop the camera while reviewing
    stopCamera();
  }, [facingMode, mirrorFront, stopCamera]);

  // Retake photo
  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
    startCamera();
  }, [startCamera]);

  // Switch camera (front/back)
  const switchCamera = useCallback(() => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    // Clear specific device selection when flipping
    setSelectedDevice('');
  }, [facingMode]);

  // Upload captured photo
  const uploadPhoto = useCallback(async () => {
    if (!capturedImage) return;

    setIsUploading(true);
    try {
      // Convert data URL to blob
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      
      // Create file name with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `capture-${timestamp}.jpg`;
      
      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64.split(',')[1]); // Remove data URL prefix
        };
      });
      reader.readAsDataURL(blob);
      const base64Data = await base64Promise;

      // Upload via tRPC
      const result = await createFileMutation.mutateAsync({
        filename: fileName,
        mimeType: 'image/jpeg',
        fileSize: blob.size,
        content: base64Data,
      });

      toast.success('Photo captured and uploaded!', {
        description: 'AI enrichment will process your photo automatically.',
      });

      // Invalidate file queries to refresh the list
      utils.files.list.invalidate();
      
      // Close dialog and notify parent
      onOpenChange(false);
      setCapturedImage(null);
      
      if (onCaptureComplete && result && typeof result === 'number') {
        onCaptureComplete(result);
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to upload photo', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setIsUploading(false);
    }
  }, [capturedImage, createFileMutation, utils, onOpenChange, onCaptureComplete]);

  // Start camera when dialog opens
  useEffect(() => {
    if (open && !capturedImage) {
      startCamera();
    }
    return () => {
      if (!open) {
        stopCamera();
        setCapturedImage(null);
        setCameraError(null);
      }
    };
  }, [open, startCamera, stopCamera, capturedImage]);

  // Restart camera when facing mode or device changes
  useEffect(() => {
    if (open && isStreaming) {
      startCamera();
    }
  }, [facingMode, selectedDevice, resolution]);

  const shouldMirror = facingMode === 'user' && mirrorFront && !capturedImage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            Capture Photo
          </DialogTitle>
          <DialogDescription>
            Take a photo to add to your library with automatic AI enrichment
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-[4/3] bg-black">
          {/* Camera Error State */}
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <Camera className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4">{cameraError}</p>
              <Button onClick={startCamera} variant="outline" size="sm">
                <RotateCcw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            </div>
          )}

          {/* Video Preview */}
          {!cameraError && !capturedImage && (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${shouldMirror ? 'scale-x-[-1]' : ''}`}
              />
              {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="w-8 h-8 animate-spin text-white" />
                </div>
              )}
              {/* Camera mode indicator */}
              {isStreaming && (
                <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/60 text-white px-2 py-1 rounded text-xs">
                  <Camera className="h-3 w-3" />
                  {facingMode === 'user' ? 'Front' : 'Back'} • {resolution}
                </div>
              )}
            </>
          )}

          {/* Captured Image Preview */}
          {capturedImage && (
            <img
              src={capturedImage}
              alt="Captured"
              className="w-full h-full object-cover"
            />
          )}

          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Controls */}
        <div className="p-4 flex items-center justify-center gap-4">
          {!capturedImage ? (
            <>
              {/* Switch Camera Button */}
              <Button
                variant="outline"
                size="icon"
                onClick={switchCamera}
                disabled={!isStreaming || !!cameraError}
                className="rounded-full min-h-[44px] min-w-[44px]"
                title={facingMode === 'user' ? 'Switch to back camera' : 'Switch to front camera'}
              >
                <SwitchCamera className="w-5 h-5" />
              </Button>

              {/* Capture Button */}
              <Button
                size="lg"
                onClick={capturePhoto}
                disabled={!isStreaming || !!cameraError}
                className="rounded-full w-16 h-16 p-0 active:scale-95 transition-transform"
              >
                <div className="w-12 h-12 rounded-full bg-white" />
              </Button>

              {/* Close Button */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="rounded-full min-h-[44px] min-w-[44px]"
              >
                <X className="w-5 h-5" />
              </Button>
            </>
          ) : (
            <>
              {/* Retake Button */}
              <Button
                variant="outline"
                onClick={retakePhoto}
                disabled={isUploading}
                className="min-h-[44px]"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Retake
              </Button>

              {/* Upload Button */}
              <Button
                onClick={uploadPhoto}
                disabled={isUploading}
                className="min-w-[140px] min-h-[44px]"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Save & Enrich
                  </>
                )}
              </Button>

              {/* Cancel Button */}
              <Button
                variant="outline"
                onClick={() => {
                  setCapturedImage(null);
                  onOpenChange(false);
                }}
                disabled={isUploading}
                className="min-h-[44px]"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </>
          )}
        </div>

        {/* Camera Settings Row */}
        {!capturedImage && (
          <div className="px-4 pb-2 flex flex-wrap items-center gap-2">
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger className="w-[90px] h-8">
                <div className="flex items-center gap-1">
                  <Monitor className="h-3 w-3" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {PHOTO_RESOLUTION_OPTIONS.map(opt => (
                  <SelectItem key={opt.label} value={opt.label}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {videoDevices.length > 1 && (
              <Select value={selectedDevice || 'auto'} onValueChange={(val) => {
                setSelectedDevice(val === 'auto' ? '' : val);
              }}>
                <SelectTrigger className="h-8 flex-1 min-w-[120px]">
                  <SelectValue placeholder="Auto camera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto ({facingMode === 'user' ? 'Front' : 'Back'})</SelectItem>
                  {videoDevices.map((device, idx) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${idx + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              variant={mirrorFront ? 'default' : 'outline'}
              size="sm"
              className="h-8 gap-1 ml-auto"
              onClick={() => setMirrorFront(!mirrorFront)}
              disabled={facingMode !== 'user'}
              title="Mirror front camera"
            >
              <FlipHorizontal className="h-3 w-3" />
              <span className="text-xs">Mirror</span>
            </Button>
          </div>
        )}

        {/* Premium Badge */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ImagePlus className="w-3 h-3" />
            <span>Premium Feature • Photos are auto-enriched with AI</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CameraCapture;
