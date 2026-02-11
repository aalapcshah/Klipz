/**
 * One-time script to generate a thumbnail for an existing video file.
 * Usage: node server/scripts/generateThumbnail.mjs <fileId>
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import mysql from 'mysql2/promise';

const execFileAsync = promisify(execFile);

const fileId = parseInt(process.argv[2]);
if (!fileId) {
  console.error('Usage: node server/scripts/generateThumbnail.mjs <fileId>');
  process.exit(1);
}

const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

async function storagePut(relKey, buffer, contentType) {
  const key = relKey.replace(/^\/+/, '');
  const uploadUrl = new URL('v1/storage/upload', ensureTrailingSlash(FORGE_API_URL));
  uploadUrl.searchParams.set('path', key);
  
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: contentType }), path.basename(key));
  
  const resp = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${FORGE_API_KEY}` },
    body: formData,
  });
  
  if (!resp.ok) throw new Error(`Storage upload failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return { key, url: data.url };
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Get the file record
  const [rows] = await conn.execute(
    'SELECT id, url, filename, userId, mimeType, thumbnailUrl FROM files WHERE id = ?',
    [fileId]
  );
  
  if (rows.length === 0) {
    console.error(`File ${fileId} not found`);
    process.exit(1);
  }
  
  const file = rows[0];
  console.log(`File: ${file.filename} (${file.mimeType})`);
  console.log(`URL: ${file.url.substring(0, 80)}...`);
  
  if (file.thumbnailUrl) {
    console.log(`Already has thumbnail: ${file.thumbnailUrl.substring(0, 80)}...`);
    console.log('Regenerating...');
  }
  
  if (!file.url.startsWith('http')) {
    console.error('File URL is not a direct HTTP URL (still using streaming endpoint?)');
    process.exit(1);
  }
  
  // Generate thumbnail with FFmpeg
  const tmpDir = os.tmpdir();
  const outputFile = path.join(tmpDir, `thumb-${Date.now()}.jpg`);
  
  try {
    console.log('Extracting frame with FFmpeg...');
    await execFileAsync('ffmpeg', [
      '-ss', '1',
      '-i', file.url,
      '-vframes', '1',
      '-vf', 'scale=640:-1',
      '-q:v', '5',
      '-y',
      outputFile,
    ], { timeout: 30000 });
    
    const stats = fs.statSync(outputFile);
    console.log(`Frame extracted (${(stats.size / 1024).toFixed(1)}KB)`);
    
    // Upload to S3
    const thumbnailBuffer = fs.readFileSync(outputFile);
    const baseName = path.basename(file.filename, path.extname(file.filename));
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const thumbnailKey = `user-${file.userId}/thumbnails/${timestamp}-${randomSuffix}-${baseName}.jpg`;
    
    console.log(`Uploading to S3 as ${thumbnailKey}...`);
    const result = await storagePut(thumbnailKey, thumbnailBuffer, 'image/jpeg');
    
    console.log(`Thumbnail URL: ${result.url.substring(0, 80)}...`);
    
    // Update file record
    await conn.execute(
      'UPDATE files SET thumbnailUrl = ?, thumbnailKey = ? WHERE id = ?',
      [result.url, thumbnailKey, fileId]
    );
    console.log('Updated file record');
    
    // Also update video record if exists
    const [videoRows] = await conn.execute(
      'SELECT id FROM videos WHERE fileId = ?',
      [fileId]
    );
    if (videoRows.length > 0) {
      await conn.execute(
        'UPDATE videos SET thumbnailUrl = ?, thumbnailKey = ? WHERE fileId = ?',
        [result.url, thumbnailKey, fileId]
      );
      console.log('Updated video record');
    }
    
    console.log('✅ Done!');
  } finally {
    try { fs.unlinkSync(outputFile); } catch {}
    await conn.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
