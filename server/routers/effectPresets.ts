import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { videoEffectPresets } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// Effect settings schema for validation
const effectSettingsSchema = z.object({
  selectedLUT: z.number(),
  lutIntensity: z.number().min(0).max(100),
  brightness: z.number().min(50).max(150),
  contrast: z.number().min(50).max(150),
  saturation: z.number().min(0).max(200),
  hue: z.number().min(-180).max(180),
  effects: z.array(z.object({
    id: z.string(),
    name: z.string(),
    enabled: z.boolean(),
    intensity: z.number(),
    settings: z.record(z.string(), z.number()).optional(),
  })),
});

export const effectPresetsRouter = router({
  // List all presets for the current user
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const presets = await db
      .select()
      .from(videoEffectPresets)
      .where(eq(videoEffectPresets.userId, ctx.user.id))
      .orderBy(desc(videoEffectPresets.usageCount));
    
    return presets;
  }),

  // Get a specific preset by ID
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [preset] = await db
        .select()
        .from(videoEffectPresets)
        .where(
          and(
            eq(videoEffectPresets.id, input.id),
            eq(videoEffectPresets.userId, ctx.user.id)
          )
        );
      
      return preset || null;
    }),

  // Create a new preset
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      settings: effectSettingsSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [preset] = await db
        .insert(videoEffectPresets)
        .values({
          userId: ctx.user.id,
          name: input.name,
          description: input.description || null,
          settings: input.settings,
        })
        .$returningId();
      
      return { id: preset.id, success: true };
    }),

  // Update an existing preset
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(100).optional(),
      description: z.string().optional(),
      settings: effectSettingsSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const updateData: Partial<typeof videoEffectPresets.$inferInsert> = {};
      
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.settings !== undefined) updateData.settings = input.settings;
      
      await db
        .update(videoEffectPresets)
        .set(updateData)
        .where(
          and(
            eq(videoEffectPresets.id, input.id),
            eq(videoEffectPresets.userId, ctx.user.id)
          )
        );
      
      return { success: true };
    }),

  // Delete a preset
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db
        .delete(videoEffectPresets)
        .where(
          and(
            eq(videoEffectPresets.id, input.id),
            eq(videoEffectPresets.userId, ctx.user.id)
          )
        );
      
      return { success: true };
    }),

  // Track preset usage (increment usage count)
  trackUsage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [preset] = await db
        .select({ usageCount: videoEffectPresets.usageCount })
        .from(videoEffectPresets)
        .where(
          and(
            eq(videoEffectPresets.id, input.id),
            eq(videoEffectPresets.userId, ctx.user.id)
          )
        );
      
      if (preset) {
        await db
          .update(videoEffectPresets)
          .set({ usageCount: preset.usageCount + 1 })
          .where(eq(videoEffectPresets.id, input.id));
      }
      
      return { success: true };
    }),
});

export default effectPresetsRouter;
