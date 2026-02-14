/**
 * Shared error message helpers for video processing features.
 * Maps raw error messages to user-friendly descriptions that help users
 * understand what went wrong and what they can do about it.
 */

/**
 * Maps raw transcription error messages to user-friendly descriptions.
 */
export function getTranscriptionErrorMessage(rawError: string, errorCode?: string): string {
  // Strip any existing "Transcription failed:" prefix to avoid nesting
  let cleanError = rawError;
  while (cleanError.startsWith("Transcription failed: ")) {
    cleanError = cleanError.replace("Transcription failed: ", "");
  }
  // Also strip trailing retry messages to avoid duplication
  cleanError = cleanError.replace(/\.?\s*You can retry by clicking the Transcript button\.?\s*$/g, "").trim();
  const lower = cleanError.toLowerCase();

  // File format / codec issues
  if (lower.includes("unsupported") || lower.includes("codec") || lower.includes("format")) {
    return "This video format is not supported for transcription. Try converting it to MP4 (H.264) before uploading.";
  }

  // File too large (shouldn't normally reach here since we have LLM fallback)
  if (errorCode === "FILE_TOO_LARGE" || lower.includes("too large") || lower.includes("size limit")) {
    return "This video file is too large for transcription. Try trimming the video or compressing it before uploading.";
  }

  // No audio track
  if (lower.includes("no audio") || lower.includes("audio track") || lower.includes("silent")) {
    return "No audio track was detected in this video. Transcription requires a video with spoken audio.";
  }

  // Network / timeout errors
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("econnreset") || lower.includes("econnrefused")) {
    return "The transcription service timed out or lost connection. This can happen with very long videos. Please try again.";
  }

  // Rate limiting
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
    return "The transcription service is temporarily busy. Please wait a minute and try again.";
  }

  // LLM-specific errors
  if (lower.includes("llm") || lower.includes("empty or invalid response") || lower.includes("parse")) {
    return "AI analysis could not process this video. The video may be too long, corrupted, or in an unsupported format. Try a shorter clip.";
  }

  // Generic server error
  if (lower.includes("internal server error") || lower.includes("500")) {
    return "An unexpected server error occurred during transcription. Please try again. If the problem persists, the video file may be corrupted.";
  }

  // File still being assembled (chunked upload not yet complete)
  if (lower.includes("still being processed") || lower.includes("hasn't been fully assembled") || lower.includes("background assembly")) {
    return "This video is still being processed after upload. Please wait a few minutes and try again.";
  }

  // Failed to download / access the file
  if (lower.includes("failed to download") || lower.includes("failed to fetch") || lower.includes("cannot resolve file url")) {
    return "Could not access the video file for transcription. The file may still be processing after upload. Please wait a minute and try again.";
  }

  // Default: include the original error but with a user-friendly prefix
  return `Transcription failed: ${cleanError}. You can retry by clicking the Transcript button.`;
}

/**
 * Maps raw captioning error messages to user-friendly descriptions.
 */
export function getCaptioningErrorMessage(rawError: string): string {
  // Strip any existing prefix to avoid nesting
  let cleanError = rawError;
  while (cleanError.startsWith("Visual captioning failed: ") || cleanError.startsWith("Caption generation failed: ")) {
    cleanError = cleanError.replace("Visual captioning failed: ", "").replace("Caption generation failed: ", "");
  }
  cleanError = cleanError.trim();
  const lower = cleanError.toLowerCase();

  // File format issues
  if (lower.includes("unsupported") || lower.includes("format")) {
    return "This video format is not supported for visual captioning. Try converting it to MP4 (H.264).";
  }

  // File too large
  if (lower.includes("too large") || lower.includes("size")) {
    return "This video is too large for visual analysis. Try a shorter or lower-resolution version.";
  }

  // LLM response issues
  if (lower.includes("empty or invalid response") || lower.includes("no content")) {
    return "AI analysis returned no results. The video may be too large, too long, or in an unsupported format for visual analysis.";
  }

  // JSON parse errors
  if (lower.includes("parse") || lower.includes("json")) {
    return "AI analysis produced an unreadable response. Please try again. If it keeps failing, the video may be too complex for analysis.";
  }

  // Network / timeout
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("econnreset")) {
    return "The captioning service timed out. This can happen with long videos. Please try again or use a shorter clip.";
  }

  // Rate limiting
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "The captioning service is temporarily busy. Please wait a minute and try again.";
  }

  // File still being assembled (chunked upload not yet complete)
  if (lower.includes("still being processed") || lower.includes("hasn't been fully assembled") || lower.includes("background assembly")) {
    return "This video is still being processed after upload. Please wait a few minutes and try again.";
  }

  // Failed to download / access the file
  if (lower.includes("failed to download") || lower.includes("failed to fetch") || lower.includes("cannot resolve file url")) {
    return "Could not access the video file for captioning. The file may still be processing after upload. Please wait a minute and try again.";
  }

  // Default
  return `Caption generation failed: ${cleanError}. You can retry by clicking the Captions button.`;
}
