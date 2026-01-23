import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import type { Request, Response } from "express";

describe("Stripe Integration", () => {
  let mockContext: any;

  beforeAll(async () => {
    // Create a mock authenticated context
    mockContext = {
      req: {} as Request,
      res: {} as Response,
      user: {
        id: 1,
        openId: "test-user",
        name: "Test User",
        email: "test@example.com",
        role: "user",
        subscriptionTier: "free",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    };
  });

  it("should have stripe router registered", () => {
    expect(appRouter._def.procedures).toHaveProperty("stripe.createCheckoutSession");
    expect(appRouter._def.procedures).toHaveProperty("stripe.getSubscriptionStatus");
    expect(appRouter._def.procedures).toHaveProperty("stripe.cancelSubscription");
    expect(appRouter._def.procedures).toHaveProperty("stripe.resumeSubscription");
  });

  it("should return subscription status for free tier user", async () => {
    const caller = appRouter.createCaller(mockContext);
    const status = await caller.stripe.getSubscriptionStatus();
    
    expect(status).toMatchObject({
      tier: "free",
      status: "inactive",
      currentPeriodEnd: null,
    });
  });

  it("should reject invalid tier IDs in checkout", async () => {
    const caller = appRouter.createCaller(mockContext);
    
    await expect(
      caller.stripe.createCheckoutSession({ tierId: "invalid" as any })
    ).rejects.toThrow();
  });

  it("should reject free tier checkout", async () => {
    const caller = appRouter.createCaller(mockContext);
    
    await expect(
      caller.stripe.createCheckoutSession({ tierId: "free" as any })
    ).rejects.toThrow();
  });
});
