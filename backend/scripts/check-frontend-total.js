const sql = require('mssql');
const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  user: 'sa',
  password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
};

async function run() {
  const pool = await sql.connect(config);
  
  const res = await pool.request().query(`
    SELECT
      u.fio,
      ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount ELSE 0 END), 0) +
      ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL AND wp.rate IS NOT NULL
                      THEN ISNULL(o.prod_count, 0) * wp.rate ELSE 0 END), 0) AS total_amount
    FROM operations o
    INNER JOIN users u ON o.user_id = u.id
    LEFT JOIN wcr_norms wn ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
    LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01'
      AND (wn.wcr_code IS NOT NULL OR wp.wcr_code IS NOT NULL)
    GROUP BY u.fio
    HAVING ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount ELSE 0 END), 0) +
           ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL AND wp.rate IS NOT NULL
                           THEN ISNULL(o.prod_count, 0) * wp.rate ELSE 0 END), 0) > 0.1
    ORDER BY total_amount DESC
  `);
  
  console.log('Total entries:', res.recordset.length);
  
  let grandTotal = 0;
  for (const row of res.recordset) {
    grandTotal += row.total_amount;
  }
  
  console.log('Grand Total:', grandTotal.toFixed(2));
  
  pool.close();
}

run().catch(console.error);