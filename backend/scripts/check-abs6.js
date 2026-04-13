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
  const res = await pool.request().query("SELECT COUNT(*) as c, COUNT(DISTINCT operation_id) as cd FROM v_salary_details WHERE employee_id = '00075649'");
  console.log('Row counts for Долматов:', res.recordset);
  
  pool.close();
}
run().catch(console.error);