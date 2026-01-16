import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Video,
  VideoOff,
  Circle,
  Square,
  Loader2,
  Upload,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { uploadFileToStorage } from "@/lib/storage";

export function VideoRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const createVideoMutation = trpc.videos.create.useMutation();
  const trpcUtils = trpc.useUtils();

  useEffect(() => {
    return () => {
      stopCamera();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsPreviewing(true);
    } catch (error) {
      toast.error("Failed to access camera");
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

  const handleUpload = async () => {
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

  const handleDiscard = () => {
    setRecordedBlob(null);
    setRecordingTime(0);
    if (videoRef.current) {
      videoRef.current.src = "";
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        {/* Video Preview */}
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden mb-4">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={!recordedBlob}
            controls={!!recordedBlob}
            className="w-full h-full object-contain"
          />

          {/* Recording Indicator */}
          {isRecording && (
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-destructive text-destructive-foreground px-3 py-2 rounded-md">
              <Circle className="h-4 w-4 fill-current animate-pulse" />
              <span className="font-mono font-bold">{formatTime(recordingTime)}</span>
            </div>
          )}

          {/* Status Badge */}
          {!isPreviewing && !recordedBlob && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white">
                <VideoOff className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg opacity-75">Camera Off</p>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          {!isPreviewing && !recordedBlob && (
            <Button onClick={startCamera} size="lg">
              <Video className="h-5 w-5 mr-2" />
              Start Camera
            </Button>
          )}

          {isPreviewing && !isRecording && (
            <>
              <Button onClick={stopCamera} variant="outline">
                <VideoOff className="h-4 w-4 mr-2" />
                Stop Camera
              </Button>
              <Button onClick={startRecording} size="lg" className="bg-destructive hover:bg-destructive/90">
                <Circle className="h-5 w-5 mr-2" />
                Start Recording
              </Button>
            </>
          )}

          {isRecording && (
            <Button onClick={stopRecording} size="lg" variant="destructive">
              <Square className="h-5 w-5 mr-2" />
              Stop Recording
            </Button>
          )}

          {recordedBlob && !uploading && (
            <>
              <Button onClick={handleDiscard} variant="outline">
                Discard
              </Button>
              <Button onClick={handleUpload} size="lg">
                <Upload className="h-5 w-5 mr-2" />
                Upload Video
              </Button>
            </>
          )}

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
      </Card>

      {/* Instructions */}
      <Card className="p-4 bg-accent/10 border-accent">
        <div className="space-y-2">
          <p className="text-sm font-medium">How to use:</p>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Click "Start Camera" to enable your webcam</li>
            <li>Click "Start Recording" when ready</li>
            <li>Click "Stop Recording" when finished</li>
            <li>Review your recording and upload or discard</li>
          </ol>
        </div>
      </Card>
    </div>
  );
}
