/**
 * Stripe Product and Price Definitions
 * 
 * Define your subscription products and prices here for centralized management.
 * These should match the products created in your Stripe Dashboard.
 */

export interface SubscriptionTier {
  id: string;
  name: string;
  stripePriceId: string;
  storageGB: number;
  priceMonthly: number;
  features: string[];
}

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  free: {
    id: 'free',
    name: 'Free',
    stripePriceId: '', // No Stripe price for free tier
    storageGB: 10,
    priceMonthly: 0,
    features: [
      '10 GB storage',
      'Unlimited file uploads',
      'AI enrichment',
      'Basic search',
      'Collections',
      'Video annotations',
      'Mobile access'
    ]
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    // TODO: Replace with actual Stripe Price ID after creating product in Stripe Dashboard
    stripePriceId: process.env.STRIPE_PRICE_ID_PRO || 'price_pro_placeholder',
    storageGB: 100,
    priceMonthly: 9,
    features: [
      '100 GB storage',
      'Everything in Free',
      'Advanced AI enrichment',
      'Priority processing',
      'Advanced search filters',
      'Batch operations',
      'Export to multiple formats',
      'Email support'
    ]
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    // TODO: Replace with actual Stripe Price ID after creating product in Stripe Dashboard
    stripePriceId: process.env.STRIPE_PRICE_ID_ENTERPRISE || 'price_enterprise_placeholder',
    storageGB: 1024, // 1 TB
    priceMonthly: 49,
    features: [
      '1 TB storage',
      'Everything in Pro',
      'Custom AI models',
      'API access',
      'Team collaboration',
      'SSO authentication',
      'Advanced analytics',
      'Dedicated support',
      'Custom integrations'
    ]
  }
};

/**
 * Get subscription tier by ID
 */
export function getSubscriptionTier(tierId: string): SubscriptionTier | undefined {
  return SUBSCRIPTION_TIERS[tierId];
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
  return tier ? tier.storageGB * 1024 * 1024 * 1024 : 10 * 1024 * 1024 * 1024; // Default to 10GB
}
