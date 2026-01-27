// Browser Push Notification Service for Upload Events

const NOTIFICATION_STORAGE_KEY = 'metaclips-notification-settings';

export interface NotificationSettings {
  enabled: boolean;
  soundEnabled: boolean;
  onUploadComplete: boolean;
  onUploadFailed: boolean;
  onScheduledStart: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  soundEnabled: true,
  onUploadComplete: true,
  onUploadFailed: true,
  onScheduledStart: true,
};

// Load settings from localStorage
export function getNotificationSettings(): NotificationSettings {
  try {
    const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('[Notifications] Failed to load settings:', e);
  }
  return DEFAULT_SETTINGS;
}

// Save settings to localStorage
export function saveNotificationSettings(settings: NotificationSettings): void {
  try {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('[Notifications] Failed to save settings:', e);
  }
}

// Check if notifications are supported
export function isNotificationSupported(): boolean {
  return 'Notification' in window;
}

// Get current permission status
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (e) {
    console.error('[Notifications] Failed to request permission:', e);
    return 'denied';
  }
}

// Play notification sound
function playNotificationSound(type: 'success' | 'error' | 'info'): void {
  const settings = getNotificationSettings();
  if (!settings.soundEnabled) return;
  
  // Create a simple beep using Web Audio API
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Different frequencies for different notification types
    const frequencies = {
      success: [523.25, 659.25, 783.99], // C5, E5, G5 (major chord arpeggio)
      error: [392, 349.23], // G4, F4 (descending)
      info: [523.25, 587.33], // C5, D5 (ascending)
    };
    
    const freqs = frequencies[type];
    const duration = 0.15;
    
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    
    freqs.forEach((freq, i) => {
      oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + i * duration);
    });
    
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + freqs.length * duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + freqs.length * duration);
  } catch (e) {
    // Audio not available, silently fail
    console.debug('[Notifications] Audio not available:', e);
  }
}

// Show a browser notification
export function showNotification(
  title: string,
  options?: {
    body?: string;
    icon?: string;
    tag?: string;
    type?: 'success' | 'error' | 'info';
    onClick?: () => void;
  }
): void {
  const settings = getNotificationSettings();
  
  if (!settings.enabled) {
    return;
  }
  
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return;
  }
  
  try {
    const notification = new Notification(title, {
      body: options?.body,
      icon: options?.icon || '/favicon.ico',
      tag: options?.tag,
      silent: !settings.soundEnabled, // Let browser handle sound if we're not playing custom
    });
    
    // Play custom sound
    if (settings.soundEnabled && options?.type) {
      playNotificationSound(options.type);
    }
    
    if (options?.onClick) {
      notification.onclick = () => {
        window.focus();
        options.onClick?.();
        notification.close();
      };
    }
    
    // Auto-close after 5 seconds
    setTimeout(() => {
      notification.close();
    }, 5000);
  } catch (e) {
    console.error('[Notifications] Failed to show notification:', e);
  }
}

// Specific notification helpers for upload events
export function notifyUploadComplete(filename: string, onClick?: () => void): void {
  const settings = getNotificationSettings();
  if (!settings.onUploadComplete) return;
  
  showNotification('Upload Complete', {
    body: `${filename} has been uploaded successfully.`,
    tag: 'upload-complete',
    type: 'success',
    onClick,
  });
}

export function notifyUploadFailed(filename: string, error?: string, onClick?: () => void): void {
  const settings = getNotificationSettings();
  if (!settings.onUploadFailed) return;
  
  showNotification('Upload Failed', {
    body: error ? `${filename}: ${error}` : `${filename} failed to upload.`,
    tag: 'upload-failed',
    type: 'error',
    onClick,
  });
}

export function notifyScheduledUploadStarted(filename: string, onClick?: () => void): void {
  const settings = getNotificationSettings();
  if (!settings.onScheduledStart) return;
  
  showNotification('Scheduled Upload Started', {
    body: `${filename} is now uploading.`,
    tag: 'upload-scheduled',
    type: 'info',
    onClick,
  });
}

export function notifyAllUploadsComplete(count: number, onClick?: () => void): void {
  const settings = getNotificationSettings();
  if (!settings.onUploadComplete) return;
  
  showNotification('All Uploads Complete', {
    body: `${count} file${count > 1 ? 's' : ''} uploaded successfully.`,
    tag: 'uploads-complete',
    type: 'success',
    onClick,
  });
}
