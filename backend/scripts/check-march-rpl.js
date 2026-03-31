const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

async function main() {
  const pool = await sql.connect(cfg);

  // Check March ФС_Коробочная for known excess employees
  console.log('\n=== ФС_Коробочная в марте для ключевых сотрудников ===');
  const r1 = await pool.request().query(
    "SELECT u.fio, SUM(o.count) as total_aei, COUNT(*) as ops " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_type = N'" + "ФС_Коробочная комплектация" + "' " +
    "AND o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01' " +
    "AND (u.fio LIKE N'%ДЕНИСОВ%' OR u.fio LIKE N'%ТУПЕЛЕКИН%' OR u.fio LIKE N'%МИЩЕНКОВ%' OR " +
    "u.fio LIKE N'%НОВИКОВ%' OR u.fio LIKE N'%ГОЗИЕВ%' OR u.fio LIKE N'%ИКСАНОВ%' OR " +
    "u.fio LIKE N'%БЕРДНИКОВ%' OR u.fio LIKE N'%ЗАХАРОВ%' OR u.fio LIKE N'%ТРИФОНОВ%' OR u.fio LIKE N'%СТОЯКИН%') " +
    "GROUP BY u.fio " +
    "ORDER BY total_aei DESC"
  );
  if (r1.recordset.length === 0) {
    console.log('  Нет данных');
  } else {
    r1.recordset.forEach(row => console.log(`  ${row.fio}: ${row.total_aei} AEI (${row.ops} ops)`));
  }

  // How many RPL1 type operations in March vs Feb (by operation type)
  console.log('\n=== Типы операций в марте (топ 20) ===');
  const r2 = await pool.request().query(
    "SELECT operation_type, COUNT(*) as cnt, SUM(count) as total_aei " +
    "FROM operations " +
    "WHERE operation_date >= '2026-03-01' AND operation_date < '2026-04-01' " +
    "GROUP BY operation_type " +
    "ORDER BY total_aei DESC"
  );
  r2.recordset.slice(0, 20).forEach(row => console.log(`  ${row.operation_type}: ${row.total_aei} AEI (${row.cnt} ops)`));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
