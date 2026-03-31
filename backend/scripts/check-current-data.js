const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

async function main() {
  const pool = await sql.connect(cfg);

  // Latest data in DB
  console.log('\n=== Последние данные в БД по месяцам ===');
  const r1 = await pool.request().query(
    "SELECT FORMAT(operation_date, 'yyyy-MM') as month, COUNT(*) as cnt, SUM(count) as total_aei " +
    "FROM operations " +
    "GROUP BY FORMAT(operation_date, 'yyyy-MM') " +
    "ORDER BY month DESC"
  );
  r1.recordset.forEach(row => console.log(`  ${row.month}: ${row.cnt} ops, ${row.total_aei} AEI`));

  // March data if any
  console.log('\n=== Данные за март 2026 ===');
  const r2 = await pool.request().query(
    "SELECT u.fio, SUM(o.count) as total_aei, o.wcr_code, o.aarea " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01' " +
    "GROUP BY u.fio, o.wcr_code, o.aarea " +
    "ORDER BY total_aei DESC"
  );
  if (r2.recordset.length === 0) {
    console.log('  Нет данных за март 2026');
  } else {
    r2.recordset.slice(0, 10).forEach(row => {
      console.log(`  ${row.fio}: aei=${row.total_aei} wcr=${row.wcr_code} aarea=${row.aarea}`);
    });
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
