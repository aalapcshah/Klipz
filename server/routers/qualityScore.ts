import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { files } from "../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

export const qualityScoreRouter = router({
  /**
   * Calculate quality score for a single file
   */
  calculateScore: protectedProcedure
    .input(z.object({ fileId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get file
      const [file] = await db
        .select()
        .from(files)
        .where(and(eq(files.id, input.fileId), eq(files.userId, ctx.user.id)))
        .limit(1);

      if (!file) {
        throw new Error("File not found or access denied");
      }

      // Only calculate for images and videos
      if (!file.mimeType.startsWith("image/") && !file.mimeType.startsWith("video/")) {
        throw new Error("Quality score only available for images and videos");
      }

      // Use LLM vision to analyze quality
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are an expert in image and video quality assessment. Analyze the provided media and rate its quality on a scale of 0-100 based on resolution, clarity, composition, lighting, and overall visual appeal. Return ONLY a JSON object with a 'score' field (integer 0-100) and a 'reasoning' field (brief explanation)."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze the quality of this ${file.mimeType.startsWith("image/") ? "image" : "video"}: ${file.filename}`
              },
              {
                type: "image_url",
                image_url: {
                  url: file.url,
                  detail: "high"
                }
              }
            ]
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "quality_assessment",
            strict: true,
            schema: {
              type: "object",
              properties: {
                score: {
                  type: "integer",
                  description: "Quality score from 0 to 100"
                },
                reasoning: {
                  type: "string",
                  description: "Brief explanation of the score"
                }
              },
              required: ["score", "reasoning"],
              additionalProperties: false
            }
          }
        }
      });

      const content = response.choices[0].message.content;
      const result = JSON.parse(typeof content === "string" ? content : "{}");
      const qualityScore = Math.max(0, Math.min(100, result.score)); // Clamp to 0-100

      // Update file with quality score
      await db
        .update(files)
        .set({ qualityScore })
        .where(eq(files.id, input.fileId));

      return {
        score: qualityScore,
        reasoning: result.reasoning
      };
    }),

  /**
   * Calculate quality scores for all files without scores
   */
  calculateAllScores: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get all files without quality scores
      const filesToScore = await db
        .select()
        .from(files)
        .where(
          and(
            eq(files.userId, ctx.user.id),
            isNull(files.qualityScore)
          )
        )
        .limit(50); // Process in batches

      const results = [];
      for (const file of filesToScore) {
        try {
          // Only process images and videos
          if (!file.mimeType.startsWith("image/") && !file.mimeType.startsWith("video/")) {
            continue;
          }

          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: "You are an expert in image and video quality assessment. Analyze the provided media and rate its quality on a scale of 0-100. Return ONLY a JSON object with a 'score' field (integer 0-100)."
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Rate the quality of this ${file.mimeType.startsWith("image/") ? "image" : "video"}.`
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: file.url,
                      detail: "low" // Use low detail for batch processing
                    }
                  }
                ]
              }
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "quality_score",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    score: {
                      type: "integer",
                      description: "Quality score from 0 to 100"
                    }
                  },
                  required: ["score"],
                  additionalProperties: false
                }
              }
            }
          });

          const content = response.choices[0].message.content;
      const result = JSON.parse(typeof content === "string" ? content : "{}");
          const qualityScore = Math.max(0, Math.min(100, result.score));

          // Update file
          await db
            .update(files)
            .set({ qualityScore })
            .where(eq(files.id, file.id));

          results.push({ fileId: file.id, score: qualityScore });
        } catch (error) {
          console.error(`Failed to score file ${file.id}:`, error);
          results.push({ fileId: file.id, error: "Failed to calculate score" });
        }
      }

      return {
        processed: results.length,
        results
      };
    }),
});
