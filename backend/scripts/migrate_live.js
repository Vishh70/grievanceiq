const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const password = process.argv[2];
  if (!password) {
    console.error("Please provide your database password as an argument.");
    console.error("Usage: node scripts/migrate_live.js <your_password>");
    process.exit(1);
  }

  const connectionString = `postgresql://postgres:${encodeURIComponent(password)}@db.bvyyeefapmdisxzuttds.supabase.co:5432/postgres`;
  
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("Connecting to Supabase...");
    await client.connect();
    
    const sqlPath = path.join(__dirname, '..', '..', 'docs', 'database', 'ALL_MIGRATIONS.sql');
    console.log("Reading SQL from", sqlPath);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log("Executing migration (this may take a few seconds)...");
    await client.query(sql);
    
    console.log("✅ Migration applied successfully!");
    
    console.log("Verifying schema...");
    const { rows } = await client.query(`
      select table_name 
      from information_schema.tables 
      where table_schema = 'public' 
      and table_name in ('complaints', 'civic_issues', 'routing_results', 'workstreams', 'tasks', 'task_dependencies', 'task_status_history')
    `);
    console.log("Found tables:", rows.map(r => r.table_name).join(', '));
    
  } catch (err) {
    console.error("Migration failed:", err.message);
  } finally {
    await client.end();
  }
}

runMigration();
