import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { generatedReports } from "../../drizzle/schema";
import { eq, desc, and, gte, lte, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const reportsRouter = router({
  /**
   * Get all generated reports with optional filters
   */
  getAll: adminProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        format: z.enum(["csv", "excel"]).optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const conditions = [];

      if (input?.startDate) {
        conditions.push(gte(generatedReports.generatedAt, new Date(input.startDate)));
      }

      if (input?.endDate) {
        conditions.push(lte(generatedReports.generatedAt, new Date(input.endDate)));
      }

      if (input?.format) {
        conditions.push(eq(generatedReports.format, input.format));
      }

      if (input?.search) {
        conditions.push(like(generatedReports.name, `%${input.search}%`));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      return await db
        .select()
        .from(generatedReports)
        .where(where)
        .orderBy(desc(generatedReports.generatedAt));
    }),

  /**
   * Get a single report by ID
   */
  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [report] = await db
        .select()
        .from(generatedReports)
        .where(eq(generatedReports.id, input.id))
        .limit(1);

      if (!report) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      }

      return report;
    }),

  /**
   * Delete a generated report
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db
        .delete(generatedReports)
        .where(eq(generatedReports.id, input.id));

      return { success: true };
    }),

  /**
   * Get report statistics
   */
  getStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const allReports = await db.select().from(generatedReports);

    const totalReports = allReports.length;
    const totalSize = allReports.reduce((sum, r) => sum + (r.fileSize || 0), 0);
    const csvCount = allReports.filter(r => r.format === "csv").length;
    const excelCount = allReports.filter(r => r.format === "excel").length;

    // Get reports from last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentReports = allReports.filter(r => new Date(r.generatedAt) >= thirtyDaysAgo);

    return {
      totalReports,
      totalSize,
      csvCount,
      excelCount,
      recentReportsCount: recentReports.length,
    };
  }),
});
