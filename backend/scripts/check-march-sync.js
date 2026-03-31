const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

async function main() {
  const pool = await sql.connect(cfg);

  // When were march records created/updated?
  console.log('\n=== Когда создавались мартовские записи ===');
  const r1 = await pool.request().query(
    "SELECT FORMAT(created_at, 'yyyy-MM-dd HH') as hour, COUNT(*) as cnt " +
    "FROM operations " +
    "WHERE operation_date >= '2026-03-01' AND operation_date < '2026-04-01' " +
    "GROUP BY FORMAT(created_at, 'yyyy-MM-dd HH') " +
    "ORDER BY hour DESC"
  );
  r1.recordset.forEach(row => console.log(`  ${row.hour}:00 — ${row.cnt} records`));

  // Check if any march records have wcr_code populated
  console.log('\n=== Есть ли мартовские записи с wcr_code ===');
  const r2 = await pool.request().query(
    "SELECT wcr_code, COUNT(*) as cnt FROM operations " +
    "WHERE operation_date >= '2026-03-01' AND operation_date < '2026-04-01' " +
    "GROUP BY wcr_code " +
    "ORDER BY cnt DESC"
  );
  r2.recordset.forEach(row => console.log(`  wcr_code=${row.wcr_code} : ${row.cnt} records`));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
