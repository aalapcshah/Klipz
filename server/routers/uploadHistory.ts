import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";

export const uploadHistoryRouter = router({
  // Record a completed upload
  record: protectedProcedure
    .input(
      z.object({
        fileId: z.number().optional(),
        filename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        uploadType: z.enum(["video", "file"]),
        status: z.enum(["completed", "failed", "cancelled"]),
        errorMessage: z.string().optional(),
        startedAt: z.number(), // Unix timestamp in ms
        durationSeconds: z.number().optional(),
        averageSpeed: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await db.createUploadHistoryRecord({
        userId: ctx.user.id,
        fileId: input.fileId,
        filename: input.filename,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        uploadType: input.uploadType,
        status: input.status,
        errorMessage: input.errorMessage,
        startedAt: new Date(input.startedAt),
        durationSeconds: input.durationSeconds,
        averageSpeed: input.averageSpeed,
      });

      return { id };
    }),

  // Get upload history with pagination and filters
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        status: z.enum(["completed", "failed", "cancelled"]).optional(),
        uploadType: z.enum(["video", "file"]).optional(),
        startDate: z.number().optional(), // Unix timestamp in ms
        endDate: z.number().optional(), // Unix timestamp in ms
      })
    )
    .query(async ({ ctx, input }) => {
      const history = await db.getUploadHistory({
        userId: ctx.user.id,
        limit: input.limit,
        offset: input.offset,
        status: input.status,
        uploadType: input.uploadType,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      });

      return history;
    }),

  // Get upload statistics
  stats: protectedProcedure.query(async ({ ctx }) => {
    return db.getUploadHistoryStats(ctx.user.id);
  }),
});
