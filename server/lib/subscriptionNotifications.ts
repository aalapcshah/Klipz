/**
 * Subscription Email Notifications
 * 
 * Sends email notifications for subscription lifecycle events using the
 * owner notification system. These notifications inform users about
 * subscription changes, upcoming renewals, and payment issues.
 */

import { notifyOwner } from "../_core/notification";

interface SubscriptionNotificationParams {
  userName: string;
  userEmail: string;
}

interface SubscriptionStartedParams extends SubscriptionNotificationParams {
  planName: string;
  amount: string;
  interval: string;
  nextBillingDate: string;
}

interface SubscriptionCanceledParams extends SubscriptionNotificationParams {
  planName: string;
  accessEndsDate: string;
}

interface SubscriptionResumedParams extends SubscriptionNotificationParams {
  planName: string;
  nextBillingDate: string;
}

interface RenewalReminderParams extends SubscriptionNotificationParams {
  planName: string;
  amount: string;
  renewalDate: string;
}

interface PaymentFailedParams extends SubscriptionNotificationParams {
  planName: string;
  amount: string;
  retryDate?: string;
}

/**
 * Send notification when a new subscription is activated
 */
export async function notifySubscriptionStarted(params: SubscriptionStartedParams): Promise<void> {
  try {
    await notifyOwner({
      title: `🎉 New Pro Subscription: ${params.userName}`,
      content: [
        `A new subscription has been activated.`,
        ``,
        `**Subscriber:** ${params.userName} (${params.userEmail})`,
        `**Plan:** ${params.planName}`,
        `**Amount:** ${params.amount}/${params.interval}`,
        `**Next Billing:** ${params.nextBillingDate}`,
        ``,
        `The user now has full access to all Pro features.`,
      ].join("\n"),
    });
    console.log(`[SubscriptionNotify] Sent subscription started notification for ${params.userEmail}`);
  } catch (error) {
    console.error("[SubscriptionNotify] Failed to send subscription started notification:", error);
  }
}

/**
 * Send notification when a subscription is canceled
 */
export async function notifySubscriptionCanceled(params: SubscriptionCanceledParams): Promise<void> {
  try {
    await notifyOwner({
      title: `⚠️ Subscription Canceled: ${params.userName}`,
      content: [
        `A subscription has been canceled.`,
        ``,
        `**User:** ${params.userName} (${params.userEmail})`,
        `**Plan:** ${params.planName}`,
        `**Access Until:** ${params.accessEndsDate}`,
        ``,
        `The user's Pro features will remain active until the end of their current billing period.`,
        `After that, their account will be downgraded to the Free plan.`,
      ].join("\n"),
    });
    console.log(`[SubscriptionNotify] Sent cancellation notification for ${params.userEmail}`);
  } catch (error) {
    console.error("[SubscriptionNotify] Failed to send cancellation notification:", error);
  }
}

/**
 * Send notification when a canceled subscription is resumed
 */
export async function notifySubscriptionResumed(params: SubscriptionResumedParams): Promise<void> {
  try {
    await notifyOwner({
      title: `✅ Subscription Resumed: ${params.userName}`,
      content: [
        `A subscription has been reactivated.`,
        ``,
        `**User:** ${params.userName} (${params.userEmail})`,
        `**Plan:** ${params.planName}`,
        `**Next Billing:** ${params.nextBillingDate}`,
        ``,
        `The user will continue to be billed and retain Pro features.`,
      ].join("\n"),
    });
    console.log(`[SubscriptionNotify] Sent subscription resumed notification for ${params.userEmail}`);
  } catch (error) {
    console.error("[SubscriptionNotify] Failed to send subscription resumed notification:", error);
  }
}

/**
 * Send notification before an upcoming billing renewal
 */
export async function notifyRenewalReminder(params: RenewalReminderParams): Promise<void> {
  try {
    await notifyOwner({
      title: `🔔 Upcoming Renewal: ${params.userName}`,
      content: [
        `A subscription renewal is coming up.`,
        ``,
        `**User:** ${params.userName} (${params.userEmail})`,
        `**Plan:** ${params.planName}`,
        `**Amount:** ${params.amount}`,
        `**Renewal Date:** ${params.renewalDate}`,
        ``,
        `The user will be charged automatically on the renewal date.`,
      ].join("\n"),
    });
    console.log(`[SubscriptionNotify] Sent renewal reminder for ${params.userEmail}`);
  } catch (error) {
    console.error("[SubscriptionNotify] Failed to send renewal reminder:", error);
  }
}

/**
 * Send notification when a payment fails
 */
export async function notifyPaymentFailed(params: PaymentFailedParams): Promise<void> {
  try {
    await notifyOwner({
      title: `❌ Payment Failed: ${params.userName}`,
      content: [
        `A subscription payment has failed.`,
        ``,
        `**User:** ${params.userName} (${params.userEmail})`,
        `**Plan:** ${params.planName}`,
        `**Amount:** ${params.amount}`,
        params.retryDate ? `**Next Retry:** ${params.retryDate}` : `**Status:** No automatic retry scheduled`,
        ``,
        `The user may need to update their payment method to avoid service interruption.`,
      ].join("\n"),
    });
    console.log(`[SubscriptionNotify] Sent payment failed notification for ${params.userEmail}`);
  } catch (error) {
    console.error("[SubscriptionNotify] Failed to send payment failed notification:", error);
  }
}

/**
 * Send notification when a subscription is fully deleted (expired)
 */
export async function notifySubscriptionExpired(params: SubscriptionNotificationParams): Promise<void> {
  try {
    await notifyOwner({
      title: `📋 Subscription Expired: ${params.userName}`,
      content: [
        `A subscription has expired and the user has been downgraded.`,
        ``,
        `**User:** ${params.userName} (${params.userEmail})`,
        `**New Plan:** Free`,
        ``,
        `The user has been downgraded to the Free plan. They can resubscribe at any time.`,
      ].join("\n"),
    });
    console.log(`[SubscriptionNotify] Sent subscription expired notification for ${params.userEmail}`);
  } catch (error) {
    console.error("[SubscriptionNotify] Failed to send subscription expired notification:", error);
  }
}
