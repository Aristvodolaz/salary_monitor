const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

async function main() {
  const pool = await sql.connect(cfg);

  console.log('\n=== Операции Денисова в марте 2026 ===');
  const r1 = await pool.request().query(
    "SELECT u.fio, o.operation_type, SUM(o.count) as total_aei, COUNT(*) as op_count " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01' " +
    "AND u.fio LIKE N'%ДЕНИСОВ%' " +
    "GROUP BY u.fio, o.operation_type " +
    "ORDER BY u.fio, total_aei DESC"
  );
  if (r1.recordset.length === 0) {
    console.log('  Нет данных за март');
  } else {
    r1.recordset.forEach(row => console.log(`  ${row.fio} | ${row.operation_type} | ${row.total_aei} AEI | ${row.op_count} ops`));
  }

  console.log('\n=== Операции Мищенкова в марте 2026 ===');
  const r2 = await pool.request().query(
    "SELECT u.fio, o.operation_type, SUM(o.count) as total_aei, COUNT(*) as op_count " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01' " +
    "AND u.fio LIKE N'%МИЩЕНКОВ%' " +
    "GROUP BY u.fio, o.operation_type " +
    "ORDER BY u.fio, total_aei DESC"
  );
  if (r2.recordset.length === 0) {
    console.log('  Нет данных за март');
  } else {
    r2.recordset.forEach(row => console.log(`  ${row.fio} | ${row.operation_type} | ${row.total_aei} AEI | ${row.op_count} ops`));
  }

  // Let's see ALL employees who worked in February but NOT in March (ФС_Коробочная)
  console.log('\n=== Сотрудники с ФС_Коробочная в феврале, но НЕ в марте ===');
  const r3 = await pool.request().query(
    "SELECT u.fio, " +
    "SUM(CASE WHEN o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01' THEN o.count ELSE 0 END) as feb_aei, " +
    "SUM(CASE WHEN o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01' THEN o.count ELSE 0 END) as mar_aei " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_type = N'" + "ФС_Коробочная комплектация" + "' " +
    "AND o.operation_date >= '2026-02-01' AND o.operation_date < '2026-04-01' " +
    "GROUP BY u.fio " +
    "HAVING SUM(CASE WHEN o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01' THEN o.count ELSE 0 END) > 100 " +
    "AND SUM(CASE WHEN o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01' THEN o.count ELSE 0 END) = 0 " +
    "ORDER BY feb_aei DESC"
  );
  r3.recordset.forEach(row => console.log(`  ${row.fio}: Feb=${row.feb_aei} Mar=${row.mar_aei}`));

  // And employees who had ФС_Коробочная in BOTH months (these are the "true" FS workers)
  console.log('\n=== Сотрудники с ФС_Коробочная в ОБОИХ месяцах ===');
  const r4 = await pool.request().query(
    "SELECT u.fio, " +
    "SUM(CASE WHEN o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01' THEN o.count ELSE 0 END) as feb_aei, " +
    "SUM(CASE WHEN o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01' THEN o.count ELSE 0 END) as mar_aei " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_type = N'" + "ФС_Коробочная комплектация" + "' " +
    "AND o.operation_date >= '2026-02-01' AND o.operation_date < '2026-04-01' " +
    "GROUP BY u.fio " +
    "HAVING SUM(CASE WHEN o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01' THEN o.count ELSE 0 END) > 0 " +
    "AND SUM(CASE WHEN o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01' THEN o.count ELSE 0 END) > 0 " +
    "ORDER BY feb_aei DESC"
  );
  r4.recordset.forEach(row => console.log(`  ${row.fio}: Feb=${row.feb_aei} Mar=${row.mar_aei}`));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
