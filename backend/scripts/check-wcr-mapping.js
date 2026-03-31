const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

async function main() {
  const pool = await sql.connect(cfg);

  // Show WCR mapping for replenishment-related operations
  console.log('\n=== WCR маппинг (репленишмент и связанные) ===');
  const r1 = await pool.request().query(
    "SELECT wcr_code, operation_type, participant_area " +
    "FROM wcr_mapping " +
    "WHERE is_active = 1 " +
    "AND (wcr_code LIKE 'RPL%' OR operation_type LIKE N'%Пополн%' OR operation_type LIKE N'%Коробоч%') " +
    "ORDER BY operation_type, wcr_code"
  );
  r1.recordset.forEach(row => console.log(`  ${row.wcr_code} → ${row.operation_type} [${row.participant_area}]`));

  // What WCR codes does Денисов use in March? (from SAP - indirectly via DB)
  // We can't get WCR codes from DB since wcr_code is NULL, but we know the operation types
  // Let's see all March operations by type for Денисов
  console.log('\n=== Все типы операций Денисова в марте ===');
  const r2 = await pool.request().query(
    "SELECT o.operation_type, SUM(o.count) as aei, COUNT(*) as ops " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE u.fio LIKE N'%ДЕНИСОВ%' AND u.fio LIKE N'%ЮРИЙ%' " +
    "AND o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01' " +
    "GROUP BY o.operation_type ORDER BY aei DESC"
  );
  r2.recordset.forEach(row => console.log(`  ${row.operation_type}: ${row.aei} AEI (${row.ops} ops)`));

  // What WCR codes are mapped to "ПМ Пополнение"?
  console.log('\n=== WCR коды, маппированные на ПМ Пополнение ===');
  const r3 = await pool.request().query(
    "SELECT wcr_code, operation_type, participant_area " +
    "FROM wcr_mapping WHERE is_active = 1 AND operation_type LIKE N'%Пополн%'"
  );
  r3.recordset.forEach(row => console.log(`  ${row.wcr_code} → ${row.operation_type} [${row.participant_area}]`));

  // All WCR codes in the mapping
  console.log('\n=== Все WCR коды в маппинге ===');
  const r4 = await pool.request().query(
    "SELECT wcr_code, operation_type, participant_area FROM wcr_mapping WHERE is_active = 1 ORDER BY wcr_code"
  );
  r4.recordset.forEach(row => console.log(`  ${row.wcr_code} → ${row.operation_type} [${row.participant_area || ''}]`));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
