const sql = require('mssql');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const password = env.match(/^DB_PASSWORD=(.*)$/m)[1].trim();

(async () => {
  const pool = await sql.connect({
    server: 'PRM-SRV-MSSQL-01.komus.net',
    port: 59587,
    database: 'SalaryMonitor',
    user: 'sa',
    password,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 20000,
    requestTimeout: 120000,
  });

  const tot = await pool.request().query(`
    SELECT
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt,
      COUNT(*) n
    FROM operations o
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
  `);
  console.log('PICKING_JULY', JSON.stringify(tot.recordset[0]));

  const tot01ss = await pool.request().query(`
    SELECT
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt,
      COUNT(*) n
    FROM operations o
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.warehouse_code = '01SS'
  `);
  console.log('PICKING_JULY_01SS', JSON.stringify(tot01ss.recordset[0]));

  const w = await pool.request().query(`
    SELECT TOP 20
      o.wcr_code,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt,
      MAX(wp.rate) AS rate
    FROM operations o
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
    GROUP BY o.wcr_code
    ORDER BY SUM(CAST(ISNULL(o.count,0) AS FLOAT)) DESC
  `);
  console.log('TOP_WCR', JSON.stringify(w.recordset, null, 2));

  const p2 = await pool.request().query(`
    SELECT
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod
    FROM operations o
    WHERE o.wcr_code = 'P2M2'
      AND o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
  `);
  console.log('P2M2', JSON.stringify(p2.recordset[0]));

  await pool.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
