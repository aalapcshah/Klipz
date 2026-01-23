import { Request, Response, NextFunction } from 'express';

/**
 * Security headers middleware
 * Adds essential security headers to all responses
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://fonts.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https: http:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://api.manus.im https://*.manus.computer",
      "media-src 'self' blob: https: http:",
      "frame-src 'self' https://checkout.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join('; ')
  );

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy
  res.setHeader(
    'Permissions-Policy',
    'camera=(self), microphone=(self), geolocation=(self), payment=(self)'
  );

  // Strict Transport Security (HSTS)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
}

/**
 * Input sanitization helper
 * Removes potentially dangerous characters from user input
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove iframe tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
}

/**
 * Validate file upload
 * Checks file type and size
 */
export function validateFileUpload(file: { size: number; mimetype: string }, options: {
  maxSize?: number; // in bytes
  allowedTypes?: string[];
} = {}) {
  const {
    maxSize = 100 * 1024 * 1024, // 100MB default
    allowedTypes = ['image/', 'video/', 'audio/', 'application/pdf', 'application/msword', 'application/vnd.'],
  } = options;

  // Check file size
  if (file.size > maxSize) {
    throw new Error(`File size exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`);
  }

  // Check file type
  const isAllowed = allowedTypes.some(type => file.mimetype.startsWith(type));
  if (!isAllowed) {
    throw new Error(`File type ${file.mimetype} is not allowed`);
  }

  return true;
}
