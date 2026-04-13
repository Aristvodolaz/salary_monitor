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
    SELECT TOP 10 o.wcr_code, o.count, o.amount, u.employee_id
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    WHERE o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01'
      AND u.employee_id IN ('00089780', '00089916')
  `);
  console.log('Operations for users:');
  console.log(res.recordset);

  const res2 = await pool.request().query(`
    SELECT TOP 10 o.wcr_code, o.count, o.amount, u.employee_id
    FROM norms_operations o
    INNER JOIN users u ON u.id = o.user_id
    WHERE o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01'
      AND u.employee_id IN ('00089780', '00089916')
  `);
  console.log('norms_operations for users:');
  console.log(res2.recordset);

  pool.close();
}
run().catch(console.error);