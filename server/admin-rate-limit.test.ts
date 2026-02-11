import { describe, it, expect, beforeEach } from "vitest";

/**
 * Tests for admin login rate limiting.
 * Tests the IP-based rate limiter that protects the /api/admin/login endpoint.
 */

const BASE = "http://localhost:3000";

async function resetRateLimits() {
  await fetch(`${BASE}/api/admin/_reset-rate-limits`, { method: "POST" });
}

async function attemptLogin(password = "wrong-password") {
  return fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

describe("Admin Auth - Rate Limiting", () => {
  beforeEach(async () => {
    await resetRateLimits();
  });

  it("should allow login attempts within the rate limit", async () => {
    // First 5 attempts should all get through (even with wrong password)
    for (let i = 0; i < 5; i++) {
      const response = await attemptLogin();
      // Should get 401 (wrong password), not 429 (rate limited)
      expect(response.status).toBe(401);
    }
  });

  it("should block login after exceeding rate limit", async () => {
    // Make 5 failed attempts to exhaust the rate limit
    for (let i = 0; i < 5; i++) {
      await attemptLogin();
    }

    // 6th attempt should be rate limited
    const response = await attemptLogin();

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain("Too many login attempts");
    expect(data.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("should include Retry-After header when rate limited", async () => {
    // Exhaust rate limit
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
    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await attemptLogin();
    }

    const response = await attemptLogin();
    const data = await response.json();

    expect(data.retryAfterSeconds).toBeDefined();
    expect(typeof data.retryAfterSeconds).toBe("number");
    // Should be within the 15-minute window
    expect(data.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
    expect(data.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("should reset rate limits via the test endpoint", async () => {
    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await attemptLogin();
    }

    // Verify rate limited
    let response = await attemptLogin();
    expect(response.status).toBe(429);

    // Reset rate limits via HTTP endpoint
    await resetRateLimits();

    // Should be allowed again
    response = await attemptLogin();
    expect(response.status).toBe(401); // Wrong password, but not rate limited
  });

  it("should export rate limit constants", async () => {
    const { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS } = await import("./routes/adminAuth");
    expect(RATE_LIMIT_MAX_ATTEMPTS).toBe(5);
    expect(RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000); // 15 minutes in ms
  });
});
