/**
 * inspect_users.js — Database schema inspection utility
 * 
 * Usage: DATABASE_URL=postgresql://... node scripts/inspect_users.js
 * 
 * NEVER hardcode credentials. Always use environment variables.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  console.error('Usage: DATABASE_URL=postgresql://user:pass@host:port/db node scripts/inspect_users.js');
  process.exit(1);
}

const client = new Client({ connectionString });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name, data_type, character_maximum_length, column_default, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'users';
  `);
  console.table(res.rows);
  await client.end();
}

run().catch(err => {
  console.error('Query failed:', err.message);
  process.exit(1);
});
