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
  
  const res = await pool.request().query("SELECT TOP 10 * FROM wcr_picking_norms");
  console.log('wcr_picking_norms:', res.recordset);

  pool.close();
}
run().catch(console.error);