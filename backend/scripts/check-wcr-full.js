const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

async function main() {
  const pool = await sql.connect(cfg);

  // All WCR mappings including inactive
  console.log('\n=== Все WCR маппинги (включая неактивные) ===');
  const r1 = await pool.request().query(
    "SELECT wcr_code, operation_type, participant_area, is_active FROM wcr_mapping ORDER BY operation_type, wcr_code"
  );
  r1.recordset.forEach(row => console.log(`  [${row.is_active?'✓':'✗'}] ${row.wcr_code} → ${row.operation_type} [${row.participant_area || ''}]`));

  // All distinct operation_types in March operations
  console.log('\n=== Уникальные типы операций в марте ===');
  const r2 = await pool.request().query(
    "SELECT DISTINCT operation_type FROM operations " +
    "WHERE operation_date >= '2026-03-01' AND operation_date < '2026-04-01' " +
    "ORDER BY operation_type"
  );
  r2.recordset.forEach(row => console.log(`  "${row.operation_type}"`));

  // Operation types NOT in wcr_mapping
  console.log('\n=== Типы операций в БД НЕ через WCR маппинг (т.е. нет в wcr_mapping) ===');
  const r3 = await pool.request().query(
    "SELECT DISTINCT o.operation_type " +
    "FROM operations o " +
    "WHERE o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01' " +
    "AND NOT EXISTS (SELECT 1 FROM wcr_mapping w WHERE w.operation_type = o.operation_type AND w.is_active = 1) " +
    "ORDER BY o.operation_type"
  );
  if (r3.recordset.length === 0) {
    console.log('  Все типы операций есть в маппинге');
  } else {
    r3.recordset.forEach(row => console.log(`  "${row.operation_type}" - НЕТ В МАППИНГЕ!`));
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
