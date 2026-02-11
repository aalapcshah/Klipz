/**
 * Extract a thumbnail frame from a video URL using canvas.
 * Works for both direct S3 URLs and streaming URLs.
 * Returns a base64 data URL of the thumbnail image.
 */
export async function extractVideoThumbnail(
  videoUrl: string,
  options: {
    seekTime?: number; // Time in seconds to capture (default: 1)
    maxWidth?: number; // Max thumbnail width (default: 480)
    maxHeight?: number; // Max thumbnail height (default: 270)
    quality?: number; // JPEG quality 0-1 (default: 0.85)
  } = {}
): Promise<string | null> {
  const {
    seekTime = 1,
    maxWidth = 480,
    maxHeight = 270,
    quality = 0.85,
  } = options;

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    
    // Only set crossOrigin for external URLs
    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
      video.crossOrigin = 'anonymous';
    }

    let resolved = false;
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      video.src = '';
      video.load();
    };

    const onError = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(null);
      }
    };

    const onSeeked = () => {
      if (resolved) return;
      resolved = true;

      try {
        const canvas = document.createElement('canvas');
        
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
        
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        
        cleanup();
        resolve(dataUrl);
      } catch (err) {
        console.error('[VideoThumbnail] Canvas capture failed:', err);
        cleanup();
        resolve(null);
      }
    };

    const onLoaded = () => {
      // Seek to the specified time, or 10% of duration if video is short
      const targetTime = Math.min(seekTime, video.duration * 0.1 || seekTime);
      video.currentTime = targetTime;
    };

    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });

    // Timeout after 15 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(null);
      }
    }, 15000);

    video.src = videoUrl;
  });
}
