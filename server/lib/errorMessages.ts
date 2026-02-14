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

  // File still being assembled (chunked upload not yet complete) — check FIRST
  if (lower.includes("still being processed") || lower.includes("hasn't been fully assembled") || lower.includes("background assembly")) {
    return "This video is still being processed after upload. Please wait a few minutes and try again.";
  }

  // Failed to download / access the file — check BEFORE format errors
  if (lower.includes("failed to download") || lower.includes("failed to fetch") || lower.includes("cannot resolve file url") || lower.includes("could not download")) {
    return "Could not access the video file for transcription. The file may still be processing after upload. Please wait a minute and try again.";
  }

  // File too large
  if (errorCode === "FILE_TOO_LARGE" || lower.includes("too large") || lower.includes("size limit") || lower.includes("exceeds the maximum")) {
    return "This video file is too large for transcription. Try trimming the video or compressing it before uploading.";
  }

  // No audio track
  if (lower.includes("no audio") || lower.includes("audio track") || lower.includes("silent")) {
    return "No audio track was detected in this video. Transcription requires a video with spoken audio.";
  }

  // Network / timeout errors
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("econnreset") || lower.includes("econnrefused") || lower.includes("socket hang up")) {
    return "The transcription service timed out or lost connection. This can happen with very long videos. Please try again.";
  }

  // Rate limiting
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
    return "The transcription service is temporarily busy. Please wait a minute and try again.";
  }

  // LLM-specific errors
  if (lower.includes("empty or invalid response") || lower.includes("no content in llm")) {
    return "AI analysis could not process this video. The video may be too long or corrupted. Try a shorter clip.";
  }

  // JSON parse errors
  if (lower.includes("failed to parse") || lower.includes("json")) {
    return "AI analysis produced an unreadable response. Please try again.";
  }

  // File format / codec issues — only match specific format-related errors, NOT generic ones
  if (lower.includes("unsupported media type") || lower.includes("unsupported codec") || lower.includes("unsupported video format") || lower.includes("invalid video") || lower.includes("not a valid video")) {
    return "This video format is not supported for transcription. Try converting it to MP4 (H.264) before uploading.";
  }

  // Generic server error
  if (lower.includes("internal server error") || lower.includes("500")) {
    return "An unexpected server error occurred during transcription. Please try again. If the problem persists, the video file may be corrupted.";
  }

  // Default: include the original error but with a user-friendly prefix
  return `Transcription error: ${cleanError}. You can retry by clicking the Transcript button.`;
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

  // File still being assembled (chunked upload not yet complete) — check FIRST
  if (lower.includes("still being processed") || lower.includes("hasn't been fully assembled") || lower.includes("background assembly")) {
    return "This video is still being processed after upload. Please wait a few minutes and try again.";
  }

  // Failed to download / access the file — check BEFORE format errors
  if (lower.includes("failed to download") || lower.includes("failed to fetch") || lower.includes("cannot resolve file url") || lower.includes("could not download") || lower.includes("could not access")) {
    return "Could not access the video file for captioning. The file may still be processing after upload. Please wait a minute and try again.";
  }

  // File too large
  if (lower.includes("too large") || lower.includes("exceeds") || lower.includes("maximum allowed size")) {
    return "This video is too large for visual analysis. Try a shorter or lower-resolution version.";
  }

  // LLM response issues
  if (lower.includes("empty or invalid response") || lower.includes("no content in llm")) {
    return "AI analysis returned no results. The video may be too large or too long for visual analysis. Try a shorter clip.";
  }

  // JSON parse errors
  if (lower.includes("failed to parse") || lower.includes("json")) {
    return "AI analysis produced an unreadable response. Please try again.";
  }

  // Network / timeout
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("econnreset") || lower.includes("socket hang up")) {
    return "The captioning service timed out. This can happen with long videos. Please try again or use a shorter clip.";
  }

  // Rate limiting
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "The captioning service is temporarily busy. Please wait a minute and try again.";
  }

  // File format issues — only match SPECIFIC format errors, not generic "format" mentions
  if (lower.includes("unsupported media type") || lower.includes("unsupported codec") || lower.includes("unsupported video format") || lower.includes("invalid video") || lower.includes("not a valid video")) {
    return "This video format is not supported for visual captioning. Try converting it to MP4 (H.264).";
  }

  // Generic server error
  if (lower.includes("internal server error") || lower.includes("500")) {
    return "An unexpected server error occurred during captioning. Please try again.";
  }

  // Default — show the actual error without misleading format messages
  return `Captioning error: ${cleanError}. You can retry by clicking the Retry button.`;
}
