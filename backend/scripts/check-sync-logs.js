const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

async function main() {
  const pool = await sql.connect(cfg);

  // Check if sync_logs table exists
  console.log('\n=== Таблицы в БД ===');
  const r0 = await pool.request().query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
  );
  r0.recordset.forEach(row => console.log(`  ${row.TABLE_NAME}`));

  // Check sync_logs
  try {
    console.log('\n=== Последние 20 синков ===');
    const r1 = await pool.request().query(
      "SELECT TOP 20 * FROM sync_logs ORDER BY created_at DESC"
    );
    r1.recordset.forEach(row => console.log(`  ${JSON.stringify(row)}`));
  } catch(e) {
    console.log('  sync_logs не найдена: ' + e.message);
  }

  // Check if ПМ operations have a rate > 0
  console.log('\n=== Примеры мартовских ПМ Пополнение операций ===');
  const r2 = await pool.request().query(
    "SELECT TOP 5 u.fio, o.operation_type, o.count, o.amount, o.actdura, o.sap_order_id, o.warehouse_code, o.created_at " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_type = N'" + "ПМ Пополнение" + "' " +
    "AND o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01' " +
    "ORDER BY o.created_at DESC"
  );
  r2.recordset.forEach(row => {
    const rate = row.amount / row.count;
    console.log(`  ${row.fio} | ${row.operation_type} | ${row.count} AEI | amount=${row.amount} | rate=${rate.toFixed(2)} | wh=${row.warehouse_code} | created=${row.created_at.toISOString().slice(0,19)}`);
  });

  // What is the implicit rate being used for ПМ operations?
  console.log('\n=== Расценки для ПМ Пополнение (rate = amount/count) ===');
  const r3 = await pool.request().query(
    "SELECT ROUND(CAST(amount AS FLOAT)/count, 2) as rate, COUNT(*) as cnt " +
    "FROM operations " +
    "WHERE operation_type = N'" + "ПМ Пополнение" + "' " +
    "AND operation_date >= '2026-03-01' AND operation_date < '2026-04-01' " +
    "AND count > 0 AND amount > 0 " +
    "GROUP BY ROUND(CAST(amount AS FLOAT)/count, 2) " +
    "ORDER BY cnt DESC"
  );
  r3.recordset.slice(0, 10).forEach(row => console.log(`  rate=${row.rate}: ${row.cnt} ops`));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
