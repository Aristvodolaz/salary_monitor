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
      o.wcr_code,
      o.operation_type,
      o.participant_area,
      COUNT(*) as count_ops,
      SUM(o.count) as sum_aei,
      SUM(o.prod_count) as sum_prod,
      SUM(o.actdura) as sum_actdura,
      SUM(o.amount) as sum_amount
    FROM operations o
    JOIN users u ON o.user_id = u.id
    WHERE u.employee_id IN ('75649', '00075649')
      AND o.operation_date >= '2026-03-01'
      AND o.operation_date < '2026-04-01'
    GROUP BY o.wcr_code, o.operation_type, o.participant_area
    ORDER BY sum_amount DESC
  `);
  console.log("All operations for Dolmatov:");
  console.table(result.recordset);
  
  await pool.close();
}

main().catch(console.error);