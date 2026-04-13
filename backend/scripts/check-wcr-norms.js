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
  
  const res = await pool.request().query("SELECT wcr_code, description, norm_type, norm_value, is_active FROM wcr_norms ORDER BY wcr_code");
  console.log('wcr_norms count:', res.recordset.length);
  console.log(res.recordset);

  pool.close();
}
run().catch(console.error);