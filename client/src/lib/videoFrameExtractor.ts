/**
 * Client-side video frame extraction using HTML5 Canvas.
 * Works on all devices (desktop, laptop, Android, iPhone) because it uses
 * the browser's native video decoder — no FFmpeg needed.
 */

export interface ExtractedFrame {
  /** Time in seconds from the start of the video */
  timestamp: number;
  /** Base64-encoded JPEG image data (without data: prefix) */
  base64: string;
}

export interface FrameExtractionOptions {
  /** Interval in seconds between frames (default: 5) */
  intervalSeconds?: number;
  /** Maximum number of frames to extract (default: 30) */
  maxFrames?: number;
  /** Maximum width of extracted frames (default: 640) */
  maxWidth?: number;
  /** JPEG quality 0-1 (default: 0.7) */
  quality?: number;
  /** Progress callback */
  onProgress?: (current: number, total: number) => void;
}

export interface FrameExtractionResult {
  frames: ExtractedFrame[];
  videoDuration: number;
}

/**
 * Extract frames from a video URL using HTML5 Canvas.
 * The video is loaded in a hidden <video> element, seeked to specific timestamps,
 * and each frame is captured to a canvas and exported as JPEG.
 */
export async function extractVideoFrames(
  videoUrl: string,
  options: FrameExtractionOptions = {}
): Promise<FrameExtractionResult> {
  const {
    intervalSeconds = 5,
    maxFrames = 30,
    maxWidth = 640,
    quality = 0.7,
    onProgress,
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    // Set a timeout for the entire operation
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Frame extraction timed out after 120 seconds"));
    }, 120_000);

    function cleanup() {
      clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
    }

    video.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load video: ${video.error?.message || "unknown error"}`));
    };

    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration;
        if (!duration || !isFinite(duration) || duration <= 0) {
          cleanup();
          reject(new Error("Could not determine video duration"));
          return;
        }

        // Calculate timestamps to extract
        const timestamps: number[] = [];
        for (let t = 0; t < duration; t += intervalSeconds) {
          timestamps.push(t);
          if (timestamps.length >= maxFrames) break;
        }
        // Always include the last frame if we haven't already
        if (timestamps.length < maxFrames && timestamps[timestamps.length - 1] < duration - 1) {
          timestamps.push(Math.max(0, duration - 0.5));
        }

        // Calculate canvas dimensions maintaining aspect ratio
        const scale = Math.min(1, maxWidth / video.videoWidth);
        const canvasWidth = Math.round(video.videoWidth * scale);
        const canvasHeight = Math.round(video.videoHeight * scale);

        const canvas = document.createElement("canvas");
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          reject(new Error("Could not create canvas context"));
          return;
        }

        const frames: ExtractedFrame[] = [];

        for (let i = 0; i < timestamps.length; i++) {
          const timestamp = timestamps[i];
          onProgress?.(i + 1, timestamps.length);

          try {
            await seekToTime(video, timestamp);
            ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);
            const dataUrl = canvas.toDataURL("image/jpeg", quality);
            const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
            frames.push({ timestamp, base64 });
          } catch (seekError) {
            console.warn(`Failed to extract frame at ${timestamp}s:`, seekError);
            // Skip this frame and continue
          }
        }

        cleanup();

        if (frames.length === 0) {
          reject(new Error("Could not extract any frames from the video"));
          return;
        }

        resolve({ frames, videoDuration: duration });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.src = videoUrl;
  });
}

/**
 * Seek the video to a specific time and wait for the frame to be ready.
 */
function seekToTime(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Seek to ${time}s timed out`));
    }, 10_000);

    function onSeeked() {
      clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      // Small delay to ensure the frame is rendered
      requestAnimationFrame(() => resolve());
    }

    function onError() {
      clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error(`Error seeking to ${time}s`));
    }

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = time;
  });
}
