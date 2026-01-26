/**
 * Haptic feedback utility for mobile interactions
 * Provides tactile feedback using the Vibration API
 */

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

/**
 * Trigger haptic feedback with specified pattern
 * @param pattern - The type of haptic feedback to trigger
 */
export function triggerHaptic(pattern: HapticPattern = 'light'): void {
  // Check if vibration API is supported
  if (!('vibrate' in navigator)) {
    return;
  }

  // Define vibration patterns (in milliseconds)
  const patterns: Record<HapticPattern, number | number[]> = {
    light: 10,
    medium: 20,
    heavy: 30,
    success: [10, 50, 10],
    warning: [20, 100, 20],
    error: [30, 100, 30, 100, 30],
  };

  try {
    navigator.vibrate(patterns[pattern]);
  } catch (error) {
    // Silently fail if vibration is not supported or blocked
    console.debug('Haptic feedback not available:', error);
  }
}

/**
 * Cancel any ongoing vibration
 */
export function cancelHaptic(): void {
  if ('vibrate' in navigator) {
    navigator.vibrate(0);
  }
}
