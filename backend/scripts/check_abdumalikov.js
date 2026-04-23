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
      u.fio,
      o.wcr_code,
      SUM(o.count) as sum_aei,
      SUM(o.prod_count) as sum_prod
    FROM operations o
    JOIN users u ON o.user_id = u.id
    WHERE u.employee_id IN ('00075649', '00078423', '00078692')
      AND o.wcr_code NOT LIKE 'FIX%'
      AND o.operation_date >= '2026-03-01'
      AND o.operation_date < '2026-04-01'
    GROUP BY u.fio, o.wcr_code
  `);
  console.table(result.recordset);
  await pool.close();
}

main().catch(console.error);