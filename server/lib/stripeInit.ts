import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover",
});

let cachedPriceId: string | null = null;

/**
 * Ensures the MetaClips Pro subscription product and price exist in Stripe.
 * Creates them if they don't exist. Returns the price ID.
 * 
 * This runs on server startup and caches the result so checkout sessions
 * can reference the correct price ID without needing a manual env var.
 */
export async function ensureStripeProductAndPrice(): Promise<string> {
  if (cachedPriceId) return cachedPriceId;

  // Check if price ID is already set via env var
  if (process.env.STRIPE_PRICE_ID_PRO) {
    cachedPriceId = process.env.STRIPE_PRICE_ID_PRO;
    console.log("[StripeInit] Using STRIPE_PRICE_ID_PRO from env:", cachedPriceId);
    return cachedPriceId;
  }

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

    // Check for existing active price on this product
    const existingPrices = await stripe.prices.list({
      product: productId,
      active: true,
      type: "recurring",
      limit: 10,
    });

    // Look for a $9.99/month price
    const matchingPrice = existingPrices.data.find(
      (p) => p.unit_amount === 999 && p.recurring?.interval === "month"
    );

    if (matchingPrice) {
      cachedPriceId = matchingPrice.id;
      console.log("[StripeInit] Found existing price:", cachedPriceId);
    } else {
      // Create the price
      const price = await stripe.prices.create({
        product: productId,
        unit_amount: 999, // $9.99
        currency: "usd",
        recurring: {
          interval: "month",
        },
        metadata: {
          app: "metaclips",
          tier: "pro",
        },
      });
      cachedPriceId = price.id;
      console.log("[StripeInit] Created new price:", cachedPriceId);
    }

    return cachedPriceId;
  } catch (error) {
    console.error("[StripeInit] Failed to initialize Stripe product/price:", error);
    throw error;
  }
}

/**
 * Get the cached Stripe price ID for the Pro tier.
 * Returns null if not yet initialized.
 */
export function getProPriceId(): string | null {
  return cachedPriceId || process.env.STRIPE_PRICE_ID_PRO || null;
}
