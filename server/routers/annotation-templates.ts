import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { annotationTemplates } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const annotationTemplatesRouter = router({
  /**
   * Save a new annotation template
   */
  saveTemplate: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        templateData: z.object({
          tool: z.enum(["pen", "rectangle", "circle", "arrow", "text"]),
          color: z.string(),
          strokeWidth: z.number(),
          text: z.string().optional(),
        }),
        thumbnailUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [template] = await db.insert(annotationTemplates).values({
        userId: ctx.user.id,
        name: input.name,
        description: input.description,
        style: input.templateData,
        thumbnailUrl: input.thumbnailUrl,
      });

      return {
        success: true,
        templateId: template.insertId,
      };
    }),

  /**
   * Get all templates for the current user
   */
  getTemplates: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const templates = await db
      .select()
      .from(annotationTemplates)
      .where(eq(annotationTemplates.userId, ctx.user.id))
      .orderBy(annotationTemplates.createdAt);

    return templates;
  }),

  /**
   * Delete a template
   */
  deleteTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify ownership
      const [template] = await db
        .select()
        .from(annotationTemplates)
        .where(eq(annotationTemplates.id, input.templateId))
        .limit(1);

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      if (template.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to delete this template",
        });
      }

      await db
        .delete(annotationTemplates)
        .where(eq(annotationTemplates.id, input.templateId));

      return { success: true };
    }),

  /**
   * Apply a template (returns template data for client to use)
   */
  applyTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [template] = await db
        .select()
        .from(annotationTemplates)
        .where(
          and(
            eq(annotationTemplates.id, input.templateId),
            eq(annotationTemplates.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      return template.style as {
        tool: string;
        color: string;
        strokeWidth: number;
        text?: string;
      };
    }),
});
