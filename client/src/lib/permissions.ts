/**
 * Utility functions for requesting and managing smartphone permissions
 */

export type PermissionType = 'camera' | 'microphone' | 'location' | 'contacts';

export interface PermissionResult {
  granted: boolean;
  error?: string;
}

/**
 * Request camera permission for file uploads and video recording
 */
export async function requestCameraPermission(): Promise<PermissionResult> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    // Stop the stream immediately after getting permission
    stream.getTracks().forEach(track => track.stop());
    return { granted: true };
  } catch (error) {
    return {
      granted: false,
      error: error instanceof Error ? error.message : 'Camera permission denied'
    };
  }
}

/**
 * Request microphone permission for video recording with audio
 */
export async function requestMicrophonePermission(): Promise<PermissionResult> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return { granted: true };
  } catch (error) {
    return {
      granted: false,
      error: error instanceof Error ? error.message : 'Microphone permission denied'
    };
  }
}

/**
 * Request location permission for geotagging files
 */
export async function requestLocationPermission(): Promise<PermissionResult> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({
        granted: false,
        error: 'Geolocation not supported by this browser'
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => resolve({ granted: true }),
      (error) => resolve({
        granted: false,
        error: error.message || 'Location permission denied'
      }),
      { timeout: 10000 }
    );
  });
}

/**
 * Check if a permission is already granted
 */
export async function checkPermission(type: PermissionType): Promise<boolean> {
  try {
    if (type === 'camera' || type === 'microphone') {
      const permissionName = type === 'camera' ? 'camera' : 'microphone';
      const result = await navigator.permissions.query({ name: permissionName as PermissionName });
      return result.state === 'granted';
    }
    
    if (type === 'location') {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      return result.state === 'granted';
    }

    // Contacts API is not widely supported, return false
    return false;
  } catch (error) {
    // Permission API not supported or permission not available
    return false;
  }
}

/**
 * Request all necessary permissions for the app
 */
export async function requestAllPermissions(): Promise<Record<PermissionType, PermissionResult>> {
  const [camera, microphone, location] = await Promise.all([
    requestCameraPermission(),
    requestMicrophonePermission(),
    requestLocationPermission()
  ]);

  return {
    camera,
    microphone,
    location,
    contacts: { granted: false, error: 'Contacts API not supported' }
  };
}
