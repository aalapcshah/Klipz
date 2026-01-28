import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockContext(userOverrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...userOverrides,
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Subscription Router", () => {
  describe("getPlans (public)", () => {
    it("should return all subscription plans", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      const plans = await caller.subscription.getPlans();
      
      expect(plans).toBeDefined();
      expect(Array.isArray(plans)).toBe(true);
      expect(plans.length).toBe(3); // free, trial, pro
      
      const planIds = plans.map(p => p.id);
      expect(planIds).toContain("free");
      expect(planIds).toContain("trial");
      expect(planIds).toContain("pro");
    });
    
    it("should include correct plan details", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      const plans = await caller.subscription.getPlans();
      
      const freePlan = plans.find(p => p.id === "free");
      expect(freePlan).toBeDefined();
      expect(freePlan?.price).toBe(0);
      expect(freePlan?.priceFormatted).toBe("Free");
      expect(freePlan?.features).toBeDefined();
      expect(Array.isArray(freePlan?.features)).toBe(true);
      
      const proPlan = plans.find(p => p.id === "pro");
      expect(proPlan).toBeDefined();
      expect(proPlan?.price).toBeGreaterThan(0);
      expect(proPlan?.recommended).toBe(true);
    });
    
    it("should include trial plan with correct features", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      const plans = await caller.subscription.getPlans();
      
      const trialPlan = plans.find(p => p.id === "trial");
      expect(trialPlan).toBeDefined();
      expect(trialPlan?.price).toBe(0);
      expect(trialPlan?.features).toBeDefined();
      expect(trialPlan?.features.some(f => f.includes("14 days"))).toBe(true);
    });
  });
  
  describe("Plan limits", () => {
    it("free plan should have limited storage", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      const plans = await caller.subscription.getPlans();
      
      const freePlan = plans.find(p => p.id === "free");
      expect(freePlan?.limits).toBeDefined();
      expect(freePlan?.limits.maxStorageBytes).toBeLessThan(10 * 1024 * 1024 * 1024); // Less than 10GB
    });
    
    it("pro plan should have higher storage limit", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      const plans = await caller.subscription.getPlans();
      
      const freePlan = plans.find(p => p.id === "free");
      const proPlan = plans.find(p => p.id === "pro");
      
      expect(proPlan?.limits.maxStorageBytes).toBeGreaterThan(freePlan?.limits.maxStorageBytes || 0);
    });
    
    it("free plan should not allow video uploads", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      const plans = await caller.subscription.getPlans();
      
      const freePlan = plans.find(p => p.id === "free");
      expect(freePlan?.limits.canUploadVideos).toBe(false);
    });
    
    it("pro plan should allow video uploads", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      const plans = await caller.subscription.getPlans();
      
      const proPlan = plans.find(p => p.id === "pro");
      expect(proPlan?.limits.canUploadVideos).toBe(true);
    });
  });
});
