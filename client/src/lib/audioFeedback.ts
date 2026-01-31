// Audio Feedback Utility
// Provides sound effects for voice commands and user actions

// Audio context for generating sounds
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

// Sound types with their configurations
type SoundType = 'success' | 'error' | 'warning' | 'notification' | 'click' | 'listening' | 'recognized' | 'complete';

interface SoundConfig {
  frequency: number;
  duration: number;
  type: OscillatorType;
  volume: number;
  ramp?: 'up' | 'down' | 'none';
  secondFrequency?: number;
}

const soundConfigs: Record<SoundType, SoundConfig | SoundConfig[]> = {
  success: [
    { frequency: 523.25, duration: 0.1, type: 'sine', volume: 0.3, ramp: 'none' }, // C5
    { frequency: 659.25, duration: 0.1, type: 'sine', volume: 0.3, ramp: 'none' }, // E5
    { frequency: 783.99, duration: 0.15, type: 'sine', volume: 0.3, ramp: 'down' }, // G5
  ],
  error: [
    { frequency: 200, duration: 0.15, type: 'square', volume: 0.2, ramp: 'none' },
    { frequency: 150, duration: 0.2, type: 'square', volume: 0.2, ramp: 'down' },
  ],
  warning: { frequency: 440, duration: 0.3, type: 'triangle', volume: 0.25, ramp: 'down' },
  notification: [
    { frequency: 880, duration: 0.08, type: 'sine', volume: 0.2, ramp: 'none' },
    { frequency: 1108.73, duration: 0.12, type: 'sine', volume: 0.2, ramp: 'down' },
  ],
  click: { frequency: 1000, duration: 0.02, type: 'square', volume: 0.1, ramp: 'down' },
  listening: [
    { frequency: 440, duration: 0.1, type: 'sine', volume: 0.2, ramp: 'up' },
    { frequency: 554.37, duration: 0.1, type: 'sine', volume: 0.2, ramp: 'none' },
    { frequency: 659.25, duration: 0.15, type: 'sine', volume: 0.2, ramp: 'down' },
  ],
  recognized: [
    { frequency: 587.33, duration: 0.08, type: 'sine', volume: 0.25, ramp: 'none' }, // D5
    { frequency: 880, duration: 0.12, type: 'sine', volume: 0.25, ramp: 'down' }, // A5
  ],
  complete: [
    { frequency: 392, duration: 0.1, type: 'sine', volume: 0.3, ramp: 'none' }, // G4
    { frequency: 523.25, duration: 0.1, type: 'sine', volume: 0.3, ramp: 'none' }, // C5
    { frequency: 659.25, duration: 0.1, type: 'sine', volume: 0.3, ramp: 'none' }, // E5
    { frequency: 783.99, duration: 0.2, type: 'sine', volume: 0.3, ramp: 'down' }, // G5
  ],
};

// Play a single tone
function playTone(config: SoundConfig, startTime: number): number {
  const ctx = getAudioContext();
  
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.type = config.type;
  oscillator.frequency.setValueAtTime(config.frequency, startTime);
  
  if (config.secondFrequency) {
    oscillator.frequency.linearRampToValueAtTime(config.secondFrequency, startTime + config.duration);
  }
  
  gainNode.gain.setValueAtTime(0, startTime);
  
  switch (config.ramp) {
    case 'up':
      gainNode.gain.linearRampToValueAtTime(config.volume, startTime + config.duration * 0.3);
      gainNode.gain.setValueAtTime(config.volume, startTime + config.duration);
      break;
    case 'down':
      gainNode.gain.setValueAtTime(config.volume, startTime);
      gainNode.gain.linearRampToValueAtTime(0, startTime + config.duration);
      break;
    default:
      gainNode.gain.setValueAtTime(config.volume, startTime);
      gainNode.gain.setValueAtTime(config.volume, startTime + config.duration * 0.8);
      gainNode.gain.linearRampToValueAtTime(0, startTime + config.duration);
  }
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.start(startTime);
  oscillator.stop(startTime + config.duration);
  
  return config.duration;
}

// Check if audio feedback is enabled
function isAudioEnabled(): boolean {
  const stored = localStorage.getItem('metaclips-audio-feedback');
  return stored !== 'false'; // Enabled by default
}

// Play a sound effect
export function playSound(type: SoundType): void {
  if (!isAudioEnabled()) return;
  
  try {
    const ctx = getAudioContext();
    
    // Resume audio context if suspended (required for user interaction)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const config = soundConfigs[type];
    let currentTime = ctx.currentTime;
    
    if (Array.isArray(config)) {
      // Play sequence of tones
      for (const tone of config) {
        currentTime += playTone(tone, currentTime);
      }
    } else {
      playTone(config, currentTime);
    }
  } catch (error) {
    console.warn('Failed to play sound:', error);
  }
}

// Voice command specific sounds
export const voiceFeedback = {
  startListening: () => playSound('listening'),
  commandRecognized: () => playSound('recognized'),
  commandSuccess: () => playSound('success'),
  commandError: () => playSound('error'),
  commandComplete: () => playSound('complete'),
};

// General action sounds
export const actionFeedback = {
  success: () => playSound('success'),
  error: () => playSound('error'),
  warning: () => playSound('warning'),
  notification: () => playSound('notification'),
  click: () => playSound('click'),
};

// Enable/disable audio feedback
export function setAudioEnabled(enabled: boolean): void {
  localStorage.setItem('metaclips-audio-feedback', String(enabled));
}

export function getAudioEnabled(): boolean {
  return isAudioEnabled();
}

// Test all sounds (for settings page)
export async function testAllSounds(): Promise<void> {
  const sounds: SoundType[] = ['listening', 'recognized', 'success', 'error', 'warning', 'notification', 'complete'];
  
  for (const sound of sounds) {
    playSound(sound);
    await new Promise(resolve => setTimeout(resolve, 600));
  }
}
