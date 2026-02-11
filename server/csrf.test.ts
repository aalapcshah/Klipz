import { describe, it, expect } from "vitest";

/**
 * Tests for CSRF protection middleware.
 * Validates the double-submit cookie pattern implementation.
 */

const BASE = "http://localhost:3000";
const CSRF_TOKEN = "test-csrf-token-for-csrf-tests";

describe("CSRF Protection", () => {
  it("should set a CSRF token cookie on GET requests", async () => {
    const response = await fetch(`${BASE}/`);
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("_csrf_token=");
  });

  it("should block POST requests to /api/ without CSRF token", async () => {
    // Set a known CSRF cookie but don't send the header
    const response = await fetch(`${BASE}/api/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `_csrf_token=${CSRF_TOKEN}`,
      },
      body: JSON.stringify({ password: "test" }),
    });

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain("CSRF token validation failed");
  });

  it("should block POST requests with mismatched CSRF tokens", async () => {
    const response = await fetch(`${BASE}/api/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `_csrf_token=${CSRF_TOKEN}`,
        "x-csrf-token": "wrong-token",
      },
      body: JSON.stringify({ password: "test" }),
    });

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain("CSRF token validation failed");
  });

  it("should allow POST requests with matching CSRF tokens", async () => {
    // Reset rate limits first
    await fetch(`${BASE}/api/admin/_reset-rate-limits`, {
      method: "POST",
      headers: {
        Cookie: `_csrf_token=${CSRF_TOKEN}`,
        "x-csrf-token": CSRF_TOKEN,
      },
    });

    const response = await fetch(`${BASE}/api/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `_csrf_token=${CSRF_TOKEN}`,
        "x-csrf-token": CSRF_TOKEN,
      },
      body: JSON.stringify({ password: "wrong" }),
    });

    // Should get 401 (wrong password), not 403 (CSRF failure)
    expect(response.status).toBe(401);
  });

  it("should skip CSRF validation for GET requests", async () => {
    const response = await fetch(`${BASE}/api/admin/verify`);
    // GET requests should pass through without CSRF check
    expect(response.status).toBe(200);
  });

  it("should skip CSRF validation for Stripe webhook", async () => {
    // Stripe webhook has its own signature verification
    const response = await fetch(`${BASE}/api/stripe/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "test" }),
    });

    // Should NOT be 403 (CSRF). Will be some other error since we don't have valid Stripe signature
    expect(response.status).not.toBe(403);
  });

  it("should allow first POST request when no CSRF cookie exists yet", async () => {
    // Reset rate limits with a valid CSRF token first
    await fetch(`${BASE}/api/admin/_reset-rate-limits`, {
      method: "POST",
      headers: {
        Cookie: `_csrf_token=${CSRF_TOKEN}`,
        "x-csrf-token": CSRF_TOKEN,
      },
    });

    // Send POST without any CSRF cookie at all (first-time visitor scenario)
    const response = await fetch(`${BASE}/api/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: "wrong" }),
    });

    // First request without cookie should be allowed (cookie gets set)
    // It should get through to the actual handler
    expect(response.status).not.toBe(403);
  });
});
