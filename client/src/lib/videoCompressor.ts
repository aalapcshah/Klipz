/**
 * Client-side video compression using the browser's MediaRecorder API.
 * This re-encodes video at a lower bitrate without requiring external libraries.
 * 
 * Supported browsers: Chrome, Edge, Firefox (with VP8/VP9/H264 codecs)
 * Falls back gracefully if compression is not supported.
 */

export interface CompressionOptions {
  /** Target quality preset */
  quality: 'high' | 'medium' | 'low';
  /** Maximum width (height auto-scales to maintain aspect ratio) */
  maxWidth?: number;
  /** Progress callback (0-1) */
  onProgress?: (progress: number) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  duration: number; // ms
  width: number;
  height: number;
}

// Quality presets: videoBitrate in bps
const QUALITY_PRESETS = {
  high: { videoBitrate: 4_000_000, audioBitrate: 128_000, maxWidth: 1920 },
  medium: { videoBitrate: 2_000_000, audioBitrate: 96_000, maxWidth: 1280 },
  low: { videoBitrate: 1_000_000, audioBitrate: 64_000, maxWidth: 854 },
};

/**
 * Check if the browser supports client-side video compression
 */
export function isCompressionSupported(): boolean {
  if (typeof MediaRecorder === 'undefined') return false;
  if (typeof document === 'undefined') return false;
  // Check for canvas captureStream support
  const canvas = document.createElement('canvas');
  if (typeof canvas.captureStream !== 'function') return false;
  // Check for at least one supported codec
  return getSupportedMimeType() !== null;
}

/**
 * Get the best supported MIME type for recording
 */
function getSupportedMimeType(): string | null {
  const types = [
    'video/webm;codecs=h264,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

/**
 * Get video metadata (duration, width, height) from a File
 */
function getVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    
    const url = URL.createObjectURL(file);
    
    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      URL.revokeObjectURL(url);
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video metadata'));
    };
    
    video.src = url;
  });
}

/**
 * Compress a video file using the browser's MediaRecorder API.
 * 
 * This works by:
 * 1. Playing the video through an offscreen <video> element
 * 2. Drawing each frame to a <canvas>
 * 3. Capturing the canvas stream + audio stream
 * 4. Re-encoding via MediaRecorder at a lower bitrate
 */
export async function compressVideo(
  file: File,
  options: CompressionOptions
): Promise<CompressionResult> {
  const startTime = Date.now();
  const mimeType = getSupportedMimeType();
  
  if (!mimeType) {
    throw new Error('Video compression is not supported in this browser');
  }

  const preset = QUALITY_PRESETS[options.quality];
  const maxWidth = options.maxWidth || preset.maxWidth;

  // Get video metadata
  const metadata = await getVideoMetadata(file);
  
  // Calculate target dimensions
  let targetWidth = metadata.width;
  let targetHeight = metadata.height;
  if (targetWidth > maxWidth) {
    const scale = maxWidth / targetWidth;
    targetWidth = maxWidth;
    targetHeight = Math.round(metadata.height * scale);
  }
  // Ensure even dimensions (required by most codecs)
  targetWidth = Math.round(targetWidth / 2) * 2;
  targetHeight = Math.round(targetHeight / 2) * 2;

  return new Promise((resolve, reject) => {
    // Check for cancellation
    if (options.signal?.aborted) {
      reject(new DOMException('Compression cancelled', 'AbortError'));
      return;
    }

    // Create offscreen video element
    const video = document.createElement('video');
    video.muted = false; // Need audio for capture
    video.playsInline = true;
    
    // Create canvas for frame capture
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d')!;

    const url = URL.createObjectURL(file);
    const chunks: Blob[] = [];

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.pause();
      video.src = '';
      video.load();
    };

    // Handle abort
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Compression cancelled', 'AbortError'));
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    video.onloadeddata = async () => {
      try {
        // Capture canvas stream
        const canvasStream = canvas.captureStream(30); // 30 fps
        
        // Try to capture audio from the video
        let combinedStream: MediaStream;
        try {
          // Create an AudioContext to capture audio
          const audioCtx = new AudioContext();
          const source = audioCtx.createMediaElementSource(video);
          const dest = audioCtx.createMediaStreamDestination();
          source.connect(dest);
          source.connect(audioCtx.destination); // Also connect to speakers (muted video)
          
          // Combine video (canvas) + audio streams
          const audioTracks = dest.stream.getAudioTracks();
          const videoTracks = canvasStream.getVideoTracks();
          combinedStream = new MediaStream([...videoTracks, ...audioTracks]);
        } catch {
          // If audio capture fails, just use video-only stream
          combinedStream = canvasStream;
        }

        // Create MediaRecorder
        const recorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond: preset.videoBitrate,
          audioBitsPerSecond: preset.audioBitrate,
        });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          cleanup();
          options.signal?.removeEventListener('abort', onAbort);
          
          const blob = new Blob(chunks, { type: mimeType });
          const duration = Date.now() - startTime;
          
          resolve({
            blob,
            originalSize: file.size,
            compressedSize: blob.size,
            compressionRatio: blob.size / file.size,
            duration,
            width: targetWidth,
            height: targetHeight,
          });
        };

        recorder.onerror = (e) => {
          cleanup();
          options.signal?.removeEventListener('abort', onAbort);
          reject(new Error(`Recording error: ${(e as any).error?.message || 'Unknown'}`));
        };

        // Start recording
        recorder.start(1000); // Collect data every second

        // Draw frames to canvas
        const drawFrame = () => {
          if (options.signal?.aborted) return;
          if (video.paused || video.ended) return;
          
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          
          // Report progress
          if (options.onProgress && metadata.duration > 0) {
            options.onProgress(Math.min(video.currentTime / metadata.duration, 1));
          }
          
          requestAnimationFrame(drawFrame);
        };

        video.onended = () => {
          // Draw final frame
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          options.onProgress?.(1);
          
          // Stop recording after a short delay to ensure all data is captured
          setTimeout(() => {
            if (recorder.state === 'recording') {
              recorder.stop();
            }
          }, 500);
        };

        // Mute the video element (audio captured via AudioContext)
        video.muted = true;
        video.volume = 0;
        
        // Start playback
        await video.play();
        drawFrame();
        
      } catch (err) {
        cleanup();
        options.signal?.removeEventListener('abort', onAbort);
        reject(err);
      }
    };

    video.onerror = () => {
      cleanup();
      options.signal?.removeEventListener('abort', onAbort);
      reject(new Error('Failed to load video for compression'));
    };

    video.src = url;
  });
}

/**
 * Estimate the compressed file size based on quality preset and video duration
 */
export function estimateCompressedSize(
  originalSize: number,
  durationSeconds: number,
  quality: CompressionOptions['quality']
): number {
  const preset = QUALITY_PRESETS[quality];
  // Estimated size = (videoBitrate + audioBitrate) * duration / 8
  const estimatedBytes = ((preset.videoBitrate + preset.audioBitrate) * durationSeconds) / 8;
  // Don't estimate larger than original
  return Math.min(estimatedBytes, originalSize);
}

/**
 * Format bytes to human-readable string
 */
export function formatCompressedSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
