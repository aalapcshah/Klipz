import { Router } from "express";
import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import { ENV } from "../_core/env";

const router = Router();

const ADMIN_COOKIE_NAME = "admin_session";
const ADMIN_TOKEN_EXPIRY = "7d"; // 7 days

// Rate limiting for login endpoint
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(loginAttempts.entries());
  for (const [ip, entry] of entries) {
    if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

function getClientIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry) {
    loginAttempts.set(ip, { attempts: 1, firstAttempt: now });
    return { allowed: true };
  }

  // Window expired, reset
  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(ip, { attempts: 1, firstAttempt: now });
    return { allowed: true };
  }

  if (entry.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil(
      (RATE_LIMIT_WINDOW_MS - (now - entry.firstAttempt)) / 1000
    );
    return { allowed: false, retryAfterSeconds };
  }

  entry.attempts++;
  return { allowed: true };
}

/** Exported for testing */
export function _resetRateLimits() {
  loginAttempts.clear();
}

export { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS };

/**
 * Standalone admin authentication routes.
 * Uses ADMIN_PASSWORD env var for password-based login,
 * independent of Manus OAuth. Works when self-hosted.
 */

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(ENV.cookieSecret);
}

// POST /api/admin/login - Authenticate with admin password
router.post("/api/admin/login", async (req, res) => {
  // Rate limiting check
  const clientIp = getClientIp(req);
  const rateCheck = checkRateLimit(clientIp);
  if (!rateCheck.allowed) {
    res.set("Retry-After", String(rateCheck.retryAfterSeconds));
    return res.status(429).json({
      error: "Too many login attempts. Please try again later.",
      retryAfterSeconds: rateCheck.retryAfterSeconds,
    });
  }

  const { password } = req.body;

  if (!ENV.adminPassword) {
    return res.status(503).json({
      error: "Admin password not configured. Set ADMIN_PASSWORD environment variable.",
    });
  }

  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "Password is required." });
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(password, ENV.adminPassword)) {
    return res.status(401).json({ error: "Invalid password." });
  }

  // Issue a JWT token for the admin session
  const token = await new SignJWT({ role: "admin", type: "standalone_admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(ADMIN_TOKEN_EXPIRY)
    .setIssuedAt()
    .sign(getSecretKey());

  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: ENV.isProduction,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });

  return res.json({ success: true });
});

// POST /api/admin/logout - Clear admin session
router.post("/api/admin/logout", (_req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, { path: "/" });
  return res.json({ success: true });
});

// GET /api/admin/verify - Check if current admin session is valid
router.get("/api/admin/verify", async (req, res) => {
  const cookies = req.headers.cookie ? parseCookieHeader(req.headers.cookie) : {};
  const token = cookies[ADMIN_COOKIE_NAME];

  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.role === "admin" && payload.type === "standalone_admin") {
      return res.json({ authenticated: true, type: "standalone_admin" });
    }
    return res.json({ authenticated: false });
  } catch {
    res.clearCookie(ADMIN_COOKIE_NAME, { path: "/" });
    return res.json({ authenticated: false });
  }
});

/**
 * Verify an admin session token from request.
 * Used by createContext to inject admin user into tRPC context.
 * Returns true if the request has a valid standalone admin session.
 */
export async function verifyAdminSession(req: { headers: { cookie?: string } }): Promise<boolean> {
  const cookies = req.headers.cookie ? parseCookieHeader(req.headers.cookie) : {};
  const token = cookies[ADMIN_COOKIE_NAME];
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload.role === "admin" && payload.type === "standalone_admin";
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Test-only endpoint to reset rate limits (only available in non-production)
if (!ENV.isProduction) {
  router.post("/api/admin/_reset-rate-limits", (_req, res) => {
    loginAttempts.clear();
    return res.json({ success: true });
  });
}

export default router;
