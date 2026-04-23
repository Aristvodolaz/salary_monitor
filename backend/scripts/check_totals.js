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
      u.employee_id,
      SUM(o.amount) as total_earned,
      COUNT(*) as operations_count
    FROM operations o
    JOIN users u ON o.user_id = u.id
    WHERE o.operation_date >= '2026-03-01'
      AND o.operation_date < '2026-04-01'
      AND u.employee_id IN ('75649', '00075649', '78423', '00078423', '78692', '00078692')
    GROUP BY u.fio, u.employee_id
  `);
  console.log("Totals for Dolmatov, Abdumalikov, Hrapov:");
  console.table(result.recordset);
  
  await pool.close();
}

main().catch(console.error);