import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { getAutoCaptioningStatus, processScheduledAutoCaptioning } from "../_core/scheduledAutoCaptioning";
import { getCaptioningErrorMessage } from "../lib/errorMessages";

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

        if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
          throw new Error("LLM returned an empty or invalid response. The video may be too large or in an unsupported format for visual analysis.");
        }

        const content = response.choices[0].message.content;
        const contentStr = typeof content === "string" ? content : JSON.stringify(content);

        if (!contentStr) {
          throw new Error("No content in LLM response. The video may be too large or in an unsupported format.");
        }

        let result: any;
        try {
          result = JSON.parse(contentStr);
        } catch (parseError) {
          throw new Error(`Failed to parse LLM response as JSON: ${contentStr.substring(0, 200)}`);
        }

        const captions = result.captions || [];
        if (captions.length === 0) {
          console.warn(`[VisualCaptions] LLM returned 0 captions for file ${input.fileId}`);
        }

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
        const userMessage = getCaptioningErrorMessage(error.message);
        await db.updateVisualCaption(captionId, {
          status: "failed",
          errorMessage: userMessage,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: userMessage,
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
   * Edit a specific caption's text
   */
  editCaption: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        timestamp: z.number(),
        newCaption: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const caption = await db.getVisualCaptionByFileId(input.fileId);
      if (!caption) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Visual captions not found for this video",
        });
      }
      if (caption.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to edit these captions",
        });
      }

      const captions = caption.captions as Array<{
        timestamp: number;
        caption: string;
        entities: string[];
        confidence: number;
      }>;

      // Find and update the caption at the given timestamp
      const idx = captions.findIndex(
        (c) => Math.abs(c.timestamp - input.timestamp) < 0.5
      );
      if (idx === -1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Caption at this timestamp not found",
        });
      }

      captions[idx].caption = input.newCaption;

      await db.updateVisualCaption(caption.id, {
        captions: captions,
      });

      return { success: true, updatedCaption: captions[idx] };
    }),

  /**
   * Export captions as SRT or VTT subtitle files
   */
  exportSubtitles: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        format: z.enum(["srt", "vtt"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const caption = await db.getVisualCaptionByFileId(input.fileId);
      if (!caption || caption.status !== "completed") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Completed visual captions not found",
        });
      }
      if (caption.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to export these captions",
        });
      }

      const captions = (caption.captions as Array<{
        timestamp: number;
        caption: string;
        entities: string[];
        confidence: number;
      }>).sort((a, b) => a.timestamp - b.timestamp);

      const formatTimeSRT = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
      };

      const formatTimeVTT = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
      };

      let content = "";

      if (input.format === "vtt") {
        content = "WEBVTT\n\n";
        for (let i = 0; i < captions.length; i++) {
          const start = captions[i].timestamp;
          const end = i < captions.length - 1 ? captions[i + 1].timestamp : start + 5;
          content += `${i + 1}\n`;
          content += `${formatTimeVTT(start)} --> ${formatTimeVTT(end)}\n`;
          content += `${captions[i].caption}\n\n`;
        }
      } else {
        for (let i = 0; i < captions.length; i++) {
          const start = captions[i].timestamp;
          const end = i < captions.length - 1 ? captions[i + 1].timestamp : start + 5;
          content += `${i + 1}\n`;
          content += `${formatTimeSRT(start)} --> ${formatTimeSRT(end)}\n`;
          content += `${captions[i].caption}\n\n`;
        }
      }

      const ext = input.format === "vtt" ? "vtt" : "srt";
      return {
        content,
        filename: `captions_${input.fileId}.${ext}`,
        format: input.format,
      };
    }),

  /**
   * Search across all visual captions for a user
   */
  searchCaptions: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
      })
    )
    .query(async ({ ctx, input }) => {
      const results = await db.searchVisualCaptions(ctx.user.id, input.query);
      return results;
    }),

  /**
   * Get all visual captions summary for a user
   */
  getAllCaptions: protectedProcedure.query(async ({ ctx }) => {
    const captions = await db.getAllVisualCaptionsByUser(ctx.user.id);
    return captions;
  }),

  /**
   * Update a caption's timestamp (for drag-to-adjust)
   */
  updateTimestamp: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        originalTimestamp: z.number(),
        newTimestamp: z.number().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const caption = await db.getVisualCaptionByFileId(input.fileId);
      if (!caption) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Visual captions not found for this video",
        });
      }
      if (caption.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to edit these captions",
        });
      }

      const captions = caption.captions as Array<{
        timestamp: number;
        caption: string;
        entities: string[];
        confidence: number;
      }>;

      const idx = captions.findIndex(
        (c) => Math.abs(c.timestamp - input.originalTimestamp) < 0.5
      );
      if (idx === -1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Caption at this timestamp not found",
        });
      }

      captions[idx].timestamp = input.newTimestamp;
      // Re-sort by timestamp
      captions.sort((a, b) => a.timestamp - b.timestamp);

      await db.updateVisualCaption(caption.id, {
        captions: captions,
      });

      return { success: true, updatedCaption: captions[idx] };
    }),

  /**
   * Auto-generate captions for a video (called after upload)
   * This is a fire-and-forget endpoint that doesn't block the upload flow
   */
  autoCaptionVideo: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const file = await db.getFileById(input.fileId);
      if (!file || !file.mimeType?.startsWith("video/")) {
        return { queued: false, reason: "Not a video file" };
      }
      if (file.userId !== ctx.user.id) {
        return { queued: false, reason: "Permission denied" };
      }

      // Check if captions already exist
      const existing = await db.getVisualCaptionByFileId(input.fileId);
      if (existing && existing.status === "completed") {
        return { queued: false, reason: "Captions already exist" };
      }

      // Create a pending caption record
      const captionId = existing
        ? existing.id
        : await db.createVisualCaption({
            fileId: input.fileId,
            userId: ctx.user.id,
            intervalSeconds: 5,
            status: "processing",
          });

      if (existing) {
        await db.updateVisualCaption(existing.id, {
          status: "processing",
          errorMessage: null,
        });
      }

      // Fire-and-forget: run captioning in background
      (async () => {
        try {
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are an expert video analyst. Analyze the visual content and generate detailed captions at regular time intervals (approximately every 5 seconds).

For each timepoint, provide:
1. A descriptive caption of what is visually happening
2. Key entities/topics extracted from the visual content
3. A confidence score (0.0-1.0)

Focus on: what is shown on screen (text, diagrams, images, UI elements), actions being performed, objects, any visible text, scene changes, and people.`,
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
                    text: "Analyze this video and generate visual captions at approximately 5-second intervals. Return a JSON response with the captions array.",
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
                          timestamp: { type: "number" },
                          caption: { type: "string" },
                          entities: { type: "array", items: { type: "string" } },
                          confidence: { type: "number" },
                        },
                        required: ["timestamp", "caption", "entities", "confidence"],
                        additionalProperties: false,
                      },
                    },
                    videoDurationEstimate: { type: "number" },
                    videoSummary: { type: "string" },
                  },
                  required: ["captions", "videoDurationEstimate", "videoSummary"],
                  additionalProperties: false,
                },
              },
            },
          });

          if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
            throw new Error("LLM returned an empty or invalid response. The video may be too large or in an unsupported format.");
          }

          const content = response.choices[0].message.content;
          const contentStr = typeof content === "string" ? content : JSON.stringify(content);
          if (!contentStr) throw new Error("No content in LLM response");

          let result: any;
          try {
            result = JSON.parse(contentStr);
          } catch {
            throw new Error("Failed to parse LLM caption response as JSON");
          }
          const captions = result.captions || [];

          await db.updateVisualCaption(captionId, {
            captions,
            totalFramesAnalyzed: captions.length,
            status: "completed",
          });

          console.log(`[AutoCaption] Completed captioning for file ${input.fileId}: ${captions.length} captions`);
        } catch (error: any) {
          console.error(`[AutoCaption] Failed for file ${input.fileId}:`, error.message);
          await db.updateVisualCaption(captionId, {
            status: "failed",
            errorMessage: error.message,
          });
        }
      })();

      return { queued: true, captionId };
    }),

  /**
   * Get caption analytics (aggregate stats across all user's captioned videos)
   */
  getCaptionAnalytics: protectedProcedure.query(async ({ ctx }) => {
    const analytics = await db.getCaptionAnalytics(ctx.user.id);
    return analytics;
  }),

  /**
   * Bulk file matching: run file matching across all captioned videos at once
   */
  bulkFileMatch: protectedProcedure
    .input(
      z.object({
        minRelevanceScore: z.number().min(0).max(1).default(0.3),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get all captioned video file IDs
      const videoFileIds = await db.getCaptionedVideoFileIds(ctx.user.id);

      if (videoFileIds.length === 0) {
        return {
          processed: 0,
          totalMatches: 0,
          results: [],
          message: "No captioned videos found",
        };
      }

      // Get all user's files for matching
      const userFiles = await db.getFilesByUserId(ctx.user.id);

      const results: Array<{
        fileId: number;
        matchCount: number;
        status: string;
      }> = [];
      let totalMatches = 0;

      for (const videoFileId of videoFileIds) {
        try {
          const caption = await db.getVisualCaptionByFileId(videoFileId);
          if (!caption || caption.status !== "completed") {
            results.push({ fileId: videoFileId, matchCount: 0, status: "skipped" });
            continue;
          }

          const candidateFiles = userFiles.filter((f) => f.id !== videoFileId);
          if (candidateFiles.length === 0) {
            results.push({ fileId: videoFileId, matchCount: 0, status: "no_candidates" });
            continue;
          }

          // Delete old matches
          await db.deleteVisualCaptionFileMatches(videoFileId);

          const captions = caption.captions as Array<{
            timestamp: number;
            caption: string;
            entities: string[];
            confidence: number;
          }>;

          if (!captions || captions.length === 0) {
            results.push({ fileId: videoFileId, matchCount: 0, status: "no_captions" });
            continue;
          }

          // Build file catalog
          const fileCatalog = candidateFiles
            .map(
              (f, idx) =>
                `${idx + 1}. "${f.filename}" - Title: "${f.title || "N/A"}" - Description: "${f.description || "N/A"}" - AI Analysis: "${f.aiAnalysis?.substring(0, 200) || "N/A"}" - Keywords: ${(f.extractedKeywords as string[])?.join(", ") || "N/A"}`
            )
            .join("\n");

          const captionSummary = captions
            .map(
              (c) =>
                `[${c.timestamp.toFixed(1)}s] ${c.caption} | Entities: ${c.entities.join(", ")}`
            )
            .join("\n");

          const matchResponse = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are a file-matching expert. Given video captions with timestamps and a library of files, identify which files are relevant to specific moments in the video. Return matches with relevance scores.\n\nFor each match, explain WHY the file is relevant.`,
              },
              {
                role: "user",
                content: `Match these video captions to relevant files.\n\nVIDEO CAPTIONS:\n${captionSummary}\n\nFILE LIBRARY:\n${fileCatalog}\n\nOnly include matches with relevance >= ${input.minRelevanceScore}.`,
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
                          fileIndex: { type: "number" },
                          timestamp: { type: "number" },
                          relevanceScore: { type: "number" },
                          matchedEntities: { type: "array", items: { type: "string" } },
                          reasoning: { type: "string" },
                        },
                        required: ["fileIndex", "timestamp", "relevanceScore", "matchedEntities", "reasoning"],
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
          const matchResult = matchStr ? JSON.parse(matchStr) : { matches: [] };
          const rawMatches = matchResult.matches || [];

          let savedCount = 0;
          for (const match of rawMatches) {
            const file = candidateFiles[match.fileIndex - 1];
            if (!file || match.relevanceScore < input.minRelevanceScore) continue;

            const closestCaption = captions.reduce((prev, curr) =>
              Math.abs(curr.timestamp - match.timestamp) < Math.abs(prev.timestamp - match.timestamp)
                ? curr
                : prev
            );

            await db.createVisualCaptionFileMatch({
              visualCaptionId: caption.id,
              videoFileId,
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

          totalMatches += savedCount;
          results.push({ fileId: videoFileId, matchCount: savedCount, status: "completed" });
        } catch (error: any) {
          console.error(`[BulkMatch] Failed for video ${videoFileId}:`, error.message);
          results.push({ fileId: videoFileId, matchCount: 0, status: "failed" });
        }
      }

      return {
        processed: videoFileIds.length,
        totalMatches,
        results,
        message: `Processed ${videoFileIds.length} videos, generated ${totalMatches} file matches`,
      };
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

  /**
   * Get auto-captioning status (how many videos are uncaptioned, processing, etc.)
   */
  getAutoCaptioningStatus: protectedProcedure.query(async () => {
    return await getAutoCaptioningStatus();
  }),

  /**
   * Manually trigger scheduled auto-captioning (processes uncaptioned videos now)
   */
  triggerAutoCaptioning: protectedProcedure.mutation(async () => {
    const result = await processScheduledAutoCaptioning();
    return result;
  }),
});
