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
    delete process.env.STRIPE_PRICE_ID_TEAM;
    delete process.env.STRIPE_PRICE_ID_TEAM_ANNUAL;
  });

  it("should create both Pro and Team products and all 4 prices if none exist", async () => {
    // Both product searches return empty (no existing products)
    mockProductsSearch.mockResolvedValue({ data: [] });
    // Create Pro product, then Team product
    mockProductsCreate
      .mockResolvedValueOnce({ id: "prod_pro_123" })
      .mockResolvedValueOnce({ id: "prod_team_456" });
    // All price lists return empty (no existing prices)
    mockPricesList.mockResolvedValue({ data: [] });
    // Create 4 prices: pro monthly, pro annual, team monthly, team annual
    mockPricesCreate
      .mockResolvedValueOnce({ id: "price_pro_monthly" })
      .mockResolvedValueOnce({ id: "price_pro_annual" })
      .mockResolvedValueOnce({ id: "price_team_monthly" })
      .mockResolvedValueOnce({ id: "price_team_annual" });

    const { ensureStripeProductAndPrice, getProPriceId, getProAnnualPriceId, getTeamPriceId, getTeamAnnualPriceId } =
      await import("./stripeInit");
    const priceId = await ensureStripeProductAndPrice();

    expect(priceId).toBe("price_pro_monthly");
    expect(getProPriceId()).toBe("price_pro_monthly");
    expect(getProAnnualPriceId()).toBe("price_pro_annual");
    expect(getTeamPriceId()).toBe("price_team_monthly");
    expect(getTeamAnnualPriceId()).toBe("price_team_annual");

    // 2 products created (pro + team)
    expect(mockProductsCreate).toHaveBeenCalledTimes(2);
    // 4 prices created (pro monthly, pro annual, team monthly, team annual)
    expect(mockPricesCreate).toHaveBeenCalledTimes(4);

    // Pro monthly price
    expect(mockPricesCreate.mock.calls[0][0]).toMatchObject({
      product: "prod_pro_123",
      unit_amount: 999,
      currency: "usd",
      recurring: { interval: "month" },
    });

    // Pro annual price
    expect(mockPricesCreate.mock.calls[1][0]).toMatchObject({
      product: "prod_pro_123",
      unit_amount: 9999,
      currency: "usd",
      recurring: { interval: "year" },
    });

    // Team monthly price
    expect(mockPricesCreate.mock.calls[2][0]).toMatchObject({
      product: "prod_team_456",
      unit_amount: 2999,
      currency: "usd",
      recurring: { interval: "month" },
    });

    // Team annual price
    expect(mockPricesCreate.mock.calls[3][0]).toMatchObject({
      product: "prod_team_456",
      unit_amount: 29999,
      currency: "usd",
      recurring: { interval: "year" },
    });
  });

  it("should reuse existing products and prices if they all exist", async () => {
    // Both products exist
    mockProductsSearch
      .mockResolvedValueOnce({ data: [{ id: "prod_pro_existing" }] })
      .mockResolvedValueOnce({ data: [{ id: "prod_team_existing" }] });
    // All prices exist for both products
    mockPricesList
      .mockResolvedValueOnce({
        data: [
          { id: "price_pro_m", unit_amount: 999, recurring: { interval: "month" } },
          { id: "price_pro_a", unit_amount: 9999, recurring: { interval: "year" } },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          { id: "price_pro_m", unit_amount: 999, recurring: { interval: "month" } },
          { id: "price_pro_a", unit_amount: 9999, recurring: { interval: "year" } },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          { id: "price_team_m", unit_amount: 2999, recurring: { interval: "month" } },
          { id: "price_team_a", unit_amount: 29999, recurring: { interval: "year" } },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          { id: "price_team_m", unit_amount: 2999, recurring: { interval: "month" } },
          { id: "price_team_a", unit_amount: 29999, recurring: { interval: "year" } },
        ],
      });

    const { ensureStripeProductAndPrice, getProPriceId, getProAnnualPriceId, getTeamPriceId, getTeamAnnualPriceId } =
      await import("./stripeInit");
    await ensureStripeProductAndPrice();

    expect(mockProductsCreate).not.toHaveBeenCalled();
    expect(mockPricesCreate).not.toHaveBeenCalled();
    expect(getProPriceId()).toBe("price_pro_m");
    expect(getProAnnualPriceId()).toBe("price_pro_a");
    expect(getTeamPriceId()).toBe("price_team_m");
    expect(getTeamAnnualPriceId()).toBe("price_team_a");
  });

  it("should create missing prices when products exist but some prices are missing", async () => {
    // Pro product exists, team product needs creation
    mockProductsSearch
      .mockResolvedValueOnce({ data: [{ id: "prod_pro_existing" }] })
      .mockResolvedValueOnce({ data: [] });
    mockProductsCreate.mockResolvedValueOnce({ id: "prod_team_new" });

    // Pro has monthly but not annual; team has no prices
    mockPricesList
      .mockResolvedValueOnce({
        data: [
          { id: "price_pro_m_existing", unit_amount: 999, recurring: { interval: "month" } },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          { id: "price_pro_m_existing", unit_amount: 999, recurring: { interval: "month" } },
        ],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    // Creates: pro annual, team monthly, team annual
    mockPricesCreate
      .mockResolvedValueOnce({ id: "price_pro_a_new" })
      .mockResolvedValueOnce({ id: "price_team_m_new" })
      .mockResolvedValueOnce({ id: "price_team_a_new" });

    const { ensureStripeProductAndPrice, getProPriceId, getProAnnualPriceId, getTeamPriceId, getTeamAnnualPriceId } =
      await import("./stripeInit");
    await ensureStripeProductAndPrice();

    expect(mockPricesCreate).toHaveBeenCalledTimes(3);
    expect(getProPriceId()).toBe("price_pro_m_existing");
    expect(getProAnnualPriceId()).toBe("price_pro_a_new");
    expect(getTeamPriceId()).toBe("price_team_m_new");
    expect(getTeamAnnualPriceId()).toBe("price_team_a_new");
  });
});

describe("price getters", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.STRIPE_PRICE_ID_PRO;
    delete process.env.STRIPE_PRICE_ID_PRO_ANNUAL;
    delete process.env.STRIPE_PRICE_ID_TEAM;
    delete process.env.STRIPE_PRICE_ID_TEAM_ANNUAL;
  });

  it("should return null when not initialized and no env var", async () => {
    const { getProPriceId, getProAnnualPriceId, getTeamPriceId, getTeamAnnualPriceId } = await import("./stripeInit");
    expect(getProPriceId()).toBeNull();
    expect(getProAnnualPriceId()).toBeNull();
    expect(getTeamPriceId()).toBeNull();
    expect(getTeamAnnualPriceId()).toBeNull();
  });

  it("should return env var when set", async () => {
    process.env.STRIPE_PRICE_ID_PRO = "price_env_pro_m";
    process.env.STRIPE_PRICE_ID_PRO_ANNUAL = "price_env_pro_a";
    process.env.STRIPE_PRICE_ID_TEAM = "price_env_team_m";
    process.env.STRIPE_PRICE_ID_TEAM_ANNUAL = "price_env_team_a";
    const { getProPriceId, getProAnnualPriceId, getTeamPriceId, getTeamAnnualPriceId } = await import("./stripeInit");
    expect(getProPriceId()).toBe("price_env_pro_m");
    expect(getProAnnualPriceId()).toBe("price_env_pro_a");
    expect(getTeamPriceId()).toBe("price_env_team_m");
    expect(getTeamAnnualPriceId()).toBe("price_env_team_a");
  });
});
