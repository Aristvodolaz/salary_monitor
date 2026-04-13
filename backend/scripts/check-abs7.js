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
  const res = await pool.request().query("SELECT id, employee_id, warehouse_id FROM users WHERE employee_id = '00075649'");
  console.log('Users table for Долматов:', res.recordset);
  
  pool.close();
}
run().catch(console.error);