/**
 * Targeted script to assemble a specific session's chunks into a single S3 file.
 * 
 * Usage: node server/scripts/assembleOneFile.mjs <sessionToken>
 */

import mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const sessionToken = process.argv[2];
if (!sessionToken) {
  console.error('Usage: node server/scripts/assembleOneFile.mjs <sessionToken>');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
const FORGE_API_URL = (process.env.BUILT_IN_FORGE_API_URL || '').replace(/\/+$/, '');
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!DATABASE_URL || !FORGE_API_URL || !FORGE_API_KEY) {
  console.error('Missing required environment variables');
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
  if (!response.ok) throw new Error(`storageGet failed: ${response.status}`);
  return (await response.json()).url;
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
  
  return (await response.json()).url;
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  const [sessions] = await conn.execute(
    'SELECT id, sessionToken, filename, mimeType, fileSize, uploadType, userId, chunkSize FROM resumable_upload_sessions WHERE sessionToken = ?',
    [sessionToken]
  );
  
  if (sessions.length === 0) {
    console.error('Session not found:', sessionToken);
    process.exit(1);
  }
  
  const session = sessions[0];
  const fileSizeMB = (Number(session.fileSize) / 1024 / 1024).toFixed(1);
  console.log(`Session: ${session.filename} (${fileSizeMB}MB, ${session.mimeType})`);
  
  // Get chunks
  const [chunks] = await conn.execute(
    'SELECT chunkIndex, storageKey FROM resumable_upload_chunks WHERE sessionId = ? ORDER BY chunkIndex',
    [session.id]
  );
  
  console.log(`${chunks.length} chunks to assemble`);
  
  // Create temp file and assemble
  const tmpFile = path.join(os.tmpdir(), `assembly-${sessionToken}-${Date.now()}`);
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
        console.log(`Progress: ${i + 1}/${chunks.length} chunks (${(totalBytes / 1024 / 1024).toFixed(1)}MB)`);
      }
    }
    
    await new Promise((resolve) => writeStream.end(resolve));
    console.log(`All chunks assembled (${(totalBytes / 1024 / 1024).toFixed(1)}MB)`);
    
    // Read and upload
    const assembledBuffer = fs.readFileSync(tmpFile);
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const folder = session.uploadType === 'video' ? 'videos' : 'files';
    const finalFileKey = `user-${session.userId}/${folder}/${timestamp}-${randomSuffix}-${session.filename}`;
    
    console.log(`Uploading to S3 as ${finalFileKey}...`);
    const resultUrl = await storagePutBuffer(finalFileKey, assembledBuffer, session.mimeType);
    console.log(`S3 upload complete: ${resultUrl.substring(0, 100)}...`);
    
    // Update session
    await conn.execute(
      'UPDATE resumable_upload_sessions SET finalFileKey = ?, finalFileUrl = ? WHERE id = ?',
      [finalFileKey, resultUrl, session.id]
    );
    console.log('Updated session record');
    
    // Update files table
    const streamUrl = `/api/files/stream/${sessionToken}`;
    const [fileResult] = await conn.execute(
      'UPDATE files SET url = ?, fileKey = ? WHERE url = ?',
      [resultUrl, finalFileKey, streamUrl]
    );
    console.log(`Updated ${fileResult.affectedRows} file records`);
    
    // Update videos table
    const [videoResult] = await conn.execute(
      'UPDATE videos SET url = ?, fileKey = ? WHERE url = ?',
      [resultUrl, finalFileKey, streamUrl]
    );
    console.log(`Updated ${videoResult.affectedRows} video records`);
    
    console.log(`\n✅ Done! File now served from: ${resultUrl}`);
    
  } finally {
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
  }
  
  await conn.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
