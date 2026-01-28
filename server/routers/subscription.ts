import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { users, files, videos } from "../../drizzle/schema";
import { eq, sql, and, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { 
  SUBSCRIPTION_PLANS, 
  getPlanLimits, 
  calculateTrialEndDate, 
  isTrialExpired,
  getTrialDaysRemaining,
  formatStorageSize,
  TRIAL_DURATION_DAYS,
  type SubscriptionTier 
} from "../../shared/subscriptionPlans";

/**
 * Calculate current storage usage for a user
 */
async function calculateStorageUsage(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  // Sum file sizes
  const [fileResult] = await db.select({
    total: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`
  }).from(files).where(eq(files.userId, userId));
  
  // Videos are stored in files table, so total is just from files
  return fileResult?.total || 0;
}

/**
 * Get video count for a user
 */
async function getVideoCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const [result] = await db.select({
    count: sql<number>`COUNT(*)`
  }).from(videos).where(eq(videos.userId, userId));
  
  return result?.count || 0;
}

/**
 * Get file count for a user
 */
async function getFileCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const [result] = await db.select({
    count: sql<number>`COUNT(*)`
  }).from(files).where(eq(files.userId, userId));
  
  return result?.count || 0;
}

/**
 * Update user's cached storage usage
 */
async function updateStorageUsage(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  const storageUsed = await calculateStorageUsage(userId);
  const videoCount = await getVideoCount(userId);
  
  await db.update(users)
    .set({
      storageUsedBytes: storageUsed,
      videoCount: videoCount,
    })
    .where(eq(users.id, userId));
}

/**
 * Get effective subscription tier (handles trial expiration)
 */
function getEffectiveTier(user: {
  subscriptionTier: SubscriptionTier;
  trialEndsAt: Date | null;
  trialUsed: boolean;
}): SubscriptionTier {
  if (user.subscriptionTier === 'trial') {
    if (isTrialExpired(user.trialEndsAt)) {
      return 'free'; // Trial expired, revert to free
    }
  }
  return user.subscriptionTier;
}

export const subscriptionRouter = router({
  /**
   * Get current subscription status and usage
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    
    const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    
    // Calculate fresh usage
    const storageUsed = await calculateStorageUsage(ctx.user.id);
    const videoCount = await getVideoCount(ctx.user.id);
    const fileCount = await getFileCount(ctx.user.id);
    
    // Update cached values
    await updateStorageUsage(ctx.user.id);
    
    const effectiveTier = getEffectiveTier({
      subscriptionTier: user.subscriptionTier as SubscriptionTier,
      trialEndsAt: user.trialEndsAt,
      trialUsed: user.trialUsed,
    });
    
    const limits = getPlanLimits(effectiveTier);
    const planInfo = SUBSCRIPTION_PLANS[effectiveTier];
    
    return {
      currentTier: effectiveTier,
      displayTier: user.subscriptionTier, // Show "trial" even if expired for UI
      planName: planInfo.name,
      planDescription: planInfo.description,
      
      // Trial info
      isOnTrial: user.subscriptionTier === 'trial' && !isTrialExpired(user.trialEndsAt),
      trialDaysRemaining: getTrialDaysRemaining(user.trialEndsAt),
      trialEndsAt: user.trialEndsAt,
      trialUsed: user.trialUsed,
      trialExpired: user.subscriptionTier === 'trial' && isTrialExpired(user.trialEndsAt),
      
      // Usage
      usage: {
        storageUsed,
        storageLimit: limits.maxStorageBytes,
        storageUsedFormatted: formatStorageSize(storageUsed),
        storageLimitFormatted: formatStorageSize(limits.maxStorageBytes),
        storagePercentage: limits.maxStorageBytes > 0 
          ? Math.round((storageUsed / limits.maxStorageBytes) * 100) 
          : 0,
        
        videoCount,
        videoLimit: limits.maxVideoCount,
        videoPercentage: limits.maxVideoCount > 0 
          ? Math.round((videoCount / limits.maxVideoCount) * 100) 
          : 0,
        
        fileCount,
        fileLimit: limits.maxFileCount,
        filePercentage: limits.maxFileCount > 0 
          ? Math.round((fileCount / limits.maxFileCount) * 100) 
          : 0,
      },
      
      // Features
      features: {
        canUploadVideos: limits.canUploadVideos,
        canAnnotateVideos: limits.canAnnotateVideos,
        canUseTranscription: limits.canUseTranscription,
        canLinkAnnotationsToFiles: limits.canLinkAnnotationsToFiles,
        canUseAIEnrichment: limits.canUseAIEnrichment,
        canUseKnowledgeGraph: limits.canUseKnowledgeGraph,
        canExportData: limits.canExportData,
        canShareFiles: limits.canShareFiles,
        canCreateCollections: limits.canCreateCollections,
      },
      
      // Stripe info
      stripeCustomerId: user.stripeCustomerId,
      stripeSubscriptionId: user.stripeSubscriptionId,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
    };
  }),
  
  /**
   * Start free trial
   */
  startTrial: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    
    const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    
    // Check if user already used trial
    if (user.trialUsed) {
      throw new TRPCError({ 
        code: "BAD_REQUEST", 
        message: "You have already used your free trial" 
      });
    }
    
    // Check if user is already on paid plan
    if (user.subscriptionTier === 'pro') {
      throw new TRPCError({ 
        code: "BAD_REQUEST", 
        message: "You are already on a paid plan" 
      });
    }
    
    const now = new Date();
    const trialEndsAt = calculateTrialEndDate(now);
    
    await db.update(users)
      .set({
        subscriptionTier: 'trial',
        trialStartedAt: now,
        trialEndsAt: trialEndsAt,
        trialUsed: true,
      })
      .where(eq(users.id, ctx.user.id));
    
    return {
      success: true,
      trialEndsAt,
      daysRemaining: TRIAL_DURATION_DAYS,
      message: `Your ${TRIAL_DURATION_DAYS}-day Pro trial has started!`,
    };
  }),
  
  /**
   * Check if user can perform an action (for feature gating)
   */
  checkPermission: protectedProcedure
    .input(z.object({
      action: z.enum([
        'uploadVideo',
        'annotateVideo',
        'useTranscription',
        'linkAnnotationsToFiles',
        'useAIEnrichment',
        'useKnowledgeGraph',
        'exportData',
        'shareFiles',
        'createCollections',
      ]),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      
      const effectiveTier = getEffectiveTier({
        subscriptionTier: user.subscriptionTier as SubscriptionTier,
        trialEndsAt: user.trialEndsAt,
        trialUsed: user.trialUsed,
      });
      
      const limits = getPlanLimits(effectiveTier);
      
      const actionMap: Record<string, keyof typeof limits> = {
        uploadVideo: 'canUploadVideos',
        annotateVideo: 'canAnnotateVideos',
        useTranscription: 'canUseTranscription',
        linkAnnotationsToFiles: 'canLinkAnnotationsToFiles',
        useAIEnrichment: 'canUseAIEnrichment',
        useKnowledgeGraph: 'canUseKnowledgeGraph',
        exportData: 'canExportData',
        shareFiles: 'canShareFiles',
        createCollections: 'canCreateCollections',
      };
      
      const permission = actionMap[input.action];
      const allowed = permission ? limits[permission] as boolean : false;
      
      return {
        allowed,
        currentTier: effectiveTier,
        requiredTier: allowed ? effectiveTier : 'pro',
        message: allowed 
          ? undefined 
          : `This feature requires a Pro subscription. ${user.trialUsed ? 'Upgrade to Pro to continue.' : 'Start your free trial to try it out!'}`,
      };
    }),
  
  /**
   * Check storage limit before upload
   */
  checkStorageLimit: protectedProcedure
    .input(z.object({
      fileSize: z.number(), // Size in bytes
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      
      const effectiveTier = getEffectiveTier({
        subscriptionTier: user.subscriptionTier as SubscriptionTier,
        trialEndsAt: user.trialEndsAt,
        trialUsed: user.trialUsed,
      });
      
      const limits = getPlanLimits(effectiveTier);
      const currentUsage = await calculateStorageUsage(ctx.user.id);
      const newTotal = currentUsage + input.fileSize;
      
      const allowed = limits.maxStorageBytes === -1 || newTotal <= limits.maxStorageBytes;
      
      return {
        allowed,
        currentUsage,
        newTotal,
        limit: limits.maxStorageBytes,
        currentUsageFormatted: formatStorageSize(currentUsage),
        limitFormatted: formatStorageSize(limits.maxStorageBytes),
        message: allowed 
          ? undefined 
          : `This upload would exceed your storage limit. You have ${formatStorageSize(limits.maxStorageBytes - currentUsage)} remaining.`,
      };
    }),
  
  /**
   * Check video limit before upload
   */
  checkVideoLimit: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    
    const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    
    const effectiveTier = getEffectiveTier({
      subscriptionTier: user.subscriptionTier as SubscriptionTier,
      trialEndsAt: user.trialEndsAt,
      trialUsed: user.trialUsed,
    });
    
    const limits = getPlanLimits(effectiveTier);
    
    // Free tier cannot upload videos at all
    if (!limits.canUploadVideos) {
      return {
        allowed: false,
        currentCount: 0,
        limit: 0,
        message: 'Video uploads require a Pro subscription or free trial.',
      };
    }
    
    const currentCount = await getVideoCount(ctx.user.id);
    const allowed = limits.maxVideoCount === -1 || currentCount < limits.maxVideoCount;
    
    return {
      allowed,
      currentCount,
      limit: limits.maxVideoCount,
      message: allowed 
        ? undefined 
        : `You have reached your video limit (${limits.maxVideoCount} videos). Upgrade to Pro for unlimited videos.`,
    };
  }),
  
  /**
   * Get all available plans for pricing page
   */
  getPlans: publicProcedure.query(async () => {
    return Object.values(SUBSCRIPTION_PLANS).map(plan => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      priceFormatted: plan.price === 0 ? 'Free' : `$${(plan.price / 100).toFixed(2)}/mo`,
      features: plan.features,
      recommended: plan.recommended || false,
      limits: plan.limits,
    }));
  }),
  
  /**
   * Recalculate and update user's usage stats
   */
  refreshUsage: protectedProcedure.mutation(async ({ ctx }) => {
    await updateStorageUsage(ctx.user.id);
    return { success: true };
  }),
});

export type SubscriptionRouter = typeof subscriptionRouter;
