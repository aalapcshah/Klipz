import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { transcribeAudio } from "../_core/voiceTranscription";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { videoTranscripts, fileSuggestions, files } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

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
        // Transcribe the video audio
        const result = await transcribeAudio({
          audioUrl: file.url,
          language: "en",
        });

        // Check for transcription errors
        if ("error" in result) {
          await db.updateVideoTranscriptStatus(transcriptId, "failed");
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Transcription failed: ${result.error}`,
          });
        }

        // Extract word-level timestamps and segments
        const wordTimestamps = result.segments.flatMap((segment) => {
          // Whisper doesn't provide word-level timestamps directly
          // We'll split by words and estimate timestamps
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
          confidence: 95, // Whisper is generally high confidence
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
        await db.updateVideoTranscriptStatus(transcriptId, "failed");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Transcription failed: ${error.message}`,
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
