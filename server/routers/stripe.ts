import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import Stripe from "stripe";
import { SUBSCRIPTION_TIERS } from "../products";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "../db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover",
});

export const stripeRouter = router({
  /**
   * Create a Stripe Checkout session for subscription purchase
   */
  createCheckoutSession: protectedProcedure
    .input(z.object({
      tierId: z.enum(["pro"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const tier = SUBSCRIPTION_TIERS[input.tierId];
      if (!tier || !tier.stripePriceId) {
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
            price: tier.stripePriceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/upgrade?canceled=true`,
        allow_promotion_codes: true,
        metadata: {
          user_id: ctx.user.id.toString(),
          customer_email: ctx.user.email || "",
          customer_name: ctx.user.name || "",
          tier_id: tier.id,
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

      await stripe.subscriptions.update(
        ctx.user.stripeSubscriptionId,
        {
          cancel_at_period_end: false,
        }
      );

      return {
        success: true,
      };
    }),
});
