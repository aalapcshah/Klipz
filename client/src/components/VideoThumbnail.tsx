import { useState, useRef, useEffect } from "react";
import { Video, Play } from "lucide-react";

interface VideoThumbnailProps {
  src: string;
  alt?: string;
  className?: string;
  showPlayIcon?: boolean;
  seekTime?: number;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * VideoThumbnail captures a frame from a video URL at the specified seekTime
 * and renders it as an image with an optional play icon overlay.
 * Falls back to a generic video icon if the frame capture fails.
 */
export function VideoThumbnail({
  src,
  alt = "Video thumbnail",
  className = "",
  showPlayIcon = true,
  seekTime = 1,
  onClick,
}: VideoThumbnailProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const attemptedRef = useRef(false);

  useEffect(() => {
    // Reset state when src changes
    setThumbnailUrl(null);
    setError(false);
    attemptedRef.current = false;
  }, [src]);

  useEffect(() => {
    if (attemptedRef.current || thumbnailUrl || error) return;
    attemptedRef.current = true;

    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    videoRef.current = video;
    canvasRef.current = canvas;

    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "metadata";

    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
      video.src = "";
      video.load();
    };

    const onSeeked = () => {
      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          setThumbnailUrl(dataUrl);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      }
      cleanup();
    };

    const onLoaded = () => {
      // Seek to seekTime or 10% of duration, whichever is smaller
      const targetTime = Math.min(seekTime, video.duration * 0.1);
      video.currentTime = targetTime;
    };

    const onError = () => {
      setError(true);
      cleanup();
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });

    video.src = src;

    return () => {
      cleanup();
    };
  }, [src, seekTime, thumbnailUrl, error]);

  if (thumbnailUrl) {
    return (
      <div className={`relative ${className}`} onClick={onClick}>
        <img
          src={thumbnailUrl}
          alt={alt}
          className="w-full h-full object-cover rounded"
          loading="lazy"
        />
        {showPlayIcon && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
              <Play className="h-4 w-4 text-white ml-0.5" />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center ${className}`} onClick={onClick}>
        <div className="text-primary">
          <Video className="h-5 w-5" />
        </div>
      </div>
    );
  }

  // Loading state
  return (
    <div className={`flex items-center justify-center animate-pulse bg-muted/50 ${className}`}>
      <Video className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}
