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
    const sqlFile = path.join(__dirname, 'migrations', '012_add_prod_count_and_picking_norms.sql');
    const content = fs.readFileSync(sqlFile, 'utf8');

    const batches = content
      .split(/^\s*GO\s*$/im)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    console.log(`Running ${batches.length} batches...`);

    for (let i = 0; i < batches.length; i++) {
      try {
        const result = await pool.request().query(batches[i]);
        if (result.recordset && result.recordset.length > 0) {
          console.table(result.recordset.slice(0, 3));
        }
      } catch (err) {
        console.error(`Batch ${i + 1} error:`, err.message);
        throw err;
      }
    }

    const [c1, c2, c3] = await Promise.all([
      pool.request().query('SELECT COUNT(*) AS n FROM wcr_picking_norms'),
      pool.request().query("SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='operations' AND COLUMN_NAME='prod_count'"),
      pool.request().query("SELECT OBJECT_ID('norms_stats_snapshot', 'U') AS oid"),
    ]);

    console.log('\n✅ Итог:');
    console.log('  wcr_picking_norms rows: ', c1.recordset[0].n);
    console.log('  operations.prod_count:  ', c2.recordset[0].n ? 'ЕСТЬ' : 'НЕТ');
    console.log('  norms_stats_snapshot:   ', c3.recordset[0].oid ? 'таблица существует' : 'таблица НЕ НАЙДЕНА');
  } finally {
    await pool.close();
  }
}

run().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
