const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

async function main() {
  const pool = await sql.connect(cfg);

  // All tariffs
  console.log('\n=== Все активные тарифы ===');
  const r1 = await pool.request().query(
    "SELECT operation_type, rate, warehouse_code, valid_from, valid_to FROM tariffs WHERE is_active = 1 ORDER BY operation_type"
  );
  r1.recordset.forEach(row => console.log(`  ${row.operation_type} | rate=${row.rate} | wh=${row.warehouse_code}`));

  // March operations with no tariff - how many?
  console.log('\n=== Мартовские операции без тарифа (amount=NULL или 0) ===');
  const r2 = await pool.request().query(
    "SELECT operation_type, COUNT(*) as cnt, SUM(count) as aei FROM operations " +
    "WHERE operation_date >= '2026-03-01' AND operation_date < '2026-04-01' " +
    "AND (amount IS NULL OR amount = 0) " +
    "GROUP BY operation_type ORDER BY aei DESC"
  );
  r2.recordset.forEach(row => console.log(`  ${row.operation_type}: ${row.aei} AEI (${row.cnt} ops)`));

  // March operations by amount range
  console.log('\n=== Мартовские операции - distribution amount ===');
  const r3 = await pool.request().query(
    "SELECT CASE WHEN amount IS NULL THEN 'NULL' WHEN amount = 0 THEN '0' WHEN amount > 0 THEN '>0' END as amt_cat, " +
    "COUNT(*) as cnt FROM operations " +
    "WHERE operation_date >= '2026-03-01' AND operation_date < '2026-04-01' " +
    "GROUP BY CASE WHEN amount IS NULL THEN 'NULL' WHEN amount = 0 THEN '0' WHEN amount > 0 THEN '>0' END"
  );
  r3.recordset.forEach(row => console.log(`  amount=${row.amt_cat}: ${row.cnt} ops`));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
