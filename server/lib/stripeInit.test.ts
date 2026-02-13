import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to mock Stripe at the module level. Since stripeInit.ts creates
// a Stripe instance at module scope, we need the mock to be set up before
// the module is imported. vi.mock is hoisted, so it runs before imports.

const mockProductsSearch = vi.fn();
const mockProductsCreate = vi.fn();
const mockPricesList = vi.fn();
const mockPricesCreate = vi.fn();

// This mock factory is hoisted and runs before any imports
vi.mock("stripe", () => {
  return {
    default: function MockStripe() {
      return {
        products: {
          search: mockProductsSearch,
          create: mockProductsCreate,
        },
        prices: {
          list: mockPricesList,
          create: mockPricesCreate,
        },
      };
    },
  };
});

describe("stripeInit", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset modules to clear the cached price ID
    vi.resetModules();
    delete process.env.STRIPE_PRICE_ID_PRO;
  });

  it("should return env var price ID if STRIPE_PRICE_ID_PRO is set", async () => {
    process.env.STRIPE_PRICE_ID_PRO = "price_test_123";
    // Re-import after setting env to get fresh module
    const mod = await vi.importActual<typeof import("./stripeInit")>("./stripeInit");
    // Since the module caches, we need a fresh import
    const { ensureStripeProductAndPrice } = await import("./stripeInit");
    const priceId = await ensureStripeProductAndPrice();
    expect(priceId).toBe("price_test_123");
    expect(mockProductsSearch).not.toHaveBeenCalled();
  });

  it("should create product and price if none exist", async () => {
    mockProductsSearch.mockResolvedValue({ data: [] });
    mockProductsCreate.mockResolvedValue({ id: "prod_new_123" });
    mockPricesList.mockResolvedValue({ data: [] });
    mockPricesCreate.mockResolvedValue({ id: "price_new_456" });

    const { ensureStripeProductAndPrice } = await import("./stripeInit");
    const priceId = await ensureStripeProductAndPrice();

    expect(priceId).toBe("price_new_456");
    expect(mockProductsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "MetaClips Pro",
        metadata: { app: "metaclips", tier: "pro" },
      })
    );
    expect(mockPricesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        product: "prod_new_123",
        unit_amount: 999,
        currency: "usd",
        recurring: { interval: "month" },
      })
    );
  });

  it("should reuse existing product and price if they exist", async () => {
    mockProductsSearch.mockResolvedValue({
      data: [{ id: "prod_existing_789" }],
    });
    mockPricesList.mockResolvedValue({
      data: [
        {
          id: "price_existing_101",
          unit_amount: 999,
          recurring: { interval: "month" },
        },
      ],
    });

    const { ensureStripeProductAndPrice } = await import("./stripeInit");
    const priceId = await ensureStripeProductAndPrice();

    expect(priceId).toBe("price_existing_101");
    expect(mockProductsCreate).not.toHaveBeenCalled();
    expect(mockPricesCreate).not.toHaveBeenCalled();
  });

  it("should create price if product exists but no matching price", async () => {
    mockProductsSearch.mockResolvedValue({
      data: [{ id: "prod_existing_789" }],
    });
    mockPricesList.mockResolvedValue({
      data: [
        {
          id: "price_wrong",
          unit_amount: 1999,
          recurring: { interval: "month" },
        },
      ],
    });
    mockPricesCreate.mockResolvedValue({ id: "price_correct_202" });

    const { ensureStripeProductAndPrice } = await import("./stripeInit");
    const priceId = await ensureStripeProductAndPrice();

    expect(priceId).toBe("price_correct_202");
    expect(mockProductsCreate).not.toHaveBeenCalled();
    expect(mockPricesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        product: "prod_existing_789",
        unit_amount: 999,
      })
    );
  });
});

describe("getProPriceId", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.STRIPE_PRICE_ID_PRO;
  });

  it("should return null when not initialized and no env var", async () => {
    const { getProPriceId } = await import("./stripeInit");
    expect(getProPriceId()).toBeNull();
  });

  it("should return env var when set", async () => {
    process.env.STRIPE_PRICE_ID_PRO = "price_env_123";
    const { getProPriceId } = await import("./stripeInit");
    expect(getProPriceId()).toBe("price_env_123");
  });
});
