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
    SELECT TOP 5 wcr_code, operation_date, count, amount, u.employee_id
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    WHERE o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01'
      AND u.employee_id IN ('00089780', '00089916')
  `);
  console.log('Operations for users:');
  console.log(res.recordset);

  pool.close();
}
run().catch(console.error);