/**
 * Upload notification sounds using Web Audio API
 * Generates pleasant chime sounds without requiring audio files
 */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  } catch {
    return null;
  }
}

/**
 * Play a pleasant success chime (two ascending tones)
 */
export function playUploadCompleteSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // First tone - C5
  playTone(ctx, 523.25, now, 0.15, 0.25);
  // Second tone - E5 (major third, pleasant interval)
  playTone(ctx, 659.25, now + 0.12, 0.2, 0.3);
}

/**
 * Play a subtle error sound (descending tone)
 */
export function playUploadErrorSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Single descending tone
  playTone(ctx, 440, now, 0.15, 0.2, true);
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number,
  descend = false
) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startTime);

  if (descend) {
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency * 0.7,
      startTime + duration
    );
  }

  // Smooth envelope to avoid clicks
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(volume * 0.3, startTime + 0.02); // Keep volume subtle
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.01);
}
