import { useState, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { trpcCall } from "@/lib/trpcCall";

const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunks (kept small to avoid proxy body size limits on deployed sites)
const STORAGE_KEY = "metaclips-resumable-uploads";
const DEVICE_ID_KEY = "metaclips-device-id";

// Generate a stable device identifier for cross-device resume
function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = Math.random().toString(36).substring(2, 10);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch { return 'unknown'; }
}

function getDeviceInfo(): string {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edg')) browser = 'Edge';
  let os = 'Unknown';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux') && !ua.includes('Android')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  return `${browser} on ${os} [${getDeviceId()}]`;
}
const SPEED_LIMIT_KEY = "metaclips-upload-speed-limit";
const CONCURRENCY_KEY = "metaclips-upload-concurrency";

// Network quality levels
export type NetworkQuality = 'good' | 'fair' | 'poor' | 'unknown';

// Speed limit options (bytes per second, 0 = unlimited)
export type SpeedLimitOption = 0 | 512000 | 1048576 | 2097152 | 5242880;
export const SPEED_LIMIT_OPTIONS: { value: SpeedLimitOption; label: string }[] = [
  { value: 0, label: 'Unlimited' },
  { value: 512000, label: '500 KB/s' },
  { value: 1048576, label: '1 MB/s' },
  { value: 2097152, label: '2 MB/s' },
  { value: 5242880, label: '5 MB/s' },
];

// Concurrency options
export type ConcurrencyOption = 1 | 2 | 3;
export const CONCURRENCY_OPTIONS: { value: ConcurrencyOption; label: string }[] = [
  { value: 1, label: 'Sequential (1)' },
  { value: 2, label: 'Parallel (2)' },
  { value: 3, label: 'Parallel (3)' },
];

function loadSpeedLimit(): SpeedLimitOption {
  try {
    const stored = localStorage.getItem(SPEED_LIMIT_KEY);
    if (stored) return Number(stored) as SpeedLimitOption;
  } catch {}
  return 0;
}

function saveSpeedLimit(limit: SpeedLimitOption) {
  try { localStorage.setItem(SPEED_LIMIT_KEY, String(limit)); } catch {}
}

function loadConcurrency(): ConcurrencyOption {
  try {
    const stored = localStorage.getItem(CONCURRENCY_KEY);
    if (stored) return Number(stored) as ConcurrencyOption;
  } catch {}
  return 1;
}

function saveConcurrency(c: ConcurrencyOption) {
  try { localStorage.setItem(CONCURRENCY_KEY, String(c)); } catch {}
}

// Calculate delay between chunks to achieve target speed limit
function calculateThrottleDelay(chunkSizeBytes: number, speedLimitBps: number, actualDurationMs: number): number {
  if (speedLimitBps <= 0) return 0;
  const targetDurationMs = (chunkSizeBytes / speedLimitBps) * 1000;
  const delay = targetDurationMs - actualDurationMs;
  return Math.max(0, delay);
}

// Adaptive upload settings per session
interface AdaptiveSettings {
  currentTimeoutMs: number; // Current timeout per chunk (starts at 120s)
  consecutiveSuccesses: number; // Count of consecutive successes at current settings
  consecutiveFailures: number; // Count of consecutive failures
  totalFailures: number; // Total failures for this session
  totalSuccesses: number; // Total successes for this session
}

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const MIN_TIMEOUT_MS = 30_000; // 30 seconds minimum
const MAX_TIMEOUT_MS = 300_000; // 5 minutes maximum

export interface ResumableUploadSession {
  sessionToken: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadType: "video" | "file";
  status: "active" | "paused" | "finalizing" | "completed" | "error" | "expired";
  totalChunks: number;
  uploadedChunks: number;
  uploadedBytes: number;
  progress: number;
  speed: number;
  eta: number;
  metadata?: {
    title?: string;
    description?: string;
    quality?: string;
    collectionId?: number;
    tags?: string[];
  };
  expiresAt: string;
  createdAt?: string;
  lastActivityAt?: string;
  error?: string;
  thumbnailUrl?: string | null;
  // Local tracking
  file?: File;
  isPaused?: boolean;
  // Network quality tracking
  networkQuality?: NetworkQuality;
  recentSpeeds?: number[]; // Last N chunk speeds in bytes/sec
  // Scheduled retry
  scheduledRetryAt?: number; // Unix timestamp for scheduled retry
  // Queue priority
  priority?: 'normal' | 'high'; // high = pinned to top of queue
  queueOrder?: number; // Manual ordering index
  // Cross-device resume
  deviceInfo?: string | null; // Browser/OS info of the device that started the upload
  isRemoteSession?: boolean; // True if this session was started on another device
}

interface UseResumableUploadOptions {
  onComplete?: (session: ResumableUploadSession, result: { fileId: number; videoId?: number; url: string }) => void;
  onError?: (session: ResumableUploadSession, error: Error) => void;
  onProgress?: (session: ResumableUploadSession) => void;
  /** If true, auto-resume sessions that have file references in memory on page load */
  autoResume?: boolean;
  /** Delay in ms to add between chunk uploads for throttling (0 = no throttle) */
  chunkDelayMs?: number;
}

// trpcCall is now imported from @/lib/trpcCall

// --- localStorage helpers for instant session display on page load ---
interface StoredSessionInfo {
  sessionToken: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadType: "video" | "file";
  progress: number;
  uploadedChunks: number;
  totalChunks: number;
  thumbnailUrl?: string | null;
  priority?: 'normal' | 'high';
  queueOrder?: number;
}

// Sort sessions by priority (high first) then by queueOrder
function sortByPriority(sessions: ResumableUploadSession[]): ResumableUploadSession[] {
  return [...sessions].sort((a, b) => {
    const aPri = a.priority === 'high' ? 0 : 1;
    const bPri = b.priority === 'high' ? 0 : 1;
    if (aPri !== bPri) return aPri - bPri;
    return (a.queueOrder ?? 999) - (b.queueOrder ?? 999);
  });
}

function saveSessionsToStorage(sessions: ResumableUploadSession[]) {
  try {
    const toStore: StoredSessionInfo[] = sessions
      .filter(s => s.status === 'active' || s.status === 'paused' || s.status === 'finalizing' || s.status === 'error')
      .map(s => ({
        sessionToken: s.sessionToken,
        filename: s.filename,
        fileSize: s.fileSize,
        mimeType: s.mimeType,
        uploadType: s.uploadType,
        progress: s.progress,
        uploadedChunks: s.uploadedChunks,
        totalChunks: s.totalChunks,
        thumbnailUrl: s.thumbnailUrl,
      priority: s.priority,
      queueOrder: s.queueOrder,
      }));
    if (toStore.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage not available
  }
}

function loadSessionsFromStorage(): StoredSessionInfo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // localStorage not available
  }
  return [];
}

function clearSessionsFromStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage not available
  }
}

/**
 * Generate a thumbnail from a video file using a hidden <video> + <canvas>
 * Returns a base64-encoded JPEG data URL, or null on failure
 */
function generateVideoThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;

      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
        video.remove();
      };

      video.onloadeddata = () => {
        // Seek to 1 second or 10% of duration, whichever is smaller
        video.currentTime = Math.min(1, video.duration * 0.1);
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          // Generate a small thumbnail (max 320px wide)
          const scale = Math.min(320 / video.videoWidth, 240 / video.videoHeight, 1);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup();
            resolve(null);
            return;
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          cleanup();
          resolve(dataUrl);
        } catch (e) {
          console.warn('[Thumbnail] Canvas draw failed:', e);
          cleanup();
          resolve(null);
        }
      };

      video.onerror = () => {
        console.warn('[Thumbnail] Video load failed');
        cleanup();
        resolve(null);
      };

      // Timeout after 10 seconds
      setTimeout(() => {
        cleanup();
        resolve(null);
      }, 10000);
    } catch (e) {
      console.warn('[Thumbnail] Generation failed:', e);
      resolve(null);
    }
  });
}

export function useResumableUpload(options: UseResumableUploadOptions = {}) {
  const [sessions, setSessions] = useState<ResumableUploadSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [speedLimit, setSpeedLimitState] = useState<SpeedLimitOption>(loadSpeedLimit);
  const [concurrency, setConcurrencyState] = useState<ConcurrencyOption>(loadConcurrency);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const activeUploadsRef = useRef<Set<string>>(new Set());
  // Track session tokens that have been cleared/cancelled to prevent server sync from bringing them back
  const clearedTokensRef = useRef<Set<string>>(new Set());
  const autoResumedRef = useRef(false);
  const chunkDelayRef = useRef(options.chunkDelayMs ?? 0);
  const speedLimitRef = useRef<SpeedLimitOption>(speedLimit);
  const concurrencyRef = useRef<ConcurrencyOption>(concurrency);
  // Live speed tracking via ref — immune to React state race conditions
  // This is the authoritative source of speed data during active uploads
  const liveSpeedMapRef = useRef<Map<string, { speed: number; recentSpeeds: number[]; eta: number; lastUpdate: number }>>(new Map());

  // Adaptive upload settings per session
  const adaptiveSettingsRef = useRef<Map<string, AdaptiveSettings>>(new Map());
  // Network quality tracking: rolling window of chunk speeds (bytes/sec)
  const chunkSpeedHistoryRef = useRef<number[]>([]);
  const chunkFailureHistoryRef = useRef<boolean[]>([]); // true = success, false = failure
  // Scheduled retry timers
  const scheduledRetryTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Keep refs to callbacks so the upload loop always calls the latest version
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; }, [options]);
  const setSessionsRef = useRef(setSessions);
  useEffect(() => { setSessionsRef.current = setSessions; }, [setSessions]);
  // Keep a ref to current sessions for use in timeouts/callbacks
  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  
  // tRPC utils for direct cache invalidation after upload completion
  const trpcUtils = trpc.useUtils();

  // Keep chunkDelay ref in sync with options
  useEffect(() => {
    chunkDelayRef.current = options.chunkDelayMs ?? 0;
  }, [options.chunkDelayMs]);

  // Keep speed limit and concurrency refs in sync
  useEffect(() => { speedLimitRef.current = speedLimit; }, [speedLimit]);
  useEffect(() => { concurrencyRef.current = concurrency; }, [concurrency]);

  const setSpeedLimit = useCallback((limit: SpeedLimitOption) => {
    setSpeedLimitState(limit);
    speedLimitRef.current = limit;
    saveSpeedLimit(limit);
    toast.info(limit === 0 ? 'Upload speed: Unlimited' : `Upload speed limited to ${SPEED_LIMIT_OPTIONS.find(o => o.value === limit)?.label}`);
  }, []);

  const setConcurrency = useCallback((c: ConcurrencyOption) => {
    setConcurrencyState(c);
    concurrencyRef.current = c;
    saveConcurrency(c);
    toast.info(`Upload concurrency: ${c} chunk${c > 1 ? 's' : ''} at a time`);
  }, []);

  // tRPC mutations - only used for non-upload-loop operations (create session, pause, cancel, thumbnail)
  const createSessionMutation = trpc.resumableUpload.createSession.useMutation();
  const pauseSessionMutation = trpc.resumableUpload.pauseSession.useMutation();
  // cancelSession now uses direct trpcCall() instead of React Query mutation
  const saveThumbnailMutation = trpc.resumableUpload.saveThumbnail.useMutation();
  
  // tRPC queries
  const { data: serverSessions, refetch: refetchSessions } = trpc.resumableUpload.listActiveSessions.useQuery(
    undefined,
    { 
      enabled: true,
      // Use a longer staleTime so the GlobalUploadProgress polling (5s)
      // doesn't constantly trigger the serverSessions effect and reset speed data
      staleTime: 30_000,
    }
  );

  // Load cached sessions from localStorage immediately for instant UI display
  useEffect(() => {
    const cached = loadSessionsFromStorage();
    if (cached.length > 0) {
      const cachedSessions: ResumableUploadSession[] = cached.map(c => ({
        ...c,
        status: 'paused' as const,
        uploadedBytes: c.uploadedChunks * CHUNK_SIZE,
        speed: 0,
        eta: 0,
        expiresAt: '',
      }));
      setSessions(cachedSessions);
    }
  }, []);

  // Load sessions from server on mount (replaces cached data with authoritative server data)
  useEffect(() => {
    if (serverSessions) {
      // Filter out sessions that have been cleared/cancelled locally
      const filteredServerSessions = serverSessions.filter(
        (s: any) => !clearedTokensRef.current.has(s.sessionToken)
      );
      
      const currentDeviceId = getDeviceId();
      const mappedSessions: ResumableUploadSession[] = filteredServerSessions.map((s: any) => {
        // Check if this session was started on a different device
        const sessionDeviceId = s.deviceInfo ? s.deviceInfo.match(/\[([^\]]+)\]$/)?.[1] : null;
        const isRemote = sessionDeviceId ? sessionDeviceId !== currentDeviceId : false;
        return {
          sessionToken: s.sessionToken,
          filename: s.filename,
          fileSize: Number(s.fileSize),
          mimeType: s.mimeType,
          uploadType: s.uploadType,
          status: s.status,
          totalChunks: s.totalChunks,
          uploadedChunks: s.uploadedChunks,
          uploadedBytes: Number(s.uploadedBytes),
          progress: s.totalChunks > 0 ? (s.uploadedChunks / s.totalChunks) * 100 : 0,
          speed: 0,
          eta: 0,
          metadata: s.metadata,
          thumbnailUrl: s.thumbnailUrl,
          deviceInfo: s.deviceInfo,
          isRemoteSession: isRemote,
          expiresAt: s.expiresAt,
          createdAt: s.createdAt,
          lastActivityAt: s.lastActivityAt,
        };
      });
      
      // Merge file references and preserve local error status from existing sessions
      setSessions(prev => {
        return mappedSessions.map(mapped => {
          const existing = prev.find(p => p.sessionToken === mapped.sessionToken);
          if (existing) {
            // Preserve local error status — don't let server sync override it
            // The user must explicitly retry or cancel an errored upload
            if (existing.status === 'error') {
              return { ...existing, file: existing.file };
            }
            // For active uploads, preserve live tracking data (speed, eta, progress)
            // that gets calculated during chunk uploads — server sync only has static data
            if (existing.status === 'active') {
              return {
                ...mapped,
                file: existing.file,
                status: existing.status,
                speed: existing.speed,
                eta: existing.eta,
                uploadedChunks: Math.max(existing.uploadedChunks, mapped.uploadedChunks),
                uploadedBytes: Math.max(existing.uploadedBytes, mapped.uploadedBytes),
                progress: Math.max(existing.progress, mapped.progress),
                networkQuality: existing.networkQuality,
                recentSpeeds: existing.recentSpeeds,
                isPaused: existing.isPaused,
              };
            }
            // Preserve file reference for resuming
            if (existing.file) {
              return { ...mapped, file: existing.file };
            }
          }
          return mapped;
        });
      });
      setIsLoading(false);
      
      // Sync localStorage with server truth
      saveSessionsToStorage(mappedSessions);
      
      // Clean up clearedTokensRef: remove tokens that the server no longer returns
      // (meaning the server has actually processed the cancellation)
      const serverTokens = new Set(serverSessions.map((s: any) => s.sessionToken));
      Array.from(clearedTokensRef.current).forEach(token => {
        if (!serverTokens.has(token)) {
          clearedTokensRef.current.delete(token);
        }
      });
    }
  }, [serverSessions]);

  // Read chunk as base64
  const readChunkAsBase64 = useCallback((file: File, start: number, end: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        const blob = file.slice(start, end);
        
        reader.onload = () => {
          try {
            const result = reader.result as string;
            const commaIndex = result.indexOf(",");
            const base64 = commaIndex >= 0 ? result.substring(commaIndex + 1) : result;
            resolve(base64);
          } catch (e) {
            reject(new Error("Failed to encode chunk data"));
          }
        };
        
        reader.onerror = () => reject(new Error("Failed to read chunk from file"));
        reader.onabort = () => reject(new Error("Chunk read was aborted"));
        reader.readAsDataURL(blob);
      } catch (e) {
        reject(new Error("Failed to initialize chunk reader"));
      }
    });
  }, []);

  // --- Adaptive upload helpers ---
  const getAdaptiveSettings = useCallback((sessionToken: string): AdaptiveSettings => {
    let settings = adaptiveSettingsRef.current.get(sessionToken);
    if (!settings) {
      settings = {
        currentTimeoutMs: DEFAULT_TIMEOUT_MS,
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        totalFailures: 0,
        totalSuccesses: 0,
      };
      adaptiveSettingsRef.current.set(sessionToken, settings);
    }
    return settings;
  }, []);

  const recordChunkSuccess = useCallback((sessionToken: string, speedBytesPerSec: number) => {
    const settings = getAdaptiveSettings(sessionToken);
    settings.consecutiveSuccesses++;
    settings.consecutiveFailures = 0;
    settings.totalSuccesses++;

    // After 5 consecutive successes with increased timeout, reduce timeout back toward default
    if (settings.consecutiveSuccesses >= 5 && settings.currentTimeoutMs > DEFAULT_TIMEOUT_MS) {
      settings.currentTimeoutMs = Math.max(DEFAULT_TIMEOUT_MS, settings.currentTimeoutMs - 30_000);
      settings.consecutiveSuccesses = 0;
      console.log(`[Adaptive] Reduced timeout to ${settings.currentTimeoutMs / 1000}s for ${sessionToken}`);
    }

    // Track speed and success in rolling window (keep last 20)
    chunkSpeedHistoryRef.current.push(speedBytesPerSec);
    if (chunkSpeedHistoryRef.current.length > 20) chunkSpeedHistoryRef.current.shift();
    chunkFailureHistoryRef.current.push(true);
    if (chunkFailureHistoryRef.current.length > 20) chunkFailureHistoryRef.current.shift();
  }, [getAdaptiveSettings]);

  const recordChunkFailure = useCallback((sessionToken: string) => {
    const settings = getAdaptiveSettings(sessionToken);
    settings.consecutiveFailures++;
    settings.consecutiveSuccesses = 0;
    settings.totalFailures++;

    // After 3 consecutive failures, increase timeout (up to max)
    if (settings.consecutiveFailures >= 3 && settings.currentTimeoutMs < MAX_TIMEOUT_MS) {
      settings.currentTimeoutMs = Math.min(MAX_TIMEOUT_MS, settings.currentTimeoutMs + 60_000);
      console.log(`[Adaptive] Increased timeout to ${settings.currentTimeoutMs / 1000}s for ${sessionToken}`);
    }

    // Track failure in rolling window
    chunkFailureHistoryRef.current.push(false);
    if (chunkFailureHistoryRef.current.length > 20) chunkFailureHistoryRef.current.shift();
  }, [getAdaptiveSettings]);

  const calculateNetworkQuality = useCallback((): NetworkQuality => {
    const speeds = chunkSpeedHistoryRef.current;
    const results = chunkFailureHistoryRef.current;
    if (speeds.length < 3 && results.length < 3) return 'unknown';

    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const successRate = results.length > 0 ? results.filter(r => r).length / results.length : 1;

    // Good: >100KB/s avg speed and >90% success rate
    if (avgSpeed > 100_000 && successRate > 0.9) return 'good';
    // Poor: <20KB/s avg speed or <50% success rate
    if (avgSpeed < 20_000 || successRate < 0.5) return 'poor';
    // Fair: everything else
    return 'fair';
  }, []);

  // --- Scheduled retry helpers ---
  const scheduleRetry = useCallback((sessionToken: string, delayMinutes: number) => {
    // Cancel any existing scheduled retry for this session
    const existingTimer = scheduledRetryTimersRef.current.get(sessionToken);
    if (existingTimer) clearTimeout(existingTimer);

    const retryAt = Date.now() + delayMinutes * 60 * 1000;

    // Update session with scheduled time
    setSessionsRef.current(prev => {
      const updated = prev.map(s =>
        s.sessionToken === sessionToken
          ? { ...s, scheduledRetryAt: retryAt, error: `Scheduled retry in ${delayMinutes}m` }
          : s
      );
      saveSessionsToStorage(updated);
      return updated;
    });

    const timer = setTimeout(() => {
      scheduledRetryTimersRef.current.delete(sessionToken);
      const currentSession = sessionsRef.current.find(s => s.sessionToken === sessionToken);
      if (currentSession && (currentSession.status === 'error' || currentSession.scheduledRetryAt)) {
        const file = currentSession.file;
        if (file) {
          console.log(`[ScheduledRetry] Auto-retrying ${currentSession.filename}`);
          toast.info(`Scheduled retry starting for ${currentSession.filename}`);
          setSessionsRef.current(prev => prev.map(s =>
            s.sessionToken === sessionToken
              ? { ...s, status: 'active' as const, error: undefined, scheduledRetryAt: undefined }
              : s
          ));
          uploadChunksRef.current({ ...currentSession, status: 'active', scheduledRetryAt: undefined }, file);
        } else {
          toast.warning(`Cannot auto-retry ${currentSession.filename}: file needs to be re-selected`);
          setSessionsRef.current(prev => prev.map(s =>
            s.sessionToken === sessionToken
              ? { ...s, scheduledRetryAt: undefined, error: 'Scheduled retry failed: file not available. Please re-select the file.' }
              : s
          ));
        }
      }
    }, delayMinutes * 60 * 1000);

    scheduledRetryTimersRef.current.set(sessionToken, timer);
    toast.success(`Upload will retry in ${delayMinutes} minute${delayMinutes > 1 ? 's' : ''}`);
  }, []);

  const cancelScheduledRetry = useCallback((sessionToken: string) => {
    const timer = scheduledRetryTimersRef.current.get(sessionToken);
    if (timer) {
      clearTimeout(timer);
      scheduledRetryTimersRef.current.delete(sessionToken);
    }
    setSessionsRef.current(prev => prev.map(s =>
      s.sessionToken === sessionToken
        ? { ...s, scheduledRetryAt: undefined }
        : s
    ));
    toast.info('Scheduled retry cancelled');
  }, []);

  // Keep a ref to uploadChunks for the scheduled retry callback
  const uploadChunksRef = useRef<(session: ResumableUploadSession, file: File) => void>(() => {});

  // Clean up scheduled retry timers on unmount
  useEffect(() => {
    return () => {
      scheduledRetryTimersRef.current.forEach(timer => clearTimeout(timer));
      scheduledRetryTimersRef.current.clear();
    };
  }, []);

  // Start a new upload
  const startUpload = useCallback(async (
    file: File,
    uploadType: "video" | "file",
    metadata?: ResumableUploadSession["metadata"]
  ): Promise<string> => {
    // Request notification permission on first upload (non-blocking)
    requestNotificationPermission().catch(() => {});

    try {
      // Create session on server
      const result = await createSessionMutation.mutateAsync({
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadType,
        chunkSize: CHUNK_SIZE,
        metadata,
        deviceInfo: getDeviceInfo(),
      });

      const newSession: ResumableUploadSession = {
        sessionToken: result.sessionToken,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadType,
        status: "active",
        totalChunks: result.totalChunks,
        uploadedChunks: 0,
        uploadedBytes: 0,
        progress: 0,
        speed: 0,
        eta: 0,
        metadata,
        expiresAt: result.expiresAt,
        file,
      };

      setSessions(prev => {
        const updated = [...prev, newSession];
        saveSessionsToStorage(updated);
        return updated;
      });

      // Generate and save thumbnail in background (non-blocking)
      if (file.type.startsWith('video/')) {
        generateVideoThumbnail(file).then((thumbnailBase64: string | null) => {
          if (thumbnailBase64) {
            // Use direct fetch for thumbnail too (fire and forget)
            trpcCall<{ thumbnailUrl: string | null }>('resumableUpload.saveThumbnail', {
              sessionToken: result.sessionToken,
              thumbnailBase64,
            }).then((res) => {
              if (res?.thumbnailUrl) {
                setSessionsRef.current(prev => prev.map(s =>
                  s.sessionToken === result.sessionToken
                    ? { ...s, thumbnailUrl: res.thumbnailUrl }
                    : s
                ));
              }
            }).catch((e: unknown) => console.warn('[ResumableUpload] Failed to save thumbnail:', e));
          }
        }).catch((e: unknown) => console.warn('[ResumableUpload] Failed to generate thumbnail:', e));
      }

      // Start uploading chunks
      uploadChunks(newSession, file);

      return result.sessionToken;
    } catch (error) {
      console.error("[ResumableUpload] Failed to create session:", error);
      throw error;
    }
  }, [createSessionMutation]);

  // Poll for background finalization completion (for large files)
  const pollFinalizeStatus = async (
    sessionToken: string,
    signal: AbortSignal
  ): Promise<{ fileId: number; videoId?: number; url: string }> => {
    const POLL_INTERVAL = 5000; // 5 seconds
    const MAX_POLL_TIME = 30 * 60 * 1000; // 30 minutes max
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_POLL_TIME) {
      if (signal.aborted) throw new Error('Upload was cancelled');

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

      if (signal.aborted) throw new Error('Upload was cancelled');

      const status = await trpcCall<{
        status: 'completed' | 'finalizing' | 'failed' | string;
        fileKey?: string;
        url?: string;
        message?: string;
      }>('resumableUpload.getFinalizeStatus', {
        sessionToken,
      }, 'query', {
        timeoutMs: 30_000,
        signal,
      });

      if (status.status === 'completed') {
        // Fetch the full session to get fileId/videoId
        // The server doesn't return these from getFinalizeStatus, so we use the URL
        // and rely on the onComplete callback to refresh the file list
        return {
          fileId: 0, // Will be resolved by the file list refresh
          url: status.url || '',
        };
      }

      if (status.status === 'failed') {
        throw new Error(status.message || 'File assembly failed on server');
      }

      // Still finalizing, continue polling
      console.log(`[ResumableUpload] Still assembling ${sessionToken}...`);
    }

    throw new Error('File assembly timed out after 30 minutes');
  };

  // Upload queue: only 1 upload runs at a time, others wait
  const uploadQueueRef = useRef<Array<{ session: ResumableUploadSession; file: File }>>([]);
  const isProcessingQueueRef = useRef(false);

  const processUploadQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;
    
    try {
      while (uploadQueueRef.current.length > 0) {
        const next = uploadQueueRef.current.shift();
        if (next) {
          // Check if this session was cancelled while waiting in queue
          if (clearedTokensRef.current.has(next.session.sessionToken)) continue;
          // Wait for any active upload to finish before starting next
          // (activeUploadsRef is cleaned up in executeUploadChunks finally block)
          while (activeUploadsRef.current.size > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          await executeUploadChunks(next.session, next.file);
        }
      }
    } finally {
      isProcessingQueueRef.current = false;
    }
  }, []);

  // Upload chunks for a session - uses direct fetch calls, survives component unmounts
  const uploadChunks = useCallback(async (session: ResumableUploadSession, file: File) => {
    // If another upload is already active AND it's a different session, queue this one
    const activeTokens = Array.from(activeUploadsRef.current);
    const otherActive = activeTokens.filter(t => t !== session.sessionToken);
    if (otherActive.length > 0) {
      console.log(`[ResumableUpload] Queuing upload for ${session.filename} (another upload is active: ${otherActive.join(', ')})`);
      uploadQueueRef.current.push({ session, file });
      setSessionsRef.current(prev => prev.map(s =>
        s.sessionToken === session.sessionToken
          ? { ...s, status: 'paused' as const, error: 'Waiting in queue...' }
          : s
      ));
      processUploadQueue();
      return;
    }
    // If this session is already marked as active (stale entry), clean it up first
    if (activeUploadsRef.current.has(session.sessionToken)) {
      console.log(`[ResumableUpload] Cleaning up stale active entry for ${session.sessionToken}`);
      const oldController = abortControllersRef.current.get(session.sessionToken);
      if (oldController) oldController.abort();
      activeUploadsRef.current.delete(session.sessionToken);
      abortControllersRef.current.delete(session.sessionToken);
    }
    await executeUploadChunks(session, file);
    // After this upload finishes, process the next one in the queue
    processUploadQueue();
  }, []);

  const executeUploadChunks = useCallback(async (session: ResumableUploadSession, file: File) => {
    const abortController = new AbortController();
    abortControllersRef.current.set(session.sessionToken, abortController);
    activeUploadsRef.current.add(session.sessionToken);

    // Update status to active
    setSessionsRef.current(prev => prev.map(s =>
      s.sessionToken === session.sessionToken
        ? { ...s, status: 'active' as const, error: undefined }
        : s
    ));

    let lastSpeedUpdate = Date.now();
    let lastBytesForSpeed = session.uploadedBytes;
    let uploadFailed = false;
    const adaptive = getAdaptiveSettings(session.sessionToken);
    // Track completed chunk count for progress (needed for parallel uploads)
    let completedChunkCount = session.uploadedChunks;
    let completedBytes = session.uploadedBytes;

    // Helper to upload a single chunk with retries — returns true on success, false on fatal failure
    const uploadSingleChunk = async (chunkIndex: number): Promise<boolean> => {
      if (abortController.signal.aborted) return false;

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      let retries = 0;
      const maxRetries = 10;

      while (retries < maxRetries) {
        try {
          if (abortController.signal.aborted) return false;

          // Show retry status in UI
          if (retries > 0) {
            const timeoutSec = Math.round(adaptive.currentTimeoutMs / 1000);
            setSessionsRef.current(prev => prev.map(s =>
              s.sessionToken === session.sessionToken
                ? { ...s, error: `Retrying chunk ${chunkIndex + 1} (attempt ${retries + 1}/${maxRetries}, timeout ${timeoutSec}s)...` }
                : s
            ));
          }

          const chunkData = await readChunkAsBase64(file, start, end);

          // Calculate SHA-256 checksum for integrity verification
          let checksum: string | undefined;
          try {
            const chunkBlob = file.slice(start, end);
            const arrayBuffer = await chunkBlob.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            checksum = Array.from(new Uint8Array(hashBuffer))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');
          } catch (e) {
            // If Web Crypto API is not available (e.g., HTTP context), skip checksum
            console.warn('[ResumableUpload] Checksum calculation not available:', e);
          }

          const attemptStart = Date.now();
          const result = await trpcCall<{
            uploadedChunks: number;
            totalChunks: number;
            uploadedBytes: number;
            checksumVerified?: boolean;
          }>('resumableUpload.uploadChunk', {
            sessionToken: session.sessionToken,
            chunkIndex,
            chunkData,
            ...(checksum ? { checksum } : {}),
          }, 'mutation', {
            timeoutMs: adaptive.currentTimeoutMs,
            signal: abortController.signal,
          });

          const attemptDuration = (Date.now() - attemptStart) / 1000;
          const chunkBytes = end - start;
          const chunkSpeed = attemptDuration > 0 ? chunkBytes / attemptDuration : 0;

          console.log(`[ResumableUpload] Chunk ${chunkIndex + 1}/${session.totalChunks} uploaded for ${session.filename} (${(chunkSpeed / 1024).toFixed(1)} KB/s, timeout ${adaptive.currentTimeoutMs / 1000}s)`);

          // Record success for adaptive settings and network quality
          recordChunkSuccess(session.sessionToken, chunkSpeed);
          const networkQuality = calculateNetworkQuality();

          // Update progress atomically
          completedChunkCount++;
          completedBytes += chunkBytes;

          const now = Date.now();
          const timeDiff = (now - lastSpeedUpdate) / 1000;
          const bytesDiff = completedBytes - lastBytesForSpeed;
          const rollingSpeed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
          // Use the better of: per-chunk speed or rolling window speed
          // This ensures we always have a meaningful speed value
          const speed = rollingSpeed > 0 ? rollingSpeed : chunkSpeed;
          const remainingBytes = file.size - completedBytes;
          const eta = speed > 0 ? remainingBytes / speed : 0;

          if (timeDiff > 0.5) {
            lastSpeedUpdate = now;
            lastBytesForSpeed = completedBytes;
          }

          // Update live speed ref (immune to React state race conditions)
          const existingLive = liveSpeedMapRef.current.get(session.sessionToken);
          const updatedRecentSpeeds = [...(existingLive?.recentSpeeds || []).slice(-9), chunkSpeed];
          liveSpeedMapRef.current.set(session.sessionToken, {
            speed,
            recentSpeeds: updatedRecentSpeeds,
            eta,
            lastUpdate: now,
          });

          setSessionsRef.current(prev => {
            const updated = prev.map(s =>
              s.sessionToken === session.sessionToken
                ? {
                    ...s,
                    uploadedChunks: result.uploadedChunks,
                    uploadedBytes: result.uploadedBytes,
                    progress: (result.uploadedChunks / result.totalChunks) * 100,
                    speed,
                    eta,
                    error: undefined,
                    networkQuality,
                    recentSpeeds: updatedRecentSpeeds,
                  }
                : s
            );
            if (result.uploadedChunks % 5 === 0) {
              saveSessionsToStorage(updated);
            }
            return updated;
          });

          optionsRef.current.onProgress?.({
            ...session,
            uploadedChunks: result.uploadedChunks,
            uploadedBytes: result.uploadedBytes,
            progress: (result.uploadedChunks / result.totalChunks) * 100,
            speed,
            eta,
            networkQuality,
          });

          // Apply speed-limit throttle delay after successful chunk
          const currentSpeedLimit = speedLimitRef.current;
          if (currentSpeedLimit > 0) {
            const chunkDurationMs = Date.now() - attemptStart;
            const throttleDelay = calculateThrottleDelay(chunkBytes, currentSpeedLimit, chunkDurationMs);
            if (throttleDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, throttleDelay));
            }
          }

          return true; // Success
        } catch (error: any) {
          if (abortController.signal.aborted) return false;

          retries++;
          const isTimeout = error?.message?.includes('timed out');
          const isNetwork = error?.message?.includes('fetch') || error?.message?.includes('network') || error?.name === 'TypeError';
          const retryLabel = isTimeout ? 'timeout' : isNetwork ? 'network error' : error?.message;
          console.warn(`[ResumableUpload] Chunk ${chunkIndex} attempt ${retries} failed (${retryLabel})`);

          recordChunkFailure(session.sessionToken);

          if (retries >= maxRetries) {
            console.warn(`[ResumableUpload] Upload failed for ${session.filename} after ${maxRetries} retries on chunk ${chunkIndex + 1}`);
            abortController.abort();
            const networkQuality = calculateNetworkQuality();

            setSessionsRef.current(prev => {
              const updated = prev.map(s =>
                s.sessionToken === session.sessionToken
                  ? {
                      ...s,
                      status: 'error' as const,
                      speed: 0,
                      eta: 0,
                      networkQuality,
                      error: `Failed at chunk ${chunkIndex + 1}/${session.totalChunks}: ${retryLabel}. Tap retry or cancel.`,
                    }
                  : s
              );
              saveSessionsToStorage(updated);
              return updated;
            });

            toast.error(`${session.filename}: Upload failed after ${maxRetries} retries. You can retry, schedule a retry, or cancel.`, {
              duration: 8000,
            });

            return false; // Fatal failure
          }

          const backoffMs = Math.min(2000 * Math.pow(2, retries - 1), 60_000);
          console.log(`[ResumableUpload] Retrying chunk ${chunkIndex} in ${backoffMs / 1000}s (timeout: ${adaptive.currentTimeoutMs / 1000}s)...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
      return false; // Should not reach here
    };

    try {
      // Upload chunks with configurable concurrency
      const maxConcurrency = concurrencyRef.current;
      let nextChunkIndex = session.uploadedChunks;

      if (maxConcurrency <= 1) {
        // Sequential mode (default) — upload one chunk at a time
        for (let i = nextChunkIndex; i < session.totalChunks; i++) {
          if (abortController.signal.aborted) return;
          const success = await uploadSingleChunk(i);
          if (!success) {
            uploadFailed = true;
            return;
          }
        }
      } else {
        // Parallel mode — upload multiple chunks concurrently
        // Auto-fallback to sequential if network quality is poor
        while (nextChunkIndex < session.totalChunks) {
          if (abortController.signal.aborted) return;

          const currentQuality = calculateNetworkQuality();
          const effectiveConcurrency = currentQuality === 'poor' ? 1 : maxConcurrency;

          // Build batch of chunks to upload in parallel
          const batchSize = Math.min(effectiveConcurrency, session.totalChunks - nextChunkIndex);
          const batchIndices: number[] = [];
          for (let j = 0; j < batchSize; j++) {
            batchIndices.push(nextChunkIndex + j);
          }

          if (effectiveConcurrency > 1) {
            console.log(`[ResumableUpload] Uploading chunks ${batchIndices.map(i => i + 1).join(',')} in parallel (concurrency: ${effectiveConcurrency})`);
          }

          // Upload batch concurrently
          const results = await Promise.all(batchIndices.map(idx => uploadSingleChunk(idx)));

          // Check if any chunk failed
          if (results.some(r => !r)) {
            uploadFailed = true;
            return;
          }

          nextChunkIndex += batchSize;
        }
      }

      // All chunks uploaded, finalize
      console.log(`[ResumableUpload] All chunks uploaded for ${session.filename}, starting finalization...`);

      setSessionsRef.current(prev => prev.map(s =>
        s.sessionToken === session.sessionToken
          ? { ...s, status: "finalizing" as const, progress: 100 }
          : s
      ));

      const finalizeResult = await trpcCall<{
        success: boolean;
        async?: boolean;
        fileId?: number;
        videoId?: number;
        url?: string;
        fileKey?: string;
        message?: string;
      }>('resumableUpload.finalizeUpload', {
        sessionToken: session.sessionToken,
      }, 'mutation', {
        timeoutMs: 300_000,
        signal: abortController.signal,
      });

      let completedResult: { fileId: number; videoId?: number; url: string };

      if (finalizeResult.async) {
        console.log(`[ResumableUpload] Background assembly started for ${session.filename}, polling for completion...`);
        toast.info(`${session.filename}: Assembling file on server... This may take a few minutes for large files.`);
        completedResult = await pollFinalizeStatus(session.sessionToken, abortController.signal);
      } else {
        completedResult = {
          fileId: finalizeResult.fileId!,
          videoId: finalizeResult.videoId,
          url: finalizeResult.url!,
        };
      }

      console.log(`[ResumableUpload] Finalization complete for ${session.filename}:`, completedResult);

      setSessionsRef.current(prev => {
        const updated = prev.map(s =>
          s.sessionToken === session.sessionToken
            ? { ...s, status: "completed" as const, progress: 100 }
            : s
        );
        saveSessionsToStorage(updated);
        return updated;
      });

      setTimeout(() => {
        trpcUtils.files.list.invalidate();
        trpcUtils.files.enrichmentCounts.invalidate();
        trpcUtils.recentlyViewed.list.invalidate();
      }, 500);

      optionsRef.current.onComplete?.(session, completedResult);
      toast.success(`${session.filename} uploaded successfully!`);

      // Send browser notification for background tab
      const fileSizeMB = (session.fileSize / (1024 * 1024)).toFixed(1);
      sendBrowserNotification(
        'Upload Complete',
        `${session.filename} (${fileSizeMB} MB) uploaded successfully!`
      );

    } catch (error) {
      if (!abortController.signal.aborted) {
        console.error("[ResumableUpload] Upload failed:", error);

        setSessionsRef.current(prev => {
          const updated = prev.map(s =>
            s.sessionToken === session.sessionToken
              ? { ...s, status: "error" as const, error: error instanceof Error ? error.message : "Upload failed" }
              : s
          );
          saveSessionsToStorage(updated);
          return updated;
        });

        optionsRef.current.onError?.(session, error instanceof Error ? error : new Error("Upload failed"));
        toast.error(`Failed to upload ${session.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);

        // Send browser notification for background tab
        sendBrowserNotification(
          'Upload Failed',
          `${session.filename} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    } finally {
      activeUploadsRef.current.delete(session.sessionToken);
      abortControllersRef.current.delete(session.sessionToken);
      liveSpeedMapRef.current.delete(session.sessionToken);
    }
  }, [readChunkAsBase64]);

  // Keep uploadChunksRef in sync for scheduled retry callbacks
  useEffect(() => { uploadChunksRef.current = uploadChunks; }, [uploadChunks]);

  // Auto-resume: when sessions load and have file references in memory, auto-resume them
  useEffect(() => {
    if (autoResumedRef.current || isLoading || sessions.length === 0) return;
    if (!options.autoResume) return;

    const sessionsWithFiles = sessions.filter(
      s => (s.status === 'active' || s.status === 'paused') && 
           s.file && 
           !activeUploadsRef.current.has(s.sessionToken)
    );

    if (sessionsWithFiles.length > 0) {
      autoResumedRef.current = true;
      console.log(`[ResumableUpload] Auto-resuming ${sessionsWithFiles.length} upload(s) with files in memory`);
      toast.info(`Auto-resuming ${sessionsWithFiles.length} upload(s)...`);
      
      // Stagger auto-resumes to avoid overwhelming the server
      sessionsWithFiles.forEach((session, index) => {
        setTimeout(() => {
          if (session.file) {
            uploadChunks({ ...session, status: 'active' }, session.file);
            setSessions(prev => prev.map(s => 
              s.sessionToken === session.sessionToken
                ? { ...s, status: 'active' as const, isPaused: false }
                : s
            ));
          }
        }, index * 1000); // 1 second stagger between each
      });
    }
  }, [sessions, isLoading, options.autoResume, uploadChunks]);

  // Track last progress for stall detection: { timestamp, chunks }
  const lastProgressRef = useRef<Map<string, { time: number; chunks: number }>>(new Map());

  // Update last progress timestamp whenever a session makes progress
  useEffect(() => {
    for (const session of sessions) {
      if (session.status === 'active' && session.uploadedChunks > 0) {
        const prev = lastProgressRef.current.get(session.sessionToken);
        if (!prev || session.uploadedChunks > prev.chunks) {
          lastProgressRef.current.set(session.sessionToken, { time: Date.now(), chunks: session.uploadedChunks });
        }
      }
    }
  }, [sessions]);

  // Visibility change handler: when user returns to the tab/app, check for stalled uploads
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[ResumableUpload] Page became visible, checking for stalled uploads...');
        const now = Date.now();
        const currentSessions = sessionsRef.current;
        
        for (const session of currentSessions) {
          // Only restart truly active uploads — skip error/paused sessions
          if (session.status === 'active' && session.file && activeUploadsRef.current.has(session.sessionToken)) {
            const lastProgress = lastProgressRef.current.get(session.sessionToken);
            const stalledFor = lastProgress ? now - lastProgress.time : 0;
            
            // If an "active" upload hasn't made progress in 90 seconds, it's stalled
            if (lastProgress && stalledFor > 90_000) {
              console.warn(`[ResumableUpload] ${session.filename} stalled for ${Math.round(stalledFor / 1000)}s, restarting...`);
              
              // Abort the stalled upload
              const controller = abortControllersRef.current.get(session.sessionToken);
              if (controller) controller.abort();
              activeUploadsRef.current.delete(session.sessionToken);
              abortControllersRef.current.delete(session.sessionToken);
              
              // Re-queue it
              toast.info(`Resuming ${session.filename} after returning to app...`);
              uploadChunks({ ...session, status: 'active' }, session.file);
            }
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [uploadChunks]);

  // Periodic stall detection: every 60 seconds, check if active uploads are making progress
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const currentSessions = sessionsRef.current;
      
      for (const session of currentSessions) {
        if (session.status === 'active' && session.file && activeUploadsRef.current.has(session.sessionToken)) {
          const lastProgress = lastProgressRef.current.get(session.sessionToken);
          const stalledFor = lastProgress ? now - lastProgress.time : 0;
          
          // If active for more than 3 minutes without progress, restart
          if (lastProgress && stalledFor > 180_000) {
            console.warn(`[ResumableUpload] ${session.filename} stalled for ${Math.round(stalledFor / 1000)}s (periodic check), restarting...`);
            
            const controller = abortControllersRef.current.get(session.sessionToken);
            if (controller) controller.abort();
            activeUploadsRef.current.delete(session.sessionToken);
            abortControllersRef.current.delete(session.sessionToken);
            
            toast.info(`Restarting stalled upload: ${session.filename}`);
            uploadChunks({ ...session, status: 'active' }, session.file);
            
            // Reset the progress timestamp
            lastProgressRef.current.set(session.sessionToken, { time: now, chunks: session.uploadedChunks });
          }
        }
      }
    }, 60_000); // Check every 60 seconds

    return () => clearInterval(interval);
  }, [uploadChunks]);

  // Pause an upload
  const pauseUpload = useCallback(async (sessionToken: string) => {
    const controller = abortControllersRef.current.get(sessionToken);
    if (controller) {
      controller.abort();
    }

    try {
      await pauseSessionMutation.mutateAsync({ sessionToken });
      
      setSessions(prev => prev.map(s => 
        s.sessionToken === sessionToken
          ? { ...s, status: "paused" as const, isPaused: true, speed: 0, eta: 0 }
          : s
      ));

      toast.info("Upload paused");
    } catch (error) {
      console.error("[ResumableUpload] Failed to pause:", error);
    }
  }, [pauseSessionMutation]);

  // Resume an upload
  const resumeUpload = useCallback(async (sessionToken: string, file?: File) => {
    const session = sessions.find(s => s.sessionToken === sessionToken);
    if (!session) {
      toast.error("Session not found");
      return;
    }

    // If no file provided, we need the user to re-select it
    const uploadFile = file || session.file;
    if (!uploadFile) {
      toast.error("Please re-select the file to resume upload");
      return;
    }

    // Verify file matches - use size as primary check (name can differ on mobile)
    if (uploadFile.size !== session.fileSize) {
      toast.error(`File size doesn't match. Expected ${session.fileSize} bytes but got ${uploadFile.size} bytes. Please select the correct file.`);
      return;
    }
    // Warn if name differs but allow it (mobile file pickers can return different names)
    if (uploadFile.name !== session.filename) {
      console.warn(`[ResumableUpload] File name mismatch: expected "${session.filename}", got "${uploadFile.name}". Allowing because size matches.`);
      toast.info(`File name differs but size matches — resuming upload.`);
    }

    setSessions(prev => prev.map(s => 
      s.sessionToken === sessionToken
        ? { ...s, status: "active" as const, isPaused: false, file: uploadFile }
        : s
    ));

    // Continue uploading
    uploadChunks({ ...session, file: uploadFile }, uploadFile);
    toast.info("Upload resumed");
  }, [sessions, uploadChunks]);

  // Cancel an upload - uses direct fetch to ensure it works regardless of component lifecycle
  const cancelUpload = useCallback(async (sessionToken: string) => {
    const controller = abortControllersRef.current.get(sessionToken);
    if (controller) {
      controller.abort();
    }

    // Add to cleared tokens to prevent server sync from bringing it back
    clearedTokensRef.current.add(sessionToken);

    // Immediately remove from local state
    setSessions(prev => {
      const updated = prev.filter(s => s.sessionToken !== sessionToken);
      saveSessionsToStorage(updated);
      return updated;
    });

    try {
      // Use direct fetch to ensure the cancel reaches the server
      await trpcCall<{ success: boolean }>('resumableUpload.cancelSession', { sessionToken });
      console.log(`[ResumableUpload] Session ${sessionToken} cancelled on server`);
      // Invalidate the query cache so refetch doesn't bring it back
      refetchSessions();
      toast.info("Upload cancelled");
    } catch (error) {
      console.error("[ResumableUpload] Failed to cancel on server:", error);
      // Still show cancelled locally even if server call fails
      toast.info("Upload cancelled locally");
    }
  }, [refetchSessions]);

  // Clear all sessions (force delete from server)
  const clearAllSessions = useCallback(async () => {
    const allTokens = sessions.map(s => s.sessionToken);
    
    // Add all tokens to cleared set to prevent server sync from bringing them back
    for (const token of allTokens) {
      clearedTokensRef.current.add(token);
    }
    
    // Immediately clear local state
    setSessions([]);
    clearSessionsFromStorage();
    
    // Cancel each on the server (in parallel for speed)
    const cancelPromises = allTokens.map(async (token) => {
      const controller = abortControllersRef.current.get(token);
      if (controller) controller.abort();
      try {
        await trpcCall<{ success: boolean }>('resumableUpload.cancelSession', { sessionToken: token });
      } catch (e) {
        console.warn(`[ResumableUpload] Failed to cancel session ${token}:`, e);
      }
    });
    
    // Wait for all cancellations to complete before refetching
    await Promise.allSettled(cancelPromises);
    
    refetchSessions();
    toast.info("All uploads cleared");
  }, [sessions, refetchSessions]);

  // Pause all active uploads
  const pauseAll = useCallback(async () => {
    const activeUploads = sessions.filter(s => s.status === "active");
    for (const session of activeUploads) {
      await pauseUpload(session.sessionToken);
    }
    if (activeUploads.length > 0) {
      toast.info(`${activeUploads.length} upload(s) paused`);
    }
  }, [sessions, pauseUpload]);

  // Resume all paused uploads (requires files to be re-selected)
  const resumeAll = useCallback(async (fileMap?: Map<string, File>) => {
    const pausedUploads = sessions.filter(s => s.status === "paused");
    let resumed = 0;
    let needsFile = 0;
    
    for (const session of pausedUploads) {
      const file = fileMap?.get(session.sessionToken) || session.file;
      if (file) {
        await resumeUpload(session.sessionToken, file);
        resumed++;
      } else {
        needsFile++;
      }
    }
    
    if (resumed > 0) {
      toast.info(`${resumed} upload(s) resumed`);
    }
    if (needsFile > 0) {
      toast.warning(`${needsFile} upload(s) need files to be re-selected`);
    }
  }, [sessions, resumeUpload]);

  // Retry all failed uploads
  const retryAllFailed = useCallback(async (fileMap?: Map<string, File>) => {
    const failedUploads = sessions.filter(s => s.status === "error");
    let retried = 0;
    let needsFile = 0;
    
    for (const session of failedUploads) {
      const file = fileMap?.get(session.sessionToken) || session.file;
      if (file) {
        // Reset status and restart
        setSessions(prev => prev.map(s => 
          s.sessionToken === session.sessionToken
            ? { ...s, status: "active" as const, error: undefined }
            : s
        ));
        uploadChunks({ ...session, status: "active", file }, file);
        retried++;
      } else {
        needsFile++;
      }
    }
    
    if (retried > 0) {
      toast.info(`${retried} failed upload(s) retrying`);
    }
    if (needsFile > 0) {
      toast.warning(`${needsFile} upload(s) need files to be re-selected`);
    }
  }, [sessions, uploadChunks]);

  // Pin/unpin upload (set priority)
  const pinUpload = useCallback((sessionToken: string) => {
    setSessions(prev => {
      const updated = prev.map(s =>
        s.sessionToken === sessionToken
          ? { ...s, priority: 'high' as const }
          : s
      );
      // Sort: high priority first, then by queueOrder
      const sorted = sortByPriority(updated);
      saveSessionsToStorage(sorted);
      return sorted;
    });
    toast.info('Upload pinned to top of queue');
  }, []);

  const unpinUpload = useCallback((sessionToken: string) => {
    setSessions(prev => {
      const updated = prev.map(s =>
        s.sessionToken === sessionToken
          ? { ...s, priority: 'normal' as const }
          : s
      );
      saveSessionsToStorage(updated);
      return updated;
    });
    toast.info('Upload unpinned');
  }, []);

  // Reorder uploads by moving a session to a new index
  const reorderUploads = useCallback((fromIndex: number, toIndex: number) => {
    setSessions(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      // Update queueOrder for all sessions
      const withOrder = updated.map((s, i) => ({ ...s, queueOrder: i }));
      saveSessionsToStorage(withOrder);
      return withOrder;
    });
  }, []);

  // Request browser notification permission
  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      return result === 'granted';
    }
    return Notification.permission === 'granted';
  }, []);

  // Send browser notification (for background tab)
  const sendBrowserNotification = useCallback((title: string, body: string, icon?: string) => {
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
      try {
        new Notification(title, { body, icon: icon || '/favicon.ico', tag: 'upload-notification' });
      } catch (e) {
        console.warn('[Notification] Failed to send:', e);
      }
    }
  }, []);

  // Get active/resumable sessions count
  const activeCount = sessions.filter(s => s.status === "active").length;
  const pausedCount = sessions.filter(s => s.status === "paused").length;
  const errorCount = sessions.filter(s => s.status === "error").length;
  const resumableCount = sessions.filter(s => s.status === "active" || s.status === "paused").length;

  // Compute global network quality from all active sessions
  const networkQuality = calculateNetworkQuality();

  return {
    sessions,
    isLoading,
    liveSpeedMapRef,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    clearAllSessions,
    pauseAll,
    resumeAll,
    retryAllFailed,
    scheduleRetry,
    cancelScheduledRetry,
    refetchSessions,
    activeCount,
    pausedCount,
    errorCount,
    resumableCount,
    networkQuality,
    speedLimit,
    setSpeedLimit,
    concurrency,
    setConcurrency,
    pinUpload,
    unpinUpload,
    reorderUploads,
    requestNotificationPermission,
    sendBrowserNotification,
  };
}
