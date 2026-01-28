/**
 * Subscription Plans Configuration
 * Defines the features and limits for each subscription tier
 */

export type SubscriptionTier = 'free' | 'trial' | 'pro';

export interface PlanLimits {
  // Storage limits
  maxStorageBytes: number; // -1 for unlimited
  maxVideoCount: number; // -1 for unlimited
  maxFileCount: number; // -1 for unlimited
  
  // Feature access
  canUploadVideos: boolean;
  canAnnotateVideos: boolean;
  canUseTranscription: boolean;
  canLinkAnnotationsToFiles: boolean;
  canUseAIEnrichment: boolean;
  canUseKnowledgeGraph: boolean;
  canExportData: boolean;
  canShareFiles: boolean;
  canCreateCollections: boolean;
  
  // Usage limits
  knowledgeGraphQueriesPerMonth: number;
  aiEnrichmentPerMonth: number; // -1 for unlimited
}

export interface PlanInfo {
  id: SubscriptionTier;
  name: string;
  description: string;
  price: number; // Monthly price in cents (0 for free)
  limits: PlanLimits;
  features: string[]; // Marketing feature list
  recommended?: boolean;
}

// Trial duration in days
export const TRIAL_DURATION_DAYS = 14;

// Plan definitions
export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, PlanInfo> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Basic file management for individuals',
    price: 0,
    limits: {
      maxStorageBytes: 2 * 1024 * 1024 * 1024, // 2 GB
      maxVideoCount: 0, // No videos on free plan
      maxFileCount: 100,
      canUploadVideos: false,
      canAnnotateVideos: false,
      canUseTranscription: false,
      canLinkAnnotationsToFiles: false,
      canUseAIEnrichment: false,
      canUseKnowledgeGraph: false,
      canExportData: false,
      canShareFiles: true,
      canCreateCollections: true,
      knowledgeGraphQueriesPerMonth: 0,
      aiEnrichmentPerMonth: 0,
    },
    features: [
      'Upload up to 100 files',
      '2 GB storage',
      'Label and organize files',
      'Edit file metadata',
      'Delete files',
      'Create collections',
      'Share files via links',
    ],
  },
  
  trial: {
    id: 'trial',
    name: 'Pro Trial',
    description: '14-day free trial of all Pro features',
    price: 0,
    limits: {
      maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10 GB during trial
      maxVideoCount: 20, // Limited videos during trial
      maxFileCount: -1, // Unlimited
      canUploadVideos: true,
      canAnnotateVideos: true,
      canUseTranscription: true,
      canLinkAnnotationsToFiles: true,
      canUseAIEnrichment: true,
      canUseKnowledgeGraph: true,
      canExportData: true,
      canShareFiles: true,
      canCreateCollections: true,
      knowledgeGraphQueriesPerMonth: 50,
      aiEnrichmentPerMonth: 100,
    },
    features: [
      'All Pro features for 14 days',
      '10 GB storage',
      'Upload up to 20 videos',
      'Video annotation with transcription',
      'AI-powered file enrichment',
      'Knowledge graph visualization',
      'Export data',
      'No credit card required',
    ],
  },
  
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'Full-featured media management for professionals',
    price: 999, // $9.99/month
    recommended: true,
    limits: {
      maxStorageBytes: 50 * 1024 * 1024 * 1024, // 50 GB
      maxVideoCount: -1, // Unlimited
      maxFileCount: -1, // Unlimited
      canUploadVideos: true,
      canAnnotateVideos: true,
      canUseTranscription: true,
      canLinkAnnotationsToFiles: true,
      canUseAIEnrichment: true,
      canUseKnowledgeGraph: true,
      canExportData: true,
      canShareFiles: true,
      canCreateCollections: true,
      knowledgeGraphQueriesPerMonth: -1, // Unlimited
      aiEnrichmentPerMonth: -1, // Unlimited
    },
    features: [
      'Unlimited files',
      '50 GB storage',
      'Unlimited video uploads',
      'Video annotation with transcription',
      'Link annotations to metadata-labeled files',
      'AI-powered file enrichment',
      'Knowledge graph visualization',
      'Export data in multiple formats',
      'Priority support',
    ],
  },
};

/**
 * Get plan limits for a given subscription tier
 */
export function getPlanLimits(tier: SubscriptionTier): PlanLimits {
  return SUBSCRIPTION_PLANS[tier].limits;
}

/**
 * Get plan info for a given subscription tier
 */
export function getPlanInfo(tier: SubscriptionTier): PlanInfo {
  return SUBSCRIPTION_PLANS[tier];
}

/**
 * Check if a user can perform an action based on their plan
 */
export function canPerformAction(
  tier: SubscriptionTier,
  action: keyof Omit<PlanLimits, 'maxStorageBytes' | 'maxVideoCount' | 'maxFileCount' | 'knowledgeGraphQueriesPerMonth' | 'aiEnrichmentPerMonth'>
): boolean {
  return SUBSCRIPTION_PLANS[tier].limits[action];
}

/**
 * Format storage size for display
 */
export function formatStorageSize(bytes: number): string {
  if (bytes === -1) return 'Unlimited';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Calculate trial end date from start date
 */
export function calculateTrialEndDate(startDate: Date): Date {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + TRIAL_DURATION_DAYS);
  return endDate;
}

/**
 * Check if trial has expired
 */
export function isTrialExpired(trialEndsAt: Date | null): boolean {
  if (!trialEndsAt) return true;
  return new Date() > trialEndsAt;
}

/**
 * Get days remaining in trial
 */
export function getTrialDaysRemaining(trialEndsAt: Date | null): number {
  if (!trialEndsAt) return 0;
  const now = new Date();
  const diff = trialEndsAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
