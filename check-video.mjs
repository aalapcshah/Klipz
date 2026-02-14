import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  'SELECT id, url, filename, transcodedUrl, transcodeStatus FROM videos WHERE userId = 1 ORDER BY id DESC LIMIT 3'
);
for (const r of rows) {
  console.log(JSON.stringify({
    id: r.id,
    filename: r.filename,
    url: r.url?.substring(0, 120),
    transcodedUrl: r.transcodedUrl?.substring(0, 120),
    transcodeStatus: r.transcodeStatus,
  }));
}
await conn.end();
