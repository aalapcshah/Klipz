import type { Request, Response } from "express";
import Stripe from "stripe";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getSubscriptionTierByPriceId } from "../products";
import {
  notifySubscriptionStarted,
  notifySubscriptionCanceled,
  notifySubscriptionExpired,
  notifyPaymentFailed,
} from "../lib/subscriptionNotifications";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover",
});

export async function handleStripeWebhook(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    console.error("[Stripe Webhook] Missing signature");
    return res.status(400).send("Missing signature");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle test events
  if (event.id.startsWith("evt_test_")) {
    console.log("[Stripe Webhook] Test event detected, returning verification response");
    return res.json({ verified: true });
  }

  console.log("[Stripe Webhook] Received event:", event.type, event.id);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log("[Stripe Webhook] Invoice paid:", invoice.id);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log("[Stripe Webhook] Unhandled event type:", event.type);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("[Stripe Webhook] Error processing event:", error);
    res.status(500).send("Webhook processing failed");
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!userId) {
    console.error("[Stripe Webhook] Missing user_id in checkout session metadata");
    return;
  }

  const db = await getDb();
  if (!db) {
    console.error("[Stripe Webhook] Database not available");
    return;
  }

  console.log("[Stripe Webhook] Checkout completed for user:", userId);

  // Get subscription to determine tier
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = (subscription.items.data[0]?.price.id) as string;
    const tier = getSubscriptionTierByPriceId(priceId);

    if (tier) {
      await db.update(users)
        .set({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          subscriptionTier: tier.id as "free" | "trial" | "pro" | "team",
          subscriptionExpiresAt: new Date((subscription as any).current_period_end * 1000),
        })
        .where(eq(users.id, parseInt(userId)));

      console.log("[Stripe Webhook] Updated user subscription to:", tier.name);

      // Send subscription started notification
      const price = subscription.items.data[0]?.price;
      const interval = price?.recurring?.interval || "month";
      const amount = price?.unit_amount
        ? `$${(price.unit_amount / 100).toFixed(2)}`
        : "$9.99";
      const nextBillingDate = new Date(
        (subscription as any).current_period_end * 1000
      ).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      await notifySubscriptionStarted({
        userName: session.metadata?.customer_name || "User",
        userEmail: session.metadata?.customer_email || session.customer_email || "",
        planName: tier.name,
        amount,
        interval,
        nextBillingDate,
      });
    }
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const db = await getDb();
  if (!db) return;

  const priceId = subscription.items.data[0]?.price.id as string;
  const tier = getSubscriptionTierByPriceId(priceId);

  if (!tier) {
    console.error("[Stripe Webhook] Unknown price ID:", priceId);
    return;
  }

  // Find user by subscription ID
  const [user] = await db.select()
    .from(users)
    .where(eq(users.stripeSubscriptionId, subscription.id))
    .limit(1);

  if (!user) {
    console.error("[Stripe Webhook] User not found for subscription:", subscription.id);
    return;
  }

  await db.update(users)
    .set({
      subscriptionTier: tier.id as "free" | "trial" | "pro" | "team",
      subscriptionExpiresAt: new Date((subscription as any).current_period_end * 1000),
    })
    .where(eq(users.id, user.id));

  console.log("[Stripe Webhook] Updated subscription for user:", user.id);

  // Check if subscription was just canceled (cancel_at_period_end set to true)
  if (subscription.cancel_at_period_end) {
    const accessEndsDate = new Date(
      (subscription as any).current_period_end * 1000
    ).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    await notifySubscriptionCanceled({
      userName: user.name || "User",
      userEmail: user.email || "",
      planName: tier.name,
      accessEndsDate,
    });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const db = await getDb();
  if (!db) return;

  // Find user by subscription ID
  const [user] = await db.select()
    .from(users)
    .where(eq(users.stripeSubscriptionId, subscription.id))
    .limit(1);

  if (!user) {
    console.error("[Stripe Webhook] User not found for subscription:", subscription.id);
    return;
  }

  // Downgrade to free tier
  await db.update(users)
    .set({
      subscriptionTier: "free",
      stripeSubscriptionId: null,
      subscriptionExpiresAt: null,
    })
    .where(eq(users.id, user.id));

  console.log("[Stripe Webhook] Downgraded user to free tier:", user.id);

  // Send subscription expired notification
  await notifySubscriptionExpired({
    userName: user.name || "User",
    userEmail: user.email || "",
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  console.log("[Stripe Webhook] Payment failed:", invoice.id);

  const customerId = invoice.customer as string;
  if (!customerId) return;

  const db = await getDb();
  if (!db) return;

  // Find user by Stripe customer ID
  const [user] = await db.select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  if (!user) {
    console.error("[Stripe Webhook] User not found for customer:", customerId);
    return;
  }

  const amount = invoice.amount_due
    ? `$${(invoice.amount_due / 100).toFixed(2)}`
    : "Unknown";

  const nextRetry = invoice.next_payment_attempt
    ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : undefined;

  await notifyPaymentFailed({
    userName: user.name || "User",
    userEmail: user.email || "",
    planName: user.subscriptionTier === "team" ? "Team" : "Pro",
    amount,
    retryDate: nextRetry,
  });
}
