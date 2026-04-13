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
  
  const resOps = await pool.request().query("SELECT COUNT(*) as c FROM operations WHERE user_id = 562 AND operation_date >= '2026-03-01' AND operation_date < '2026-04-01' AND (wcr_code IS NULL OR wcr_code NOT IN ('FIXAEIMAR', 'FIXPCKMAR', 'FIXMARCH', 'FIX_MARCH'))");
  console.log('Ops count:', resOps.recordset[0].c);

  const resVs = await pool.request().query("SELECT COUNT(*) as c FROM v_salary_details WHERE employee_id = '00075649' AND operation_date >= '2026-03-01' AND operation_date < '2026-04-01' AND operation_type NOT IN ('FIXAEIMAR', 'FIXPCKMAR', 'FIXMARCH', 'FIX_MARCH')");
  console.log('v_salary_details count:', resVs.recordset[0].c);
  
  const resSumOps = await pool.request().query("SELECT SUM(amount) as s FROM operations WHERE user_id = 562 AND operation_date >= '2026-03-01' AND operation_date < '2026-04-01' AND (wcr_code IS NULL OR wcr_code NOT IN ('FIXAEIMAR', 'FIXPCKMAR', 'FIXMARCH', 'FIX_MARCH'))");
  console.log('Ops sum amount:', resSumOps.recordset[0].s);

  const resSumVs = await pool.request().query("SELECT SUM(base_amount) as s FROM v_salary_details WHERE employee_id = '00075649' AND operation_date >= '2026-03-01' AND operation_date < '2026-04-01' AND operation_type NOT IN ('FIXAEIMAR', 'FIXPCKMAR', 'FIXMARCH', 'FIX_MARCH')");
  console.log('v_salary_details sum base_amount:', resSumVs.recordset[0].s);

  pool.close();
}
run().catch(console.error);