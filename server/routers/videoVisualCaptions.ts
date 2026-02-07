import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";

/**
 * Video Visual Captions Router
 * Analyzes video frames using LLM vision to generate captions for videos (especially those without audio).
 * Then matches extracted entities against user's uploaded files with confidence scores.
 */
export const videoVisualCaptionsRouter = router({
  /**
   * Generate visual captions by sending the video to LLM vision API
   * The LLM analyzes the video content and produces timed captions with entities
   */
  generateCaptions: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        intervalSeconds: z.number().min(2).max(30).default(5),
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

      if (file.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to analyze this video",
        });
      }

      if (!file.mimeType?.startsWith("video/")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File is not a video",
        });
      }

      // Check if captions already exist and delete old file matches
      const existing = await db.getVisualCaptionByFileId(input.fileId);
      if (existing) {
        // Delete old file matches
        await db.deleteVisualCaptionFileMatches(input.fileId);
      }

      // Create or update the visual caption record
      let captionId: number;
      if (existing) {
        await db.updateVisualCaption(existing.id, {
          status: "processing",
          intervalSeconds: input.intervalSeconds,
          errorMessage: null,
        });
        captionId = existing.id;
      } else {
        captionId = await db.createVisualCaption({
          fileId: input.fileId,
          userId: ctx.user.id,
          intervalSeconds: input.intervalSeconds,
          status: "processing",
        });
      }

      try {
        // Send the video to LLM vision API for analysis
        // The LLM can process video content directly via file_url
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert video analyst. You will be given a video file. Analyze the visual content and generate detailed captions at regular time intervals (approximately every ${input.intervalSeconds} seconds).

For each timepoint, provide:
1. A descriptive caption of what is visually happening (objects, actions, text on screen, scenes, people, etc.)
2. Key entities/topics extracted from the visual content (nouns, concepts, named entities)
3. A confidence score (0.0-1.0) for how confident you are in the caption

Focus on:
- What is shown on screen (text, diagrams, charts, images, UI elements)
- Actions being performed
- Objects and their relationships
- Any text visible in the video (titles, labels, captions)
- Scene changes and transitions
- People and their activities

Generate captions for the entire duration of the video. If the video is short, provide captions at smaller intervals.`,
            },
            {
              role: "user",
              content: [
                {
                  type: "file_url" as const,
                  file_url: {
                    url: file.url,
                    mime_type: "video/mp4" as const,
                  },
                },
                {
                  type: "text" as const,
                  text: `Analyze this video and generate visual captions at approximately ${input.intervalSeconds}-second intervals. Return a JSON response with the captions array.`,
                },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "visual_captions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  captions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        timestamp: {
                          type: "number",
                          description: "Time in seconds from the start of the video",
                        },
                        caption: {
                          type: "string",
                          description: "Detailed description of what is visually happening at this timepoint",
                        },
                        entities: {
                          type: "array",
                          items: { type: "string" },
                          description: "Key entities, topics, and concepts extracted from the visual content",
                        },
                        confidence: {
                          type: "number",
                          description: "Confidence score 0.0-1.0",
                        },
                      },
                      required: ["timestamp", "caption", "entities", "confidence"],
                      additionalProperties: false,
                    },
                  },
                  videoDurationEstimate: {
                    type: "number",
                    description: "Estimated total duration of the video in seconds",
                  },
                  videoSummary: {
                    type: "string",
                    description: "Brief overall summary of the video content",
                  },
                },
                required: ["captions", "videoDurationEstimate", "videoSummary"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        const contentStr = typeof content === "string" ? content : JSON.stringify(content);

        if (!contentStr) {
          throw new Error("No response from LLM");
        }

        const result = JSON.parse(contentStr);
        const captions = result.captions || [];

        // Update the visual caption record
        await db.updateVisualCaption(captionId, {
          captions: captions,
          totalFramesAnalyzed: captions.length,
          status: "completed",
        });

        return {
          captionId,
          status: "completed",
          captionCount: captions.length,
          videoSummary: result.videoSummary,
          videoDurationEstimate: result.videoDurationEstimate,
          captions,
        };
      } catch (error: any) {
        await db.updateVisualCaption(captionId, {
          status: "failed",
          errorMessage: error.message,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Visual captioning failed: ${error.message}`,
        });
      }
    }),

  /**
   * Get visual captions for a video
   */
  getCaptions: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const caption = await db.getVisualCaptionByFileId(input.fileId);
      if (!caption) return null;

      if (caption.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to view these captions",
        });
      }

      return caption;
    }),

  /**
   * Generate file matches based on visual caption entities
   * Matches extracted entities against user's uploaded files
   */
  generateFileMatches: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        minRelevanceScore: z.number().min(0).max(1).default(0.3),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the visual captions
      const caption = await db.getVisualCaptionByFileId(input.fileId);
      if (!caption || caption.status !== "completed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Video must have completed visual captions first",
        });
      }

      if (caption.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to generate matches for this video",
        });
      }

      // Get all user's files (excluding the video itself)
      const userFiles = await db.getFilesByUserId(ctx.user.id);
      const candidateFiles = userFiles.filter((f) => f.id !== input.fileId);

      if (candidateFiles.length === 0) {
        return { matches: [], count: 0, message: "No files available for matching" };
      }

      // Delete old matches before regenerating
      await db.deleteVisualCaptionFileMatches(input.fileId);

      const captions = caption.captions as Array<{
        timestamp: number;
        caption: string;
        entities: string[];
        confidence: number;
      }>;

      if (!captions || captions.length === 0) {
        return { matches: [], count: 0, message: "No captions available" };
      }

      // Build a file catalog for the LLM
      const fileCatalog = candidateFiles
        .map(
          (f, idx) =>
            `${idx + 1}. "${f.filename}" - Title: "${f.title || "N/A"}" - Description: "${f.description || "N/A"}" - AI Analysis: "${f.aiAnalysis?.substring(0, 200) || "N/A"}" - Keywords: ${(f.extractedKeywords as string[])?.join(", ") || "N/A"}`
        )
        .join("\n");

      // Build caption summary for matching
      const captionSummary = captions
        .map(
          (c) =>
            `[${c.timestamp.toFixed(1)}s] ${c.caption} | Entities: ${c.entities.join(", ")}`
        )
        .join("\n");

      // Use LLM to match captions to files
      const matchResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an expert at semantic matching. Given video captions with extracted entities and a library of files, identify which files are relevant to specific video timepoints.

For each match, explain WHY the file is relevant to that specific moment in the video. Consider:
- Direct topic matches (file about same subject as video caption)
- Entity matches (file mentions same people, places, concepts)
- Contextual relevance (file provides background/supplementary info)
- Visual similarity (file contains similar imagery or diagrams)`,
          },
          {
            role: "user",
            content: `Match these video captions to relevant files from the library.

VIDEO CAPTIONS:
${captionSummary}

FILE LIBRARY:
${fileCatalog}

For each relevant match, provide the file index, the timestamp it matches, relevance score, matched entities, and reasoning. Only include matches with relevance >= ${input.minRelevanceScore}.`,
          },
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
                      fileIndex: {
                        type: "number",
                        description: "1-based index of the file in the catalog",
                      },
                      timestamp: {
                        type: "number",
                        description: "Video timestamp in seconds this match relates to",
                      },
                      relevanceScore: {
                        type: "number",
                        description: "0.0-1.0 relevance score",
                      },
                      matchedEntities: {
                        type: "array",
                        items: { type: "string" },
                        description: "Entities that matched between caption and file",
                      },
                      reasoning: {
                        type: "string",
                        description: "Brief explanation of why this file matches this timepoint",
                      },
                    },
                    required: [
                      "fileIndex",
                      "timestamp",
                      "relevanceScore",
                      "matchedEntities",
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

      const matchContent = matchResponse.choices[0]?.message?.content;
      const matchStr = typeof matchContent === "string" ? matchContent : JSON.stringify(matchContent);

      if (!matchStr) {
        return { matches: [], count: 0, message: "No matches generated" };
      }

      const matchResult = JSON.parse(matchStr);
      const rawMatches = matchResult.matches || [];

      // Save matches to database
      let savedCount = 0;
      for (const match of rawMatches) {
        const file = candidateFiles[match.fileIndex - 1];
        if (!file || match.relevanceScore < input.minRelevanceScore) continue;

        // Find the caption text for this timestamp
        const closestCaption = captions.reduce((prev, curr) =>
          Math.abs(curr.timestamp - match.timestamp) < Math.abs(prev.timestamp - match.timestamp)
            ? curr
            : prev
        );

        await db.createVisualCaptionFileMatch({
          visualCaptionId: caption.id,
          videoFileId: input.fileId,
          suggestedFileId: file.id,
          userId: ctx.user.id,
          timestamp: match.timestamp,
          captionText: closestCaption.caption,
          matchedEntities: match.matchedEntities,
          relevanceScore: match.relevanceScore,
          matchReasoning: match.reasoning,
        });
        savedCount++;
      }

      return {
        matches: rawMatches,
        count: savedCount,
        message: `Generated ${savedCount} file matches from visual captions`,
      };
    }),

  /**
   * Get file matches for a video
   */
  getFileMatches: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        status: z.enum(["active", "dismissed", "accepted"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const matches = await db.getVisualCaptionFileMatches(
        input.fileId,
        input.status
      );
      return matches;
    }),

  /**
   * Update match status (accept/dismiss)
   */
  updateMatchStatus: protectedProcedure
    .input(
      z.object({
        matchId: z.number(),
        status: z.enum(["active", "dismissed", "accepted"]),
        feedback: z.enum(["helpful", "not_helpful", "irrelevant"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.updateVisualCaptionFileMatchStatus(
        input.matchId,
        input.status,
        input.feedback
      );
      return { success: true };
    }),
});
