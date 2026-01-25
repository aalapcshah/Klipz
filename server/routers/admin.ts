import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users, files, fileActivityLogs } from "../../drizzle/schema";
import { eq, sql, desc, and, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { fetchActivityDataForExport, generateCSV, generateExcel } from "../_core/activityExport";
import { getAllEngagementMetrics, getEngagementTrends } from "../_core/engagementMetrics";
import { analyzeCohort, compareCohorts } from "../_core/cohortAnalysis";

export const adminRouter = router({
  /**
   * Get system-wide statistics
   */
  getSystemStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Get total users
    const totalUsersResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users);
    const totalUsers = totalUsersResult[0]?.count || 0;

    // Get total files
    const totalFilesResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(files);
    const totalFiles = totalFilesResult[0]?.count || 0;

    // Get total activities
    const totalActivitiesResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(fileActivityLogs);
    const totalActivities = totalActivitiesResult[0]?.count || 0;

    // Get activities in last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentActivitiesResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(fileActivityLogs)
      .where(gte(fileActivityLogs.createdAt, oneDayAgo));
    const recentActivities = recentActivitiesResult[0]?.count || 0;

    // Get new users in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newUsersResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(gte(users.createdAt, sevenDaysAgo));
    const newUsers = newUsersResult[0]?.count || 0;

    return {
      totalUsers,
      totalFiles,
      totalActivities,
      recentActivities,
      newUsers,
    };
  }),

  /**
   * Get all users with their statistics
   */
  getAllUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().optional().default(50),
        offset: z.number().optional().default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get users
      const usersList = await db
        .select({
          id: users.id,
          openId: users.openId,
          name: users.name,
          email: users.email,
          role: users.role,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      // Get statistics for each user
      const usersWithStats = await Promise.all(
        usersList.map(async (user) => {
          // Get file count
          const fileCountResult = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(files)
            .where(eq(files.userId, user.id));
          const fileCount = fileCountResult[0]?.count || 0;

          // Get activity count
          const activityCountResult = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(fileActivityLogs)
            .where(eq(fileActivityLogs.userId, user.id));
          const activityCount = activityCountResult[0]?.count || 0;

          // Get last activity
          const lastActivityResult = await db
            .select({ createdAt: fileActivityLogs.createdAt })
            .from(fileActivityLogs)
            .where(eq(fileActivityLogs.userId, user.id))
            .orderBy(desc(fileActivityLogs.createdAt))
            .limit(1);
          const lastActivity = lastActivityResult[0]?.createdAt || null;

          return {
            ...user,
            fileCount,
            activityCount,
            lastActivity,
          };
        })
      );

      return usersWithStats;
    }),

  /**
   * Get detailed statistics for a specific user
   */
  getUserStats: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get user info
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Get file count
      const fileCountResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(files)
        .where(eq(files.userId, input.userId));
      const fileCount = fileCountResult[0]?.count || 0;

      // Get activity count by type
      const activityByType = await db
        .select({
          type: fileActivityLogs.activityType,
          count: sql<number>`COUNT(*)`,
        })
        .from(fileActivityLogs)
        .where(eq(fileActivityLogs.userId, input.userId))
        .groupBy(fileActivityLogs.activityType);

      // Get recent activities
      const recentActivities = await db
        .select()
        .from(fileActivityLogs)
        .where(eq(fileActivityLogs.userId, input.userId))
        .orderBy(desc(fileActivityLogs.createdAt))
        .limit(10);

      return {
        user: {
          id: user.id,
          openId: user.openId,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
          lastSignedIn: user.lastSignedIn,
        },
        fileCount,
        activityByType,
        recentActivities,
      };
    }),

  /**
   * Update user role (promote/demote admin)
   */
  updateUserRole: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        role: z.enum(["user", "admin"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.userId));

      return { success: true };
    }),

  /**
   * Get activity statistics for a specific user (for charts)
   */
  getUserActivityStats: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Get daily activity for the user
      const dailyActivityRaw = await db
        .select({
          date: sql<string>`DATE(${fileActivityLogs.createdAt})`,
          count: sql<number>`COUNT(*)`,
        })
        .from(fileActivityLogs)
        .where(
          and(
            eq(fileActivityLogs.userId, input.userId),
            gte(fileActivityLogs.createdAt, thirtyDaysAgo)
          )
        )
        .groupBy(sql`DATE(${fileActivityLogs.createdAt})`)
        .orderBy(sql`DATE(${fileActivityLogs.createdAt})`);

      return {
        dailyActivity: dailyActivityRaw,
      };
    }),

  /**
   * Export activity data as CSV
   */
  exportActivityCSV: adminProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        userId: z.number().optional(),
        activityType: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const filters: any = {};
      
      if (input.startDate) {
        filters.startDate = new Date(input.startDate);
      }
      
      if (input.endDate) {
        filters.endDate = new Date(input.endDate);
      }
      
      if (input.userId) {
        filters.userId = input.userId;
      }
      
      if (input.activityType) {
        filters.activityType = input.activityType;
      }

      const data = await fetchActivityDataForExport(filters);
      const csv = generateCSV(data);

      return {
        data: csv,
        filename: `activity-report-${new Date().toISOString().split('T')[0]}.csv`,
      };
    }),

  /**
   * Export activity data as Excel
   */
  exportActivityExcel: adminProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        userId: z.number().optional(),
        activityType: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const filters: any = {};
      
      if (input.startDate) {
        filters.startDate = new Date(input.startDate);
      }
      
      if (input.endDate) {
        filters.endDate = new Date(input.endDate);
      }
      
      if (input.userId) {
        filters.userId = input.userId;
      }
      
      if (input.activityType) {
        filters.activityType = input.activityType;
      }

      const data = await fetchActivityDataForExport(filters);
      const buffer = await generateExcel(data);

      return {
        data: buffer.toString('base64'),
        filename: `activity-report-${new Date().toISOString().split('T')[0]}.xlsx`,
      };
    }),

  /**
   * Get engagement metrics (DAU, WAU, MAU, retention, feature adoption)
   */
  getEngagementMetrics: adminProcedure.query(async () => {
    return await getAllEngagementMetrics();
  }),

  /**
   * Get engagement trends over time
   */
  getEngagementTrends: adminProcedure.query(async () => {
    return await getEngagementTrends();
  }),

  /**
   * Analyze a single cohort
   */
  analyzeCohort: adminProcedure
    .input(
      z.object({
        name: z.string(),
        startDate: z.date(),
        endDate: z.date(),
        userIds: z.array(z.number()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await analyzeCohort(input);
    }),

  /**
   * Compare multiple cohorts
   */
  compareCohorts: adminProcedure
    .input(
      z.array(
        z.object({
          name: z.string(),
          startDate: z.date(),
          endDate: z.date(),
          userIds: z.array(z.number()).optional(),
        })
      )
    )
    .mutation(async ({ input }) => {
      return await compareCohorts(input);
    }),
});
