const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:janu%40Baby7066@db.bvyyeefapmdisxzuttds.supabase.co:5432/postgres'
});

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

run().catch(console.error);
