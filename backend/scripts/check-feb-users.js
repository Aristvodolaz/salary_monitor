const sql = require('mssql');
const cfg = { server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587, database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU', options: { encrypt: false, trustServerCertificate: true } };

async function run() {
  const pool = await sql.connect(cfg);

  // Байыш id=568, Дмитриев id=536
  console.log('=== БАЙЫШ (568) - февраль 2026 ===');
  const r1 = await pool.request().query(`
    SELECT operation_type, wcr_code, SUM(count) as cnt, SUM(amount) as amt
    FROM operations
    WHERE operation_date >= '2026-02-01' AND operation_date < '2026-03-01' AND user_id = 568
    GROUP BY operation_type, wcr_code ORDER BY operation_type
  `);
  let tot1 = 0;
  r1.recordset.forEach(x => { tot1 += x.amt; console.log(x.operation_type + '\t' + (x.wcr_code||'NULL') + '\t' + x.cnt + '\t' + x.amt.toFixed(2)); });
  console.log('  ИТОГО: ' + tot1.toFixed(2) + '  (эталон: 47374)');

  console.log('\n=== ДМИТРИЕВ (536) - февраль 2026 ===');
  const r2 = await pool.request().query(`
    SELECT operation_type, wcr_code, SUM(count) as cnt, SUM(amount) as amt
    FROM operations
    WHERE operation_date >= '2026-02-01' AND operation_date < '2026-03-01' AND user_id = 536
    GROUP BY operation_type, wcr_code ORDER BY operation_type
  `);
  let tot2 = 0;
  r2.recordset.forEach(x => { tot2 += x.amt; console.log(x.operation_type + '\t' + (x.wcr_code||'NULL') + '\t' + x.cnt + '\t' + x.amt.toFixed(2)); });
  console.log('  ИТОГО: ' + tot2.toFixed(2) + '  (эталон: 70673.7)');

  // Check if any DEF ops exist in Feb at all
  console.log('\n=== ПМ_Упаковка / DEF операции в феврале ===');
  const r3 = await pool.request().query(`
    SELECT u.fio, operation_type, wcr_code, SUM(count) as cnt, SUM(amount) as amt
    FROM operations o JOIN users u ON u.id = o.user_id
    WHERE operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
      AND (wcr_code = 'DEF' OR operation_type LIKE N'%ПМ%')
    GROUP BY u.fio, operation_type, wcr_code ORDER BY u.fio
  `);
  if (r3.recordset.length === 0) {
    console.log('  ПУСТО - DEF / ПМ операций нет!');
  } else {
    r3.recordset.forEach(x => console.log(x.fio + '\t' + x.operation_type + '\t' + (x.wcr_code||'NULL') + '\t' + x.cnt + '\t' + x.amt.toFixed(2)));
  }

  // Check Евстигнеева who should have DEF
  console.log('\n=== Евстигнеева ===');
  const r4 = await pool.request().query(`
    SELECT id, fio, employee_id FROM users WHERE fio LIKE N'%ЕВСТИГ%'
  `);
  r4.recordset.forEach(x => console.log('id=' + x.id + '\t' + x.fio + '\t' + x.employee_id));

  await pool.close();
}
run().catch(console.error);
