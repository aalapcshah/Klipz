/**
 * Vitest Global Test Setup
 * 
 * CRITICAL: This file sets up the test environment but does NOT mock modules globally.
 * Each test file is responsible for its own mocking.
 * 
 * SAFEGUARDS:
 * 1. Environment check prevents accidental production database access
 * 2. The createFile function in db.ts blocks test filenames in production
 * 3. All mock IDs should use high numbers (99999+) to avoid conflicts
 * 
 * GUIDELINES FOR TEST AUTHORS:
 * - Always mock the database module in your test file if you're testing database operations
 * - Use vi.mock('./db', () => ({ ... })) at the top of your test file
 * - Never create real database entries - use mocks instead
 * - Use descriptive mock data that won't be confused with real user data
 */

import { beforeAll } from 'vitest';

// SAFEGUARD: Ensure we're in test environment
beforeAll(() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: Tests cannot run in production environment!');
  }
  
  // Set test environment flag
  process.env.VITEST = 'true';
  process.env.NODE_ENV = 'test';
});

// Export nothing - this file only sets up environment guards
export {};
