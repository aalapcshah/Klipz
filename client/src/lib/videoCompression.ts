/**
 * Video Compression Utility
 * Uses browser's MediaRecorder API to re-encode videos at lower quality
 */

export interface CompressionSettings {
  maxHeight: number | null;
  videoBitrate: number; // kbps
  audioBitrate: number; // kbps
}

export interface CompressionProgress {
  stage: 'loading' | 'processing' | 'encoding' | 'complete';
  progress: number; // 0-100
  estimatedSize?: number;
  elapsedMs?: number; // Time elapsed since compression started
  etaMs?: number; // Estimated time remaining in milliseconds
  videoDuration?: number; // Video duration in seconds for ETA calculation
}

export const COMPRESSION_PRESETS: Record<string, CompressionSettings> = {
  original: { maxHeight: null, videoBitrate: 0, audioBitrate: 0 },
  high: { maxHeight: 1080, videoBitrate: 5000, audioBitrate: 192 },
  medium: { maxHeight: 720, videoBitrate: 2500, audioBitrate: 128 },
  low: { maxHeight: 480, videoBitrate: 1000, audioBitrate: 96 },
};

/**
 * Estimate compressed file size based on video duration and bitrate settings
 */
export function estimateCompressedSize(
  originalSize: number,
  duration: number, // seconds
  settings: CompressionSettings
): number {
  if (!settings.maxHeight || settings.videoBitrate === 0) {
    return originalSize;
  }
  
  // Calculate estimated size: (video bitrate + audio bitrate) * duration / 8
  const totalBitrate = settings.videoBitrate + settings.audioBitrate; // kbps
  const estimatedBytes = (totalBitrate * 1000 * duration) / 8;
  
  // Add 10% overhead for container format
  return Math.round(estimatedBytes * 1.1);
}

/**
 * Get video metadata (duration, width, height)
 */
export function getVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      URL.revokeObjectURL(video.src);
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };
    
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Check if browser supports video compression
 */
export function isCompressionSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && 
         typeof HTMLCanvasElement !== 'undefined' &&
         MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus');
}

/**
 * Compress video using canvas and MediaRecorder
 * This approach re-encodes the video at a lower resolution/bitrate
 */
export async function compressVideo(
  file: File,
  settings: CompressionSettings,
  onProgress?: (progress: CompressionProgress) => void
): Promise<File> {
  // If original quality, return the file as-is
  if (!settings.maxHeight || settings.videoBitrate === 0) {
    onProgress?.({ stage: 'complete', progress: 100 });
    return file;
  }

  if (!isCompressionSupported()) {
    console.warn('Video compression not supported in this browser, returning original file');
    onProgress?.({ stage: 'complete', progress: 100 });
    return file;
  }

  const startTime = Date.now();
  onProgress?.({ stage: 'loading', progress: 0, elapsedMs: 0 });

  // Get video metadata
  const metadata = await getVideoMetadata(file);
  
  // Calculate target dimensions
  let targetWidth = metadata.width;
  let targetHeight = metadata.height;
  
  if (settings.maxHeight && metadata.height > settings.maxHeight) {
    const scale = settings.maxHeight / metadata.height;
    targetWidth = Math.round(metadata.width * scale);
    targetHeight = settings.maxHeight;
  }
  
  // Ensure dimensions are even (required for most codecs)
  targetWidth = Math.round(targetWidth / 2) * 2;
  targetHeight = Math.round(targetHeight / 2) * 2;

  onProgress?.({ stage: 'processing', progress: 10, elapsedMs: Date.now() - startTime, videoDuration: metadata.duration });

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const chunks: Blob[] = [];
    
    // Set up MediaRecorder with target bitrate
    const stream = canvas.captureStream(30); // 30 fps
    
    // Try to capture audio from video
    video.onloadedmetadata = async () => {
      try {
        // Create audio context to capture audio
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(video);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        source.connect(audioContext.destination); // Also connect to speakers (muted)
        
        // Combine video and audio streams
        const audioTrack = destination.stream.getAudioTracks()[0];
        if (audioTrack) {
          stream.addTrack(audioTrack);
        }
      } catch (e) {
        console.warn('Could not capture audio track:', e);
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm;codecs=vp8,opus';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: settings.videoBitrate * 1000,
        audioBitsPerSecond: settings.audioBitrate * 1000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const compressedFile = new File(
          [blob],
          file.name.replace(/\.[^/.]+$/, '_compressed.webm'),
          { type: 'video/webm' }
        );
        
        onProgress?.({ 
          stage: 'complete', 
          progress: 100,
          estimatedSize: compressedFile.size 
        });
        
        resolve(compressedFile);
      };

      recorder.onerror = (e) => {
        reject(new Error('MediaRecorder error: ' + e));
      };

      // Start recording
      recorder.start(1000); // Collect data every second
      video.muted = true;
      video.play();

      onProgress?.({ stage: 'encoding', progress: 20, elapsedMs: Date.now() - startTime, videoDuration: metadata.duration });

      // Draw frames to canvas
      const drawFrame = () => {
        if (video.paused || video.ended) {
          recorder.stop();
          return;
        }
        
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        
        // Update progress with ETA calculation
        const progress = 20 + (video.currentTime / video.duration) * 75;
        const elapsedMs = Date.now() - startTime;
        // ETA based on video playback position vs total duration
        const remainingVideoTime = (video.duration - video.currentTime) * 1000; // Compression runs at ~1x speed
        onProgress?.({ 
          stage: 'encoding', 
          progress: Math.min(progress, 95),
          elapsedMs,
          etaMs: remainingVideoTime,
          videoDuration: metadata.duration
        });
        
        requestAnimationFrame(drawFrame);
      };

      video.onplay = () => {
        drawFrame();
      };

      video.onended = () => {
        setTimeout(() => {
          recorder.stop();
        }, 500); // Small delay to ensure all frames are captured
      };
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video for compression'));
    };

    video.src = URL.createObjectURL(file);
    video.load();
  });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Calculate compression ratio
 */
export function getCompressionRatio(originalSize: number, compressedSize: number): string {
  if (originalSize === 0) return '0%';
  const reduction = ((originalSize - compressedSize) / originalSize) * 100;
  return reduction > 0 ? `-${reduction.toFixed(1)}%` : `+${Math.abs(reduction).toFixed(1)}%`;
}
