/**
 * Centralized Transcoding Progress Tracker
 * 
 * Tracks progress for all FFmpeg-based operations:
 * - HLS transcoding
 * - Video compression
 * - Audio extraction
 * - Video export
 * 
 * Progress is stored in-memory and exposed via tRPC polling endpoints.
 */

export type JobType = "hls" | "compression" | "audio_extraction" | "video_export" | "transcription" | "captioning";
export type JobStatus = "queued" | "downloading" | "processing" | "uploading" | "complete" | "failed";

export interface TranscodingJob {
  id: string;           // Unique job identifier (e.g., "hls-42", "compress-15")
  type: JobType;
  entityId: number;     // videoId or fileId
  status: JobStatus;
  progress: number;     // 0-100
  stage?: string;       // Human-readable stage description
  startedAt: number;    // Unix timestamp ms
  updatedAt: number;    // Unix timestamp ms
  completedAt?: number;
  error?: string;
  metadata?: Record<string, any>; // Extra info (e.g., originalSize, compressedSize)
}

// In-memory job store
const jobs = new Map<string, TranscodingJob>();

// Keep completed/failed jobs for 5 minutes for UI to pick up
const COMPLETED_JOB_TTL = 5 * 60 * 1000;

/**
 * Create or update a transcoding job
 */
export function upsertJob(id: string, updates: Partial<TranscodingJob> & { type: JobType; entityId: number }): TranscodingJob {
  const existing = jobs.get(id);
  const now = Date.now();
  
  if (existing) {
    const updated = {
      ...existing,
      ...updates,
      updatedAt: now,
    };
    if (updates.status === "complete" || updates.status === "failed") {
      updated.completedAt = now;
      // Schedule cleanup
      setTimeout(() => jobs.delete(id), COMPLETED_JOB_TTL);
    }
    jobs.set(id, updated);
    return updated;
  }

  const job: TranscodingJob = {
    id,
    type: updates.type,
    entityId: updates.entityId,
    status: updates.status || "queued",
    progress: updates.progress || 0,
    stage: updates.stage,
    startedAt: now,
    updatedAt: now,
    error: updates.error,
    metadata: updates.metadata,
  };
  jobs.set(id, job);
  return job;
}

/**
 * Update job progress
 */
export function updateJobProgress(id: string, progress: number, stage?: string): void {
  const job = jobs.get(id);
  if (job) {
    job.progress = Math.min(100, Math.max(0, progress));
    job.updatedAt = Date.now();
    if (stage) job.stage = stage;
  }
}

/**
 * Mark job as complete
 */
export function completeJob(id: string, metadata?: Record<string, any>): void {
  const job = jobs.get(id);
  if (job) {
    job.status = "complete";
    job.progress = 100;
    job.completedAt = Date.now();
    job.updatedAt = Date.now();
    if (metadata) job.metadata = { ...job.metadata, ...metadata };
    setTimeout(() => jobs.delete(id), COMPLETED_JOB_TTL);
  }
}

/**
 * Mark job as failed
 */
export function failJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (job) {
    job.status = "failed";
    job.error = error;
    job.completedAt = Date.now();
    job.updatedAt = Date.now();
    setTimeout(() => jobs.delete(id), COMPLETED_JOB_TTL);
  }
}

/**
 * Get a specific job
 */
export function getJob(id: string): TranscodingJob | undefined {
  return jobs.get(id);
}

/**
 * Get all jobs for a specific entity (video or file)
 */
export function getJobsForEntity(entityId: number): TranscodingJob[] {
  return Array.from(jobs.values()).filter(j => j.entityId === entityId);
}

/**
 * Get all active jobs (not complete or failed)
 */
export function getActiveJobs(): TranscodingJob[] {
  return Array.from(jobs.values()).filter(
    j => j.status !== "complete" && j.status !== "failed"
  );
}

/**
 * Parse FFmpeg progress output from -progress pipe:1
 * Returns progress percentage (0-100) based on duration
 */
export function parseFFmpegProgress(output: string, totalDurationSec: number): number {
  if (totalDurationSec <= 0) return 0;
  
  const timeMatch = output.match(/out_time_us=(\d+)/);
  if (timeMatch) {
    const currentTimeUs = parseInt(timeMatch[1]);
    const currentTimeSec = currentTimeUs / 1_000_000;
    return Math.min(99, Math.round((currentTimeSec / totalDurationSec) * 100));
  }
  
  // Also try parsing out_time=HH:MM:SS.mmm format
  const timeStrMatch = output.match(/out_time=(\d+):(\d+):(\d+\.\d+)/);
  if (timeStrMatch) {
    const hours = parseInt(timeStrMatch[1]);
    const minutes = parseInt(timeStrMatch[2]);
    const seconds = parseFloat(timeStrMatch[3]);
    const currentTimeSec = hours * 3600 + minutes * 60 + seconds;
    return Math.min(99, Math.round((currentTimeSec / totalDurationSec) * 100));
  }
  
  return -1; // No progress info found
}

/**
 * Parse FFmpeg stderr for duration info
 * Returns duration in seconds
 */
export function parseFFmpegDuration(stderr: string): number {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (match) {
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseFloat(match[3]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
}
