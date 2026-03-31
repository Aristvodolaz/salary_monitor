const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

async function main() {
  const pool = await sql.connect(cfg);

  // Compare order number ranges by date for excess vs correct employees
  console.log('\n=== Распределение SAP order IDs по дням для ФС_Коробочная (февраль) ===');
  const r1 = await pool.request().query(
    "SELECT u.fio, FORMAT(o.operation_date, 'yyyy-MM-dd') as dt, " +
    "COUNT(*) as op_count, SUM(o.count) as total_aei, " +
    "MIN(CAST(o.sap_order_id AS BIGINT)) as min_order, " +
    "MAX(CAST(o.sap_order_id AS BIGINT)) as max_order " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_type = N'" + "ФС_Коробочная комплектация" + "' " +
    "AND o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01' " +
    "AND (u.fio LIKE N'%ДЕНИСОВ%' OR u.fio LIKE N'%ТУПЕЛЕКИН%') " +
    "GROUP BY u.fio, FORMAT(o.operation_date, 'yyyy-MM-dd') " +
    "ORDER BY u.fio, dt"
  );
  r1.recordset.forEach(row => {
    console.log(`  ${row.fio} | ${row.dt} | ops=${row.op_count} aei=${row.total_aei} | orders:[${row.min_order}-${row.max_order}]`);
  });

  // Let's also compare order number ranges for Тупелекин (correct) vs Денисов (excess)
  // to see if they overlap or are separate blocks
  console.log('\n=== Общие SAP order IDs у Денисова и Тупелекина? ===');
  const r2 = await pool.request().query(
    "SELECT d.sap_order_id, d_count=d.count, t_count=t.count " +
    "FROM operations d " +
    "JOIN users ud ON d.user_id = ud.id AND ud.fio LIKE N'%ДЕНИСОВ%' " +
    "JOIN operations t ON t.sap_order_id = d.sap_order_id " +
    "JOIN users ut ON t.user_id = ut.id AND ut.fio LIKE N'%ТУПЕЛЕКИН%' " +
    "WHERE d.operation_type = N'" + "ФС_Коробочная комплектация" + "' " +
    "AND d.operation_date >= '2026-02-01' AND d.operation_date < '2026-03-01'"
  );
  console.log(`  Общих SAP order IDs: ${r2.recordset.length}`);
  if (r2.recordset.length > 0) {
    r2.recordset.slice(0, 5).forEach(row => console.log(`    ${row.sap_order_id}: Денисов=${row.d_count} Тупелекин=${row.t_count}`));
  }

  // Look at daily breakdown for key employees to spot patterns
  console.log('\n=== Дневной AEI за февраль: Денисов vs Тупелекин (первые 10 дней) ===');
  const r3 = await pool.request().query(
    "SELECT FORMAT(o.operation_date, 'yyyy-MM-dd') as dt, " +
    "SUM(CASE WHEN u.fio LIKE N'%ДЕНИСОВ%' THEN o.count ELSE 0 END) as denisov_aei, " +
    "SUM(CASE WHEN u.fio LIKE N'%ТУПЕЛЕКИН%' THEN o.count ELSE 0 END) as tupelykin_aei " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_type = N'" + "ФС_Коробочная комплектация" + "' " +
    "AND o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01' " +
    "AND (u.fio LIKE N'%ДЕНИСОВ%' OR u.fio LIKE N'%ТУПЕЛЕКИН%') " +
    "GROUP BY FORMAT(o.operation_date, 'yyyy-MM-dd') " +
    "ORDER BY dt"
  );
  r3.recordset.forEach(row => {
    const ratio = row.denisov_aei > 0 ? (row.denisov_aei / (row.tupelykin_aei || 1)).toFixed(2) : 0;
    console.log(`  ${row.dt} | Денисов=${row.denisov_aei} Тупелекин=${row.tupelykin_aei} ratio=${ratio}`);
  });

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
