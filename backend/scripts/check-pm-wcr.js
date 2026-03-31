const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

async function main() {
  const pool = await sql.connect(cfg);

  // Are there inactive WCR codes for ПМ operations?
  console.log('\n=== Все (включая неактивные) WCR для ПМ Пополнение ===');
  const r1 = await pool.request().query(
    "SELECT wcr_code, operation_type, participant_area, is_active FROM wcr_mapping WHERE operation_type LIKE N'ПМ%' ORDER BY wcr_code"
  );
  if (r1.recordset.length === 0) {
    console.log('  НЕТ в wcr_mapping вообще');
  } else {
    r1.recordset.forEach(row => console.log(`  [${row.is_active?'✓':'✗'}] ${row.wcr_code} → ${row.operation_type}`));
  }

  // Check if there's ANY wcr_code that maps to ПМ-like operations
  console.log('\n=== Все WCR коды в маппинге (включая неактивные) ===');
  const r2 = await pool.request().query(
    "SELECT wcr_code, operation_type, participant_area, is_active FROM wcr_mapping ORDER BY is_active DESC, wcr_code"
  );
  const inactive = r2.recordset.filter(r => !r.is_active);
  if (inactive.length === 0) {
    console.log('  Нет неактивных записей');
  } else {
    inactive.forEach(row => console.log(`  [INACTIVE] ${row.wcr_code} → ${row.operation_type}`));
  }

  // Check dist/ compiled code to see if it has different mapping
  console.log('\n=== Есть ли dist/main.js? ===');
  const fs = require('fs');
  const path = require('path');
  const distDir = path.join('D:\\work\\komus\\selary\\backend', 'dist');
  if (fs.existsSync(distDir)) {
    console.log('  dist/ существует');
    const files = fs.readdirSync(distDir);
    console.log('  Файлы в dist/:', files.slice(0, 10).join(', '));
  } else {
    console.log('  dist/ НЕ существует');
  }

  // Let's check one ПМ Пополнение record to understand its SAP order ID pattern
  console.log('\n=== Примеры ПМ Пополнение (полные данные) ===');
  const r3 = await pool.request().query(
    "SELECT TOP 3 u.fio, o.*, FORMAT(o.operation_date,'yyyy-MM-dd') as dt " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_type = N'" + "ПМ Пополнение" + "' " +
    "AND o.operation_date >= '2026-03-01' " +
    "ORDER BY o.created_at DESC"
  );
  r3.recordset.forEach(row => {
    console.log(`  fio=${row.fio} dt=${row.dt} wh=${row.warehouse_code} aei=${row.count} rate=${(row.amount/row.count).toFixed(2)} sap_order=${row.sap_order_id} wcr_code=${row.wcr_code} aarea=${row.aarea} created=${row.created_at.toISOString().slice(0,19)}`);
  });

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
