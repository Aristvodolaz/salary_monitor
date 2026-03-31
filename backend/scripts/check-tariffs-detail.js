const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

async function main() {
  const pool = await sql.connect(cfg);

  // ALL tariffs including inactive
  console.log('\n=== ВСЕ тарифы (включая неактивные) ===');
  const r1 = await pool.request().query(
    "SELECT operation_type, rate, warehouse_code, valid_from, valid_to, is_active FROM tariffs ORDER BY operation_type, warehouse_code"
  );
  r1.recordset.forEach(row => console.log(`  [${row.is_active?'✓':'✗'}] ${row.operation_type} | rate=${row.rate} | wh=${row.warehouse_code} | ${row.valid_from?.toISOString()?.slice(0,10)}`));

  // What WCR codes map to ПМ-like operations in wcr_mapping?
  console.log('\n=== WCR коды для операций с тарифом 2.5 ===');
  // Looking in wcr_mapping for ALL entries
  const r2 = await pool.request().query(
    "SELECT w.wcr_code, w.operation_type, w.participant_area, t.rate " +
    "FROM wcr_mapping w " +
    "LEFT JOIN tariffs t ON t.operation_type = w.operation_type AND t.is_active = 1 " +
    "WHERE t.rate = 2.5 OR w.operation_type LIKE N'ПМ%' " +
    "ORDER BY w.operation_type"
  );
  r2.recordset.forEach(row => console.log(`  ${row.wcr_code} → ${row.operation_type} | rate=${row.rate}`));

  // Check if maybe these come from a DIFFERENT SAP entity/service
  // Maybe there's a separate service endpoint for 0SK warehouses
  console.log('\n=== Синк лог для 0SK6 (последние 5) ===');
  const r3 = await pool.request().query(
    "SELECT TOP 5 * FROM sync_logs WHERE warehouse_code = '0SK6' ORDER BY created_at DESC"
  );
  r3.recordset.forEach(row => console.log(`  ${row.created_at.toISOString().slice(0,19)} status=${row.status} records=${row.records_processed} err=${row.error_message}`));

  // When were ПМ Пополнение operations first created?
  console.log('\n=== Первые ПМ Пополнение операции ===');
  const r4 = await pool.request().query(
    "SELECT TOP 5 o.operation_type, o.warehouse_code, o.count, o.amount, o.sap_order_id, FORMAT(o.operation_date,'yyyy-MM-dd') as dt, FORMAT(o.created_at,'yyyy-MM-dd HH:mm') as created " +
    "FROM operations o " +
    "WHERE o.operation_type = N'" + "ПМ Пополнение" + "' " +
    "ORDER BY o.created_at ASC"
  );
  r4.recordset.forEach(row => console.log(`  dt=${row.dt} wh=${row.warehouse_code} aei=${row.count} amount=${row.amount} sap=${row.sap_order_id} created=${row.created}`));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
