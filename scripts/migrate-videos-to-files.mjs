#!/usr/bin/env node
/**
 * Migration script to backfill file entries for existing videos
 * This creates a files table entry for each video that doesn't have a fileId
 */

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from '../drizzle/schema.js';
import { eq, isNull } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

async function main() {
  console.log('🔄 Starting video-to-files migration...\n');

  // Create database connection
  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection, { schema, mode: 'default' });

  try {
    // Find all videos without fileId
    const videosWithoutFileId = await db
      .select()
      .from(schema.videos)
      .where(isNull(schema.videos.fileId));

    console.log(`📊 Found ${videosWithoutFileId.length} videos without fileId\n`);

    if (videosWithoutFileId.length === 0) {
      console.log('✅ No videos need migration. All done!');
      await connection.end();
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    // Process each video
    for (const video of videosWithoutFileId) {
      try {
        console.log(`Processing video ID ${video.id}: ${video.title || video.filename}`);

        // Create file entry
        const [fileResult] = await db.insert(schema.files).values({
          userId: video.userId,
          fileKey: video.fileKey,
          url: video.url,
          filename: video.filename,
          mimeType: 'video/webm',
          fileSize: 0, // Size not tracked for recorded videos
          title: video.title || video.filename,
          description: video.description,
          enrichmentStatus: 'completed', // Skip AI enrichment for recorded videos
          createdAt: video.createdAt,
          updatedAt: video.updatedAt,
        });

        const fileId = Number(fileResult.insertId);

        // Update video with fileId
        await db
          .update(schema.videos)
          .set({ fileId })
          .where(eq(schema.videos.id, video.id));

        console.log(`  ✅ Created file entry ${fileId} and linked to video ${video.id}`);
        successCount++;
      } catch (error) {
        console.error(`  ❌ Error processing video ${video.id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n📈 Migration Summary:`);
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📊 Total: ${videosWithoutFileId.length}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await connection.end();
    console.log('\n🔌 Database connection closed');
  }
}

main()
  .then(() => {
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
