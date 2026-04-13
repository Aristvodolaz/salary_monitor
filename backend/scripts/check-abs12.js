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
  
  const res = await pool.request().query("SELECT * FROM norms_employees_snapshot WHERE period_start = '2026-03-01' AND fio LIKE N'%Сопов%'");
  console.log('Сопов in snapshot:', res.recordset);

  pool.close();
}
run().catch(console.error);