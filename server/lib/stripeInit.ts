import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover",
});

let cachedProMonthlyPriceId: string | null = null;
let cachedProAnnualPriceId: string | null = null;
let cachedTeamMonthlyPriceId: string | null = null;
let cachedTeamAnnualPriceId: string | null = null;

/**
 * Helper to find or create a Stripe product by metadata
 */
async function ensureProduct(name: string, description: string, tier: string): Promise<string> {
  const existing = await stripe.products.search({
    query: `metadata["app"]:"metaclips" AND metadata["tier"]:"${tier}"`,
  });

  if (existing.data.length > 0) {
    console.log(`[StripeInit] Found existing ${tier} product:`, existing.data[0].id);
    return existing.data[0].id;
  }

  const product = await stripe.products.create({
    name,
    description,
    metadata: { app: "metaclips", tier },
  });
  console.log(`[StripeInit] Created new ${tier} product:`, product.id);
  return product.id;
}

/**
 * Helper to find or create a recurring price for a product
 */
async function ensurePrice(
  productId: string,
  amount: number,
  interval: "month" | "year",
  tier: string
): Promise<string> {
  const existingPrices = await stripe.prices.list({
    product: productId,
    active: true,
    type: "recurring",
    limit: 20,
  });

  const match = existingPrices.data.find(
    (p) => p.unit_amount === amount && p.recurring?.interval === interval
  );

  if (match) {
    console.log(`[StripeInit] Found existing ${tier} ${interval} price:`, match.id);
    return match.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: amount,
    currency: "usd",
    recurring: { interval },
    metadata: { app: "metaclips", tier, interval },
  });
  console.log(`[StripeInit] Created new ${tier} ${interval} price:`, price.id);
  return price.id;
}

/**
 * Ensures all MetaClips subscription products and prices exist in Stripe.
 * Creates Pro (monthly/annual) and Team (monthly/annual) prices.
 * 
 * This runs on server startup and caches the results so checkout sessions
 * can reference the correct price IDs without needing manual env vars.
 */
export async function ensureStripeProductAndPrice(): Promise<string> {
  if (cachedProMonthlyPriceId && cachedProAnnualPriceId && cachedTeamMonthlyPriceId && cachedTeamAnnualPriceId) {
    return cachedProMonthlyPriceId;
  }

  try {
    // --- Pro tier ---
    const proProductId = await ensureProduct(
      "MetaClips Pro",
      "Unlimited files, 50 GB storage, video annotation, AI enrichment, and more.",
      "pro"
    );
    cachedProMonthlyPriceId = await ensurePrice(proProductId, 999, "month", "pro");
    cachedProAnnualPriceId = await ensurePrice(proProductId, 9999, "year", "pro");

    // --- Team tier ---
    const teamProductId = await ensureProduct(
      "MetaClips Team",
      "Collaborative media management with 200 GB shared storage, up to 5 team members, and admin controls.",
      "team"
    );
    cachedTeamMonthlyPriceId = await ensurePrice(teamProductId, 2999, "month", "team");
    cachedTeamAnnualPriceId = await ensurePrice(teamProductId, 29999, "year", "team");

    console.log("[StripeInit] All products and prices initialized successfully");
    return cachedProMonthlyPriceId;
  } catch (error) {
    console.error("[StripeInit] Failed to initialize Stripe products/prices:", error);
    throw error;
  }
}

// --- Pro price getters ---

export function getProPriceId(): string | null {
  return cachedProMonthlyPriceId || process.env.STRIPE_PRICE_ID_PRO || null;
}

export function getProAnnualPriceId(): string | null {
  return cachedProAnnualPriceId || process.env.STRIPE_PRICE_ID_PRO_ANNUAL || null;
}

// --- Team price getters ---

export function getTeamPriceId(): string | null {
  return cachedTeamMonthlyPriceId || process.env.STRIPE_PRICE_ID_TEAM || null;
}

export function getTeamAnnualPriceId(): string | null {
  return cachedTeamAnnualPriceId || process.env.STRIPE_PRICE_ID_TEAM_ANNUAL || null;
}
