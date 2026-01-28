import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users, files, fileActivityLogs, savedCohortComparisons, shareLinks, shareAccessLog, videos, collections } from "../../drizzle/schema";
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

  /**
   * Get saved cohort comparisons for current admin
   */
  getSavedCohortComparisons: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    
    return db
      .select()
      .from(savedCohortComparisons)
      .where(eq(savedCohortComparisons.userId, ctx.user.id))
      .orderBy(desc(savedCohortComparisons.createdAt));
  }),

  /**
   * Save a cohort comparison
   */
  saveCohortComparison: adminProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        cohort1Name: z.string(),
        cohort1StartDate: z.string(),
        cohort1EndDate: z.string(),
        cohort2Name: z.string(),
        cohort2StartDate: z.string(),
        cohort2EndDate: z.string(),
        results: z.any(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const [saved] = await db.insert(savedCohortComparisons).values({
        userId: ctx.user.id,
        name: input.name,
        description: input.description,
        cohort1Name: input.cohort1Name,
        cohort1StartDate: new Date(input.cohort1StartDate),
        cohort1EndDate: new Date(input.cohort1EndDate),
        cohort2Name: input.cohort2Name,
        cohort2StartDate: new Date(input.cohort2StartDate),
        cohort2EndDate: new Date(input.cohort2EndDate),
        results: input.results,
      });

      return { success: true, id: saved.insertId };
    }),

  /**
   * Delete a saved cohort comparison
   */
  deleteSavedCohortComparison: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      await db
        .delete(savedCohortComparisons)
        .where(eq(savedCohortComparisons.id, input.id));

      return { success: true };
    }),

  /**
   * Get share analytics - all share links with stats
   */
  getShareAnalytics: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Get all share links with user info
    const allShareLinks = await db
      .select({
        id: shareLinks.id,
        token: shareLinks.token,
        fileId: shareLinks.fileId,
        videoId: shareLinks.videoId,
        collectionId: shareLinks.collectionId,
        viewCount: shareLinks.viewCount,
        maxViews: shareLinks.maxViews,
        isActive: shareLinks.isActive,
        allowDownload: shareLinks.allowDownload,
        expiresAt: shareLinks.expiresAt,
        createdAt: shareLinks.createdAt,
        lastAccessedAt: shareLinks.lastAccessedAt,
        userId: shareLinks.userId,
        userName: users.name,
        userEmail: users.email,
      })
      .from(shareLinks)
      .leftJoin(users, eq(shareLinks.userId, users.id))
      .orderBy(desc(shareLinks.createdAt));

    // Enrich with item names
    const enrichedLinks = await Promise.all(
      allShareLinks.map(async (link) => {
        let itemName = "Unknown";
        let itemType: "file" | "video" | "collection" = "file";

        if (link.fileId) {
          const [file] = await db.select({ filename: files.filename }).from(files).where(eq(files.id, link.fileId));
          itemName = file?.filename || "Deleted file";
          itemType = "file";
        } else if (link.videoId) {
          const [video] = await db.select({ title: videos.title }).from(videos).where(eq(videos.id, link.videoId));
          itemName = video?.title || "Deleted video";
          itemType = "video";
        } else if (link.collectionId) {
          const [collection] = await db.select({ name: collections.name }).from(collections).where(eq(collections.id, link.collectionId));
          itemName = collection?.name || "Deleted collection";
          itemType = "collection";
        }

        return {
          ...link,
          itemName,
          itemType,
          isExpired: link.expiresAt ? new Date(link.expiresAt) < new Date() : false,
        };
      })
    );

    // Get summary stats
    const totalSharesResult = await db.select({ count: sql<number>`COUNT(*)` }).from(shareLinks);
    const activeSharesResult = await db.select({ count: sql<number>`COUNT(*)` }).from(shareLinks).where(eq(shareLinks.isActive, true));
    const totalViewsResult = await db.select({ sum: sql<number>`SUM(${shareLinks.viewCount})` }).from(shareLinks);
    const totalAccessLogsResult = await db.select({ count: sql<number>`COUNT(*)` }).from(shareAccessLog);
    
    // Get downloads count
    const downloadsResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(shareAccessLog)
      .where(eq(shareAccessLog.action, "download"));

    return {
      shares: enrichedLinks,
      stats: {
        totalShares: totalSharesResult[0]?.count || 0,
        activeShares: activeSharesResult[0]?.count || 0,
        totalViews: totalViewsResult[0]?.sum || 0,
        totalDownloads: downloadsResult[0]?.count || 0,
        totalAccessLogs: totalAccessLogsResult[0]?.count || 0,
      },
    };
  }),

  /**
   * Get access logs for a specific share link (admin view)
   */
  getShareAccessLogs: adminProcedure
    .input(z.object({ shareLinkId: z.number(), limit: z.number().default(100) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      return db
        .select()
        .from(shareAccessLog)
        .where(eq(shareAccessLog.shareLinkId, input.shareLinkId))
        .orderBy(desc(shareAccessLog.accessedAt))
        .limit(input.limit);
    }),

  /**
   * Revoke a share link (admin action)
   */
  revokeShareLink: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db
        .update(shareLinks)
        .set({ isActive: false })
        .where(eq(shareLinks.id, input.id));

      return { success: true };
    }),

  /**
   * Get system overview with storage and resource usage
   */
  getSystemOverview: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Total storage used
    const storageResult = await db
      .select({ total: sql<number>`SUM(${files.fileSize})` })
      .from(files);
    const totalStorageBytes = storageResult[0]?.total || 0;

    // Files by type
    const filesByType = await db
      .select({
        mimeType: files.mimeType,
        count: sql<number>`COUNT(*)`,
        size: sql<number>`SUM(${files.fileSize})`,
      })
      .from(files)
      .groupBy(files.mimeType);

    // Enrichment status breakdown
    const enrichmentStatus = await db
      .select({
        status: files.enrichmentStatus,
        count: sql<number>`COUNT(*)`,
      })
      .from(files)
      .groupBy(files.enrichmentStatus);

    // Videos count
    const videosCountResult = await db.select({ count: sql<number>`COUNT(*)` }).from(videos);
    const videosCount = videosCountResult[0]?.count || 0;

    // Collections count
    const collectionsCountResult = await db.select({ count: sql<number>`COUNT(*)` }).from(collections);
    const collectionsCount = collectionsCountResult[0]?.count || 0;

    // Top users by storage
    const topUsersByStorage = await db
      .select({
        userId: files.userId,
        userName: users.name,
        userEmail: users.email,
        fileCount: sql<number>`COUNT(*)`,
        totalSize: sql<number>`SUM(${files.fileSize})`,
      })
      .from(files)
      .leftJoin(users, eq(files.userId, users.id))
      .groupBy(files.userId, users.name, users.email)
      .orderBy(desc(sql`SUM(${files.fileSize})`))
      .limit(10);

    return {
      storage: {
        totalBytes: totalStorageBytes,
        totalGB: (totalStorageBytes / (1024 * 1024 * 1024)).toFixed(2),
      },
      filesByType: filesByType.map((f) => ({
        type: f.mimeType.split('/')[0] || 'other',
        mimeType: f.mimeType,
        count: f.count,
        sizeBytes: f.size,
      })),
      enrichmentStatus,
      videosCount,
      collectionsCount,
      topUsersByStorage,
    };
  }),
});
