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
