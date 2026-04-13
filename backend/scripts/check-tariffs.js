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
    SELECT * FROM tariffs
    WHERE operation_type IN (
      SELECT operation_type FROM wcr_mapping WHERE wcr_code IN ('INB_CD', 'INB_MZ01', 'REPL_MZ01', 'UNLOAD')
    ) OR operation_type IN ('INB_CD', 'INB_MZ01', 'REPL_MZ01', 'UNLOAD')
  `);
  console.log('Tariffs for INB/REPL:');
  console.log(res.recordset);

  pool.close();
}
run().catch(console.error);