import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  users,
  files,
  tags,
  fileTags,
  collections,
  collectionFiles,
  videos,
  enrichmentJobs,
  resumableUploadSessions,
  resumableUploadChunks,
  uploadSessions,
  shareLinks,
} from "../../drizzle/schema";
import { eq, sql, desc, and, inArray, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const adminControlRouter = router({
  /**
   * Override a user's subscription tier (bypass payment)
   */
  overrideSubscription: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        tier: z.enum(["free", "trial", "pro"]),
        expiresAt: z.string().optional(), // ISO date string, null for no expiry
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const updateData: any = {
        subscriptionTier: input.tier,
      };

      if (input.tier === "pro") {
        // Set far-future expiry for admin-granted pro
        updateData.subscriptionExpiresAt = input.expiresAt
          ? new Date(input.expiresAt)
          : new Date("2099-12-31");
      } else if (input.tier === "trial") {
        const now = new Date();
        updateData.trialStartedAt = now;
        updateData.trialEndsAt = new Date(
          now.getTime() + 14 * 24 * 60 * 60 * 1000
        );
        updateData.trialUsed = true;
      } else {
        updateData.subscriptionExpiresAt = null;
      }

      await db.update(users).set(updateData).where(eq(users.id, input.userId));

      return { success: true, tier: input.tier };
    }),

  /**
   * Bulk override subscription for multiple users
   */
  bulkOverrideSubscription: adminProcedure
    .input(
      z.object({
        userIds: z.array(z.number()),
        tier: z.enum(["free", "trial", "pro"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const updateData: any = {
        subscriptionTier: input.tier,
      };

      if (input.tier === "pro") {
        updateData.subscriptionExpiresAt = new Date("2099-12-31");
      }

      await db
        .update(users)
        .set(updateData)
        .where(inArray(users.id, input.userIds));

      return { success: true, count: input.userIds.length };
    }),

  /**
   * Get comprehensive user details with all subscription info
   */
  getUserDetails: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      // Get file count and storage
      const [fileStats] = await db
        .select({
          count: sql<number>`COUNT(*)`,
          totalSize: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`,
        })
        .from(files)
        .where(eq(files.userId, input.userId));

      // Get video count
      const [videoStats] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(videos)
        .where(eq(videos.userId, input.userId));

      // Get collection count
      const [collectionStats] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(collections)
        .where(eq(collections.userId, input.userId));

      return {
        ...user,
        fileCount: fileStats?.count || 0,
        totalStorageUsed: fileStats?.totalSize || 0,
        videoCount: videoStats?.count || 0,
        collectionCount: collectionStats?.count || 0,
      };
    }),

  /**
   * List all users with search and filter
   */
  listUsers: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        tier: z.enum(["free", "trial", "pro", "all"]).optional().default("all"),
        role: z.enum(["user", "admin", "all"]).optional().default("all"),
        limit: z.number().optional().default(50),
        offset: z.number().optional().default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [];
      if (input.search) {
        conditions.push(
          sql`(${users.name} LIKE ${`%${input.search}%`} OR ${users.email} LIKE ${`%${input.search}%`})`
        );
      }
      if (input.tier !== "all") {
        conditions.push(eq(users.subscriptionTier, input.tier));
      }
      if (input.role !== "all") {
        conditions.push(eq(users.role, input.role));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const usersList = await db
        .select({
          id: users.id,
          openId: users.openId,
          name: users.name,
          email: users.email,
          role: users.role,
          subscriptionTier: users.subscriptionTier,
          accountStatus: users.accountStatus,
          storageUsedBytes: users.storageUsedBytes,
          videoCount: users.videoCount,
          trialEndsAt: users.trialEndsAt,
          trialUsed: users.trialUsed,
          subscriptionExpiresAt: users.subscriptionExpiresAt,
          stripeCustomerId: users.stripeCustomerId,
          stripeSubscriptionId: users.stripeSubscriptionId,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .where(whereClause);

      return {
        users: usersList,
        total: countResult?.count || 0,
      };
    }),

  /**
   * Update user account status
   */
  updateAccountStatus: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        status: z.enum(["active", "deactivated", "suspended"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(users)
        .set({
          accountStatus: input.status,
          deactivatedAt:
            input.status === "deactivated" ? new Date() : null,
        })
        .where(eq(users.id, input.userId));

      return { success: true };
    }),

  /**
   * Get all files across all users with search
   */
  listAllFiles: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        userId: z.number().optional(),
        mimeType: z.string().optional(),
        limit: z.number().optional().default(50),
        offset: z.number().optional().default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [];
      if (input.search) {
        conditions.push(
          sql`(${files.filename} LIKE ${`%${input.search}%`} OR ${files.title} LIKE ${`%${input.search}%`})`
        );
      }
      if (input.userId) {
        conditions.push(eq(files.userId, input.userId));
      }
      if (input.mimeType) {
        conditions.push(
          sql`${files.mimeType} LIKE ${`${input.mimeType}%`}`
        );
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const filesList = await db
        .select({
          id: files.id,
          userId: files.userId,
          filename: files.filename,
          title: files.title,
          mimeType: files.mimeType,
          fileSize: files.fileSize,
          url: files.url,
          enrichmentStatus: files.enrichmentStatus,
          qualityScore: files.qualityScore,
          createdAt: files.createdAt,
        })
        .from(files)
        .where(whereClause)
        .orderBy(desc(files.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(files)
        .where(whereClause);

      return {
        files: filesList,
        total: countResult?.count || 0,
      };
    }),

  /**
   * Delete a file (admin override - any user's file)
   */
  deleteFile: adminProcedure
    .input(z.object({ fileId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Remove from collections first
      await db
        .delete(collectionFiles)
        .where(eq(collectionFiles.fileId, input.fileId));

      // Remove tags
      await db.delete(fileTags).where(eq(fileTags.fileId, input.fileId));

      // Delete the file record
      await db.delete(files).where(eq(files.id, input.fileId));

      return { success: true };
    }),

  /**
   * Get all tags across all users
   */
  listAllTags: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().optional().default(100),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [];
      if (input.search) {
        conditions.push(like(tags.name, `%${input.search}%`));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const tagsList = await db
        .select({
          id: tags.id,
          name: tags.name,
          color: tags.color,
          userId: tags.userId,
          usageCount: sql<number>`(SELECT COUNT(*) FROM file_tags WHERE file_tags.tagId = ${tags.id})`,
        })
        .from(tags)
        .where(whereClause)
        .orderBy(desc(sql`usageCount`))
        .limit(input.limit);

      return tagsList;
    }),

  /**
   * Get all collections across all users
   */
  listAllCollections: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().optional().default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [];
      if (input.search) {
        conditions.push(like(collections.name, `%${input.search}%`));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const collectionsList = await db
        .select({
          id: collections.id,
          name: collections.name,
          description: collections.description,
          color: collections.color,
          userId: collections.userId,
          fileCount: sql<number>`(SELECT COUNT(*) FROM collection_files WHERE collection_files.collectionId = ${collections.id})`,
          createdAt: collections.createdAt,
        })
        .from(collections)
        .where(whereClause)
        .orderBy(desc(collections.createdAt))
        .limit(input.limit);

      return collectionsList;
    }),

  /**
   * Get enrichment jobs overview
   */
  listEnrichmentJobs: adminProcedure
    .input(
      z.object({
        status: z
          .enum(["pending", "processing", "completed", "failed", "cancelled", "all"])
          .optional()
          .default("all"),
        limit: z.number().optional().default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [];
      if (input.status !== "all") {
        conditions.push(eq(enrichmentJobs.status, input.status as any));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const jobs = await db
        .select({
          id: enrichmentJobs.id,
          userId: enrichmentJobs.userId,
          status: enrichmentJobs.status,
          totalFiles: enrichmentJobs.totalFiles,
          completedFiles: enrichmentJobs.completedFiles,
          failedFiles: enrichmentJobs.failedFiles,
          lastError: enrichmentJobs.lastError,
          createdAt: enrichmentJobs.createdAt,
          completedAt: enrichmentJobs.completedAt,
        })
        .from(enrichmentJobs)
        .where(whereClause)
        .orderBy(desc(enrichmentJobs.createdAt))
        .limit(input.limit);

      return jobs;
    }),

  /**
   * Get resumable upload sessions overview with real-time progress
   */
  listUploadSessions: adminProcedure
    .input(
      z.object({
        status: z
          .enum(["active", "paused", "finalizing", "completed", "failed", "expired", "all"])
          .optional()
          .default("all"),
        limit: z.number().optional().default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [];
      if (input.status !== "all") {
        conditions.push(
          eq(resumableUploadSessions.status, input.status as any)
        );
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const sessions = await db
        .select({
          id: resumableUploadSessions.id,
          sessionToken: resumableUploadSessions.sessionToken,
          userId: resumableUploadSessions.userId,
          filename: resumableUploadSessions.filename,
          fileSize: resumableUploadSessions.fileSize,
          mimeType: resumableUploadSessions.mimeType,
          totalChunks: resumableUploadSessions.totalChunks,
          uploadedChunks: resumableUploadSessions.uploadedChunks,
          status: resumableUploadSessions.status,
          uploadType: resumableUploadSessions.uploadType,
          lastActivityAt: resumableUploadSessions.lastActivityAt,
          createdAt: resumableUploadSessions.createdAt,
          expiresAt: resumableUploadSessions.expiresAt,
          finalFileUrl: resumableUploadSessions.finalFileUrl,
        })
        .from(resumableUploadSessions)
        .where(whereClause)
        .orderBy(desc(resumableUploadSessions.createdAt))
        .limit(input.limit);

      // Get status counts for summary
      const statusCounts = await db
        .select({
          status: resumableUploadSessions.status,
          count: sql<number>`COUNT(*)`,
        })
        .from(resumableUploadSessions)
        .groupBy(resumableUploadSessions.status);

      const counts: Record<string, number> = {};
      for (const row of statusCounts) {
        counts[row.status] = row.count;
      }

      return {
        sessions: sessions.map(s => ({
          ...s,
          progressPercent: s.totalChunks > 0
            ? Math.round((s.uploadedChunks / s.totalChunks) * 100)
            : 0,
          uploadedBytes: s.totalChunks > 0
            ? Math.round((s.uploadedChunks / s.totalChunks) * s.fileSize)
            : 0,
        })),
        statusCounts: counts,
        total: Object.values(counts).reduce((a, b) => a + b, 0),
      };
    }),

  /**
   * Clean up stuck upload sessions
   */
  cleanupUploadSessions: adminProcedure
    .input(
      z.object({
        sessionIds: z.array(z.number()).optional(),
        olderThanHours: z.number().optional().default(24),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (input.sessionIds && input.sessionIds.length > 0) {
        // Delete specific sessions
        await db
          .delete(resumableUploadChunks)
          .where(
            inArray(resumableUploadChunks.sessionId, input.sessionIds)
          );
        await db
          .delete(resumableUploadSessions)
          .where(inArray(resumableUploadSessions.id, input.sessionIds));
        return { success: true, cleaned: input.sessionIds.length };
      }

      // Clean up expired/stuck sessions
      const cutoff = new Date(
        Date.now() - input.olderThanHours * 60 * 60 * 1000
      );
      const stuckSessions = await db
        .select({ id: resumableUploadSessions.id })
        .from(resumableUploadSessions)
        .where(
          and(
            sql`${resumableUploadSessions.status} IN ('active', 'paused', 'finalizing')`,
            sql`${resumableUploadSessions.createdAt} < ${cutoff}`
          )
        );

      const stuckIds = stuckSessions.map((s) => s.id);
      if (stuckIds.length > 0) {
        await db
          .delete(resumableUploadChunks)
          .where(inArray(resumableUploadChunks.sessionId, stuckIds));
        await db
          .delete(resumableUploadSessions)
          .where(inArray(resumableUploadSessions.id, stuckIds));
      }

      return { success: true, cleaned: stuckIds.length };
    }),

  /**
   * Get share links overview
   */
  listShareLinks: adminProcedure
    .input(
      z.object({
        limit: z.number().optional().default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const links = await db
        .select({
          id: shareLinks.id,
          userId: shareLinks.userId,
          token: shareLinks.token,
          fileId: shareLinks.fileId,
          isActive: shareLinks.isActive,
          viewCount: shareLinks.viewCount,
          expiresAt: shareLinks.expiresAt,
          createdAt: shareLinks.createdAt,
        })
        .from(shareLinks)
        .orderBy(desc(shareLinks.createdAt))
        .limit(input.limit);

      return links;
    }),

  /**
   * Get storage breakdown by user
   */
  getStorageBreakdown: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const breakdown = await db
      .select({
        userId: files.userId,
        userName: users.name,
        userEmail: users.email,
        userTier: users.subscriptionTier,
        fileCount: sql<number>`COUNT(*)`,
        totalSize: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`,
      })
      .from(files)
      .leftJoin(users, eq(files.userId, users.id))
      .groupBy(files.userId, users.name, users.email, users.subscriptionTier)
      .orderBy(desc(sql`totalSize`));

    // Total storage
    const [totalResult] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(files);

    return {
      byUser: breakdown,
      total: {
        bytes: totalResult?.total || 0,
        fileCount: totalResult?.count || 0,
      },
    };
  }),

  /**
   * Reset a user's usage counters
   */
  resetUserUsage: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(users)
        .set({
          knowledgeGraphUsageCount: 0,
        })
        .where(eq(users.id, input.userId));

      return { success: true };
    }),

  /**
   * Reset a user's trial (allow re-trial)
   */
  resetUserTrial: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(users)
        .set({
          trialUsed: false,
          trialStartedAt: null,
          trialEndsAt: null,
        })
        .where(eq(users.id, input.userId));

      return { success: true };
    }),
});
