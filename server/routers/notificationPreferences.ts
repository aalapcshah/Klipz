import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";

export const notificationPreferencesRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return await db.getActivityNotificationPreferences(ctx.user.id);
  }),

  update: protectedProcedure
    .input(
      z.object({
        enableUploadNotifications: z.boolean().optional(),
        enableViewNotifications: z.boolean().optional(),
        enableEditNotifications: z.boolean().optional(),
        enableTagNotifications: z.boolean().optional(),
        enableShareNotifications: z.boolean().optional(),
        enableDeleteNotifications: z.boolean().optional(),
        enableEnrichNotifications: z.boolean().optional(),
        enableExportNotifications: z.boolean().optional(),
        quietHoursStart: z.string().nullable().optional(),
        quietHoursEnd: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await db.upsertActivityNotificationPreferences({
        userId: ctx.user.id,
        ...input,
      });
    }),
});
