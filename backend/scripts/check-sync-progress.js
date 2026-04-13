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
    SELECT wcr_code, COUNT(*) as count 
    FROM operations 
    WHERE wcr_code IN ('INB_CD', 'INB_MC01', 'REPL_MZ01', 'UNLOAD', 'INT_BRAK', 'INV_MZ01')
    GROUP BY wcr_code
  `);
  console.log('Current counts in operations:');
  console.log(res.recordset);

  pool.close();
}
run().catch(console.error);