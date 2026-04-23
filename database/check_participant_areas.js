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
  const r = await pool.request().query(`
    SELECT
      participant_area,
      COUNT(*) AS ops,
      ROUND(SUM(amount),2) AS total_amount,
      COUNT(DISTINCT warehouse_code) AS warehouses
    FROM operations
    WHERE operation_date >= '2026-03-01' AND operation_date < '2026-04-01'
      AND ISNULL(amount,0) > 0
    GROUP BY participant_area
    ORDER BY total_amount DESC
  `);
  console.log('=== participant_area в марте (amount > 0) ===');
  console.table(r.recordset);
  await pool.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
