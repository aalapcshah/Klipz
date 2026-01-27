import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";

export const duplicateCheckRouter = router({
  /**
   * Check if a single file is a duplicate
   */
  checkSingle: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        fileSize: z.number(),
        type: z.enum(["video", "file"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await db.checkForDuplicateFile(ctx.user.id, {
        filename: input.filename,
        fileSize: input.fileSize,
        type: input.type,
      });

      return result;
    }),

  /**
   * Check multiple files for duplicates at once
   */
  checkBatch: protectedProcedure
    .input(
      z.object({
        files: z.array(
          z.object({
            filename: z.string(),
            fileSize: z.number(),
            type: z.enum(["video", "file"]),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const resultsMap = await db.checkForDuplicateFiles(ctx.user.id, input.files);

      // Convert Map to array of results with file info
      const results: Array<{
        filename: string;
        fileSize: number;
        type: "video" | "file";
        isDuplicate: boolean;
        existingFile?: {
          id: number;
          filename: string;
          fileSize: number;
          url: string;
          createdAt: Date;
          type: "video" | "file";
        };
      }> = [];

      for (const file of input.files) {
        const key = `${file.filename}:${file.fileSize}`;
        const result = resultsMap.get(key);
        results.push({
          ...file,
          isDuplicate: result?.isDuplicate ?? false,
          existingFile: result?.existingFile,
        });
      }

      return {
        results,
        hasDuplicates: results.some((r) => r.isDuplicate),
        duplicateCount: results.filter((r) => r.isDuplicate).length,
      };
    }),
});
