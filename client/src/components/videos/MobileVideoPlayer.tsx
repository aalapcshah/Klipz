import { useRef, useState, useCallback, useEffect } from "react";
import { SkipBack, SkipForward, Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";

interface MobileVideoPlayerProps {
  id: string;
  url: string;
  transcodedUrl?: string;
  mimeType?: string;
  thumbnailUrl?: string;
  duration?: number;
  className?: string;
  onVideoRef?: (el: HTMLVideoElement | null) => void;
}

export function MobileVideoPlayer({
  id,
  url,
  transcodedUrl,
  mimeType,
  thumbnailUrl,
  duration,
  className = "",
  onVideoRef,
}: MobileVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(duration || 0);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSkipIndicator, setShowSkipIndicator] = useState<"forward" | "backward" | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Touch gesture state
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Detect mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || "ontouchstart" in window);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (onVideoRef) {
      onVideoRef(videoRef.current);
    }
  }, [onVideoRef]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  const skip = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    setShowSkipIndicator(seconds > 0 ? "forward" : "backward");
    setTimeout(() => setShowSkipIndicator(null), 600);
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }, []);

  // Handle double-tap to skip
  const handleTap = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!isMobile) return;

      const now = Date.now();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const clientX = "touches" in e ? e.changedTouches[0].clientX : e.clientX;
      const relativeX = clientX - rect.left;
      const isLeftSide = relativeX < rect.width / 2;

      if (lastTapRef.current && now - lastTapRef.current.time < 300) {
        // Double tap detected
        e.preventDefault();
        if (isLeftSide) {
          skip(-10);
        } else {
          skip(10);
        }
        lastTapRef.current = null;
      } else {
        lastTapRef.current = { time: now, x: relativeX };
        // Single tap - toggle controls after a short delay
        setTimeout(() => {
          if (lastTapRef.current && now === lastTapRef.current.time) {
            showControlsTemporarily();
          }
        }, 300);
      }
    },
    [isMobile, skip, showControlsTemporarily]
  );

  // Handle swipe to seek
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const elapsed = Date.now() - touchStartRef.current.time;

      // Only process horizontal swipes (not vertical scrolls)
      if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 2 && elapsed < 500) {
        const seekAmount = Math.min(Math.abs(deltaX) / 10, 30); // Max 30s seek
        if (deltaX > 0) {
          skip(seekAmount);
        } else {
          skip(-seekAmount);
        }
      }
      touchStartRef.current = null;
    },
    [skip]
  );

  // Handle seek bar touch/click
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const bar = e.currentTarget;
    if (!video || !bar) return;

    const rect = bar.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    video.currentTime = percent * video.duration;
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  // Video event handlers
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setCurrentTime(video.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setVideoDuration(video.duration);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setShowControls(true);
  }, []);

  const progress = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;

  // For non-mobile, use native controls
  if (!isMobile) {
    return (
      <div className={`relative aspect-video bg-black rounded-lg overflow-hidden ${className}`}>
        <video
          id={id}
          ref={(el) => {
            (videoRef as any).current = el;
            onVideoRef?.(el);
          }}
          className="w-full h-full object-contain"
          controls
          preload="metadata"
          poster={thumbnailUrl || undefined}
          crossOrigin="anonymous"
        >
          {transcodedUrl && <source src={transcodedUrl} type="video/mp4" />}
          <source
            src={url}
            type={mimeType || (url.endsWith(".webm") ? "video/webm" : "video/mp4")}
          />
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative aspect-video bg-black rounded-lg overflow-hidden select-none ${className}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={(e) => {
        handleTouchEnd(e);
        handleTap(e);
      }}
      onClick={handleTap}
    >
      {/* Video element - no native controls on mobile */}
      <video
        id={id}
        ref={(el) => {
          (videoRef as any).current = el;
          onVideoRef?.(el);
        }}
        className="w-full h-full object-contain"
        preload="metadata"
        poster={thumbnailUrl || undefined}
        crossOrigin="anonymous"
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      >
        {transcodedUrl && <source src={transcodedUrl} type="video/mp4" />}
        <source
          src={url}
          type={mimeType || (url.endsWith(".webm") ? "video/webm" : "video/mp4")}
        />
      </video>

      {/* Skip indicators */}
      {showSkipIndicator && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${
            showSkipIndicator === "backward" ? "left-8" : "right-8"
          } bg-black/60 rounded-full p-4 animate-ping`}
        >
          {showSkipIndicator === "backward" ? (
            <SkipBack className="w-8 h-8 text-white" />
          ) : (
            <SkipForward className="w-8 h-8 text-white" />
          )}
        </div>
      )}

      {/* Double-tap hint zones */}
      {showControls && !isPlaying && (
        <>
          <div className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30 text-xs pointer-events-none">
            ← 2x tap
          </div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 text-xs pointer-events-none">
            2x tap →
          </div>
        </>
      )}

      {/* Custom mobile controls overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Gradient background for controls */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

        {/* Center play/pause button */}
        <button
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/50 rounded-full p-4 active:scale-90 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {isPlaying ? (
            <Pause className="w-10 h-10 text-white" fill="white" />
          ) : (
            <Play className="w-10 h-10 text-white" fill="white" />
          )}
        </button>

        {/* Bottom controls bar */}
        <div className="relative z-10 px-3 pb-3 pt-8">
          {/* Progress bar - larger touch target */}
          <div
            className="w-full h-8 flex items-center cursor-pointer mb-1"
            onClick={handleSeek}
            onTouchStart={handleSeek}
          >
            <div className="w-full h-1.5 bg-white/30 rounded-full relative">
              <div
                className="h-full bg-teal-400 rounded-full relative"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-teal-400 rounded-full shadow-lg" />
              </div>
            </div>
          </div>

          {/* Time and controls row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Skip backward */}
              <button
                className="p-2 active:scale-90 transition-transform"
                onClick={(e) => {
                  e.stopPropagation();
                  skip(-10);
                }}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                <SkipBack className="w-5 h-5 text-white" />
              </button>

              {/* Play/Pause small */}
              <button
                className="p-2 active:scale-90 transition-transform"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 text-white" fill="white" />
                ) : (
                  <Play className="w-5 h-5 text-white" fill="white" />
                )}
              </button>

              {/* Skip forward */}
              <button
                className="p-2 active:scale-90 transition-transform"
                onClick={(e) => {
                  e.stopPropagation();
                  skip(10);
                }}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                <SkipForward className="w-5 h-5 text-white" />
              </button>

              {/* Time display */}
              <span className="text-white text-xs font-mono">
                {formatTime(currentTime)} / {formatTime(videoDuration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Mute toggle */}
              <button
                className="p-2 active:scale-90 transition-transform"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5 text-white" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" />
                )}
              </button>

              {/* Fullscreen */}
              <button
                className="p-2 active:scale-90 transition-transform"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                <Maximize className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
