import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { voiceAnnotations, visualAnnotations, files } from "../../drizzle/schema";
import { eq, and, gte, lte, sql, count, avg, desc } from "drizzle-orm";

export const analyticsRouter = router({
  getOverview: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Build date filter
      const dateFilter = [];
      if (input.startDate) {
        dateFilter.push(gte(voiceAnnotations.createdAt, new Date(input.startDate)));
      }
      if (input.endDate) {
        dateFilter.push(lte(voiceAnnotations.createdAt, new Date(input.endDate)));
      }

      // Get total voice annotations
      const voiceCount = await db
        .select({ count: count() })
        .from(voiceAnnotations)
        .where(and(eq(voiceAnnotations.userId, userId), ...dateFilter));

      // Get total visual annotations
      const visualCount = await db
        .select({ count: count() })
        .from(visualAnnotations)
        .where(and(eq(visualAnnotations.userId, userId), ...dateFilter));

      // Get average duration
      const avgDuration = await db
        .select({ avg: avg(voiceAnnotations.duration) })
        .from(voiceAnnotations)
        .where(and(eq(voiceAnnotations.userId, userId), ...dateFilter));

      // Get total files with annotations
      const filesWithAnnotations = await db
        .selectDistinct({ fileId: voiceAnnotations.fileId })
        .from(voiceAnnotations)
        .where(and(eq(voiceAnnotations.userId, userId), ...dateFilter));

      return {
        totalVoiceAnnotations: voiceCount[0]?.count || 0,
        totalVisualAnnotations: visualCount[0]?.count || 0,
        totalAnnotations: (voiceCount[0]?.count || 0) + (visualCount[0]?.count || 0),
        averageDuration: Number(avgDuration[0]?.avg || 0),
        filesWithAnnotations: filesWithAnnotations.length,
        voiceToVisualRatio: (voiceCount[0]?.count || 0) / Math.max((visualCount[0]?.count || 1), 1),
      };
    }),

  getAnnotationsByVideo: protectedProcedure
    .input(z.object({
      limit: z.number().default(10),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get voice annotations count per file
      const voiceByFile = await db
        .select({
          fileId: voiceAnnotations.fileId,
          count: count(),
        })
        .from(voiceAnnotations)
        .where(eq(voiceAnnotations.userId, userId))
        .groupBy(voiceAnnotations.fileId)
        .limit(input.limit);

      // Get visual annotations count per file
      const visualByFile = await db
        .select({
          fileId: visualAnnotations.fileId,
          count: count(),
        })
        .from(visualAnnotations)
        .where(eq(visualAnnotations.userId, userId))
        .groupBy(visualAnnotations.fileId)
        .limit(input.limit);

      // Merge and get file details
      const fileIds = Array.from(new Set([...voiceByFile.map((v: any) => v.fileId), ...visualByFile.map((v: any) => v.fileId)]));
      
      const fileDetails = await db
        .select()
        .from(files)
        .where(and(
          eq(files.userId, userId),
          sql`${files.id} IN ${fileIds}`
        ));

      const result = fileDetails.map((file: any) => {
        const voice = voiceByFile.find((v: any) => v.fileId === file.id)?.count || 0;
        const visual = visualByFile.find((v: any) => v.fileId === file.id)?.count || 0;
        
        return {
          fileId: file.id,
          fileName: file.filename,
          voiceAnnotations: voice,
          visualAnnotations: visual,
          totalAnnotations: Number(voice) + Number(visual),
        };
      });

      return result.sort((a: any, b: any) => b.totalAnnotations - a.totalAnnotations).slice(0, input.limit);
    }),

  getMostAnnotatedTimestamps: protectedProcedure
    .input(z.object({
      fileId: z.number().optional(),
      limit: z.number().default(10),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const whereClause = input.fileId
        ? and(eq(voiceAnnotations.userId, userId), eq(voiceAnnotations.fileId, input.fileId))
        : eq(voiceAnnotations.userId, userId);

      // Get most annotated timestamps (grouped by 5-second intervals)
      const whereCondition = input.fileId
        ? sql`${voiceAnnotations.userId} = ${userId} AND ${voiceAnnotations.fileId} = ${input.fileId}`
        : sql`${voiceAnnotations.userId} = ${userId}`;
      const timestampsRaw: any[] = await db.execute(
        sql`SELECT FLOOR(${voiceAnnotations.videoTimestamp} / 5) * 5 AS ts_bucket, COUNT(*) AS ts_count FROM ${voiceAnnotations} WHERE ${whereCondition} GROUP BY ts_bucket ORDER BY ts_count DESC LIMIT ${input.limit}`
      ).then((rows: any) => (rows.rows || rows));

      return timestampsRaw.map((t: any) => ({
        timestamp: Number(t.ts_bucket),
        count: Number(t.ts_count),
      }));
    }),

  getAnnotationTimeline: protectedProcedure
    .input(z.object({
      days: z.number().default(30),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.days);

      // Get annotations by day
      const voiceByDay: { date: string; count: number }[] = await db.execute(
        sql`SELECT DATE(${voiceAnnotations.createdAt}) AS annotation_date, COUNT(*) AS annotation_count FROM ${voiceAnnotations} WHERE ${voiceAnnotations.userId} = ${userId} AND ${voiceAnnotations.createdAt} >= ${startDate} GROUP BY annotation_date ORDER BY annotation_date`
      ).then((rows: any) => (rows.rows || rows).map((r: any) => ({ date: String(r.annotation_date), count: Number(r.annotation_count) })));

      const visualByDay: { date: string; count: number }[] = await db.execute(
        sql`SELECT DATE(${visualAnnotations.createdAt}) AS annotation_date, COUNT(*) AS annotation_count FROM ${visualAnnotations} WHERE ${visualAnnotations.userId} = ${userId} AND ${visualAnnotations.createdAt} >= ${startDate} GROUP BY annotation_date ORDER BY annotation_date`
      ).then((rows: any) => (rows.rows || rows).map((r: any) => ({ date: String(r.annotation_date), count: Number(r.annotation_count) })));

      // Merge results
      const allDates = Array.from(new Set([...voiceByDay.map(v => v.date), ...visualByDay.map(v => v.date)]));
      
      return allDates.map(date => ({
        date,
        voiceAnnotations: Number(voiceByDay.find(v => v.date === date)?.count || 0),
        visualAnnotations: Number(visualByDay.find(v => v.date === date)?.count || 0),
      })).sort((a, b) => a.date.localeCompare(b.date));
    }),
});
