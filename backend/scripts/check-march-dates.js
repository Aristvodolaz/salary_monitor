const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

async function main() {
  const pool = await sql.connect(cfg);

  // What operation dates are in the March sync?
  console.log('\n=== Даты операций в марте (из БД) ===');
  const r1 = await pool.request().query(
    "SELECT FORMAT(operation_date, 'yyyy-MM-dd') as dt, COUNT(*) as cnt, SUM(count) as aei " +
    "FROM operations " +
    "WHERE operation_date >= '2026-03-01' AND operation_date < '2026-04-01' " +
    "GROUP BY FORMAT(operation_date, 'yyyy-MM-dd') " +
    "ORDER BY dt"
  );
  r1.recordset.forEach(row => console.log(`  ${row.dt}: ${row.cnt} ops, ${row.aei} AEI`));

  // Check if RPL1/RPL2/RPL3 are in March data (mapped to ФС_Коробочная)
  console.log('\n=== ФС_Коробочная в марте (топ 10 сотрудников) ===');
  const r2 = await pool.request().query(
    "SELECT TOP 10 u.fio, SUM(o.count) as total_aei, COUNT(*) as ops " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_type = N'" + "ФС_Коробочная комплектация" + "' " +
    "AND o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01' " +
    "GROUP BY u.fio " +
    "ORDER BY total_aei DESC"
  );
  r2.recordset.forEach(row => console.log(`  ${row.fio}: ${row.total_aei} AEI, ${row.ops} ops`));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
