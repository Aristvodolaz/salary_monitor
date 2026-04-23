-- =============================================
-- Аналитика: сравнение RAW-данных SAP с обработанными операциями
-- Запускать после заполнения sap_raw через import_sap_march.js
--
-- Переменные — подставьте нужные значения перед запуском:
-- =============================================

USE SalaryMonitor;
GO

DECLARE @batch    NVARCHAR(50) = '2026-03-PPMC';  -- метка импорта
DECLARE @wh       NVARCHAR(10) = 'PPMC';           -- склад
DECLARE @dateFrom DATE = '2026-03-01';
DECLARE @dateTo   DATE = '2026-03-31';

-- ══════════════════════════════════════════════════════════════════
-- 1. ОБЩАЯ СВОДКА: что пришло из SAP и что попало в operations
-- ══════════════════════════════════════════════════════════════════
PRINT '=== 1. Общая сводка raw vs operations ===';

SELECT
  r.warehouse_code,
  COUNT(*)                                                     AS raw_total,
  SUM(CASE WHEN r.parsed_skipped = 1 THEN 1 ELSE 0 END)       AS skipped_parse,   -- aei=prod=0 или нет empId
  SUM(CASE WHEN r.parsed_skipped = 0 AND r.wcr_known = 0 THEN 1 ELSE 0 END) AS unknown_wcr,  -- не в wcr_mapping
  SUM(CASE WHEN r.parsed_skipped = 0 AND r.mapped_has_tariff = 0 THEN 1 ELSE 0 END) AS no_tariff,
  SUM(CASE WHEN r.parsed_skipped = 0 AND r.user_found = 0 THEN 1 ELSE 0 END)  AS unknown_user,
  SUM(CASE WHEN r.user_found = 1 AND r.parsed_skipped = 0 THEN 1 ELSE 0 END)  AS mapped_ok,
  -- Итоговое количество в operations
  (SELECT COUNT(*) FROM operations o
   WHERE o.warehouse_code = r.warehouse_code
     AND o.operation_date >= @dateFrom AND o.operation_date <= DATEADD(DAY,1,@dateTo)) AS in_operations
FROM sap_raw r
WHERE r.sync_batch = @batch
GROUP BY r.warehouse_code;
GO

-- ══════════════════════════════════════════════════════════════════
-- 2. НЕИЗВЕСТНЫЕ WCR-КОДЫ (есть в SAP, нет в wcr_mapping)
-- ══════════════════════════════════════════════════════════════════
PRINT '=== 2. Неизвестные WCR-коды ===';

SELECT
  r.raw_wcr,
  COUNT(*)                         AS occurrences,
  COUNT(DISTINCT r.parsed_employee_id) AS unique_employees,
  SUM(r.parsed_aei_count)          AS total_aei,
  SUM(r.parsed_prod_count)         AS total_prod,
  MIN(r.period_date)               AS first_date,
  MAX(r.period_date)               AS last_date
FROM sap_raw r
WHERE r.sync_batch = @batch
  AND r.parsed_skipped = 0
  AND r.wcr_known = 0
  AND r.raw_wcr IS NOT NULL
  AND r.raw_wcr != ''
GROUP BY r.raw_wcr
ORDER BY occurrences DESC;
GO

-- ══════════════════════════════════════════════════════════════════
-- 3. ОПЕРАЦИИ БЕЗ ТАРИФА (WCR известен, но нет расценки)
-- ══════════════════════════════════════════════════════════════════
PRINT '=== 3. Операции без тарифа (нулевая сумма) ===';

SELECT
  r.mapped_operation_type,
  r.mapped_participant_area,
  COUNT(*)                         AS occurrences,
  SUM(r.mapped_cnt)                AS total_cnt,
  MIN(r.period_date)               AS first_date,
  MAX(r.period_date)               AS last_date
FROM sap_raw r
WHERE r.sync_batch = @batch
  AND r.parsed_skipped = 0
  AND r.wcr_known = 1
  AND r.mapped_has_tariff = 0
GROUP BY r.mapped_operation_type, r.mapped_participant_area
ORDER BY occurrences DESC;
GO

-- ══════════════════════════════════════════════════════════════════
-- 4. ПОТЕРИ ПО СОТРУДНИКАМ: raw vs operations
-- ══════════════════════════════════════════════════════════════════
PRINT '=== 4. Потери по сотрудникам (raw AEI vs operations count) ===';

SELECT
  r.parsed_employee_id,
  MAX(r.raw_mc_name1 + ' ' + r.raw_mc_name2) AS employee_name,
  SUM(r.parsed_aei_count)  AS raw_total_aei,
  SUM(r.parsed_prod_count) AS raw_total_prod,
  ISNULL(SUM(o.count), 0)      AS ops_total_aei,
  ISNULL(SUM(o.prod_count), 0) AS ops_total_prod,
  SUM(r.parsed_aei_count)  - ISNULL(SUM(o.count), 0) AS delta_aei,
  SUM(r.parsed_prod_count) - ISNULL(SUM(o.prod_count), 0) AS delta_prod
FROM sap_raw r
LEFT JOIN users u ON u.employee_id = r.parsed_employee_id
LEFT JOIN operations o
  ON o.user_id = u.id
  AND o.warehouse_code = r.warehouse_code
  AND o.operation_date >= @dateFrom
  AND o.operation_date <  DATEADD(DAY, 1, @dateTo)
WHERE r.sync_batch = @batch
  AND r.parsed_skipped = 0
GROUP BY r.parsed_employee_id
HAVING SUM(r.parsed_aei_count) - ISNULL(SUM(o.count), 0) <> 0
    OR SUM(r.parsed_prod_count) - ISNULL(SUM(o.prod_count), 0) <> 0
ORDER BY ABS(SUM(r.parsed_aei_count) - ISNULL(SUM(o.count), 0)) DESC;
GO

-- ══════════════════════════════════════════════════════════════════
-- 5. ВЫРАБОТКА ПО СОТРУДНИКАМ (итог из operations)
--    Блок 1: АЕИ × rate из wcr_norms / wcr_mapping
--    Блок 2: prod_count × rate из wcr_picking_norms
-- ══════════════════════════════════════════════════════════════════
PRINT '=== 5. Итоговая выработка сотрудников (Блок1 + Блок2) ===';

SELECT
  u.employee_id,
  u.fio,
  COUNT(DISTINCT CAST(o.operation_date AS DATE))     AS work_days,

  -- Блок 1: АЕИ (нормативные из wcr_norms)
  ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.[count]  ELSE 0 END), 0) AS total_aei,
  ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount   ELSE 0 END), 0) AS aei_amount,

  -- Блок 2: Комплектация (нормативные из wcr_picking_norms)
  ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL THEN ISNULL(o.prod_count,0) ELSE 0 END), 0) AS total_prod,
  ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL
                  THEN CASE WHEN wp.rate IS NOT NULL
                            THEN ISNULL(o.prod_count,0) * wp.rate
                            ELSE ISNULL(o.amount,0) END
                  ELSE 0 END), 0)                                             AS picking_amount,

  -- Итого
  ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount ELSE 0 END), 0) +
  ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL
                  THEN CASE WHEN wp.rate IS NOT NULL
                            THEN ISNULL(o.prod_count,0) * wp.rate
                            ELSE ISNULL(o.amount,0) END
                  ELSE 0 END), 0)                                             AS total_amount
FROM operations o
INNER JOIN users u ON o.user_id = u.id
LEFT  JOIN wcr_norms         wn ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
LEFT  JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
WHERE o.warehouse_code = @wh
  AND u.is_active = 1
  AND u.employee_id != '00000000'
  AND o.operation_date >= @dateFrom
  AND o.operation_date <  DATEADD(DAY, 1, @dateTo)
  AND (wn.wcr_code IS NOT NULL OR wp.wcr_code IS NOT NULL)
GROUP BY u.id, u.employee_id, u.fio
ORDER BY total_amount DESC;
GO

-- ══════════════════════════════════════════════════════════════════
-- 6. ДЕТАЛИЗАЦИЯ ПО WCR-КОДАМ: сколько пришло из SAP и что записалось
-- ══════════════════════════════════════════════════════════════════
PRINT '=== 6. Детализация по WCR-кодам (raw vs operations) ===';

SELECT
  r.raw_wcr,
  r.mapped_operation_type,
  r.mapped_participant_area,
  CASE WHEN r.wcr_known = 1 THEN 'да' ELSE 'нет' END    AS in_wcr_mapping,
  CASE WHEN r.mapped_has_tariff = 1 THEN 'да' ELSE 'нет' END AS has_tariff,
  r.mapped_rate,
  SUM(r.parsed_aei_count)   AS raw_total_aei,
  SUM(r.parsed_prod_count)  AS raw_total_prod,
  SUM(r.mapped_cnt)         AS raw_cnt_for_amount,
  SUM(r.mapped_amount)      AS raw_calc_amount,
  -- Фактически записано в operations
  ISNULL((
    SELECT SUM(o.[count])
    FROM operations o
    WHERE o.wcr_code = r.raw_wcr
      AND o.warehouse_code = r.warehouse_code
      AND o.operation_date >= @dateFrom
      AND o.operation_date <  DATEADD(DAY,1,@dateTo)
  ), 0) AS ops_total_aei,
  ISNULL((
    SELECT SUM(o.amount)
    FROM operations o
    WHERE o.wcr_code = r.raw_wcr
      AND o.warehouse_code = r.warehouse_code
      AND o.operation_date >= @dateFrom
      AND o.operation_date <  DATEADD(DAY,1,@dateTo)
  ), 0) AS ops_total_amount
FROM sap_raw r
WHERE r.sync_batch = @batch
  AND r.parsed_skipped = 0
GROUP BY r.raw_wcr, r.mapped_operation_type, r.mapped_participant_area,
         r.wcr_known, r.mapped_has_tariff, r.mapped_rate, r.warehouse_code
ORDER BY raw_total_aei DESC;
GO

-- ══════════════════════════════════════════════════════════════════
-- 7. ПРОВЕРКА АЕИ-КОДОВ (Блок 1): только "Приемка и Хранение"
-- ══════════════════════════════════════════════════════════════════
PRINT '=== 7. АЕИ-коды (Блок 1): raw vs operations ===';

SELECT
  r.raw_wcr,
  r.mapped_operation_type,
  COUNT(DISTINCT r.parsed_employee_id) AS employees,
  SUM(r.parsed_aei_count)              AS raw_aei_total,
  SUM(r.mapped_amount)                 AS raw_calc_amount,
  ISNULL((SELECT SUM(o.[count]) FROM operations o
          WHERE o.wcr_code = r.raw_wcr
            AND o.warehouse_code = r.warehouse_code
            AND o.operation_date >= @dateFrom
            AND o.operation_date <  DATEADD(DAY,1,@dateTo)), 0) AS ops_aei,
  ISNULL((SELECT SUM(o.amount) FROM operations o
          WHERE o.wcr_code = r.raw_wcr
            AND o.warehouse_code = r.warehouse_code
            AND o.operation_date >= @dateFrom
            AND o.operation_date <  DATEADD(DAY,1,@dateTo)), 0) AS ops_amount
FROM sap_raw r
WHERE r.sync_batch = @batch
  AND r.parsed_skipped = 0
  AND r.mapped_participant_area = N'Приемка и Хранение'
GROUP BY r.raw_wcr, r.mapped_operation_type, r.warehouse_code
ORDER BY raw_aei_total DESC;
GO

-- ══════════════════════════════════════════════════════════════════
-- 8. ПРОВЕРКА PICKING-КОДОВ (Блок 2): prod_count
-- ══════════════════════════════════════════════════════════════════
PRINT '=== 8. Picking-коды (Блок 2): raw vs operations ===';

SELECT
  r.raw_wcr,
  r.mapped_operation_type,
  r.mapped_participant_area,
  COUNT(DISTINCT r.parsed_employee_id) AS employees,
  SUM(r.parsed_prod_count)             AS raw_prod_total,
  SUM(r.mapped_amount)                 AS raw_calc_amount,
  ISNULL((SELECT SUM(o.prod_count) FROM operations o
          WHERE o.wcr_code = r.raw_wcr
            AND o.warehouse_code = r.warehouse_code
            AND o.operation_date >= @dateFrom
            AND o.operation_date <  DATEADD(DAY,1,@dateTo)), 0) AS ops_prod,
  ISNULL((SELECT SUM(o.amount) FROM operations o
          WHERE o.wcr_code = r.raw_wcr
            AND o.warehouse_code = r.warehouse_code
            AND o.operation_date >= @dateFrom
            AND o.operation_date <  DATEADD(DAY,1,@dateTo)), 0) AS ops_amount
FROM sap_raw r
WHERE r.sync_batch = @batch
  AND r.parsed_skipped = 0
  AND r.mapped_participant_area != N'Приемка и Хранение'
  AND r.mapped_participant_area IS NOT NULL
  AND r.mapped_participant_area != ''
GROUP BY r.raw_wcr, r.mapped_operation_type, r.mapped_participant_area, r.warehouse_code
ORDER BY raw_prod_total DESC;
GO

-- ══════════════════════════════════════════════════════════════════
-- 9. ЗАПИСИ С НУЛЕВЫМ AMOUNT (без тарифа или без маппинга)
-- ══════════════════════════════════════════════════════════════════
PRINT '=== 9. Операции с amount=0 в operations ===';

SELECT
  o.wcr_code,
  o.operation_type,
  o.participant_area,
  COUNT(*)         AS count_ops,
  SUM(o.[count])   AS total_aei,
  SUM(o.prod_count)AS total_prod,
  -- Есть ли в справочниках
  MAX(CASE WHEN wn.wcr_code IS NOT NULL THEN 1 ELSE 0 END) AS in_wcr_norms,
  MAX(CASE WHEN wp.wcr_code IS NOT NULL THEN 1 ELSE 0 END) AS in_wcr_picking,
  MAX(CASE WHEN wm.wcr_code IS NOT NULL THEN 1 ELSE 0 END) AS in_wcr_mapping
FROM operations o
LEFT JOIN wcr_norms wn         ON wn.wcr_code = o.wcr_code
LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code
LEFT JOIN wcr_mapping wm       ON wm.wcr_code = o.wcr_code
WHERE o.warehouse_code = @wh
  AND o.operation_date >= @dateFrom
  AND o.operation_date <  DATEADD(DAY, 1, @dateTo)
  AND ISNULL(o.amount, 0) = 0
GROUP BY o.wcr_code, o.operation_type, o.participant_area
ORDER BY count_ops DESC;
GO

-- ══════════════════════════════════════════════════════════════════
-- 10. ИТОГОВЫЙ ЧЕКЛИСТ МАРТ
-- ══════════════════════════════════════════════════════════════════
PRINT '=== 10. Итоговый чеклист ===';

SELECT
  'RAW записей из SAP'           AS metric,
  CAST(COUNT(*) AS NVARCHAR)     AS value
FROM sap_raw WHERE sync_batch = @batch

UNION ALL SELECT 'Из них пропущено (aei=prod=0)', CAST(SUM(CASE WHEN parsed_skipped=1 THEN 1 ELSE 0 END) AS NVARCHAR)
FROM sap_raw WHERE sync_batch = @batch

UNION ALL SELECT 'Из них неизвестный WCR', CAST(SUM(CASE WHEN parsed_skipped=0 AND wcr_known=0 THEN 1 ELSE 0 END) AS NVARCHAR)
FROM sap_raw WHERE sync_batch = @batch

UNION ALL SELECT 'Из них нет тарифа', CAST(SUM(CASE WHEN parsed_skipped=0 AND mapped_has_tariff=0 THEN 1 ELSE 0 END) AS NVARCHAR)
FROM sap_raw WHERE sync_batch = @batch

UNION ALL SELECT 'Записей в operations за период',
  CAST((SELECT COUNT(*) FROM operations WHERE warehouse_code=@wh
        AND operation_date>=@dateFrom AND operation_date<DATEADD(DAY,1,@dateTo)) AS NVARCHAR) AS value
FROM (SELECT 1 AS x) AS dummy

UNION ALL SELECT 'Сотрудников с выработкой',
  CAST((SELECT COUNT(DISTINCT user_id) FROM operations WHERE warehouse_code=@wh
        AND operation_date>=@dateFrom AND operation_date<DATEADD(DAY,1,@dateTo)
        AND amount > 0) AS NVARCHAR) AS value
FROM (SELECT 1 AS x) AS dummy

UNION ALL SELECT 'Сумма АЕИ в operations',
  CAST((SELECT ISNULL(SUM([count]),0) FROM operations WHERE warehouse_code=@wh
        AND operation_date>=@dateFrom AND operation_date<DATEADD(DAY,1,@dateTo)) AS NVARCHAR) AS value
FROM (SELECT 1 AS x) AS dummy

UNION ALL SELECT 'Сумма amount в operations (руб.)',
  CAST((SELECT ISNULL(ROUND(SUM(amount),2),0) FROM operations WHERE warehouse_code=@wh
        AND operation_date>=@dateFrom AND operation_date<DATEADD(DAY,1,@dateTo)) AS NVARCHAR) AS value
FROM (SELECT 1 AS x) AS dummy;
GO
