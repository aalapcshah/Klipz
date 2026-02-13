import { describe, it, expect, vi, beforeEach } from "vitest";

const mockProductsSearch = vi.fn();
const mockProductsCreate = vi.fn();
const mockPricesList = vi.fn();
const mockPricesCreate = vi.fn();

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
    vi.resetModules();
    delete process.env.STRIPE_PRICE_ID_PRO;
    delete process.env.STRIPE_PRICE_ID_PRO_ANNUAL;
  });

  it("should create product and both monthly and annual prices if none exist", async () => {
    mockProductsSearch.mockResolvedValue({ data: [] });
    mockProductsCreate.mockResolvedValue({ id: "prod_new_123" });
    mockPricesList.mockResolvedValue({ data: [] });
    mockPricesCreate
      .mockResolvedValueOnce({ id: "price_monthly_456" })
      .mockResolvedValueOnce({ id: "price_annual_789" });

    const { ensureStripeProductAndPrice, getProPriceId, getProAnnualPriceId } =
      await import("./stripeInit");
    const priceId = await ensureStripeProductAndPrice();

    expect(priceId).toBe("price_monthly_456");
    expect(getProPriceId()).toBe("price_monthly_456");
    expect(getProAnnualPriceId()).toBe("price_annual_789");

    expect(mockProductsCreate).toHaveBeenCalledOnce();
    expect(mockPricesCreate).toHaveBeenCalledTimes(2);

    // Monthly price
    expect(mockPricesCreate.mock.calls[0][0]).toMatchObject({
      product: "prod_new_123",
      unit_amount: 999,
      currency: "usd",
      recurring: { interval: "month" },
    });

    // Annual price
    expect(mockPricesCreate.mock.calls[1][0]).toMatchObject({
      product: "prod_new_123",
      unit_amount: 9999,
      currency: "usd",
      recurring: { interval: "year" },
    });
  });

  it("should reuse existing product and both prices if they exist", async () => {
    mockProductsSearch.mockResolvedValue({
      data: [{ id: "prod_existing" }],
    });
    mockPricesList.mockResolvedValue({
      data: [
        { id: "price_monthly_existing", unit_amount: 999, recurring: { interval: "month" } },
        { id: "price_annual_existing", unit_amount: 9999, recurring: { interval: "year" } },
      ],
    });

    const { ensureStripeProductAndPrice, getProPriceId, getProAnnualPriceId } =
      await import("./stripeInit");
    await ensureStripeProductAndPrice();

    expect(mockProductsCreate).not.toHaveBeenCalled();
    expect(mockPricesCreate).not.toHaveBeenCalled();
    expect(getProPriceId()).toBe("price_monthly_existing");
    expect(getProAnnualPriceId()).toBe("price_annual_existing");
  });

  it("should create only annual price when monthly already exists", async () => {
    mockProductsSearch.mockResolvedValue({
      data: [{ id: "prod_existing" }],
    });
    mockPricesList.mockResolvedValue({
      data: [
        { id: "price_monthly_existing", unit_amount: 999, recurring: { interval: "month" } },
      ],
    });
    mockPricesCreate.mockResolvedValue({ id: "price_annual_new" });

    const { ensureStripeProductAndPrice, getProPriceId, getProAnnualPriceId } =
      await import("./stripeInit");
    await ensureStripeProductAndPrice();

    expect(mockPricesCreate).toHaveBeenCalledOnce();
    expect(mockPricesCreate.mock.calls[0][0]).toMatchObject({
      unit_amount: 9999,
      recurring: { interval: "year" },
    });
    expect(getProPriceId()).toBe("price_monthly_existing");
    expect(getProAnnualPriceId()).toBe("price_annual_new");
  });

  it("should create only monthly price when annual already exists", async () => {
    mockProductsSearch.mockResolvedValue({
      data: [{ id: "prod_existing" }],
    });
    mockPricesList.mockResolvedValue({
      data: [
        { id: "price_annual_existing", unit_amount: 9999, recurring: { interval: "year" } },
      ],
    });
    mockPricesCreate.mockResolvedValue({ id: "price_monthly_new" });

    const { ensureStripeProductAndPrice, getProPriceId, getProAnnualPriceId } =
      await import("./stripeInit");
    await ensureStripeProductAndPrice();

    expect(mockPricesCreate).toHaveBeenCalledOnce();
    expect(mockPricesCreate.mock.calls[0][0]).toMatchObject({
      unit_amount: 999,
      recurring: { interval: "month" },
    });
    expect(getProPriceId()).toBe("price_monthly_new");
    expect(getProAnnualPriceId()).toBe("price_annual_existing");
  });
});

describe("getProPriceId / getProAnnualPriceId", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.STRIPE_PRICE_ID_PRO;
    delete process.env.STRIPE_PRICE_ID_PRO_ANNUAL;
  });

  it("should return null when not initialized and no env var", async () => {
    const { getProPriceId, getProAnnualPriceId } = await import("./stripeInit");
    expect(getProPriceId()).toBeNull();
    expect(getProAnnualPriceId()).toBeNull();
  });

  it("should return env var when set", async () => {
    process.env.STRIPE_PRICE_ID_PRO = "price_env_monthly";
    process.env.STRIPE_PRICE_ID_PRO_ANNUAL = "price_env_annual";
    const { getProPriceId, getProAnnualPriceId } = await import("./stripeInit");
    expect(getProPriceId()).toBe("price_env_monthly");
    expect(getProAnnualPriceId()).toBe("price_env_annual");
  });
});
