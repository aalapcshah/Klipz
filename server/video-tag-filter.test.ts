import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getVideosByUserId, getVideosCountByUserId, createVideo, createVideoTag, assignTagToVideo } from './db';
import { getDb } from './db';
import { videos, videoTags, videoTagAssignments } from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';

describe('Video Tag Filtering', { timeout: 30000 }, () => {
  const testUserId = 999999;
  let testVideoId1: number;
  let testVideoId2: number;
  let testVideoId3: number;
  let testTagId1: number;
  let testTagId2: number;
  let setupComplete = false;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Clean up any leftover test data from previous runs
    const existingVideos = await db.select({ id: videos.id }).from(videos).where(eq(videos.userId, testUserId));
    for (const v of existingVideos) {
      await db.delete(videoTagAssignments).where(eq(videoTagAssignments.videoId, v.id));
    }
    await db.delete(videoTags).where(eq(videoTags.userId, testUserId));
    await db.delete(videos).where(eq(videos.userId, testUserId));

    const ts = Date.now();

    // Create test videos (fileId is optional, use null to avoid FK issues)
    testVideoId1 = await createVideo({
      userId: testUserId,
      fileKey: `test-videos/vtf-test1-${ts}.mp4`,
      title: 'Test Video 1',
      filename: 'test1.mp4',
      url: 'https://example.com/test1.mp4',
      duration: 120,
    });

    testVideoId2 = await createVideo({
      userId: testUserId,
      fileKey: `test-videos/vtf-test2-${ts}.mp4`,
      title: 'Test Video 2',
      filename: 'test2.mp4',
      url: 'https://example.com/test2.mp4',
      duration: 180,
    });

    testVideoId3 = await createVideo({
      userId: testUserId,
      fileKey: `test-videos/vtf-test3-${ts}.mp4`,
      title: 'Test Video 3',
      filename: 'test3.mp4',
      url: 'https://example.com/test3.mp4',
      duration: 240,
    });

    // Verify videos were created
    const v1 = await db.select().from(videos).where(and(eq(videos.id, testVideoId1), eq(videos.userId, testUserId))).limit(1);
    const v2 = await db.select().from(videos).where(and(eq(videos.id, testVideoId2), eq(videos.userId, testUserId))).limit(1);
    const v3 = await db.select().from(videos).where(and(eq(videos.id, testVideoId3), eq(videos.userId, testUserId))).limit(1);
    
    if (!v1.length || !v2.length || !v3.length) {
      throw new Error(`Videos not created properly: v1=${v1.length}, v2=${v2.length}, v3=${v3.length}`);
    }

    // Create test tags
    testTagId1 = await createVideoTag({
      userId: testUserId,
      name: `Tutorial-${ts}`,
      color: '#FF5733',
    });

    testTagId2 = await createVideoTag({
      userId: testUserId,
      name: `Review-${ts}`,
      color: '#33FF57',
    });

    // Assign tags to videos
    // Video 1: Tutorial
    await assignTagToVideo(testVideoId1, testTagId1, testUserId);
    
    // Video 2: Tutorial and Review
    await assignTagToVideo(testVideoId2, testTagId1, testUserId);
    await assignTagToVideo(testVideoId2, testTagId2, testUserId);
    
    // Video 3: Review only
    await assignTagToVideo(testVideoId3, testTagId2, testUserId);
    
    setupComplete = true;
  });

  afterAll(async () => {
    // Clean up test data for this user only
    const db = await getDb();
    if (db) {
      const existingVideos = await db.select({ id: videos.id }).from(videos).where(eq(videos.userId, testUserId));
      for (const v of existingVideos) {
        await db.delete(videoTagAssignments).where(eq(videoTagAssignments.videoId, v.id));
      }
      await db.delete(videoTags).where(eq(videoTags.userId, testUserId));
      await db.delete(videos).where(eq(videos.userId, testUserId));
    }
  });

  it('should return all videos when no tag filter is applied', async () => {
    expect(setupComplete).toBe(true);
    const allVideos = await getVideosByUserId(testUserId, 10, 0, 'date', '', undefined);
    expect(allVideos.length).toBe(3);
  });

  it('should filter videos by Tutorial tag', async () => {
    const tutorialVideos = await getVideosByUserId(testUserId, 10, 0, 'date', '', [testTagId1]);
    expect(tutorialVideos.length).toBe(2);
    expect(tutorialVideos.some(v => v.id === testVideoId1)).toBe(true);
    expect(tutorialVideos.some(v => v.id === testVideoId2)).toBe(true);
    expect(tutorialVideos.some(v => v.id === testVideoId3)).toBe(false);
  });

  it('should filter videos by Review tag', async () => {
    const reviewVideos = await getVideosByUserId(testUserId, 10, 0, 'date', '', [testTagId2]);
    expect(reviewVideos.length).toBe(2);
    expect(reviewVideos.some(v => v.id === testVideoId2)).toBe(true);
    expect(reviewVideos.some(v => v.id === testVideoId3)).toBe(true);
    expect(reviewVideos.some(v => v.id === testVideoId1)).toBe(false);
  });

  it('should return correct count when filtering by tag', async () => {
    const tutorialCount = await getVideosCountByUserId(testUserId, '', [testTagId1]);
    expect(tutorialCount).toBe(2);

    const reviewCount = await getVideosCountByUserId(testUserId, '', [testTagId2]);
    expect(reviewCount).toBe(2);

    const allCount = await getVideosCountByUserId(testUserId, '', undefined);
    expect(allCount).toBe(3);
  });

  it('should combine search and tag filtering', async () => {
    const searchAndTagResults = await getVideosByUserId(testUserId, 10, 0, 'date', 'Video 2', [testTagId1]);
    expect(searchAndTagResults.length).toBe(1);
    expect(searchAndTagResults[0].id).toBe(testVideoId2);
  });

  it('should return empty array for non-existent tag', async () => {
    const nonExistentTagVideos = await getVideosByUserId(testUserId, 10, 0, 'date', '', [999999]);
    expect(nonExistentTagVideos.length).toBe(0);
  });
});
