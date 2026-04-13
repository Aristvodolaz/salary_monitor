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
  const res = await pool.request().query("SELECT operation_type, amount, operation_date, wcr_code FROM operations WHERE user_id = (SELECT id FROM users WHERE employee_id = '00075649') AND operation_date >= '2026-03-01' AND wcr_code IN ('FIXAEIMAR', 'FIXPCKMAR', 'FIXMARCH', 'FIX_MARCH')");
  console.log('Fix ops for Долматов:', res.recordset);
  
  const res2 = await pool.request().query("SELECT operation_type, amount, operation_date, wcr_code FROM operations WHERE user_id = (SELECT id FROM users WHERE employee_id = '00089780') AND operation_date >= '2026-03-01' AND wcr_code IN ('FIXAEIMAR', 'FIXPCKMAR', 'FIXMARCH', 'FIX_MARCH')");
  console.log('Fix ops for Абдиали:', res2.recordset);
  pool.close();
}
run().catch(console.error);