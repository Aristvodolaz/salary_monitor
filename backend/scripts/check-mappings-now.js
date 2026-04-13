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
  
  const res = await pool.request().query("SELECT TOP 5 wcr_code, operation_type, participant_area FROM wcr_mapping WHERE wcr_code IN ('INB_CD', 'INB_MC01')");
  console.log(res.recordset);

  pool.close();
}
run().catch(console.error);