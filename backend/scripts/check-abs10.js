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
  const res = await pool.request().query("SELECT COUNT(*) as c FROM norms_employees_snapshot WHERE period_start = '2026-03-01'");
  console.log('Snapshot count:', res.recordset[0].c);
  pool.close();
}
run().catch(console.error);