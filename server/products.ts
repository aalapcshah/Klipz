/**
 * Stripe Product and Price Definitions
 * 
 * Define your subscription products and prices here for centralized management.
 * These should match the products created in your Stripe Dashboard.
 */

export type SubscriptionTierId = 'free' | 'trial' | 'pro';

export interface SubscriptionTier {
  id: SubscriptionTierId;
  name: string;
  stripePriceId: string;
  storageGB: number;
  priceMonthly: number;
  features: string[];
}

export const SUBSCRIPTION_TIERS: Record<SubscriptionTierId, SubscriptionTier> = {
  free: {
    id: 'free',
    name: 'Free',
    stripePriceId: '', // No Stripe price for free tier
    storageGB: 2,
    priceMonthly: 0,
    features: [
      '2 GB storage',
      'Upload up to 100 files',
      'Label and organize files',
      'Edit file metadata',
      'Delete files',
      'Create collections',
      'Share files via links',
    ]
  },
  trial: {
    id: 'trial',
    name: 'Pro Trial',
    stripePriceId: '', // No Stripe price for trial
    storageGB: 10,
    priceMonthly: 0,
    features: [
      'All Pro features for 14 days',
      '10 GB storage',
      'Upload up to 20 videos',
      'Video annotation with transcription',
      'AI-powered file enrichment',
      'Knowledge graph visualization',
      'Export data',
      'No credit card required',
    ]
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    // Stripe Price ID - set via environment variable after creating product in Stripe Dashboard
    stripePriceId: process.env.STRIPE_PRICE_ID_PRO || '',
    storageGB: 50,
    priceMonthly: 999, // $9.99 in cents
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
    ]
  },
};

/**
 * Get subscription tier by ID
 */
export function getSubscriptionTier(tierId: string): SubscriptionTier | undefined {
  return SUBSCRIPTION_TIERS[tierId as SubscriptionTierId];
}

/**
 * Get subscription tier by Stripe Price ID
 */
export function getSubscriptionTierByPriceId(priceId: string): SubscriptionTier | undefined {
  return Object.values(SUBSCRIPTION_TIERS).find(tier => tier.stripePriceId === priceId);
}

/**
 * Get storage limit for a subscription tier
 */
export function getStorageLimit(tierId: string): number {
  const tier = getSubscriptionTier(tierId);
  return tier ? tier.storageGB * 1024 * 1024 * 1024 : 1 * 1024 * 1024 * 1024; // Default to 1GB
}
