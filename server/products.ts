/**
 * Stripe Product and Price Definitions
 * 
 * Define your subscription products and prices here for centralized management.
 * These should match the products created in your Stripe Dashboard.
 */

import { getProPriceId, getProAnnualPriceId } from './lib/stripeInit';

export type SubscriptionTierId = 'free' | 'trial' | 'pro';
export type BillingInterval = 'month' | 'year';

export interface SubscriptionTier {
  id: SubscriptionTierId;
  name: string;
  stripePriceId: string;
  storageGB: number;
  priceMonthly: number;
  features: string[];
}

export interface PricingOption {
  interval: BillingInterval;
  priceId: string;
  amount: number; // in cents
  label: string;
  savings?: string; // e.g., "Save 17%"
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
    // Stripe Price ID - dynamically resolved from Stripe on server startup (monthly)
    get stripePriceId() {
      return getProPriceId() || process.env.STRIPE_PRICE_ID_PRO || '';
    },
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
 * Get pricing options for the Pro tier (monthly and annual)
 */
export function getProPricingOptions(): PricingOption[] {
  const monthlyPriceId = getProPriceId() || process.env.STRIPE_PRICE_ID_PRO || '';
  const annualPriceId = getProAnnualPriceId() || process.env.STRIPE_PRICE_ID_PRO_ANNUAL || '';

  return [
    {
      interval: 'month',
      priceId: monthlyPriceId,
      amount: 999, // $9.99/month
      label: '$9.99/month',
    },
    {
      interval: 'year',
      priceId: annualPriceId,
      amount: 9999, // $99.99/year ($8.33/month equivalent)
      label: '$99.99/year',
      savings: 'Save 17%',
    },
  ];
}

/**
 * Get the Stripe price ID for a given billing interval
 */
export function getProPriceIdForInterval(interval: BillingInterval): string {
  if (interval === 'year') {
    return getProAnnualPriceId() || process.env.STRIPE_PRICE_ID_PRO_ANNUAL || '';
  }
  return getProPriceId() || process.env.STRIPE_PRICE_ID_PRO || '';
}

/**
 * Get subscription tier by ID
 */
export function getSubscriptionTier(tierId: string): SubscriptionTier | undefined {
  return SUBSCRIPTION_TIERS[tierId as SubscriptionTierId];
}

/**
 * Get subscription tier by Stripe Price ID
 * Matches both monthly and annual price IDs to the Pro tier
 */
export function getSubscriptionTierByPriceId(priceId: string): SubscriptionTier | undefined {
  // Check standard tier price IDs
  const directMatch = Object.values(SUBSCRIPTION_TIERS).find(tier => tier.stripePriceId === priceId);
  if (directMatch) return directMatch;

  // Also check annual price ID (maps to pro tier)
  const annualPriceId = getProAnnualPriceId() || process.env.STRIPE_PRICE_ID_PRO_ANNUAL;
  if (annualPriceId && priceId === annualPriceId) {
    return SUBSCRIPTION_TIERS.pro;
  }

  return undefined;
}

/**
 * Get storage limit for a subscription tier
 */
export function getStorageLimit(tierId: string): number {
  const tier = getSubscriptionTier(tierId);
  return tier ? tier.storageGB * 1024 * 1024 * 1024 : 1 * 1024 * 1024 * 1024; // Default to 1GB
}
