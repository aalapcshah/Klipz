import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL || '';
const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
if (match) {
  const [_, user, pass, host, port, db] = match;
  const conn = await mysql.createConnection({
    host, 
    port: parseInt(port), 
    user, 
    password: pass, 
    database: db, 
    ssl: {rejectUnauthorized: false}
  });
  const [rows] = await conn.query('SELECT id, name, role, subscriptionTier, subscriptionExpiresAt FROM users WHERE id = 1');
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
}
