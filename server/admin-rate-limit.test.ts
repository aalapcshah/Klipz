import { describe, it, expect, beforeEach } from "vitest";

/**
 * Tests for admin login rate limiting.
 * Tests the IP-based rate limiter that protects the /api/admin/login endpoint.
 */

const BASE = "http://localhost:3000";
const CSRF_TOKEN = "test-csrf-token-for-rate-limit-tests";
const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "Cookie": `_csrf_token=${CSRF_TOKEN}`,
  "x-csrf-token": CSRF_TOKEN,
};

async function resetRateLimits() {
  await fetch(`${BASE}/api/admin/_reset-rate-limits`, {
    method: "POST",
    headers: CSRF_HEADERS,
  });
}

async function attemptLogin(password = "wrong-password") {
  return fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: CSRF_HEADERS,
    body: JSON.stringify({ password }),
  });
}

describe("Admin Auth - Rate Limiting", () => {
  beforeEach(async () => {
    await resetRateLimits();
  });

  it("should allow login attempts within the rate limit", async () => {
    for (let i = 0; i < 5; i++) {
      const response = await attemptLogin();
      expect(response.status).toBe(401);
    }
  });

  it("should block login after exceeding rate limit", async () => {
    for (let i = 0; i < 5; i++) {
      await attemptLogin();
    }

    const response = await attemptLogin();

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain("Too many login attempts");
    expect(data.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("should include Retry-After header when rate limited", async () => {
    for (let i = 0; i < 5; i++) {
      await attemptLogin();
    }

    const response = await attemptLogin();

    expect(response.status).toBe(429);
    const retryAfter = response.headers.get("retry-after");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it("should return retryAfterSeconds in the response body", async () => {
    for (let i = 0; i < 5; i++) {
      await attemptLogin();
    }

    const response = await attemptLogin();
    const data = await response.json();

    expect(data.retryAfterSeconds).toBeDefined();
    expect(typeof data.retryAfterSeconds).toBe("number");
    expect(data.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
    expect(data.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("should reset rate limits via the test endpoint", async () => {
    for (let i = 0; i < 5; i++) {
      await attemptLogin();
    }

    let response = await attemptLogin();
    expect(response.status).toBe(429);

    await resetRateLimits();

    response = await attemptLogin();
    expect(response.status).toBe(401);
  });

  it("should export rate limit constants", async () => {
    const { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS } = await import("./routes/adminAuth");
    expect(RATE_LIMIT_MAX_ATTEMPTS).toBe(5);
    expect(RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});
