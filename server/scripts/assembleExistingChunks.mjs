/**
 * One-time script to trigger background assembly for existing chunk-based files.
 * This assembles chunks into a single S3 file so videos can play on production.
 * 
 * Usage: node server/scripts/assembleExistingChunks.mjs
 */

import mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DATABASE_URL = process.env.DATABASE_URL;
const FORGE_API_URL = (process.env.BUILT_IN_FORGE_API_URL || '').replace(/\/+$/, '');
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!DATABASE_URL || !FORGE_API_URL || !FORGE_API_KEY) {
  console.error('Missing required environment variables: DATABASE_URL, BUILT_IN_FORGE_API_URL, BUILT_IN_FORGE_API_KEY');
  process.exit(1);
}

function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, '');
}

async function storageGetUrl(relKey) {
  const key = normalizeKey(relKey);
  const downloadApiUrl = new URL('v1/storage/downloadUrl', FORGE_API_URL + '/');
  downloadApiUrl.searchParams.set('path', key);
  const response = await fetch(downloadApiUrl, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${FORGE_API_KEY}` },
  });
  if (!response.ok) throw new Error(`storageGet failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return data.url;
}

async function storagePutBuffer(relKey, buffer, contentType) {
  const key = normalizeKey(relKey);
  const uploadUrl = new URL('v1/storage/upload', FORGE_API_URL + '/');
  uploadUrl.searchParams.set('path', key);
  
  const blob = new Blob([buffer], { type: contentType });
  const form = new FormData();
  form.append('file', blob, key.split('/').pop() || 'file');
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${FORGE_API_KEY}` },
    body: form,
  });
  
  if (!response.ok) {
    const msg = await response.text().catch(() => response.statusText);
    throw new Error(`storagePut failed (${response.status}): ${msg}`);
  }
  
  const data = await response.json();
  return { key, url: data.url };
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  // Find all completed sessions that still use streaming URLs
  const [sessions] = await conn.execute(`
    SELECT s.id, s.sessionToken, s.filename, s.mimeType, s.fileSize, s.uploadType, s.userId, s.chunkSize
    FROM resumable_upload_sessions s
    WHERE s.status = 'completed'
    AND (s.finalFileUrl LIKE '/api/files/stream/%' OR s.finalFileUrl IS NULL)
  `);
  
  console.log(`Found ${sessions.length} sessions that need assembly`);
  
  for (const session of sessions) {
    const fileSizeMB = (Number(session.fileSize) / 1024 / 1024).toFixed(1);
    console.log(`\nProcessing: ${session.filename} (${fileSizeMB}MB, session ${session.id})`);
    
    // Get chunks
    const [chunks] = await conn.execute(
      'SELECT chunkIndex, storageKey FROM resumable_upload_chunks WHERE sessionId = ? ORDER BY chunkIndex',
      [session.id]
    );
    
    if (chunks.length === 0) {
      console.log('  No chunks found, skipping');
      continue;
    }
    
    console.log(`  ${chunks.length} chunks to assemble`);
    
    // Create temp file
    const tmpFile = path.join(os.tmpdir(), `assembly-${session.sessionToken}-${Date.now()}`);
    const writeStream = fs.createWriteStream(tmpFile);
    let totalBytes = 0;
    
    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const url = await storageGetUrl(chunk.storageKey);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch chunk ${i}: HTTP ${response.status}`);
        
        const buffer = Buffer.from(await response.arrayBuffer());
        await new Promise((resolve, reject) => {
          const canContinue = writeStream.write(buffer, (err) => { if (err) reject(err); });
          if (!canContinue) writeStream.once('drain', resolve);
          else resolve();
        });
        
        totalBytes += buffer.length;
        if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
          console.log(`  Progress: ${i + 1}/${chunks.length} chunks (${(totalBytes / 1024 / 1024).toFixed(1)}MB)`);
        }
      }
      
      await new Promise((resolve) => writeStream.end(resolve));
      console.log(`  All chunks written to temp file (${(totalBytes / 1024 / 1024).toFixed(1)}MB)`);
      
      // Read and upload
      const assembledBuffer = fs.readFileSync(tmpFile);
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const folder = session.uploadType === 'video' ? 'videos' : 'files';
      const finalFileKey = `user-${session.userId}/${folder}/${timestamp}-${randomSuffix}-${session.filename}`;
      
      console.log(`  Uploading to S3 as ${finalFileKey} (${(assembledBuffer.length / 1024 / 1024).toFixed(1)}MB)...`);
      const result = await storagePutBuffer(finalFileKey, assembledBuffer, session.mimeType);
      console.log(`  S3 upload complete: ${result.url.substring(0, 100)}...`);
      
      // Update database
      await conn.execute(
        'UPDATE resumable_upload_sessions SET finalFileKey = ?, finalFileUrl = ? WHERE id = ?',
        [finalFileKey, result.url, session.id]
      );
      
      // Update files table
      const [fileUpdateResult] = await conn.execute(
        'UPDATE files SET url = ?, fileKey = ? WHERE url = ?',
        [result.url, finalFileKey, `/api/files/stream/${session.sessionToken}`]
      );
      console.log(`  Updated ${fileUpdateResult.affectedRows} file records`);
      
      // Update videos table if applicable
      const [videoUpdateResult] = await conn.execute(
        'UPDATE videos SET url = ?, fileKey = ? WHERE url = ?',
        [result.url, finalFileKey, `/api/files/stream/${session.sessionToken}`]
      );
      console.log(`  Updated ${videoUpdateResult.affectedRows} video records`);
      
      console.log(`  ✅ Assembly complete. File now served from S3 directly.`);
      
    } catch (err) {
      console.error(`  ❌ Assembly failed:`, err.message);
    } finally {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
    }
  }
  
  await conn.end();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
