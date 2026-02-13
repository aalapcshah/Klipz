import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import Stripe from "stripe";
import { SUBSCRIPTION_TIERS, getPriceIdForTierAndInterval, type BillingInterval } from "../products";
import { users, teams } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  notifySubscriptionCanceled,
  notifySubscriptionResumed,
} from "../lib/subscriptionNotifications";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover",
});

export const stripeRouter = router({
  /**
   * Create a Stripe Checkout session for subscription purchase
   */
  createCheckoutSession: protectedProcedure
    .input(z.object({
      tierId: z.enum(["pro", "team"]),
      billingInterval: z.enum(["month", "year"]).optional().default("month"),
    }))
    .mutation(async ({ input, ctx }) => {
      const tier = SUBSCRIPTION_TIERS[input.tierId];
      const priceId = getPriceIdForTierAndInterval(input.tierId, input.billingInterval as BillingInterval);
      if (!tier || !priceId) {
        throw new Error("Invalid subscription tier");
      }

      // Get or create Stripe customer
      let stripeCustomerId = ctx.user.stripeCustomerId;
      
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: ctx.user.email || undefined,
          name: ctx.user.name || undefined,
          metadata: {
            userId: ctx.user.id.toString(),
          },
        });
        stripeCustomerId = customer.id;
        
        // Save customer ID to database
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.update(users)
          .set({ stripeCustomerId })
          .where(eq(users.id, ctx.user.id));
      }

      // Create checkout session
      const origin = ctx.req.headers.origin || "http://localhost:3000";
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        client_reference_id: ctx.user.id.toString(),
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/payment/canceled`,
        allow_promotion_codes: true,
        metadata: {
          user_id: ctx.user.id.toString(),
          customer_email: ctx.user.email || "",
          customer_name: ctx.user.name || "",
          tier_id: input.tierId,
        },
      });

      return {
        checkoutUrl: session.url,
        sessionId: session.id,
      };
    }),

  /**
   * Get current subscription status
   */
  getSubscriptionStatus: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user.stripeSubscriptionId) {
        return {
          tier: ctx.user.subscriptionTier,
          status: "inactive",
          currentPeriodEnd: null,
        };
      }

      try {
        const subscription = await stripe.subscriptions.retrieve(ctx.user.stripeSubscriptionId);
        const periodEnd = (subscription as any).current_period_end;
        return {
          tier: ctx.user.subscriptionTier,
          status: subscription.status,
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
          cancelAtPeriodEnd: (subscription as any).cancel_at_period_end,
        };
      } catch (error) {
        console.error("Error fetching subscription:", error);
        return {
          tier: ctx.user.subscriptionTier,
          status: "error",
          currentPeriodEnd: null,
        };
      }
    }),

  /**
   * Cancel subscription
   */
  cancelSubscription: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (!ctx.user.stripeSubscriptionId) {
        throw new Error("No active subscription");
      }

      const subscription = await stripe.subscriptions.update(
        ctx.user.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        }
      );

      const periodEnd = (subscription as any).current_period_end;
      const tierName = ctx.user.subscriptionTier === "team" ? "Team" : "Pro";

      // Send cancellation notification
      const accessEndsDate = periodEnd
        ? new Date(periodEnd * 1000).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "Unknown";

      notifySubscriptionCanceled({
        userName: ctx.user.name || "User",
        userEmail: ctx.user.email || "",
        planName: tierName,
        accessEndsDate,
      }).catch(() => {}); // Fire and forget

      return {
        success: true,
        cancelAt: periodEnd ? new Date(periodEnd * 1000) : null,
      };
    }),

  /**
   * Resume canceled subscription
   */
  resumeSubscription: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (!ctx.user.stripeSubscriptionId) {
        throw new Error("No subscription to resume");
      }

      const subscription = await stripe.subscriptions.update(
        ctx.user.stripeSubscriptionId,
        {
          cancel_at_period_end: false,
        }
      );

      const tierName = ctx.user.subscriptionTier === "team" ? "Team" : "Pro";
      const periodEnd = (subscription as any).current_period_end;
      const nextBillingDate = periodEnd
        ? new Date(periodEnd * 1000).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "Unknown";

      notifySubscriptionResumed({
        userName: ctx.user.name || "User",
        userEmail: ctx.user.email || "",
        planName: tierName,
        nextBillingDate,
      }).catch(() => {}); // Fire and forget

      return {
        success: true,
      };
    }),

  /**
   * Create a Stripe Customer Portal session for managing billing
   */
  createPortalSession: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (!ctx.user.stripeCustomerId) {
        throw new Error("No billing account found. Please subscribe to a plan first.");
      }

      const origin = ctx.req.headers.origin || "http://localhost:3000";

      const session = await stripe.billingPortal.sessions.create({
        customer: ctx.user.stripeCustomerId,
        return_url: `${origin}/account/subscription`,
      });

      return {
        portalUrl: session.url,
      };
    }),

  /**
   * Get all pricing options (Pro and Team, monthly and annual)
   */
  getPricingOptions: publicProcedure
    .query(async () => {
      const { getProPricingOptions, getTeamPricingOptions } = await import("../products");
      const proOptions = getProPricingOptions();
      const teamOptions = getTeamPricingOptions();

      return {
        pro: proOptions.map((opt) => ({
          interval: opt.interval,
          amount: opt.amount,
          amountFormatted: opt.interval === "month" ? "$9.99" : "$99.99",
          monthlyEquivalent: opt.interval === "month" ? "$9.99" : "$8.33",
          label: opt.label,
          savings: opt.savings || null,
        })),
        team: teamOptions.map((opt) => ({
          interval: opt.interval,
          amount: opt.amount,
          amountFormatted: opt.interval === "month" ? "$29.99" : "$299.99",
          monthlyEquivalent: opt.interval === "month" ? "$29.99" : "$25.00",
          label: opt.label,
          savings: opt.savings || null,
        })),
      };
    }),

  /**
   * Get billing history (recent invoices)
   */
  getBillingHistory: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user.stripeCustomerId) {
        return [];
      }

      try {
        const invoices = await stripe.invoices.list({
          customer: ctx.user.stripeCustomerId,
          limit: 12,
        });

        return invoices.data.map((invoice) => ({
          id: invoice.id,
          date: invoice.created * 1000,
          amount: invoice.amount_paid,
          amountFormatted: `$${(invoice.amount_paid / 100).toFixed(2)}`,
          currency: invoice.currency,
          status: invoice.status,
          description: invoice.lines.data[0]?.description || "MetaClips Subscription",
          receiptUrl: invoice.hosted_invoice_url || null,
        }));
      } catch (error) {
        console.error("Error fetching billing history:", error);
        return [];
      }
    }),
});
