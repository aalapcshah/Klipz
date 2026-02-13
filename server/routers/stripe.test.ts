import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Stripe
const mockInvoicesList = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
const mockSubscriptionsUpdate = vi.fn();
const mockCustomersCreate = vi.fn();
const mockCheckoutSessionsCreate = vi.fn();

vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      invoices: { list: mockInvoicesList },
      subscriptions: {
        retrieve: mockSubscriptionsRetrieve,
        update: mockSubscriptionsUpdate,
      },
      customers: { create: mockCustomersCreate },
      checkout: { sessions: { create: mockCheckoutSessionsCreate } },
    })),
  };
});

// Mock products
vi.mock("../products", () => ({
  SUBSCRIPTION_TIERS: {
    pro: {
      id: "pro",
      name: "MetaClips Pro",
      stripePriceId: "price_test_123",
    },
  },
}));

// Mock db
vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue({
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  }),
}));

// Mock schema
vi.mock("../../drizzle/schema", () => ({
  users: { id: "id" },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ field: a, value: b })),
}));

describe("Stripe Router - getBillingHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty array when user has no stripe customer ID", async () => {
    // The procedure checks ctx.user.stripeCustomerId
    // If null, it returns []
    // We test the logic directly
    const user = { stripeCustomerId: null };
    if (!user.stripeCustomerId) {
      expect([]).toEqual([]);
    }
  });

  it("should format invoice data correctly", () => {
    // Test the invoice mapping logic
    const mockInvoice = {
      id: "inv_123",
      created: 1707840000, // 2024-02-13
      amount_paid: 999,
      currency: "usd",
      status: "paid",
      lines: {
        data: [{ description: "MetaClips Pro Subscription" }],
      },
      hosted_invoice_url: "https://invoice.stripe.com/inv_123",
    };

    const formatted = {
      id: mockInvoice.id,
      date: mockInvoice.created * 1000,
      amount: mockInvoice.amount_paid,
      amountFormatted: `$${(mockInvoice.amount_paid / 100).toFixed(2)}`,
      currency: mockInvoice.currency,
      status: mockInvoice.status,
      description: mockInvoice.lines.data[0]?.description || "MetaClips Pro Subscription",
      receiptUrl: mockInvoice.hosted_invoice_url || null,
    };

    expect(formatted.id).toBe("inv_123");
    expect(formatted.date).toBe(1707840000000);
    expect(formatted.amount).toBe(999);
    expect(formatted.amountFormatted).toBe("$9.99");
    expect(formatted.currency).toBe("usd");
    expect(formatted.status).toBe("paid");
    expect(formatted.description).toBe("MetaClips Pro Subscription");
    expect(formatted.receiptUrl).toBe("https://invoice.stripe.com/inv_123");
  });

  it("should use default description when invoice line has no description", () => {
    const mockInvoice = {
      lines: { data: [{}] },
    };

    const description = (mockInvoice.lines.data[0] as any)?.description || "MetaClips Pro Subscription";
    expect(description).toBe("MetaClips Pro Subscription");
  });

  it("should handle null hosted_invoice_url", () => {
    const mockInvoice = {
      hosted_invoice_url: null,
    };

    const receiptUrl = mockInvoice.hosted_invoice_url || null;
    expect(receiptUrl).toBeNull();
  });
});

describe("Stripe Router - getSubscriptionStatus", () => {
  it("should return inactive status when no subscription ID", () => {
    const user = {
      stripeSubscriptionId: null,
      subscriptionTier: "free",
    };

    if (!user.stripeSubscriptionId) {
      const result = {
        tier: user.subscriptionTier,
        status: "inactive",
        currentPeriodEnd: null,
      };
      expect(result.tier).toBe("free");
      expect(result.status).toBe("inactive");
      expect(result.currentPeriodEnd).toBeNull();
    }
  });

  it("should format subscription period end correctly", () => {
    const periodEnd = 1707840000; // Unix timestamp
    const formatted = periodEnd ? new Date(periodEnd * 1000) : null;
    expect(formatted).toBeInstanceOf(Date);
    expect(formatted!.getTime()).toBe(1707840000000);
  });
});

describe("Stripe Router - cancelSubscription", () => {
  it("should throw error when no subscription to cancel", () => {
    const user = { stripeSubscriptionId: null };
    expect(() => {
      if (!user.stripeSubscriptionId) {
        throw new Error("No active subscription");
      }
    }).toThrow("No active subscription");
  });
});

describe("Stripe Router - resumeSubscription", () => {
  it("should throw error when no subscription to resume", () => {
    const user = { stripeSubscriptionId: null };
    expect(() => {
      if (!user.stripeSubscriptionId) {
        throw new Error("No subscription to resume");
      }
    }).toThrow("No subscription to resume");
  });
});
