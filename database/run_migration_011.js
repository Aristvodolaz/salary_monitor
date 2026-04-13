const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
// mssql установлен в backend, не в database/
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
    const sqlFile = path.join(__dirname, 'migrations', '011_add_wcr_norms.sql');
    const content = fs.readFileSync(sqlFile, 'utf8');

    // Split by GO statements (SQL Server batch separator)
    const batches = content
      .split(/^\s*GO\s*$/im)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    console.log(`Running ${batches.length} batches...`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const result = await pool.request().query(batch);
        if (result.recordset && result.recordset.length > 0) {
          console.table(result.recordset.slice(0, 5));
          if (result.recordset.length > 5)
            console.log(`  ... and ${result.recordset.length - 5} more rows`);
        }
      } catch (err) {
        console.error(`Batch ${i + 1} error:`, err.message);
        throw err;
      }
    }

    // Verify
    const check = await pool.request().query(
      'SELECT COUNT(*) AS total FROM wcr_norms'
    );
    console.log('\n✅ Done! wcr_norms rows:', check.recordset[0].total);
  } finally {
    await pool.close();
  }
}

run().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
