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
    SELECT SUM(o.amount) as s_ops FROM operations o
    WHERE o.user_id = 562 AND o.wcr_code NOT IN ('FIXAEIMAR', 'FIXPCKMAR', 'FIXMARCH', 'FIX_MARCH') AND operation_date >= '2026-03-01'
  `);
  console.log('SUM(o.amount) from operations:', res.recordset[0].s_ops);
  
  const res2 = await pool.request().query(`
    SELECT SUM(sd.base_amount) as s_vs FROM v_salary_details sd
    WHERE sd.employee_id = '00075649' AND sd.operation_type NOT IN ('FIXAEIMAR', 'FIXPCKMAR', 'FIXMARCH', 'FIX_MARCH') AND operation_date >= '2026-03-01'
  `);
  console.log('SUM(sd.base_amount) from v_salary_details:', res2.recordset[0].s_vs);
  
  pool.close();
}
run().catch(console.error);