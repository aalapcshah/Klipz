import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { annotationTemplates } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { broadcastTemplateEvent } from "../_core/websocketBroadcast";

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

      const templateId = template.insertId;
      
      // Broadcast template creation
      broadcastTemplateEvent(
        "template_created",
        { id: templateId, ...input, userId: ctx.user.id },
        ctx.user.id,
        ctx.user.name || "Unknown User"
      );

      return {
        success: true,
        templateId,
      };
    }),

  /**
   * Get all templates for the current user (including shared templates)
   */
  getTemplates: protectedProcedure
    .input(
      z
        .object({
          includeShared: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get user's own templates
    const ownTemplates = await db
      .select()
      .from(annotationTemplates)
      .where(eq(annotationTemplates.userId, ctx.user.id))
      .orderBy(annotationTemplates.createdAt);

    // If includeShared is true, also get shared templates
    if (input?.includeShared) {
      const sharedTemplates = await db
        .select()
        .from(annotationTemplates)
        .where(
          and(
            eq(annotationTemplates.visibility, "public"),
            // Exclude own templates
            eq(annotationTemplates.userId, ctx.user.id)
          )
        )
        .orderBy(annotationTemplates.usageCount);

      return [...ownTemplates, ...sharedTemplates];
    }

    return ownTemplates;
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
      
      // Broadcast template deletion
      broadcastTemplateEvent(
        "template_deleted",
        { id: input.templateId },
        ctx.user.id,
        ctx.user.name || "Unknown User"
      );

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

  /**
   * Update template visibility
   */
  updateVisibility: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
        visibility: z.enum(["private", "team", "public"]),
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
          message: "You don't have permission to modify this template",
        });
      }

      await db
        .update(annotationTemplates)
        .set({ visibility: input.visibility })
        .where(eq(annotationTemplates.id, input.templateId));

      return { success: true };
    }),

  /**
   * Get public templates (template library)
   */
  getPublicTemplates: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const templates = await db
        .select()
        .from(annotationTemplates)
        .where(eq(annotationTemplates.visibility, "public"))
        .orderBy(desc(annotationTemplates.usageCount))
        .limit(input?.limit || 50);

      return templates;
    }),

  /**
   * Increment template usage count
   */
  incrementUsage: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get current usage count
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

      // Increment usage count
      await db
        .update(annotationTemplates)
        .set({
          usageCount: template.usageCount + 1,
        })
        .where(eq(annotationTemplates.id, input.templateId));

      return { success: true };
    }),
});
