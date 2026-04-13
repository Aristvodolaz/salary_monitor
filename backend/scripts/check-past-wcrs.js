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
    SELECT TOP 10 wcr_code, COUNT(*) as cnt, MAX(operation_date) as last_date
    FROM operations
    WHERE wcr_code IN ('INB_CD', 'INB_MZ01', 'REPL_MZ01', 'UNLOAD', 'INT_BRAK', 'INV_MZ01')
    GROUP BY wcr_code
  `);
  console.log('Past operations with these WCRs:');
  console.log(res.recordset);

  pool.close();
}
run().catch(console.error);