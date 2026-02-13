import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover",
});

let cachedMonthlyPriceId: string | null = null;
let cachedAnnualPriceId: string | null = null;

/**
 * Ensures the MetaClips Pro subscription product and prices exist in Stripe.
 * Creates both monthly ($9.99/mo) and annual ($99.99/yr, ~17% discount) prices.
 * 
 * This runs on server startup and caches the results so checkout sessions
 * can reference the correct price IDs without needing manual env vars.
 */
export async function ensureStripeProductAndPrice(): Promise<string> {
  if (cachedMonthlyPriceId && cachedAnnualPriceId) return cachedMonthlyPriceId;

  try {
    // Search for existing product by metadata
    const existingProducts = await stripe.products.search({
      query: `metadata["app"]:"metaclips" AND metadata["tier"]:"pro"`,
    });

    let productId: string;

    if (existingProducts.data.length > 0) {
      productId = existingProducts.data[0].id;
      console.log("[StripeInit] Found existing product:", productId);
    } else {
      // Create the product
      const product = await stripe.products.create({
        name: "MetaClips Pro",
        description: "Unlimited files, 50 GB storage, video annotation, AI enrichment, and more.",
        metadata: {
          app: "metaclips",
          tier: "pro",
        },
      });
      productId = product.id;
      console.log("[StripeInit] Created new product:", productId);
    }

    // List all active recurring prices for this product
    const existingPrices = await stripe.prices.list({
      product: productId,
      active: true,
      type: "recurring",
      limit: 20,
    });

    // --- Monthly price ($9.99/month) ---
    const matchingMonthly = existingPrices.data.find(
      (p) => p.unit_amount === 999 && p.recurring?.interval === "month"
    );

    if (matchingMonthly) {
      cachedMonthlyPriceId = matchingMonthly.id;
      console.log("[StripeInit] Found existing monthly price:", cachedMonthlyPriceId);
    } else {
      const price = await stripe.prices.create({
        product: productId,
        unit_amount: 999, // $9.99
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { app: "metaclips", tier: "pro", interval: "month" },
      });
      cachedMonthlyPriceId = price.id;
      console.log("[StripeInit] Created new monthly price:", cachedMonthlyPriceId);
    }

    // --- Annual price ($99.99/year, ~17% discount) ---
    const matchingAnnual = existingPrices.data.find(
      (p) => p.unit_amount === 9999 && p.recurring?.interval === "year"
    );

    if (matchingAnnual) {
      cachedAnnualPriceId = matchingAnnual.id;
      console.log("[StripeInit] Found existing annual price:", cachedAnnualPriceId);
    } else {
      const price = await stripe.prices.create({
        product: productId,
        unit_amount: 9999, // $99.99
        currency: "usd",
        recurring: { interval: "year" },
        metadata: { app: "metaclips", tier: "pro", interval: "year" },
      });
      cachedAnnualPriceId = price.id;
      console.log("[StripeInit] Created new annual price:", cachedAnnualPriceId);
    }

    console.log("[StripeInit] Product and prices initialized successfully");
    return cachedMonthlyPriceId;
  } catch (error) {
    console.error("[StripeInit] Failed to initialize Stripe product/prices:", error);
    throw error;
  }
}

/**
 * Get the cached Stripe price ID for the Pro tier (monthly).
 * Returns null if not yet initialized.
 */
export function getProPriceId(): string | null {
  return cachedMonthlyPriceId || process.env.STRIPE_PRICE_ID_PRO || null;
}

/**
 * Get the cached Stripe price ID for the Pro annual tier.
 * Returns null if not yet initialized.
 */
export function getProAnnualPriceId(): string | null {
  return cachedAnnualPriceId || process.env.STRIPE_PRICE_ID_PRO_ANNUAL || null;
}
