const path = require('path');
const { createRequire } = require('module');
const sql = createRequire(path.join(__dirname, '..', 'backend', 'package.json'))('mssql');

const cfg = { user:'sa', password:'YourStrong@Passw0rd', server:'localhost', database:'SalaryMonitor', options:{trustServerCertificate:true} };

async function main() {
  const pool = await sql.connect(cfg);
  const r = await pool.request().query(`
    SELECT DISTINCT sd.participant_area, COUNT(*) as cnt
    FROM v_salary_details sd
    WHERE sd.operation_date >= '2026-03-01' AND sd.operation_date <= '2026-03-31'
    GROUP BY sd.participant_area
    ORDER BY cnt DESC
  `);
  r.recordset.forEach(row => {
    console.log(`[${row.participant_area}] = ${row.cnt} записей`);
  });
  pool.close();
}
main().catch(e => console.error(e.message));
