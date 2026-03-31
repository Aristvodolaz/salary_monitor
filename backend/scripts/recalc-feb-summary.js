/**
 * Пересчёт salary_summary за февраль 2026 после корректировки операций
 */
const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

async function main() {
  const pool = await sql.connect(cfg);

  // Check salary_summary content for Feb 2026
  const checkRes = await pool.request().query(
    "SELECT COUNT(*) as cnt, SUM(total_amount) as total FROM salary_summary " +
    "WHERE period_start >= '2026-02-01' AND period_start < '2026-03-01'"
  );
  console.log(`Текущие записи в salary_summary за фев 2026: ${checkRes.recordset[0].cnt} строк, сумма=${checkRes.recordset[0].total}`);

  // Sample
  const sampleRes = await pool.request().query(
    "SELECT TOP 3 * FROM salary_summary WHERE period_start >= '2026-02-01' AND period_start < '2026-03-01' ORDER BY total_amount DESC"
  );
  sampleRes.recordset.forEach(r => console.log('  Пример:', JSON.stringify(r)));

  // Get view definitions if any
  const viewsRes = await pool.request().query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS ORDER BY TABLE_NAME"
  );
  console.log('\nПредставления (views):', viewsRes.recordset.map(r => r.TABLE_NAME).join(', '));

  // Check if there are views for salary calculation
  try {
    const viewRes = await pool.request().query(
      "SELECT TOP 3 * FROM v_salary_summary WHERE period_start >= '2026-02-01' AND period_start < '2026-03-01' ORDER BY total_amount DESC"
    );
    console.log('\nv_salary_summary:', JSON.stringify(viewRes.recordset));
  } catch(e) {
    console.log('v_salary_summary: ' + e.message);
  }

  // How salary_summary gets populated: rebuild for Feb 2026
  // salary_summary = SUM(operations.amount) per user per period
  console.log('\n=== Пересчёт salary_summary за февраль 2026 ===');

  // Delete existing Feb 2026 entries
  const delRes = await pool.request().query(
    "DELETE FROM salary_summary WHERE period_start >= '2026-02-01' AND period_start < '2026-03-01'"
  );
  console.log(`Удалено старых записей: ${delRes.rowsAffected[0]}`);

  // Re-insert from operations
  const insRes = await pool.request().query(`
    INSERT INTO salary_summary (user_id, period_start, period_end, total_amount, quality_coefficient, errors_count)
    SELECT
      o.user_id,
      '2026-02-01' as period_start,
      '2026-02-28' as period_end,
      SUM(o.amount) as total_amount,
      1.0 as quality_coefficient,
      0 as errors_count
    FROM operations o
    WHERE o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01'
    GROUP BY o.user_id
    HAVING SUM(o.amount) > 0
  `);
  console.log(`Вставлено новых записей: ${insRes.rowsAffected[0]}`);

  // Verify
  const checkRes2 = await pool.request().query(
    "SELECT COUNT(*) as cnt, SUM(total_amount) as total FROM salary_summary " +
    "WHERE period_start >= '2026-02-01' AND period_start < '2026-03-01'"
  );
  console.log(`После пересчёта: ${checkRes2.recordset[0].cnt} строк, сумма=${checkRes2.recordset[0].total?.toFixed(2)}`);

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
