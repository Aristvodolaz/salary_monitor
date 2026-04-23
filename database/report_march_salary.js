/**
 * Итоговый отчёт по зарплате за март 2026
 * Запуск: node database/report_march_salary.js
 */

const path = require('path');
const { createRequire } = require('module');
const sql = createRequire(path.join(__dirname, '..', 'backend', 'package.json'))('mssql');

const cfg = {
  server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587,
  database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 30000, requestTimeout: 300000,
};

const DATE_FROM = '2026-03-01';
const DATE_TO   = '2026-03-31';

async function main() {
  const pool = await sql.connect(cfg);
  console.log('✅ Подключено\n');

  // ── 1. Сводка по складам ────────────────────────────────────────────────────
  const summary = await pool.request().query(`
    SELECT
      o.warehouse_code,
      COUNT(*)                                              AS total_ops,
      COUNT(DISTINCT o.user_id)                             AS total_users,
      SUM(CASE WHEN ISNULL(o.amount,0) > 0 THEN 1 ELSE 0 END) AS paid_ops,
      SUM(CASE WHEN ISNULL(o.amount,0) = 0 THEN 1 ELSE 0 END) AS zero_ops,
      ROUND(SUM(ISNULL(o.amount,0)), 2)                     AS total_amount_rub
    FROM operations o
    WHERE o.operation_date >= '${DATE_FROM}'
      AND o.operation_date <  DATEADD(DAY, 1, CAST('${DATE_TO}' AS DATE))
    GROUP BY o.warehouse_code
    ORDER BY total_amount_rub DESC
  `);
  console.log('=== Сводка по складам, МАРТ 2026 ===');
  console.table(summary.recordset);

  const grandTotalWh = summary.recordset.reduce((s, r) => s + r.total_amount_rub, 0);
  console.log(`ИТОГО по всем складам: ${grandTotalWh.toLocaleString('ru', {maximumFractionDigits:2})} руб.\n`);

  // ── 2. Топ WCR с нулевым amount (не оплачиваются) ──────────────────────────
  const zeroWcr = await pool.request().query(`
    SELECT TOP 20
      o.wcr_code,
      COUNT(*) AS ops,
      SUM(o.[count]) AS total_aei,
      COUNT(DISTINCT o.warehouse_code) AS warehouses,
      COUNT(DISTINCT o.user_id) AS users
    FROM operations o
    WHERE o.operation_date >= '${DATE_FROM}'
      AND o.operation_date <  DATEADD(DAY, 1, CAST('${DATE_TO}' AS DATE))
      AND ISNULL(o.amount,0) = 0
      AND o.wcr_code IS NOT NULL
      AND o.wcr_code NOT LIKE '%BRAK%'
      AND o.wcr_code NOT LIKE 'INT_BR%'
      AND o.wcr_code NOT LIKE 'INTW%'
      AND o.wcr_code NOT LIKE 'OUT_%'
    GROUP BY o.wcr_code
    ORDER BY ops DESC
  `);
  console.log('=== ТОП-20 WCR без оплаты (не в таблице цен) ===');
  console.table(zeroWcr.recordset);

  // ── 3. Выработка сотрудников по каждому складу ─────────────────────────────
  const warehouses = await pool.request().query(`
    SELECT DISTINCT warehouse_code
    FROM operations
    WHERE operation_date >= '${DATE_FROM}'
      AND operation_date <  DATEADD(DAY, 1, CAST('${DATE_TO}' AS DATE))
      AND ISNULL(amount,0) > 0
    ORDER BY warehouse_code
  `);

  for (const { warehouse_code } of warehouses.recordset) {
    const emps = await pool.request().query(`
      SELECT
        u.employee_id,
        u.fio,
        COUNT(DISTINCT CAST(o.operation_date AS DATE)) AS work_days,
        ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.[count]  ELSE 0 END), 0) AS aei_count,
        ROUND(ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount ELSE 0 END), 0), 2) AS aei_amount,
        ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL THEN ISNULL(o.prod_count,0) ELSE 0 END), 0) AS prod_count,
        ROUND(ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL THEN o.amount ELSE 0 END), 0), 2) AS pick_amount,
        ROUND(ISNULL(SUM(o.amount), 0), 2) AS total_amount
      FROM operations o
      INNER JOIN users u              ON o.user_id = u.id
      LEFT  JOIN wcr_norms         wn ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
      LEFT  JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
      WHERE o.warehouse_code = '${warehouse_code}'
        AND u.is_active = 1
        AND u.employee_id != '00000000'
        AND o.operation_date >= '${DATE_FROM}'
        AND o.operation_date <  DATEADD(DAY, 1, CAST('${DATE_TO}' AS DATE))
        AND ISNULL(o.amount,0) > 0
      GROUP BY u.id, u.employee_id, u.fio
      ORDER BY total_amount DESC
    `);

    if (emps.recordset.length === 0) continue;

    const total = emps.recordset.reduce((s, r) => s + r.total_amount, 0);
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📦 СКЛАД: ${warehouse_code}   Сотрудников: ${emps.recordset.length}   ИТОГО: ${total.toLocaleString('ru', {maximumFractionDigits:2})} руб.`);
    console.log('='.repeat(70));
    console.table(emps.recordset);
  }

  await pool.close();
  console.log('\n✅ Отчёт завершён!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
