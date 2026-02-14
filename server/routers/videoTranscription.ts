import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { transcribeAudio } from "../_core/voiceTranscription";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { videoTranscripts, fileSuggestions, files } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { getTranscriptionErrorMessage } from "../lib/errorMessages";
import { resolveFileUrl } from "../lib/resolveFileUrl";

/**
 * LLM-based transcription fallback for large video files that exceed Whisper's 16MB limit.
 * Uses the LLM vision API to analyze the video and extract speech content.
 */
async function transcribeWithLLM(
  file: { id: number; url: string; fileKey: string; mimeType?: string | null },
  transcriptId: number,
  origin?: string
) {
  try {
    console.log(`[Transcription] Using LLM fallback for file ${file.id}`);

    // Resolve relative streaming URLs to publicly accessible S3 URLs
    const accessibleUrl = await resolveFileUrl(file, { origin });
    console.log(`[Transcription] Resolved URL for LLM: ${accessibleUrl.substring(0, 80)}...`);

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert audio/video transcription assistant. You will be given a video file. Listen carefully to all spoken audio and transcribe it accurately with timestamps.

For each segment of speech, provide:
1. The start time in seconds
2. The end time in seconds
3. The exact text spoken

Be precise with the transcription. Include all spoken words, filler words, and any audible speech. If there is no speech, return an empty segments array.
Detect the language automatically.`,
        },
        {
          role: "user",
          content: [
            {
              type: "file_url" as const,
              file_url: {
                url: accessibleUrl,
                mime_type: (file.mimeType || "video/mp4") as "video/mp4",
              },
            },
            {
              type: "text" as const,
              text: "Transcribe all spoken audio in this video with timestamps. Return the result as JSON.",
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "video_transcription",
          strict: true,
          schema: {
            type: "object",
            properties: {
              fullText: {
                type: "string",
                description: "Complete transcription of all spoken audio",
              },
              language: {
                type: "string",
                description: "Detected language code (e.g., en, es, fr)",
              },
              segments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    start: { type: "number" },
                    end: { type: "number" },
                  },
                  required: ["text", "start", "end"],
                  additionalProperties: false,
                },
              },
            },
            required: ["fullText", "language", "segments"],
            additionalProperties: false,
          },
        },
      },
    });

    if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
      throw new Error("LLM returned an empty or invalid response for transcription");
    }

    const content = response.choices[0].message.content;
    const contentStr = typeof content === "string" ? content : JSON.stringify(content);
    if (!contentStr) {
      throw new Error("No content in LLM transcription response");
    }

    let result: any;
    try {
      result = JSON.parse(contentStr);
    } catch {
      throw new Error("Failed to parse LLM transcription response as JSON");
    }

    const segments = result.segments || [];
    const fullText = result.fullText || segments.map((s: any) => s.text).join(" ");
    const language = result.language || "en";

    // Build word timestamps from segments
    const wordTimestamps = segments.flatMap((segment: any) => {
      const words = (segment.text || "").trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) return [];
      const duration = segment.end - segment.start;
      const timePerWord = duration / words.length;
      return words.map((word: string, index: number) => ({
        word,
        start: segment.start + index * timePerWord,
        end: segment.start + (index + 1) * timePerWord,
      }));
    });

    await db.updateVideoTranscript(transcriptId, {
      fullText,
      wordTimestamps,
      segments,
      language,
      confidence: 85, // LLM transcription is slightly less precise than Whisper
      status: "completed",
    });

    return {
      transcriptId,
      status: "completed",
      transcript: {
        id: transcriptId,
        fullText,
        segments,
        language,
      },
    };
  } catch (error: any) {
    const userMessage = getTranscriptionErrorMessage(error.message);
    await db.updateVideoTranscriptStatus(transcriptId, "failed", userMessage);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: userMessage,
    });
  }
}

/**
 * Video Transcription and File Suggestion Router
 * Handles video-to-text transcription and intelligent file matching
 */
export const videoTranscriptionRouter = router({
  /**
   * Transcribe a video file and store the transcript with timestamps
   */
  transcribeVideo: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the video file
      const file = await db.getFileById(input.fileId);
      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Video file not found",
        });
      }

      // Verify ownership
      if (file.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to transcribe this video",
        });
      }

      // Check if video mime type
      if (!file.mimeType?.startsWith("video/")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File is not a video",
        });
      }

      // Check if transcript already exists
      const existing = await db.getVideoTranscriptByFileId(input.fileId);
      if (existing && existing.status === "completed") {
        return {
          transcriptId: existing.id,
          status: "already_exists",
          transcript: existing,
        };
      }

      // Create or update transcript record with pending status
      const transcriptId = existing
        ? existing.id
        : await db.createVideoTranscript({
            fileId: input.fileId,
            userId: ctx.user.id,
            fullText: "",
            status: "processing",
          });

      // Update status to processing
      await db.updateVideoTranscriptStatus(transcriptId, "processing");

      try {
        // Get the origin from the request for URL resolution
        const origin = ctx.req.headers.origin || (ctx.req.headers.host ? `${ctx.req.protocol || 'https'}://${ctx.req.headers.host}` : undefined);
        console.log(`[Transcription] Request origin: ${origin}`);

        // Resolve relative streaming URLs to publicly accessible S3 URLs
        const accessibleUrl = await resolveFileUrl(file, { origin });
        console.log(`[Transcription] Resolved URL for file ${input.fileId}: ${accessibleUrl.substring(0, 80)}...`);

        // Try Whisper first
        const result = await transcribeAudio({
          audioUrl: accessibleUrl,
          language: "en",
        });

        // Check for transcription errors
        if ("error" in result) {
          // If file is too large for Whisper, fall back to LLM transcription
          if (result.code === "FILE_TOO_LARGE") {
            console.log(`[Transcription] File ${input.fileId} too large for Whisper (${result.details}), falling back to LLM transcription`);
            return await transcribeWithLLM(file, transcriptId, origin);
          }
          const userMessage = getTranscriptionErrorMessage(result.error, result.code);
          await db.updateVideoTranscriptStatus(transcriptId, "failed", userMessage);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: userMessage,
          });
        }

        // Extract word-level timestamps and segments
        const wordTimestamps = result.segments.flatMap((segment) => {
          const words = segment.text.trim().split(/\s+/);
          const duration = segment.end - segment.start;
          const timePerWord = duration / words.length;

          return words.map((word, index) => ({
            word,
            start: segment.start + index * timePerWord,
            end: segment.start + (index + 1) * timePerWord,
          }));
        });

        const segments = result.segments.map((seg) => ({
          text: seg.text,
          start: seg.start,
          end: seg.end,
        }));

        // Update transcript with results
        await db.updateVideoTranscript(transcriptId, {
          fullText: result.text,
          wordTimestamps,
          segments,
          language: result.language,
          confidence: 95,
          status: "completed",
        });

        return {
          transcriptId,
          status: "completed",
          transcript: {
            id: transcriptId,
            fullText: result.text,
            segments,
            language: result.language,
          },
        };
      } catch (error: any) {
        // If this is already a TRPCError (from the error handling above or transcribeWithLLM),
        // re-throw it directly to avoid double-wrapping the error message
        if (error instanceof TRPCError) {
          throw error;
        }
        const userMessage = getTranscriptionErrorMessage(error.message);
        await db.updateVideoTranscriptStatus(transcriptId, "failed", userMessage);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: userMessage,
        });
      }
    }),

  /**
   * Get transcript for a video
   */
  getTranscript: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const transcript = await db.getVideoTranscriptByFileId(input.fileId);
      if (!transcript) {
        return null;
      }

      // Verify ownership
      if (transcript.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to view this transcript",
        });
      }

      return transcript;
    }),

  /**
   * Generate file suggestions based on video transcript
   */
  generateFileSuggestions: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        minRelevanceScore: z.number().min(0).max(1).default(0.5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the video transcript
      const transcript = await db.getVideoTranscriptByFileId(input.fileId);
      if (!transcript || transcript.status !== "completed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Video must be transcribed first",
        });
      }

      // Verify ownership
      if (transcript.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to generate suggestions for this video",
        });
      }

      // Get all user's files (excluding the video itself)
      const userFiles = await db.getFilesByUserId(ctx.user.id);
      const candidateFiles = userFiles.filter((f) => f.id !== input.fileId);

      if (candidateFiles.length === 0) {
        return {
          suggestions: [],
          message: "No files available for matching",
        };
      }

      // Process transcript segments
      const segments = transcript.segments as Array<{
        text: string;
        start: number;
        end: number;
      }>;

      const suggestions: Array<{
        videoFileId: number;
        suggestedFileId: number;
        userId: number;
        startTime: number;
        endTime: number;
        transcriptExcerpt: string;
        matchedKeywords: string[];
        relevanceScore: number;
        matchType: "keyword" | "semantic" | "entity" | "topic";
      }> = [];

      // Analyze each segment
      for (const segment of segments) {
        // Use LLM to analyze segment and match with files
        const prompt = `Analyze this video transcript segment and identify which files from the library are most relevant.

Transcript segment (${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s):
"${segment.text}"

Available files:
${candidateFiles
  .map(
    (f, idx) =>
      `${idx + 1}. ${f.filename} - Title: "${f.title || "N/A"}" - Description: "${f.description || "N/A"}" - AI Analysis: "${f.aiAnalysis || "N/A"}" - Keywords: ${(f.extractedKeywords as string[])?.join(", ") || "N/A"}`
  )
  .join("\n")}

Return a JSON array of matches with this structure:
[
  {
    "fileIndex": <number 1-${candidateFiles.length}>,
    "relevanceScore": <number 0.0-1.0>,
    "matchedKeywords": ["keyword1", "keyword2"],
    "matchType": "keyword|semantic|entity|topic",
    "reasoning": "brief explanation"
  }
]

Only include files with relevance score >= ${input.minRelevanceScore}. If no files are relevant, return an empty array.`;

        try {
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "You are an expert at semantic matching and content analysis. Analyze transcript segments and identify relevant files based on topic similarity, keyword matching, and contextual relevance.",
              },
              { role: "user", content: prompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "file_matches",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    matches: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          fileIndex: { type: "number" },
                          relevanceScore: { type: "number" },
                          matchedKeywords: {
                            type: "array",
                            items: { type: "string" },
                          },
                          matchType: {
                            type: "string",
                            enum: ["keyword", "semantic", "entity", "topic"],
                          },
                          reasoning: { type: "string" },
                        },
                        required: [
                          "fileIndex",
                          "relevanceScore",
                          "matchedKeywords",
                          "matchType",
                          "reasoning",
                        ],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["matches"],
                  additionalProperties: false,
                },
              },
            },
          });

          const content = response.choices[0].message.content;
          const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
          if (contentStr) {
            const result = JSON.parse(contentStr);
            const matches = result.matches || [];

            for (const match of matches) {
              const file = candidateFiles[match.fileIndex - 1];
              if (file && match.relevanceScore >= input.minRelevanceScore) {
                suggestions.push({
                  videoFileId: input.fileId,
                  suggestedFileId: file.id,
                  userId: ctx.user.id,
                  startTime: segment.start,
                  endTime: segment.end,
                  transcriptExcerpt: segment.text,
                  matchedKeywords: match.matchedKeywords,
                  relevanceScore: match.relevanceScore,
                  matchType: match.matchType,
                });
              }
            }
          }
        } catch (error) {
          console.error("Error analyzing segment:", error);
          // Continue with next segment
        }
      }

      // Save suggestions to database
      for (const suggestion of suggestions) {
        await db.createFileSuggestion(suggestion);
      }

      return {
        suggestions,
        count: suggestions.length,
        message: `Generated ${suggestions.length} file suggestions`,
      };
    }),

  /**
   * Get file suggestions for a video
   */
  getFileSuggestions: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        status: z.enum(["active", "dismissed", "accepted"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const suggestions = await db.getFileSuggestionsByVideoId(
        input.fileId,
        input.status
      );

      // Verify ownership and enrich with file details
      const enrichedSuggestions = await Promise.all(
        suggestions.map(async (suggestion) => {
          if (suggestion.userId !== ctx.user.id) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You do not have permission to view these suggestions",
            });
          }

          const suggestedFile = await db.getFileById(suggestion.suggestedFileId);
          return {
            ...suggestion,
            suggestedFile,
          };
        })
      );

      return enrichedSuggestions;
    }),

  /**
   * Update suggestion status (dismiss, accept)
   */
  updateSuggestionStatus: protectedProcedure
    .input(
      z.object({
        suggestionId: z.number(),
        status: z.enum(["active", "dismissed", "accepted"]),
        feedback: z.enum(["helpful", "not_helpful", "irrelevant"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const suggestion = await db.getFileSuggestionById(input.suggestionId);
      if (!suggestion) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Suggestion not found",
        });
      }

      // Verify ownership
      if (suggestion.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to update this suggestion",
        });
      }

      await db.updateFileSuggestionStatus(
        input.suggestionId,
        input.status,
        input.feedback
      );

      return {
        success: true,
        message: "Suggestion status updated",
      };
    }),
});
