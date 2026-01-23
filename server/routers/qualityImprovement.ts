import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { files } from "../../drizzle/schema";
import { eq, and, lt } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { generateImage } from "../_core/imageGeneration";

export const qualityImprovementRouter = router({
  /**
   * Detect low-quality files and suggest improvements
   */
  detectLowQualityFiles: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get files with quality score < 40
      const lowQualityFiles = await db
        .select()
        .from(files)
        .where(
          and(
            eq(files.userId, ctx.user.id),
            lt(files.qualityScore, 40)
          )
        )
        .limit(20);

      return lowQualityFiles.map(file => ({
        id: file.id,
        filename: file.filename,
        url: file.url,
        mimeType: file.mimeType,
        qualityScore: file.qualityScore,
        fileSize: file.fileSize,
      }));
    }),

  /**
   * Get AI-powered enhancement suggestions for a file
   */
  getSuggestions: protectedProcedure
    .input(z.object({ fileId: z.number() }))
    .query(async ({ input, ctx }) => {
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

      // Only support images for now
      if (!file.mimeType.startsWith("image/")) {
        throw new Error("Quality improvement only available for images");
      }

      // Use LLM to analyze image and suggest improvements
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are an expert in image quality assessment and enhancement. Analyze the image and suggest specific improvements. Return ONLY a JSON object with 'issues' (array of problems) and 'suggestions' (array of enhancement recommendations)."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this image and suggest quality improvements."
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
            name: "enhancement_suggestions",
            strict: true,
            schema: {
              type: "object",
              properties: {
                issues: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  description: "List of quality issues detected"
                },
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["upscale", "denoise", "color_correction", "sharpen", "brightness", "contrast"],
                        description: "Type of enhancement"
                      },
                      description: {
                        type: "string",
                        description: "What this enhancement will do"
                      },
                      priority: {
                        type: "string",
                        enum: ["high", "medium", "low"],
                        description: "Priority of this enhancement"
                      }
                    },
                    required: ["type", "description", "priority"],
                    additionalProperties: false
                  },
                  description: "Recommended enhancements"
                }
              },
              required: ["issues", "suggestions"],
              additionalProperties: false
            }
          }
        }
      });

      const content = response.choices[0].message.content;
      const result = JSON.parse(typeof content === "string" ? content : "{}");

      return {
        fileId: file.id,
        filename: file.filename,
        currentScore: file.qualityScore,
        issues: result.issues || [],
        suggestions: result.suggestions || [],
      };
    }),

  /**
   * Apply AI-powered enhancement to an image
   */
  applyEnhancement: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        enhancementType: z.enum(["upscale", "denoise", "color_correction", "sharpen", "brightness", "contrast"]),
      })
    )
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

      if (!file.mimeType.startsWith("image/")) {
        throw new Error("Enhancement only available for images");
      }

      // Generate enhancement prompt based on type
      const enhancementPrompts: Record<string, string> = {
        upscale: "Upscale this image to higher resolution while preserving details and clarity. Enhance sharpness and texture.",
        denoise: "Remove noise and grain from this image while preserving important details. Make it cleaner and smoother.",
        color_correction: "Correct the colors in this image to be more natural and balanced. Adjust white balance, saturation, and vibrancy.",
        sharpen: "Sharpen this image to enhance edges and details. Make it crisper and more defined.",
        brightness: "Adjust the brightness and exposure of this image to optimal levels. Enhance visibility of dark areas.",
        contrast: "Improve the contrast of this image to make it more dynamic. Enhance the difference between light and dark areas.",
      };

      const prompt = enhancementPrompts[input.enhancementType];

      // Use image generation API to enhance the image
      const { url: enhancedUrl } = await generateImage({
        prompt,
        originalImages: [{
          url: file.url,
          mimeType: file.mimeType,
        }],
      });

      return {
        originalUrl: file.url,
        enhancedUrl,
        enhancementType: input.enhancementType,
      };
    }),
});
