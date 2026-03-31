const sql = require('mssql');
const cfg = { server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587, database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU', options: { encrypt: false, trustServerCertificate: true } };

async function run() {
  const pool = await sql.connect(cfg);

  // Check Байыш
  const r = await pool.request().query(`
    SELECT u.fio, o.operation_type, o.wcr_code, SUM(o.count) as cnt, SUM(o.amount) as amt
    FROM operations o
    JOIN users u ON u.id = o.user_id
    WHERE o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01'
      AND u.fio LIKE N'%BAYYS%'
    GROUP BY u.fio, o.operation_type, o.wcr_code
    ORDER BY o.operation_type
  `);
  console.log('=== БАЙЫШ ===');
  let total = 0;
  r.recordset.forEach(x => { total += x.amt; console.log(x.operation_type + '\twcr=' + (x.wcr_code||'NULL') + '\tcnt=' + x.cnt + '\tamt=' + x.amt.toFixed(2)); });
  console.log('  ИТОГО: ' + total.toFixed(2) + '  (эталон: 47374)');

  // Check all DEF operations in Feb 2026
  const r2 = await pool.request().query(`
    SELECT u.fio, o.operation_type, o.wcr_code, SUM(o.count) as cnt, SUM(o.amount) as amt
    FROM operations o
    JOIN users u ON u.id = o.user_id
    WHERE o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01'
      AND o.wcr_code = 'DEF'
    GROUP BY u.fio, o.operation_type, o.wcr_code
    ORDER BY u.fio
  `);
  console.log('\n=== DEF операции (ПМ_Упаковка) ===');
  r2.recordset.forEach(x => console.log(x.fio + '\t' + x.operation_type + '\tcnt=' + x.cnt + '\tamt=' + x.amt.toFixed(2)));

  // Check Дмитриев
  const r3 = await pool.request().query(`
    SELECT u.fio, o.operation_type, o.wcr_code, SUM(o.count) as cnt, SUM(o.amount) as amt
    FROM operations o
    JOIN users u ON u.id = o.user_id
    WHERE o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01'
      AND u.fio LIKE N'%DMITRIEV%'
    GROUP BY u.fio, o.operation_type, o.wcr_code
    ORDER BY o.operation_type
  `);
  console.log('\n=== ДМИТРИЕВ ===');
  let total3 = 0;
  r3.recordset.forEach(x => { total3 += x.amt; console.log(x.operation_type + '\twcr=' + (x.wcr_code||'NULL') + '\tcnt=' + x.cnt + '\tamt=' + x.amt.toFixed(2)); });
  console.log('  ИТОГО: ' + total3.toFixed(2) + '  (эталон: 70673.7)');

  // salary_summary top 20
  const r4 = await pool.request().query(`
    SELECT TOP 20 u.fio, ss.total_amount
    FROM salary_summary ss
    JOIN users u ON u.id = ss.user_id
    WHERE ss.period_start = '2026-02-01'
    ORDER BY ss.total_amount DESC
  `);
  console.log('\n=== salary_summary ТОП-20 ===');
  r4.recordset.forEach(x => console.log(x.fio + '\t' + x.total_amount.toFixed(2)));

  await pool.close();
}
run().catch(console.error);
