/**
 * Premium Features Module
 * Handles subscription tier checks and usage limits for premium features
 */

import { TRPCError } from "@trpc/server";
import * as db from "./db";

export interface FeatureLimits {
  free: {
    knowledgeGraphQueries: number; // per month
    cloudExports: number; // per month
    maxKnowledgeGraphs: number;
  };
  premium: {
    knowledgeGraphQueries: number;
    cloudExports: number;
    maxKnowledgeGraphs: number;
  };
  enterprise: {
    knowledgeGraphQueries: number;
    cloudExports: number;
    maxKnowledgeGraphs: number;
  };
}

export const FEATURE_LIMITS: FeatureLimits = {
  free: {
    knowledgeGraphQueries: 10,
    cloudExports: 5,
    maxKnowledgeGraphs: 1,
  },
  premium: {
    knowledgeGraphQueries: 500,
    cloudExports: 100,
    maxKnowledgeGraphs: 10,
  },
  enterprise: {
    knowledgeGraphQueries: -1, // unlimited
    cloudExports: -1, // unlimited
    maxKnowledgeGraphs: -1, // unlimited
  },
};

/**
 * Check if user has access to a premium feature
 */
export async function checkPremiumFeatureAccess(
  userId: number,
  feature: "knowledgeGraph" | "cloudExport"
): Promise<{ allowed: boolean; reason?: string; upgradeRequired?: boolean }> {
  const user = await db.getUserById(userId);
  if (!user) {
    return { allowed: false, reason: "User not found" };
  }

  const tier = (user.subscriptionTier || "free") as keyof FeatureLimits;

  // Admin always has access
  if (user.role === "admin") {
    return { allowed: true };
  }

  // Check subscription expiration
  if (user.subscriptionExpiresAt && user.subscriptionExpiresAt < new Date()) {
    return {
      allowed: false,
      reason: "Subscription expired",
      upgradeRequired: true,
    };
  }

  // Check feature-specific limits
  if (feature === "knowledgeGraph") {
    const limit = FEATURE_LIMITS[tier].knowledgeGraphQueries;
    const usage = user.knowledgeGraphUsageCount || 0;

    if (limit === -1) {
      // Unlimited
      return { allowed: true };
    }

    if (usage >= limit) {
      return {
        allowed: false,
        reason: `Knowledge graph query limit reached (${usage}/${limit})`,
        upgradeRequired: tier === "free",
      };
    }

    return { allowed: true };
  }

  if (feature === "cloudExport") {
    // For now, cloud export is available to all tiers
    // Can add usage tracking later
    return { allowed: true };
  }

  return { allowed: false, reason: "Unknown feature" };
}

/**
 * Increment knowledge graph usage count
 */
export async function incrementKnowledgeGraphUsage(userId: number): Promise<void> {
  const user = await db.getUserById(userId);
  if (!user) return;

  await db.updateUser(userId, {
    knowledgeGraphUsageCount: (user.knowledgeGraphUsageCount || 0) + 1,
  });
}

/**
 * Check if user can add more knowledge graphs
 */
export async function checkKnowledgeGraphLimit(
  userId: number
): Promise<{ allowed: boolean; reason?: string; current: number; limit: number }> {
  const user = await db.getUserById(userId);
  if (!user) {
    return { allowed: false, reason: "User not found", current: 0, limit: 0 };
  }

  const tier = (user.subscriptionTier || "free") as keyof FeatureLimits;
  const limit = FEATURE_LIMITS[tier].maxKnowledgeGraphs;

  // Admin always has access
  if (user.role === "admin") {
    return { allowed: true, current: 0, limit: -1 };
  }

  // Count current knowledge graphs
  const kgs = await db.getExternalKnowledgeGraphsByUser(userId);
  const current = kgs.length;

  if (limit === -1) {
    // Unlimited
    return { allowed: true, current, limit: -1 };
  }

  if (current >= limit) {
    return {
      allowed: false,
      reason: `Knowledge graph limit reached (${current}/${limit})`,
      current,
      limit,
    };
  }

  return { allowed: true, current, limit };
}

/**
 * Get upgrade message for user
 */
export function getUpgradeMessage(tier: string): string {
  if (tier === "free") {
    return "Upgrade to Premium to unlock unlimited knowledge graph queries, cloud exports, and more!";
  }
  if (tier === "premium") {
    return "Upgrade to Enterprise for unlimited usage and priority support!";
  }
  return "Contact us for custom enterprise plans!";
}

/**
 * Reset monthly usage counters (should be called by a cron job)
 */
export async function resetMonthlyUsage(): Promise<void> {
  // This would be called by a scheduled task
  // For now, it's a placeholder
  console.log("[PremiumFeatures] Monthly usage reset triggered");
}
