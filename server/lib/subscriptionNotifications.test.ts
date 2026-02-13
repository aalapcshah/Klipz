import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the notification module
vi.mock("../_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { notifyOwner } from "../_core/notification";
import {
  notifySubscriptionStarted,
  notifySubscriptionCanceled,
  notifySubscriptionResumed,
  notifyRenewalReminder,
  notifyPaymentFailed,
  notifySubscriptionExpired,
} from "./subscriptionNotifications";

describe("subscriptionNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should send subscription started notification", async () => {
    await notifySubscriptionStarted({
      userName: "John Doe",
      userEmail: "john@example.com",
      planName: "Pro",
      interval: "month",
      amount: "$9.99",
      nextBillingDate: "March 15, 2026",
    });

    expect(notifyOwner).toHaveBeenCalledOnce();
    const call = (notifyOwner as any).mock.calls[0][0];
    expect(call.title).toContain("New Pro Subscription");
    expect(call.title).toContain("John Doe");
    expect(call.content).toContain("John Doe");
    expect(call.content).toContain("Pro");
    expect(call.content).toContain("$9.99");
  });

  it("should send subscription canceled notification", async () => {
    await notifySubscriptionCanceled({
      userName: "Jane Smith",
      userEmail: "jane@example.com",
      planName: "Pro",
      accessEndsDate: "March 15, 2026",
    });

    expect(notifyOwner).toHaveBeenCalledOnce();
    const call = (notifyOwner as any).mock.calls[0][0];
    expect(call.title).toContain("Subscription Canceled");
    expect(call.content).toContain("Jane Smith");
    expect(call.content).toContain("March 15, 2026");
  });

  it("should send subscription resumed notification", async () => {
    await notifySubscriptionResumed({
      userName: "Bob",
      userEmail: "bob@example.com",
      planName: "Pro",
      nextBillingDate: "April 1, 2026",
    });

    expect(notifyOwner).toHaveBeenCalledOnce();
    const call = (notifyOwner as any).mock.calls[0][0];
    expect(call.title).toContain("Subscription Resumed");
    expect(call.content).toContain("Bob");
  });

  it("should send renewal reminder notification", async () => {
    await notifyRenewalReminder({
      userName: "Alice",
      userEmail: "alice@example.com",
      planName: "Pro",
      amount: "$99.99",
      renewalDate: "February 13, 2027",
    });

    expect(notifyOwner).toHaveBeenCalledOnce();
    const call = (notifyOwner as any).mock.calls[0][0];
    expect(call.title).toContain("Upcoming Renewal");
    expect(call.content).toContain("$99.99");
  });

  it("should send payment failed notification with retry date", async () => {
    await notifyPaymentFailed({
      userName: "Charlie",
      userEmail: "charlie@example.com",
      planName: "Pro",
      amount: "$9.99",
      retryDate: "February 16, 2026",
    });

    expect(notifyOwner).toHaveBeenCalledOnce();
    const call = (notifyOwner as any).mock.calls[0][0];
    expect(call.title).toContain("Payment Failed");
    expect(call.content).toContain("Next Retry");
    expect(call.content).toContain("February 16, 2026");
  });

  it("should send payment failed notification without retry date", async () => {
    await notifyPaymentFailed({
      userName: "Charlie",
      userEmail: "charlie@example.com",
      planName: "Pro",
      amount: "$9.99",
    });

    expect(notifyOwner).toHaveBeenCalledOnce();
    const call = (notifyOwner as any).mock.calls[0][0];
    expect(call.content).toContain("No automatic retry scheduled");
  });

  it("should send subscription expired notification", async () => {
    await notifySubscriptionExpired({
      userName: "Dave",
      userEmail: "dave@example.com",
    });

    expect(notifyOwner).toHaveBeenCalledOnce();
    const call = (notifyOwner as any).mock.calls[0][0];
    expect(call.title).toContain("Subscription Expired");
    expect(call.content).toContain("Free");
  });

  it("should handle notification failure gracefully (catches internally)", async () => {
    (notifyOwner as any).mockRejectedValueOnce(new Error("Network error"));

    // notifySubscriptionStarted catches errors internally, so it should not throw
    await expect(
      notifySubscriptionStarted({
        userName: "Test",
        userEmail: "test@example.com",
        planName: "Pro",
        interval: "monthly",
        amount: "$9.99",
        nextBillingDate: "March 1, 2026",
      })
    ).resolves.toBeUndefined();
  });
});
