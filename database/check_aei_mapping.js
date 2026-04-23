const path = require('path');
const { createRequire } = require('module');
const sql = createRequire(path.join(__dirname, '..', 'backend', 'package.json'))('mssql');
const cfg = {
  server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587,
  database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 30000, requestTimeout: 60000,
};
async function main() {
  const pool = await sql.connect(cfg);

  // wcr_mapping для INB/INT/REPL кодов
  const wm = await pool.request().query(`
    SELECT wcr_code, operation_type, participant_area
    FROM wcr_mapping WHERE is_active=1
      AND (wcr_code LIKE 'INB%' OR wcr_code LIKE 'INT_%' OR wcr_code LIKE 'REPL%'
           OR wcr_code LIKE 'INV%' OR wcr_code = 'UNLOAD')
    ORDER BY wcr_code
  `);
  console.log('=== wcr_mapping для АЕИ кодов ===');
  console.table(wm.recordset);

  // Что в operations для этих кодов в марте
  const ops = await pool.request().query(`
    SELECT participant_area, COUNT(*) ops, ROUND(SUM(ISNULL(amount,0)),2) amt
    FROM operations
    WHERE operation_date >= '2026-03-01' AND operation_date < '2026-04-01'
      AND (wcr_code LIKE 'INB%' OR wcr_code LIKE 'INT_%' OR wcr_code LIKE 'REPL%'
           OR wcr_code LIKE 'INV%' OR wcr_code = 'UNLOAD')
    GROUP BY participant_area
    ORDER BY amt DESC
  `);
  console.log('\n=== operations марта для АЕИ кодов (INB/INT/REPL/INV/UNLOAD) ===');
  console.table(ops.recordset);

  await pool.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
