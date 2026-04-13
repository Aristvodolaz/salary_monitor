const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const sql = createRequire(path.join(__dirname, '..', 'backend', 'package.json'))('mssql');

const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  user: 'sa',
  password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 30000,
  requestTimeout: 60000,
};

async function run() {
  console.log('Connecting to DB...');
  const pool = await sql.connect(config);

  try {
    const sqlFile = path.join(__dirname, 'migrations', '014_add_norms_employees_snapshot.sql');
    const content = fs.readFileSync(sqlFile, 'utf8');

    const batches = content
      .split(/^\s*GO\s*$/im)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    console.log(`Running ${batches.length} batches from 014...`);

    for (let i = 0; i < batches.length; i++) {
      try {
        await pool.request().query(batches[i]);
      } catch (err) {
        console.error(`Batch ${i + 1} error:`, err.message);
        throw err;
      }
    }

    const check = await pool.request().query(
      "SELECT OBJECT_ID('norms_employees_snapshot', 'U') AS oid",
    );
    console.log('\n✅ Migration 014 done. norms_employees_snapshot:', check.recordset[0].oid ? 'exists' : 'missing');
  } finally {
    await pool.close();
  }
}

run().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
