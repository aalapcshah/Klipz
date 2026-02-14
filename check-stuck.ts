import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env', 'utf8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=(.*)/);
  if (m) envVars[m[1].trim()] = m[2].trim();
});

async function main() {
  const conn = await mysql.createConnection(envVars.DATABASE_URL);
  const [rows] = await conn.execute(`
    SELECT id, sessionToken, filename, fileSize, assemblyPhase, assemblyProgress, assemblyTotalChunks, 
      finalFileUrl IS NOT NULL as hasFinalUrl,
      (SELECT COUNT(*) FROM resumable_upload_chunks c WHERE c.sessionId = resumable_upload_sessions.id) as chunkCount
    FROM resumable_upload_sessions 
    WHERE status = 'completed' AND (assemblyPhase IS NULL OR assemblyPhase NOT IN ('complete'))
    ORDER BY id DESC LIMIT 15
  `);
  (rows as any[]).forEach((r: any) => console.log(`id=${r.id} file=${r.filename} size=${r.fileSize} phase=${r.assemblyPhase} progress=${r.assemblyProgress}/${r.assemblyTotalChunks} chunks=${r.chunkCount} hasFinalUrl=${r.hasFinalUrl}`));
  await conn.end();
}
main();
