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
  const startDate = '2026-03-01';
  const endDate = '2026-03-31';
  const users = await pool.request()
    .input('startDate', sql.VarChar(10), startDate)
    .input('endDate', sql.VarChar(10), endDate)
    .query(`
      SELECT
        u.id AS user_id,
        u.employee_id,
        w.code AS warehouse_code,
        ISNULL(SUM(o.amount), 0) AS total_amount
      FROM users u
      LEFT JOIN warehouses w ON w.id = u.warehouse_id
      LEFT JOIN operations o ON o.user_id = u.id 
        AND o.operation_date >= @startDate 
        AND o.operation_date < DATEADD(DAY, 1, CAST(@endDate AS DATE))
        AND (o.wcr_code IS NULL OR o.wcr_code NOT IN ('FIXAEIMAR', 'FIXPCKMAR', 'FIX_MARCH', 'FIXMARCH'))
      WHERE u.employee_id = '00075649'
      GROUP BY u.id, u.employee_id, w.code
    `);
  console.log('Result for Долматов:', users.recordset);
  pool.close();
}
run().catch(console.error);