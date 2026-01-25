import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getVideosByUserId, getVideosCountByUserId, createVideo, createVideoTag, assignTagToVideo } from './db';
import { getDb } from './db';
import { videos, videoTags, videoTagAssignments } from '../drizzle/schema';

describe('Multi-Tag Filtering with AND/OR Logic', () => {
  let testUserId: number;
  let testVideoId1: number;
  let testVideoId2: number;
  let testVideoId3: number;
  let testVideoId4: number;
  let testTagId1: number; // Tutorial
  let testTagId2: number; // Review
  let testTagId3: number; // Advanced

  beforeAll(async () => {
    // Create a test user
    testUserId = 888888;

    // Create test videos
    testVideoId1 = await createVideo({
      userId: testUserId,
      fileId: 1,
      fileKey: 'test-videos/test1.mp4',
      title: 'Test Video 1',
      filename: 'test1.mp4',
      url: 'https://example.com/test1.mp4',
      duration: 120,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    testVideoId2 = await createVideo({
      userId: testUserId,
      fileId: 2,
      fileKey: 'test-videos/test2.mp4',
      title: 'Test Video 2',
      filename: 'test2.mp4',
      url: 'https://example.com/test2.mp4',
      duration: 180,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    testVideoId3 = await createVideo({
      userId: testUserId,
      fileId: 3,
      fileKey: 'test-videos/test3.mp4',
      title: 'Test Video 3',
      filename: 'test3.mp4',
      url: 'https://example.com/test3.mp4',
      duration: 240,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    testVideoId4 = await createVideo({
      userId: testUserId,
      fileId: 4,
      fileKey: 'test-videos/test4.mp4',
      title: 'Test Video 4',
      filename: 'test4.mp4',
      url: 'https://example.com/test4.mp4',
      duration: 300,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create test tags
    testTagId1 = await createVideoTag({
      userId: testUserId,
      name: 'Tutorial',
      color: '#FF5733',
      createdAt: new Date(),
    });

    testTagId2 = await createVideoTag({
      userId: testUserId,
      name: 'Review',
      color: '#33FF57',
      createdAt: new Date(),
    });

    testTagId3 = await createVideoTag({
      userId: testUserId,
      name: 'Advanced',
      color: '#3357FF',
      createdAt: new Date(),
    });

    // Assign tags to videos
    // Video 1: Tutorial
    await assignTagToVideo(testVideoId1, testTagId1, testUserId);
    
    // Video 2: Tutorial + Review
    await assignTagToVideo(testVideoId2, testTagId1, testUserId);
    await assignTagToVideo(testVideoId2, testTagId2, testUserId);
    
    // Video 3: Tutorial + Review + Advanced
    await assignTagToVideo(testVideoId3, testTagId1, testUserId);
    await assignTagToVideo(testVideoId3, testTagId2, testUserId);
    await assignTagToVideo(testVideoId3, testTagId3, testUserId);
    
    // Video 4: Advanced only
    await assignTagToVideo(testVideoId4, testTagId3, testUserId);
  });

  afterAll(async () => {
    // Clean up test data
    const db = await getDb();
    if (db) {
      await db.delete(videoTagAssignments).where();
      await db.delete(videoTags).where();
      await db.delete(videos).where();
    }
  });

  it('should filter videos with OR logic (any tag)', async () => {
    // Filter by Tutorial OR Review (should return videos 1, 2, 3)
    const results = await getVideosByUserId(testUserId, 10, 0, 'date', '', [testTagId1, testTagId2], 'OR');
    expect(results.length).toBe(3);
    const videoIds = results.map(v => v.id);
    expect(videoIds).toContain(testVideoId1);
    expect(videoIds).toContain(testVideoId2);
    expect(videoIds).toContain(testVideoId3);
    expect(videoIds).not.toContain(testVideoId4);
  });

  it('should filter videos with AND logic (all tags)', async () => {
    // Filter by Tutorial AND Review (should return videos 2, 3 only)
    const results = await getVideosByUserId(testUserId, 10, 0, 'date', '', [testTagId1, testTagId2], 'AND');
    expect(results.length).toBe(2);
    const videoIds = results.map(v => v.id);
    expect(videoIds).toContain(testVideoId2);
    expect(videoIds).toContain(testVideoId3);
    expect(videoIds).not.toContain(testVideoId1);
    expect(videoIds).not.toContain(testVideoId4);
  });

  it('should filter videos with AND logic for 3 tags', async () => {
    // Filter by Tutorial AND Review AND Advanced (should return video 3 only)
    const results = await getVideosByUserId(testUserId, 10, 0, 'date', '', [testTagId1, testTagId2, testTagId3], 'AND');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(testVideoId3);
  });

  it('should return correct count with OR logic', async () => {
    const count = await getVideosCountByUserId(testUserId, '', [testTagId1, testTagId2], 'OR');
    expect(count).toBe(3);
  });

  it('should return correct count with AND logic', async () => {
    const count = await getVideosCountByUserId(testUserId, '', [testTagId1, testTagId2], 'AND');
    expect(count).toBe(2);
  });

  it('should handle single tag filter (OR mode by default)', async () => {
    const results = await getVideosByUserId(testUserId, 10, 0, 'date', '', [testTagId3], 'OR');
    expect(results.length).toBe(2); // Videos 3 and 4
    const videoIds = results.map(v => v.id);
    expect(videoIds).toContain(testVideoId3);
    expect(videoIds).toContain(testVideoId4);
  });

  it('should combine search and multi-tag filtering', async () => {
    // Search for "Video 2" with Tutorial OR Review filter
    const results = await getVideosByUserId(testUserId, 10, 0, 'date', 'Video 2', [testTagId1, testTagId2], 'OR');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(testVideoId2);
  });
});
