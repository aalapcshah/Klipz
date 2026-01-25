import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getVideosByUserId, getVideosCountByUserId, createVideo, createVideoTag, assignTagToVideo } from './db';
import { getDb } from './db';
import { videos, videoTags, videoTagAssignments } from '../drizzle/schema';

describe('Video Tag Filtering', () => {
  let testUserId: number;
  let testVideoId1: number;
  let testVideoId2: number;
  let testVideoId3: number;
  let testTagId1: number;
  let testTagId2: number;

  beforeAll(async () => {
    // Create a test user
    testUserId = 999999;

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

    // Assign tags to videos
    // Video 1: Tutorial
    await assignTagToVideo(testVideoId1, testTagId1, testUserId);
    
    // Video 2: Tutorial and Review
    await assignTagToVideo(testVideoId2, testTagId1, testUserId);
    await assignTagToVideo(testVideoId2, testTagId2, testUserId);
    
    // Video 3: Review only
    await assignTagToVideo(testVideoId3, testTagId2, testUserId);
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

  it('should return all videos when no tag filter is applied', async () => {
    const allVideos = await getVideosByUserId(testUserId, 10, 0, 'date', '', undefined);
    expect(allVideos.length).toBe(3);
  });

  it('should filter videos by Tutorial tag', async () => {
    const tutorialVideos = await getVideosByUserId(testUserId, 10, 0, 'date', '', testTagId1);
    expect(tutorialVideos.length).toBe(2);
    expect(tutorialVideos.some(v => v.id === testVideoId1)).toBe(true);
    expect(tutorialVideos.some(v => v.id === testVideoId2)).toBe(true);
    expect(tutorialVideos.some(v => v.id === testVideoId3)).toBe(false);
  });

  it('should filter videos by Review tag', async () => {
    const reviewVideos = await getVideosByUserId(testUserId, 10, 0, 'date', '', testTagId2);
    expect(reviewVideos.length).toBe(2);
    expect(reviewVideos.some(v => v.id === testVideoId2)).toBe(true);
    expect(reviewVideos.some(v => v.id === testVideoId3)).toBe(true);
    expect(reviewVideos.some(v => v.id === testVideoId1)).toBe(false);
  });

  it('should return correct count when filtering by tag', async () => {
    const tutorialCount = await getVideosCountByUserId(testUserId, '', testTagId1);
    expect(tutorialCount).toBe(2);

    const reviewCount = await getVideosCountByUserId(testUserId, '', testTagId2);
    expect(reviewCount).toBe(2);

    const allCount = await getVideosCountByUserId(testUserId, '', undefined);
    expect(allCount).toBe(3);
  });

  it('should combine search and tag filtering', async () => {
    const searchAndTagResults = await getVideosByUserId(testUserId, 10, 0, 'date', 'Video 2', testTagId1);
    expect(searchAndTagResults.length).toBe(1);
    expect(searchAndTagResults[0].id).toBe(testVideoId2);
  });

  it('should return empty array for non-existent tag', async () => {
    const nonExistentTagVideos = await getVideosByUserId(testUserId, 10, 0, 'date', '', 999999);
    expect(nonExistentTagVideos.length).toBe(0);
  });
});
