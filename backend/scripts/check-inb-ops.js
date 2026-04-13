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
    SELECT wcr_code, COUNT(*) as cnt, SUM(count) as aei_sum
    FROM norms_operations
    WHERE operation_date >= '2026-03-01' AND operation_date < '2026-04-01'
      AND wcr_code IN ('INB_CD', 'INB_MZ01', 'REPL_MZ01', 'UNLOAD')
    GROUP BY wcr_code
  `);
  console.log('Stats for INB/REPL in norms_operations:');
  console.log(res.recordset);

  pool.close();
}
run().catch(console.error);