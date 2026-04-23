/**
 * Пересчёт зарплаты за март 2026 по всем складам.
 * 1. Обновляет operation_type + participant_area из wcr_mapping
 * 2. Пересчитывает amount на основе tariffs
 * 3. Выводит итоговый отчёт по сотрудникам каждого склада
 *
 * Запуск: node database/run_recalculate_march.js
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
  console.log('✅ Подключено к БД\n');

  // ── Шаг 1: обновляем operation_type + participant_area из wcr_mapping ──────
  console.log('=== Шаг 1: обновление operation_type + participant_area ===');
  const upd1 = await pool.request().query(`
    UPDATE o
    SET
      o.operation_type   = wm.operation_type,
      o.participant_area = wm.participant_area,
      o.updated_at       = GETDATE()
    FROM operations o
    INNER JOIN wcr_mapping wm ON wm.wcr_code = o.wcr_code AND wm.is_active = 1
    WHERE o.operation_date >= '${DATE_FROM}'
      AND o.operation_date <  DATEADD(DAY, 1, CAST('${DATE_TO}' AS DATE))
  `);
  console.log(`  Обновлено operation_type/participant_area: ${upd1.rowsAffected[0]} строк`);

  // Обнуляем NULL participant_area (для неизвестных WCR)
  const upd0 = await pool.request().query(`
    UPDATE operations SET participant_area = '', updated_at = GETDATE()
    WHERE operation_date >= '${DATE_FROM}'
      AND operation_date <  DATEADD(DAY, 1, CAST('${DATE_TO}' AS DATE))
      AND participant_area IS NULL
  `);
  if (upd0.rowsAffected[0] > 0) console.log(`  Исправлено NULL participant_area: ${upd0.rowsAffected[0]}`);

  // ── Шаг 2: пересчёт amount по тарифам ─────────────────────────────────────
  console.log('\n=== Шаг 2: пересчёт amount ===');
  const upd2 = await pool.request().query(`
    ;WITH BestTariff AS (
      SELECT
        operation_type, rate,
        ROW_NUMBER() OVER (
          PARTITION BY operation_type
          ORDER BY
            CASE WHEN warehouse_code = 'ALL' THEN 2 ELSE 1 END,
            valid_from DESC
        ) AS rn
      FROM tariffs
      WHERE is_active = 1
        AND '${DATE_FROM}' >= CAST(valid_from AS NVARCHAR)
        AND (valid_to IS NULL OR '${DATE_TO}' <= CAST(valid_to AS NVARCHAR))
    )
    UPDATE o
    SET
      o.amount     = CASE
                       WHEN o.participant_area = N'Приемка и Хранение'
                         THEN o.[count]               * t.rate
                       ELSE  ISNULL(o.prod_count, 0)  * t.rate
                     END,
      o.updated_at = GETDATE()
    FROM operations o
    INNER JOIN BestTariff t ON t.operation_type = o.operation_type AND t.rn = 1
    WHERE o.operation_date >= '${DATE_FROM}'
      AND o.operation_date <  DATEADD(DAY, 1, CAST('${DATE_TO}' AS DATE))
  `);
  console.log(`  Пересчитано amount (есть тариф): ${upd2.rowsAffected[0]} строк`);

  // Обнуляем amount там где тарифа нет
  const upd3 = await pool.request().query(`
    UPDATE o SET o.amount = 0, o.updated_at = GETDATE()
    FROM operations o
    WHERE o.operation_date >= '${DATE_FROM}'
      AND o.operation_date <  DATEADD(DAY, 1, CAST('${DATE_TO}' AS DATE))
      AND NOT EXISTS (
        SELECT 1 FROM tariffs t
        WHERE t.operation_type = o.operation_type AND t.is_active = 1
          AND '${DATE_FROM}' >= CAST(t.valid_from AS NVARCHAR)
          AND (t.valid_to IS NULL OR '${DATE_TO}' <= CAST(t.valid_to AS NVARCHAR))
      )
  `);
  console.log(`  Обнулено amount (нет тарифа): ${upd3.rowsAffected[0]} строк`);

  // ── Шаг 3: сводка по складам ПОСЛЕ пересчёта ──────────────────────────────
  console.log('\n=== Шаг 3: сводка по складам (после пересчёта) ===');
  const summary = await pool.request().query(`
    SELECT
      o.warehouse_code,
      COUNT(*)                                         AS records,
      COUNT(DISTINCT o.user_id)                        AS users,
      SUM(CASE WHEN ISNULL(o.amount,0) > 0 THEN 1 ELSE 0 END) AS with_amount,
      SUM(CASE WHEN ISNULL(o.amount,0) = 0 THEN 1 ELSE 0 END) AS zero_amount,
      ROUND(SUM(ISNULL(o.amount,0)), 2)                AS total_amount_rub
    FROM operations o
    WHERE o.operation_date >= '${DATE_FROM}'
      AND o.operation_date <  DATEADD(DAY, 1, CAST('${DATE_TO}' AS DATE))
    GROUP BY o.warehouse_code
    ORDER BY o.warehouse_code
  `);
  console.table(summary.recordset);

  // ── Шаг 4: WCR без тарифа (топ) ───────────────────────────────────────────
  console.log('\n=== WCR без тарифа (топ-15, BRAK исключён) ===');
  const noTariff = await pool.request().query(`
    SELECT TOP 15
      o.wcr_code,
      COUNT(*) AS cnt,
      SUM(o.[count]) AS total_aei,
      SUM(ISNULL(o.prod_count,0)) AS total_prod,
      COUNT(DISTINCT o.warehouse_code) AS wh_count
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
    ORDER BY cnt DESC
  `);
  console.table(noTariff.recordset);

  // ── Шаг 5: выработка сотрудников по каждому складу ───────────────────────
  const warehouses = await pool.request().query(`
    SELECT DISTINCT warehouse_code FROM operations
    WHERE operation_date >= '${DATE_FROM}'
      AND operation_date <  DATEADD(DAY, 1, CAST('${DATE_TO}' AS DATE))
    ORDER BY warehouse_code
  `);

  for (const { warehouse_code } of warehouses.recordset) {
    const emps = await pool.request().query(`
      SELECT
        u.employee_id,
        u.fio,
        COUNT(DISTINCT CAST(o.operation_date AS DATE))     AS work_days,
        -- Блок 1: АЕИ (wcr_norms)
        ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.[count]  ELSE 0 END), 0) AS total_aei,
        ROUND(ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount ELSE 0 END), 0), 2) AS aei_amount,
        -- Блок 2: Комплектация (wcr_picking_norms)
        ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL THEN ISNULL(o.prod_count,0) ELSE 0 END), 0) AS total_prod,
        ROUND(ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL
          THEN CASE WHEN wp.rate IS NOT NULL
                    THEN ISNULL(o.prod_count,0) * wp.rate
                    ELSE ISNULL(o.amount,0) END
          ELSE 0 END), 0), 2) AS picking_amount,
        -- Итого
        ROUND(
          ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount ELSE 0 END), 0) +
          ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL
            THEN CASE WHEN wp.rate IS NOT NULL
                      THEN ISNULL(o.prod_count,0) * wp.rate
                      ELSE ISNULL(o.amount,0) END
            ELSE 0 END), 0)
        , 2) AS total_amount
      FROM operations o
      INNER JOIN users u              ON o.user_id = u.id
      LEFT  JOIN wcr_norms         wn ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
      LEFT  JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
      WHERE o.warehouse_code = '${warehouse_code}'
        AND u.is_active = 1
        AND u.employee_id != '00000000'
        AND o.operation_date >= '${DATE_FROM}'
        AND o.operation_date <  DATEADD(DAY, 1, CAST('${DATE_TO}' AS DATE))
        AND (wn.wcr_code IS NOT NULL OR wp.wcr_code IS NOT NULL)
      GROUP BY u.id, u.employee_id, u.fio
      HAVING (
        ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount ELSE 0 END), 0) +
        ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL
          THEN CASE WHEN wp.rate IS NOT NULL
                    THEN ISNULL(o.prod_count,0) * wp.rate
                    ELSE ISNULL(o.amount,0) END
          ELSE 0 END), 0)
      ) > 0
      ORDER BY total_amount DESC
    `);

    if (emps.recordset.length === 0) continue;

    const grandTotal = emps.recordset.reduce((s, r) => s + r.total_amount, 0);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 СКЛАД: ${warehouse_code}   Сотрудников: ${emps.recordset.length}   Итого: ${grandTotal.toLocaleString('ru', {maximumFractionDigits:2})} руб.`);
    console.log('='.repeat(60));
    console.table(emps.recordset);
  }

  await pool.close();
  console.log('\n✅ Пересчёт завершён!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
