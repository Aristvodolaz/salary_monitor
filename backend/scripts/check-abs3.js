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
  const res = await pool.request().query("SELECT SUM(amount) as s FROM operations WHERE wcr_code = 'FIXAEIMAR' AND user_id = (SELECT id FROM users WHERE employee_id = '00089780')");
  console.log('FIXAEIMAR for Абдиали:', res.recordset[0].s);
  const res2 = await pool.request().query("SELECT SUM(base_amount) as s FROM v_salary_details WHERE employee_id = '00089780'");
  console.log('Admin Panel total for Абдиали:', res2.recordset[0].s);
  
  const res3 = await pool.request().query("SELECT SUM(amount) as s FROM operations WHERE wcr_code = 'FIXMARCH' AND user_id = (SELECT id FROM users WHERE employee_id = '00075649')");
  console.log('FIXMARCH for Долматов:', res3.recordset[0].s);
  const res4 = await pool.request().query("SELECT SUM(base_amount) as s FROM v_salary_details WHERE employee_id = '00075649'");
  console.log('Admin Panel total for Долматов:', res4.recordset[0].s);
  
  pool.close();
}
run().catch(console.error);