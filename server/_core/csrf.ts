import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const CSRF_COOKIE_NAME = "_csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";
const TOKEN_LENGTH = 32;

/**
 * Generate a cryptographically secure CSRF token.
 */
function generateToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString("hex");
}

/**
 * Middleware to set a CSRF token cookie on every response if one doesn't exist.
 * The cookie is httpOnly=false so the frontend JS can read it and send it back as a header.
 */
export function csrfTokenSetter(req: Request, res: Response, next: NextFunction) {
  // If no CSRF cookie exists, set one
  const existingToken = req.cookies?.[CSRF_COOKIE_NAME];
  if (!existingToken) {
    const token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Must be readable by frontend JS
      secure: req.secure || req.headers["x-forwarded-proto"] === "https",
      sameSite: "strict",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }
  next();
}

/**
 * Middleware to validate CSRF token on state-changing requests.
 * Compares the token from the X-CSRF-Token header against the cookie value.
 * 
 * Skips validation for:
 * - GET, HEAD, OPTIONS requests (safe methods)
 * - Stripe webhook endpoint (uses its own signature verification)
 * - OAuth callback (uses state parameter)
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip safe HTTP methods
  const safeMethod = ["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (safeMethod) return next();

  // Skip Stripe webhook (has its own signature verification)
  if (req.path === "/api/stripe/webhook") return next();

  // Skip OAuth callback (uses state parameter for CSRF)
  if (req.path.startsWith("/api/oauth/")) return next();

  // Skip non-API routes (static files, vite HMR, etc.)
  if (!req.path.startsWith("/api/")) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

  // If no cookie token exists yet, allow the request but set the cookie
  // This handles the first request before the cookie is established
  if (!cookieToken) {
    const token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: req.secure || req.headers["x-forwarded-proto"] === "https",
      sameSite: "strict",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000,
    });
    // For the very first request, skip validation since there's no cookie to compare against
    return next();
  }

  // Validate: header token must match cookie token
  if (!headerToken || !timingSafeCompare(cookieToken, headerToken)) {
    return res.status(403).json({
      error: "CSRF token validation failed",
      message: "Invalid or missing CSRF token. Please refresh the page and try again.",
    });
  }

  next();
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME };
