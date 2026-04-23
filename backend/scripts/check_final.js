const sql = require('mssql');

const DB = {
  server:   'PRM-SRV-MSSQL-01.komus.net',
  port:     59587,
  user:     'sa',
  password: 'icY2eGuyfU',
  database: 'SalaryMonitor',
  options:  { encrypt: false, trustServerCertificate: true },
};

async function main() {
  const pool = await sql.connect(DB);
  const result = await pool.request().query(`
      SELECT
        u.employee_id,
        u.fio,
        ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount ELSE 0 END), 0) +
        ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL AND wp.rate IS NOT NULL
                        THEN ISNULL(o.prod_count, 0) * wp.rate 
                        WHEN wp.wcr_code IS NOT NULL AND wp.rate IS NULL
                        THEN ISNULL(o.amount, 0)
                        ELSE 0 END), 0) AS total_amount
      FROM operations o
      INNER JOIN users u       ON o.user_id = u.id
      LEFT  JOIN wcr_norms wn  ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
      LEFT  JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
      WHERE u.warehouse_id = 3
        AND u.employee_id = '00075649'
        AND o.operation_date >= '2026-03-01'
        AND o.operation_date <  '2026-04-01'
        AND (wn.wcr_code IS NOT NULL OR wp.wcr_code IS NOT NULL)
      GROUP BY u.id, u.employee_id, u.fio
  `);
  console.log("Dolmatov final norms sum:");
  console.table(result.recordset);
  await pool.close();
}

main().catch(console.error);