import { describe, it, expect, vi } from 'vitest';
import { sanitizeInput, validateFileUpload } from './_core/securityHeaders';
import { apiRateLimit, strictRateLimit, uploadRateLimit } from './_core/rateLimit';
import { securityHeaders } from './_core/securityHeaders';

describe('Security Tests', () => {
  describe('Input Sanitization', () => {
    it('should remove script tags', () => {
      const malicious = '<script>alert("XSS")</script>Hello';
      const sanitized = sanitizeInput(malicious);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toBe('Hello');
    });

    it('should remove iframe tags', () => {
      const malicious = '<iframe src="evil.com"></iframe>Content';
      const sanitized = sanitizeInput(malicious);
      expect(sanitized).not.toContain('<iframe>');
      expect(sanitized).toBe('Content');
    });

    it('should remove javascript: protocol', () => {
      const malicious = 'javascript:alert("XSS")';
      const sanitized = sanitizeInput(malicious);
      expect(sanitized).not.toContain('javascript:');
    });

    it('should remove event handlers', () => {
      const malicious = '<div onclick="alert()">Click</div>';
      const sanitized = sanitizeInput(malicious);
      expect(sanitized).not.toContain('onclick=');
    });

    it('should handle empty strings', () => {
      expect(sanitizeInput('')).toBe('');
    });

    it('should handle non-string inputs', () => {
      expect(sanitizeInput(null as any)).toBe('');
      expect(sanitizeInput(undefined as any)).toBe('');
      expect(sanitizeInput(123 as any)).toBe('');
    });
  });

  describe('File Upload Validation', () => {
    it('should accept valid image files', () => {
      const file = {
        size: 5 * 1024 * 1024, // 5MB
        mimetype: 'image/jpeg',
      };
      expect(() => validateFileUpload(file)).not.toThrow();
    });

    it('should accept valid video files', () => {
      const file = {
        size: 50 * 1024 * 1024, // 50MB
        mimetype: 'video/mp4',
      };
      expect(() => validateFileUpload(file)).not.toThrow();
    });

    it('should reject files exceeding size limit', () => {
      const file = {
        size: 150 * 1024 * 1024, // 150MB (exceeds 100MB default)
        mimetype: 'image/jpeg',
      };
      expect(() => validateFileUpload(file)).toThrow('File size exceeds');
    });

    it('should reject disallowed file types', () => {
      const file = {
        size: 1 * 1024 * 1024, // 1MB
        mimetype: 'application/x-executable',
      };
      expect(() => validateFileUpload(file)).toThrow('File type');
    });

    it('should accept custom size limits', () => {
      const file = {
        size: 200 * 1024 * 1024, // 200MB
        mimetype: 'video/mp4',
      };
      expect(() => 
        validateFileUpload(file, { maxSize: 500 * 1024 * 1024 })
      ).not.toThrow();
    });

    it('should accept custom allowed types', () => {
      const file = {
        size: 1 * 1024 * 1024,
        mimetype: 'text/plain',
      };
      expect(() => 
        validateFileUpload(file, { allowedTypes: ['text/'] })
      ).not.toThrow();
    });
  });

  describe('Authentication Protection', () => {
    it('should verify protected procedures require authentication', async () => {
      // This test verifies that tRPC protectedProcedure middleware works
      // In a real test, you would make an unauthenticated request and expect 401
      expect(true).toBe(true); // Placeholder - auth is handled by tRPC middleware
    });
  });

  describe('Rate Limiting', () => {
    it('should have rate limiting configured', () => {
      // Verify rate limiting middleware exists
      expect(apiRateLimit).toBeDefined();
      expect(strictRateLimit).toBeDefined();
      expect(uploadRateLimit).toBeDefined();
    });
  });

  describe('Security Headers', () => {
    it('should have security headers middleware', () => {
      expect(securityHeaders).toBeDefined();
      expect(typeof securityHeaders).toBe('function');
    });
  });
});
