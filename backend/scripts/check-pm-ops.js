const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

async function main() {
  const pool = await sql.connect(cfg);

  // Where do ПМ Пополнение ops come from (which warehouse)?
  console.log('\n=== Откуда берутся "ПМ" операции (по складу) в марте ===');
  const r1 = await pool.request().query(
    "SELECT o.warehouse_code, o.operation_type, COUNT(*) as cnt, SUM(o.count) as aei " +
    "FROM operations o " +
    "WHERE o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01' " +
    "AND o.operation_type LIKE N'ПМ%' " +
    "GROUP BY o.warehouse_code, o.operation_type " +
    "ORDER BY o.warehouse_code, aei DESC"
  );
  r1.recordset.forEach(row => console.log(`  ${row.warehouse_code} | ${row.operation_type}: ${row.aei} AEI (${row.cnt} ops)`));

  // Are there ПМ Пополнение WCR codes in the wcr_mapping? (maybe different name)
  console.log('\n=== Ищем WCR коды для пополнения ===');
  const r2 = await pool.request().query(
    "SELECT wcr_code, operation_type, participant_area FROM wcr_mapping WHERE is_active = 1 ORDER BY wcr_code"
  );
  // Filter for anything that might be replenishment
  const rplCodes = r2.recordset.filter(r =>
    r.wcr_code.includes('RP') || r.wcr_code.includes('POP') || r.wcr_code.includes('REP') ||
    r.operation_type.includes('Пополн') || r.operation_type.includes('Приёмк') || r.operation_type.includes('Инвент')
  );
  rplCodes.forEach(row => console.log(`  ${row.wcr_code} → ${row.operation_type}`));

  // Check the mapping for ПМ operations via LIKE
  console.log('\n=== WCR маппинг для складских (ПМ) операций (ищем по wildcards) ===');
  const r3 = await pool.request().query(
    "SELECT wcr_code, operation_type, participant_area FROM wcr_mapping WHERE is_active = 1 AND operation_type LIKE N'ПМ%'"
  );
  if (r3.recordset.length === 0) {
    console.log('  Нет ПМ операций в маппинге!');
  } else {
    r3.recordset.forEach(row => console.log(`  ${row.wcr_code} → ${row.operation_type} [${row.participant_area}]`));
  }

  // Check the sap_integration service - maybe there's another import source
  // Check if there's a `tariffs` for these operation types
  console.log('\n=== Тарифы для ПМ операций ===');
  const r4 = await pool.request().query(
    "SELECT operation_type, rate, warehouse_code, valid_from FROM tariffs WHERE is_active = 1 AND operation_type LIKE N'ПМ%' ORDER BY operation_type"
  );
  r4.recordset.forEach(row => console.log(`  ${row.operation_type} | rate=${row.rate} wh=${row.warehouse_code}`));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
