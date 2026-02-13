import 'dotenv/config';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  const [rows] = await conn.execute(
    'SELECT id, title, LEFT(url, 200) as url_prefix, mimeType, fileSize FROM files WHERE mimeType LIKE ? ORDER BY id DESC LIMIT 5',
    ['video/%']
  );
  console.log(JSON.stringify(rows, null, 2));
  
  // Also check video_transcripts
  const [transcripts] = await conn.execute(
    'SELECT id, fileId, status, errorMessage FROM video_transcripts ORDER BY id DESC LIMIT 5'
  );
  console.log('\nTranscripts:');
  console.log(JSON.stringify(transcripts, null, 2));
  
  // Also check visual_captions
  const [captions] = await conn.execute(
    'SELECT id, fileId, status, errorMessage FROM visual_captions ORDER BY id DESC LIMIT 5'
  );
  console.log('\nVisual Captions:');
  console.log(JSON.stringify(captions, null, 2));
  
  await conn.end();
}

main().catch(console.error);
