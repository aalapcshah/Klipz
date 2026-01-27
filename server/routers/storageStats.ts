import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";

export const storageStatsRouter = router({
  /**
   * Get storage statistics for the current user
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const stats = await db.getStorageStats(ctx.user.id);
    return stats;
  }),
});
