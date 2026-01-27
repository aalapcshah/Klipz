import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach((key) => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 5 * 60 * 1000);

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  message?: string;
  statusCode?: number;
  keyGenerator?: (req: Request) => string;
}

/**
 * Rate limiting middleware
 * Default: 100 requests per 15 minutes per IP
 */
export function rateLimit(options: Partial<RateLimitOptions> = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100,
    message = 'Too many requests, please try again later.',
    statusCode = 429,
    keyGenerator = (req) => {
      // Use IP address as key
      return req.ip || req.socket.remoteAddress || 'unknown';
    },
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    if (!store[key] || store[key].resetTime < now) {
      // Create new entry or reset expired entry
      store[key] = {
        count: 1,
        resetTime: now + windowMs,
      };
      return next();
    }

    store[key].count++;

    if (store[key].count > max) {
      return res.status(statusCode).json({
        error: message,
        retryAfter: Math.ceil((store[key].resetTime - now) / 1000),
      });
    }

    next();
  };
}

/**
 * Strict rate limit for sensitive operations (auth, payments)
 * 10 requests per 15 minutes
 */
export const strictRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts, please try again later.',
});

/**
 * Moderate rate limit for API endpoints
 * 1000 requests per 15 minutes (increased to support chunked uploads)
 * A 4GB file with 1MB chunks = ~4000 chunks, so we need higher limits
 */
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
});

/**
 * Lenient rate limit for file uploads
 * 50 uploads per hour
 */
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: 'Upload limit exceeded, please try again later.',
});
