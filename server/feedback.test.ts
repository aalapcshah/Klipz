import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appRouter } from './routers';
import { Context } from './_core/context';
import { notifyOwner } from './_core/notification';

// Mock the notification module - the router uses dynamic import so we need to mock the module
vi.mock('./_core/notification', () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

describe('Feedback Router', () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let mockContext: Context;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Re-mock notifyOwner to return true for each test
    vi.mocked(notifyOwner).mockResolvedValue(true);

    // Create a mock context with a test user
    mockContext = {
      user: {
        id: 123,
        openId: 'test-open-id',
        name: 'Test User',
        email: 'test@example.com',
        role: 'user' as const,
      },
      req: {} as any,
      res: {} as any,
    };

    caller = appRouter.createCaller(mockContext);
  });

  it('should submit feedback successfully with all fields', async () => {
    const result = await caller.feedback.submit({
      type: 'bug',
      message: 'Found a bug in the video export feature',
      email: 'contact@example.com',
    });

    expect(result.success).toBe(true);
  });

  it('should submit feedback successfully without optional email', async () => {
    const result = await caller.feedback.submit({
      type: 'feature',
      message: 'Would love to see dark mode support',
    });

    expect(result.success).toBe(true);
  });

  it('should handle different feedback types', async () => {
    const types: Array<'general' | 'bug' | 'feature' | 'improvement' | 'question'> = [
      'general',
      'bug',
      'feature',
      'improvement',
      'question',
    ];

    for (const type of types) {
      const result = await caller.feedback.submit({
        type,
        message: `Test message for ${type}`,
      });

      expect(result.success).toBe(true);
    }
  });

  it('should reject empty message', async () => {
    await expect(
      caller.feedback.submit({
        type: 'general',
        message: '',
      })
    ).rejects.toThrow();
  });

  it('should reject message exceeding 1000 characters', async () => {
    const longMessage = 'a'.repeat(1001);

    await expect(
      caller.feedback.submit({
        type: 'general',
        message: longMessage,
      })
    ).rejects.toThrow();
  });

  it('should reject invalid email format', async () => {
    await expect(
      caller.feedback.submit({
        type: 'general',
        message: 'Test message',
        email: 'invalid-email',
      })
    ).rejects.toThrow();
  });
});
