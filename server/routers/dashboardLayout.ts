import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { dashboardLayoutPreferences } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const dashboardLayoutRouter = router({
  /**
   * Get user's dashboard layout preference
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const [preference] = await db
      .select()
      .from(dashboardLayoutPreferences)
      .where(eq(dashboardLayoutPreferences.userId, ctx.user.id))
      .limit(1);

    // Return default if no preference exists
    if (!preference) {
      return {
        layout: "balanced" as const,
        widgetVisibility: {},
      };
    }

    return {
      layout: preference.layout,
      widgetVisibility: preference.widgetVisibility || {},
    };
  }),

  /**
   * Update user's dashboard layout preference
   */
  update: protectedProcedure
    .input(
      z.object({
        layout: z.enum(["monitoring", "analytics", "balanced"]),
        widgetVisibility: z.record(z.string(), z.boolean()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Check if preference exists
      const [existing] = await db
        .select()
        .from(dashboardLayoutPreferences)
        .where(eq(dashboardLayoutPreferences.userId, ctx.user.id))
        .limit(1);

      if (existing) {
        // Update existing preference
        await db
          .update(dashboardLayoutPreferences)
          .set({
            layout: input.layout,
            widgetVisibility: input.widgetVisibility as any || existing.widgetVisibility,
          })
          .where(eq(dashboardLayoutPreferences.userId, ctx.user.id));
      } else {
        // Create new preference
        await db.insert(dashboardLayoutPreferences).values({
          userId: ctx.user.id,
          layout: input.layout,
          widgetVisibility: input.widgetVisibility as any,
        });
      }

      return { success: true };
    }),
});
