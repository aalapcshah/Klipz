import { describe, it, expect, beforeAll } from 'vitest';
import { appRouter } from './routers';
import type { Context } from './_core/context';

describe('Bulk Tag Removal & Recently Viewed Files', () => {
  let testUserId: number;
  let testFileIds: number[];
  let testTagIds: number[];

  // Create a test caller
  const createCaller = (userId: number) => {
    const ctx: Context = {
      user: {
        id: userId,
        openId: `test-user-${userId}`,
        name: 'Test User',
        email: 'test@example.com',
        role: 'user',
      },
      req: {} as any,
      res: {} as any,
    };
    return appRouter.createCaller(ctx);
  };

  beforeAll(async () => {
    // Create a test user
    const caller = createCaller(1);
    testUserId = 1;

    // Create test files
    const file1 = await caller.files.create({
      fileKey: `test-file-${Date.now()}-1`,
      url: 'https://example.com/test1.jpg',
      filename: 'test1.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1000,
    });

    const file2 = await caller.files.create({
      fileKey: `test-file-${Date.now()}-2`,
      url: 'https://example.com/test2.jpg',
      filename: 'test2.jpg',
      mimeType: 'image/jpeg',
      fileSize: 2000,
    });

    testFileIds = [file1.id, file2.id];

    // Create test tags
    const tag1 = await caller.tags.create({ name: `test-tag-${Date.now()}-1`, source: 'manual' });
    const tag2 = await caller.tags.create({ name: `test-tag-${Date.now()}-2`, source: 'manual' });
    testTagIds = [tag1.id, tag2.id];

    // Add tags to files
    await caller.bulkOperations.addTags({
      fileIds: testFileIds,
      tagIds: testTagIds,
    });
  });

  describe('Bulk Tag Removal', () => {
    it('should remove tags from multiple files', async () => {
      const caller = createCaller(testUserId);

      const result = await caller.bulkOperations.removeTags({
        fileIds: testFileIds,
        tagIds: [testTagIds[0]], // Remove first tag
      });

      expect(result.filesUntagged).toBe(2);
      expect(result.tagsRemoved).toBe(1);
    });

    it('should handle removing non-existent tags gracefully', async () => {
      const caller = createCaller(testUserId);

      const result = await caller.bulkOperations.removeTags({
        fileIds: testFileIds,
        tagIds: [999999], // Non-existent tag
      });

      expect(result.filesUntagged).toBe(2);
      expect(result.tagsRemoved).toBe(1);
    });

    it('should not remove tags from files belonging to other users', async () => {
      const caller = createCaller(999); // Different user

      const result = await caller.bulkOperations.removeTags({
        fileIds: testFileIds,
        tagIds: testTagIds,
      });

      expect(result.filesUntagged).toBe(0);
      expect(result.tagsRemoved).toBe(2);
    });
  });

  describe('Recently Viewed Files', () => {
    it('should track file views', async () => {
      const caller = createCaller(testUserId);

      const result = await caller.recentlyViewed.trackView({
        fileId: testFileIds[0],
      });

      expect(result.success).toBe(true);
    });

    it('should update viewedAt timestamp on repeated views', async () => {
      const caller = createCaller(testUserId);

      // First view
      await caller.recentlyViewed.trackView({
        fileId: testFileIds[0],
      });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second view
      await caller.recentlyViewed.trackView({
        fileId: testFileIds[0],
      });

      const recentlyViewed = await caller.recentlyViewed.list({ limit: 10 });

      expect(recentlyViewed.length).toBeGreaterThan(0);
      // Check that our test file is in the results
      const testFileInResults = recentlyViewed.find(rv => rv.file.id === testFileIds[0]);
      expect(testFileInResults).toBeDefined();
    });

    it('should return recently viewed files in correct order', async () => {
      const caller = createCaller(testUserId);

      // View files in order
      await caller.recentlyViewed.trackView({ fileId: testFileIds[0] });
      await new Promise(resolve => setTimeout(resolve, 100));
      await caller.recentlyViewed.trackView({ fileId: testFileIds[1] });

      const recentlyViewed = await caller.recentlyViewed.list({ limit: 10 });

      expect(recentlyViewed.length).toBeGreaterThan(0);
      
      // Find both test files in results
      const file0Index = recentlyViewed.findIndex(rv => rv.file.id === testFileIds[0]);
      const file1Index = recentlyViewed.findIndex(rv => rv.file.id === testFileIds[1]);
      
      // Both should be present
      expect(file0Index).toBeGreaterThanOrEqual(0);
      expect(file1Index).toBeGreaterThanOrEqual(0);
      
      // file1 (viewed second) should appear before file0 (viewed first)
      expect(file1Index).toBeLessThan(file0Index);
    });

    it('should respect limit parameter', async () => {
      const caller = createCaller(testUserId);

      const recentlyViewed = await caller.recentlyViewed.list({ limit: 1 });

      expect(recentlyViewed.length).toBeLessThanOrEqual(1);
    });

    it('should only return files viewed by the current user', async () => {
      const caller1 = createCaller(testUserId);
      const caller2 = createCaller(999); // Different user

      await caller1.recentlyViewed.trackView({ fileId: testFileIds[0] });

      const recentlyViewed = await caller2.recentlyViewed.list({ limit: 10 });

      // Should not include files viewed by caller1
      const hasTestFile = recentlyViewed.some(rv => rv.file.id === testFileIds[0]);
      expect(hasTestFile).toBe(false);
    });
  });
});
