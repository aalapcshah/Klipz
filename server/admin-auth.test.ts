import { describe, it, expect, beforeEach } from "vitest";
import { SignJWT, jwtVerify } from "jose";

/**
 * Tests for standalone admin authentication system.
 * Tests the JWT-based admin login flow that works independently of Manus OAuth.
 */

const ADMIN_COOKIE_NAME = "admin_session";

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || "test-secret";
  return new TextEncoder().encode(secret);
}

describe("Admin Auth - JWT Token", () => {
  it("should create a valid admin JWT token", async () => {
    const token = await new SignJWT({ role: "admin", type: "standalone_admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(getSecretKey());

    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("should verify a valid admin JWT token", async () => {
    const token = await new SignJWT({ role: "admin", type: "standalone_admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(getSecretKey());

    const { payload } = await jwtVerify(token, getSecretKey());
    expect(payload.role).toBe("admin");
    expect(payload.type).toBe("standalone_admin");
  });

  it("should reject a token with wrong secret", async () => {
    const wrongKey = new TextEncoder().encode("wrong-secret-key");
    const token = await new SignJWT({ role: "admin", type: "standalone_admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(wrongKey);

    await expect(jwtVerify(token, getSecretKey())).rejects.toThrow();
  });

  it("should reject an expired token", async () => {
    const token = await new SignJWT({ role: "admin", type: "standalone_admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("0s")
      .setIssuedAt()
      .sign(getSecretKey());

    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(jwtVerify(token, getSecretKey())).rejects.toThrow();
  });
});

describe("Admin Auth - verifyAdminSession", () => {
  it("should return false when no cookie is present", async () => {
    const { verifyAdminSession } = await import("./routes/adminAuth");
    const result = await verifyAdminSession({ headers: {} });
    expect(result).toBe(false);
  });

  it("should return false when cookie header is empty", async () => {
    const { verifyAdminSession } = await import("./routes/adminAuth");
    const result = await verifyAdminSession({ headers: { cookie: "" } });
    expect(result).toBe(false);
  });

  it("should return false when admin_session cookie is missing", async () => {
    const { verifyAdminSession } = await import("./routes/adminAuth");
    const result = await verifyAdminSession({
      headers: { cookie: "other_cookie=somevalue" },
    });
    expect(result).toBe(false);
  });

  it("should return false for an invalid token", async () => {
    const { verifyAdminSession } = await import("./routes/adminAuth");
    const result = await verifyAdminSession({
      headers: { cookie: `${ADMIN_COOKIE_NAME}=invalid-token-value` },
    });
    expect(result).toBe(false);
  });

  it("should return true for a valid admin session token", async () => {
    const { verifyAdminSession } = await import("./routes/adminAuth");

    const token = await new SignJWT({ role: "admin", type: "standalone_admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(getSecretKey());

    const result = await verifyAdminSession({
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${token}` },
    });
    expect(result).toBe(true);
  });

  it("should return false for a token with wrong role", async () => {
    const { verifyAdminSession } = await import("./routes/adminAuth");

    const token = await new SignJWT({ role: "user", type: "standalone_admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(getSecretKey());

    const result = await verifyAdminSession({
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${token}` },
    });
    expect(result).toBe(false);
  });

  it("should return false for a token with wrong type", async () => {
    const { verifyAdminSession } = await import("./routes/adminAuth");

    const token = await new SignJWT({ role: "admin", type: "regular_session" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(getSecretKey());

    const result = await verifyAdminSession({
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${token}` },
    });
    expect(result).toBe(false);
  });
});

describe("Admin Auth - Login Endpoint Validation", () => {
  // Reset rate limits before each test to avoid interference
  beforeEach(async () => {
    await fetch("http://localhost:3000/api/admin/_reset-rate-limits", { method: "POST" });
  });

  it("should reject empty password", async () => {
    const response = await fetch("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "" }),
    });
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toBe("Password is required.");
  });

  it("should reject missing password field", async () => {
    const response = await fetch("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toBe("Password is required.");
  });

  it("should reject wrong password", async () => {
    const response = await fetch("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "definitely-wrong-password" }),
    });
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.error).toBe("Invalid password.");
  });

  it("should reject non-string password", async () => {
    const response = await fetch("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: 12345 }),
    });
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toBe("Password is required.");
  });
});

describe("Admin Auth - Verify Endpoint", () => {
  it("should return authenticated: false when no cookie", async () => {
    const response = await fetch("http://localhost:3000/api/admin/verify");
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.authenticated).toBe(false);
  });
});

describe("Admin Auth - Logout Endpoint", () => {
  it("should return success on logout", async () => {
    const response = await fetch("http://localhost:3000/api/admin/logout", {
      method: "POST",
    });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});

describe("Admin Auth - Full Login Flow", () => {
  // Reset rate limits before each test to avoid interference
  beforeEach(async () => {
    await fetch("http://localhost:3000/api/admin/_reset-rate-limits", { method: "POST" });
  });

  it("should accept correct password and set cookie", async () => {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      console.log("Skipping: ADMIN_PASSWORD not set");
      return;
    }

    const response = await fetch("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword }),
    });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain(ADMIN_COOKIE_NAME);
  });

  it("should verify session after login", async () => {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      console.log("Skipping: ADMIN_PASSWORD not set");
      return;
    }

    const loginResponse = await fetch("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword }),
    });
    const setCookie = loginResponse.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();

    const cookieMatch = setCookie?.match(new RegExp(`${ADMIN_COOKIE_NAME}=([^;]+)`));
    expect(cookieMatch).toBeTruthy();
    const cookieValue = cookieMatch![1];

    const verifyResponse = await fetch("http://localhost:3000/api/admin/verify", {
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${cookieValue}` },
    });
    const verifyData = await verifyResponse.json();
    expect(verifyResponse.status).toBe(200);
    expect(verifyData.authenticated).toBe(true);
    expect(verifyData.type).toBe("standalone_admin");
  });

  it("should clear session on logout", async () => {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      console.log("Skipping: ADMIN_PASSWORD not set");
      return;
    }

    const loginResponse = await fetch("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword }),
    });
    const setCookie = loginResponse.headers.get("set-cookie");
    const cookieMatch = setCookie?.match(new RegExp(`${ADMIN_COOKIE_NAME}=([^;]+)`));
    const cookieValue = cookieMatch![1];

    const logoutResponse = await fetch("http://localhost:3000/api/admin/logout", {
      method: "POST",
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${cookieValue}` },
    });
    expect(logoutResponse.status).toBe(200);

    const logoutSetCookie = logoutResponse.headers.get("set-cookie");
    expect(logoutSetCookie).toBeTruthy();
  });
});

describe("OAuth Error Handling", () => {
  it("should have login error page accessible", async () => {
    const response = await fetch(
      "http://localhost:3000/login/error?type=google_api&message=test"
    );
    expect(response.status).toBe(200);
  });

  it("should have login error page accessible with different error types", async () => {
    const errorTypes = ["google_api", "oauth_failed", "token_exchange", "unknown"];
    for (const type of errorTypes) {
      const response = await fetch(
        `http://localhost:3000/login/error?type=${type}`
      );
      expect(response.status).toBe(200);
    }
  });

  it("should have admin login page accessible", async () => {
    const response = await fetch("http://localhost:3000/admin/login");
    expect(response.status).toBe(200);
  });
});
