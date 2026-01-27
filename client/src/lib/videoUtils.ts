/**
 * Video utilities for duration extraction and thumbnail generation
 */

/**
 * Extract video duration from a File object
 * @param file Video file
 * @returns Promise with duration in seconds
 */
export function extractVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(Math.round(video.duration));
    };
    
    video.onerror = () => {
      window.URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };
    
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Extract video duration from a URL
 * @param url Video URL
 * @returns Promise with duration in seconds
 */
export function extractVideoDurationFromUrl(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';
    
    video.onloadedmetadata = () => {
      resolve(Math.round(video.duration));
    };
    
    video.onerror = () => {
      reject(new Error('Failed to load video metadata'));
    };
    
    video.src = url;
  });
}

/**
 * Generate a thumbnail from a video file
 * @param file Video file
 * @param seekTime Time in seconds to capture thumbnail (default: 1 second)
 * @param maxWidth Maximum thumbnail width (default: 320)
 * @param maxHeight Maximum thumbnail height (default: 180)
 * @returns Promise with thumbnail as Blob
 */
export function generateVideoThumbnail(
  file: File,
  seekTime: number = 1,
  maxWidth: number = 320,
  maxHeight: number = 180
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    
    video.onloadedmetadata = () => {
      // Seek to the specified time or 10% of duration if seekTime > duration
      const targetTime = Math.min(seekTime, video.duration * 0.1);
      video.currentTime = targetTime;
    };
    
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        // Calculate dimensions maintaining aspect ratio
        let width = video.videoWidth;
        let height = video.videoHeight;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, width, height);
        
        // Convert to blob
        canvas.toBlob(
          (blob) => {
            window.URL.revokeObjectURL(video.src);
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to generate thumbnail blob'));
            }
          },
          'image/jpeg',
          0.8
        );
      } catch (error) {
        window.URL.revokeObjectURL(video.src);
        reject(error);
      }
    };
    
    video.onerror = () => {
      window.URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video for thumbnail'));
    };
    
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Generate a thumbnail from a video URL
 * @param url Video URL
 * @param seekTime Time in seconds to capture thumbnail (default: 1 second)
 * @param maxWidth Maximum thumbnail width (default: 320)
 * @param maxHeight Maximum thumbnail height (default: 180)
 * @returns Promise with thumbnail as Blob
 */
export function generateVideoThumbnailFromUrl(
  url: string,
  seekTime: number = 1,
  maxWidth: number = 320,
  maxHeight: number = 180
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    
    video.onloadedmetadata = () => {
      const targetTime = Math.min(seekTime, video.duration * 0.1);
      video.currentTime = targetTime;
    };
    
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        let width = video.videoWidth;
        let height = video.videoHeight;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(video, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to generate thumbnail blob'));
            }
          },
          'image/jpeg',
          0.8
        );
      } catch (error) {
        reject(error);
      }
    };
    
    video.onerror = () => {
      reject(new Error('Failed to load video for thumbnail'));
    };
    
    video.src = url;
  });
}

/**
 * Video resolution info
 */
export interface VideoResolution {
  width: number;
  height: number;
}

/**
 * Extract video resolution from a File object
 * @param file Video file
 * @returns Promise with resolution (width, height)
 */
export function extractVideoResolution(file: File): Promise<VideoResolution> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve({
        width: video.videoWidth,
        height: video.videoHeight
      });
    };
    
    video.onerror = () => {
      window.URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };
    
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Extract video metadata (duration and resolution) from a File object
 * @param file Video file
 * @returns Promise with duration and resolution
 */
export function extractVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve({
        duration: Math.round(video.duration),
        width: video.videoWidth,
        height: video.videoHeight
      });
    };
    
    video.onerror = () => {
      window.URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };
    
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Get resolution label from dimensions (e.g., "1080p", "4K", "720p")
 * @param width Video width in pixels
 * @param height Video height in pixels
 * @returns Resolution label string
 */
export function getResolutionLabel(width: number | null | undefined, height: number | null | undefined): string {
  if (!width || !height) return '';
  
  // Use the smaller dimension to determine quality (handles both landscape and portrait)
  const minDim = Math.min(width, height);
  const maxDim = Math.max(width, height);
  
  // Check for common resolutions based on height (for landscape) or width (for portrait)
  if (maxDim >= 7680) return '8K';
  if (maxDim >= 3840) return '4K';
  if (maxDim >= 2560) return '1440p';
  if (maxDim >= 1920 || minDim >= 1080) return '1080p';
  if (maxDim >= 1280 || minDim >= 720) return '720p';
  if (maxDim >= 854 || minDim >= 480) return '480p';
  if (maxDim >= 640 || minDim >= 360) return '360p';
  return `${minDim}p`;
}

/**
 * Get full resolution string (e.g., "1920×1080")
 * @param width Video width in pixels
 * @param height Video height in pixels
 * @returns Full resolution string
 */
export function getFullResolution(width: number | null | undefined, height: number | null | undefined): string {
  if (!width || !height) return '';
  return `${width}×${height}`;
}

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 * @param seconds Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
