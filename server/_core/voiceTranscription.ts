/**
 * Voice transcription helper using internal Speech-to-Text service
 *
 * Frontend implementation guide:
 * 1. Capture audio using MediaRecorder API
 * 2. Upload audio to storage (e.g., S3) to get URL
 * 3. Call transcription with the URL
 * 
 * Example usage:
 * ```tsx
 * // Frontend component
 * const transcribeMutation = trpc.voice.transcribe.useMutation({
 *   onSuccess: (data) => {
 *     console.log(data.text); // Full transcription
 *     console.log(data.language); // Detected language
 *     console.log(data.segments); // Timestamped segments
 *   }
 * });
 * 
 * // After uploading audio to storage
 * transcribeMutation.mutate({
 *   audioUrl: uploadedAudioUrl,
 *   language: 'en', // optional
 *   prompt: 'Transcribe the meeting' // optional
 * });
 * ```
 */
import { ENV } from "./env";

export type TranscribeOptions = {
  audioUrl: string; // URL to the audio file (e.g., S3 URL)
  language?: string; // Optional: specify language code (e.g., "en", "es", "zh")
  prompt?: string; // Optional: custom prompt for the transcription
};

// Native Whisper API segment format
export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

// Native Whisper API response format
export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse; // Return native Whisper API response directly

export type TranscriptionError = {
  error: string;
  code: "FILE_TOO_LARGE" | "INVALID_FORMAT" | "TRANSCRIPTION_FAILED" | "UPLOAD_FAILED" | "SERVICE_ERROR";
  details?: string;
};

/**
 * Transcribe audio to text using the internal Speech-to-Text service
 * 
 * @param options - Audio data and metadata
 * @returns Transcription result or error
 */
export async function transcribeAudio(
  options: TranscribeOptions
): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    // Step 1: Validate environment configuration
    if (!ENV.forgeApiUrl) {
      return {
        error: "Voice transcription service is not configured",
        code: "SERVICE_ERROR",
        details: "BUILT_IN_FORGE_API_URL is not set"
      };
    }
    if (!ENV.forgeApiKey) {
      return {
        error: "Voice transcription service authentication is missing",
        code: "SERVICE_ERROR",
        details: "BUILT_IN_FORGE_API_KEY is not set"
      };
    }

    // Step 2: Check file size with HEAD request first to avoid downloading large files
    let audioBuffer: Buffer;
    let mimeType: string;
    try {
      // Pre-check file size with HEAD request to avoid downloading 300MB+ files
      try {
        const headResponse = await fetch(options.audioUrl, { method: 'HEAD' });
        if (headResponse.ok) {
          const contentLength = headResponse.headers.get('content-length');
          if (contentLength) {
            const sizeMB = parseInt(contentLength, 10) / (1024 * 1024);
            if (sizeMB > 16) {
              return {
                error: "Audio file exceeds maximum size limit",
                code: "FILE_TOO_LARGE",
                details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 16MB`
              };
            }
          }
        }
      } catch {
        // HEAD request failed — proceed with GET and check size after download
      }

      const response = await fetch(options.audioUrl);
      if (!response.ok) {
        return {
          error: "Failed to download audio file",
          code: "INVALID_FORMAT",
          details: `HTTP ${response.status}: ${response.statusText}`
        };
      }
      
      audioBuffer = Buffer.from(await response.arrayBuffer());
      mimeType = response.headers.get('content-type') || 'audio/mpeg';
      
      // Check file size (16MB limit)
      const sizeMB = audioBuffer.length / (1024 * 1024);
      if (sizeMB > 16) {
        return {
          error: "Audio file exceeds maximum size limit",
          code: "FILE_TOO_LARGE",
          details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 16MB`
        };
      }
    } catch (error) {
      return {
        error: "Failed to fetch audio file",
        code: "SERVICE_ERROR",
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }

    // Step 3: Create FormData for multipart upload to Whisper API
    const formData = new FormData();
    
    // Create a Blob from the buffer and append to form
    const filename = `audio.${getFileExtension(mimeType)}`;
    const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append("file", audioBlob, filename);
    
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    
    // Add prompt - use custom prompt if provided, otherwise generate based on language
    const prompt = options.prompt || (
      options.language 
        ? `Transcribe the user's voice to text, the user's working language is ${getLanguageName(options.language)}`
        : "Transcribe the user's voice to text"
    );
    formData.append("prompt", prompt);

    // Step 4: Call the transcription service
    const baseUrl = ENV.forgeApiUrl.endsWith("/")
      ? ENV.forgeApiUrl
      : `${ENV.forgeApiUrl}/`;
    
    const fullUrl = new URL(
      "v1/audio/transcriptions",
      baseUrl
    ).toString();

    // Retry transient errors (429, 502, 503, 504) with exponential backoff
    const RETRYABLE_CODES = new Set([429, 502, 503, 504]);
    const MAX_WHISPER_RETRIES = 3;
    let whisperResponse: WhisperResponse | null = null;
    let lastWhisperError: string | null = null;

    for (let attempt = 0; attempt <= MAX_WHISPER_RETRIES; attempt++) {
      try {
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: {
            authorization: `Bearer ${ENV.forgeApiKey}`,
            "Accept-Encoding": "identity",
          },
          body: formData,
        });

        if (response.ok) {
          whisperResponse = await response.json() as WhisperResponse;
          break;
        }

        const errorText = await response.text().catch(() => "");

        if (RETRYABLE_CODES.has(response.status) && attempt < MAX_WHISPER_RETRIES) {
          const delay = 2000 * Math.pow(2, attempt) + Math.random() * 1000;
          console.warn(
            `[Whisper] Transient error ${response.status} (attempt ${attempt + 1}/${MAX_WHISPER_RETRIES + 1}), ` +
            `retrying in ${(delay / 1000).toFixed(1)}s`
          );
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        lastWhisperError = `${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`;
        break;
      } catch (fetchErr: any) {
        if (attempt < MAX_WHISPER_RETRIES) {
          const delay = 2000 * Math.pow(2, attempt) + Math.random() * 1000;
          console.warn(
            `[Whisper] Network error (attempt ${attempt + 1}/${MAX_WHISPER_RETRIES + 1}), ` +
            `retrying in ${(delay / 1000).toFixed(1)}s: ${fetchErr.message}`
          );
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        lastWhisperError = fetchErr.message;
        break;
      }
    }

    if (!whisperResponse && lastWhisperError) {
      return {
        error: "Transcription service request failed",
        code: "TRANSCRIPTION_FAILED",
        details: lastWhisperError,
      };
    }

    if (!whisperResponse) {
      return {
        error: "Transcription service request failed",
        code: "TRANSCRIPTION_FAILED",
        details: "No response after retries",
      };
    }

    // Step 5: Parse and return the transcription result
    
    // Validate response structure
    if (!whisperResponse.text || typeof whisperResponse.text !== 'string') {
      return {
        error: "Invalid transcription response",
        code: "SERVICE_ERROR",
        details: "Transcription service returned an invalid response format"
      };
    }

    return whisperResponse; // Return native Whisper API response directly

  } catch (error) {
    // Handle unexpected errors
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred"
    };
  }
}

/**
 * Helper function to get file extension from MIME type
 */
function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/ogg': 'ogg',
    'audio/m4a': 'm4a',
    'audio/mp4': 'm4a',
    'video/webm': 'webm',
    'video/mp4': 'mp4',
    'video/ogg': 'ogg',
    'video/mpeg': 'mpeg',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
  };
  
  return mimeToExt[mimeType] || 'mp3';
}

/**
 * Helper function to get full language name from ISO code
 */
function getLanguageName(langCode: string): string {
  const langMap: Record<string, string> = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'nl': 'Dutch',
    'pl': 'Polish',
    'tr': 'Turkish',
    'sv': 'Swedish',
    'da': 'Danish',
    'no': 'Norwegian',
    'fi': 'Finnish',
  };
  
  return langMap[langCode] || langCode;
}

/**
 * Example tRPC procedure implementation:
 * 
 * ```ts
 * // In server/routers.ts
 * import { transcribeAudio } from "./_core/voiceTranscription";
 * 
 * export const voiceRouter = router({
 *   transcribe: protectedProcedure
 *     .input(z.object({
 *       audioUrl: z.string(),
 *       language: z.string().optional(),
 *       prompt: z.string().optional(),
 *     }))
 *     .mutation(async ({ input, ctx }) => {
 *       const result = await transcribeAudio(input);
 *       
 *       // Check if it's an error
 *       if ('error' in result) {
 *         throw new TRPCError({
 *           code: 'BAD_REQUEST',
 *           message: result.error,
 *           cause: result,
 *         });
 *       }
 *       
 *       // Optionally save transcription to database
 *       await db.insert(transcriptions).values({
 *         userId: ctx.user.id,
 *         text: result.text,
 *         duration: result.duration,
 *         language: result.language,
 *         audioUrl: input.audioUrl,
 *         createdAt: new Date(),
 *       });
 *       
 *       return result;
 *     }),
 * });
 * ```
 */
