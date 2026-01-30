import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, SwitchCamera, X, Check, RotateCcw, Loader2, Sparkles, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface CameraCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptureComplete?: (fileId: number) => void;
}

export function CameraCapture({ open, onOpenChange, onCaptureComplete }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isUploading, setIsUploading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const createFileMutation = trpc.files.create.useMutation();
  const utils = trpc.useUtils();

  // Start camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsStreaming(true);
      }
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
  }, [facingMode]);

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

    // If using front camera, flip horizontally for mirror effect
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    
    ctx.drawImage(video, 0, 0);
    
    // Get image data URL
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(imageDataUrl);
    
    // Stop the camera while reviewing
    stopCamera();
  }, [facingMode, stopCamera]);

  // Retake photo
  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
    startCamera();
  }, [startCamera]);

  // Switch camera (front/back)
  const switchCamera = useCallback(() => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  }, []);

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

  // Restart camera when facing mode changes
  useEffect(() => {
    if (open && isStreaming) {
      startCamera();
    }
  }, [facingMode]);

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
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              />
              {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="w-8 h-8 animate-spin text-white" />
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
                className="rounded-full"
              >
                <SwitchCamera className="w-5 h-5" />
              </Button>

              {/* Capture Button */}
              <Button
                size="lg"
                onClick={capturePhoto}
                disabled={!isStreaming || !!cameraError}
                className="rounded-full w-16 h-16 p-0"
              >
                <div className="w-12 h-12 rounded-full bg-white" />
              </Button>

              {/* Close Button */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="rounded-full"
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
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Retake
              </Button>

              {/* Upload Button */}
              <Button
                onClick={uploadPhoto}
                disabled={isUploading}
                className="min-w-[140px]"
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
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </>
          )}
        </div>

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
