const path = require('path');
const { createRequire } = require('module');
const sql = createRequire(path.join(__dirname, '..', 'backend', 'package.json'))('mssql');

const cfg = {
  server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587,
  database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 30000, requestTimeout: 60000,
};

async function main() {
  const pool = await sql.connect(cfg);

  // Склады
  const wh = await pool.request().query(`SELECT id, code, name, is_active FROM warehouses ORDER BY code`);
  console.log('\n=== warehouses ===');
  console.table(wh.recordset);

  // operations по складам
  const ops = await pool.request().query(`
    SELECT warehouse_code,
           COUNT(*) AS records,
           MIN(CAST(operation_date AS DATE)) AS min_date,
           MAX(CAST(operation_date AS DATE)) AS max_date,
           COUNT(DISTINCT user_id) AS users,
           SUM(CASE WHEN ISNULL(amount,0)>0 THEN 1 ELSE 0 END) AS with_amount
    FROM operations
    GROUP BY warehouse_code ORDER BY warehouse_code
  `);
  console.log('\n=== operations по складам ===');
  console.table(ops.recordset);

  // sap_raw
  const raw = await pool.request().query(`
    SELECT sync_batch,
           COUNT(*) AS total,
           SUM(CASE WHEN parsed_skipped=0 THEN 1 ELSE 0 END) AS parsed_ok,
           SUM(CASE WHEN wcr_known=1 THEN 1 ELSE 0 END) AS wcr_known,
           SUM(CASE WHEN user_found=1 THEN 1 ELSE 0 END) AS user_found
    FROM sap_raw GROUP BY sync_batch ORDER BY sync_batch
  `);
  console.log('\n=== sap_raw по batch ===');
  console.table(raw.recordset);

  await pool.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
