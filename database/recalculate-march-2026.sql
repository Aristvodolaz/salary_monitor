-- ============================================================
-- Пересчёт зарплаты за март 2026
-- Обновляет operation_type / participant_area / amount в таблице operations
-- на основе актуальных справочников wcr_mapping + tariffs.
--
-- ПОРЯДОК ЗАПУСКА:
--   1. Убедитесь что миграция 017 применена (АЕИ-коды в wcr_mapping).
--   2. Запустите этот скрипт в SSMS.
--   3. Внизу — итоговый отчёт по сотрудникам.
--
-- ВАЖНО: скрипт обновляет ТОЛЬКО март 2026 и ТОЛЬКО склад @wh.
--         Чтобы пересчитать другой склад — измените @wh.
--         Чтобы пересчитать все склады — уберите AND o.warehouse_code = @wh.
-- ============================================================

USE SalaryMonitor;
GO

SET NOCOUNT ON;

DECLARE @wh       NVARCHAR(10) = 'PPMC';       -- ← код склада (или 'ALL' убрать фильтр)
DECLARE @dateFrom DATE = '2026-03-01';
DECLARE @dateTo   DATE = '2026-03-31';

PRINT '==============================================';
PRINT 'Пересчёт зарплаты за март 2026';
PRINT 'Склад: ' + @wh;
PRINT 'Период: ' + CAST(@dateFrom AS NVARCHAR) + ' — ' + CAST(@dateTo AS NVARCHAR);
PRINT CONVERT(NVARCHAR, GETDATE(), 120);
PRINT '==============================================';
PRINT '';

-- ══════════════════════════════════════════════════════════════════
-- ШАГ 1. Диагностика ПЕРЕД пересчётом
-- ══════════════════════════════════════════════════════════════════

PRINT '--- Состояние operations ДО пересчёта ---';

SELECT
  'Всего записей'      AS metric,
  CAST(COUNT(*) AS NVARCHAR) AS value
FROM operations
WHERE warehouse_code = @wh
  AND operation_date >= @dateFrom AND operation_date < DATEADD(DAY,1,@dateTo)

UNION ALL SELECT
  'Из них amount = 0',
  CAST(SUM(CASE WHEN ISNULL(amount,0) = 0 THEN 1 ELSE 0 END) AS NVARCHAR)
FROM operations
WHERE warehouse_code = @wh
  AND operation_date >= @dateFrom AND operation_date < DATEADD(DAY,1,@dateTo)

UNION ALL SELECT
  'Уникальных WCR-кодов',
  CAST(COUNT(DISTINCT wcr_code) AS NVARCHAR)
FROM operations
WHERE warehouse_code = @wh
  AND operation_date >= @dateFrom AND operation_date < DATEADD(DAY,1,@dateTo)

UNION ALL SELECT
  'Сумма amount (руб.)',
  CAST(ROUND(ISNULL(SUM(amount),0), 2) AS NVARCHAR)
FROM operations
WHERE warehouse_code = @wh
  AND operation_date >= @dateFrom AND operation_date < DATEADD(DAY,1,@dateTo);

-- ══════════════════════════════════════════════════════════════════
-- ШАГ 2. Обновление operation_type и participant_area из wcr_mapping
-- ══════════════════════════════════════════════════════════════════

PRINT '';
PRINT '--- Шаг 2: обновление operation_type + participant_area ---';

UPDATE o
SET
  o.operation_type   = wm.operation_type,
  o.participant_area = wm.participant_area,
  o.updated_at       = GETDATE()
FROM operations o
INNER JOIN wcr_mapping wm ON wm.wcr_code = o.wcr_code AND wm.is_active = 1
WHERE o.warehouse_code = @wh
  AND o.operation_date >= @dateFrom
  AND o.operation_date <  DATEADD(DAY, 1, @dateTo);

PRINT 'Обновлено operation_type/participant_area: ' + CAST(@@ROWCOUNT AS NVARCHAR) + ' строк';

-- ══════════════════════════════════════════════════════════════════
-- ШАГ 3. Для записей с неизвестным WCR — operation_type = wcr_code (оставляем как есть)
-- Убеждаемся что participant_area не NULL для них
-- ══════════════════════════════════════════════════════════════════

UPDATE operations
SET participant_area = '',
    updated_at = GETDATE()
WHERE warehouse_code = @wh
  AND operation_date >= @dateFrom
  AND operation_date <  DATEADD(DAY, 1, @dateTo)
  AND participant_area IS NULL;

PRINT 'Исправлено NULL participant_area: ' + CAST(@@ROWCOUNT AS NVARCHAR) + ' строк';

-- ══════════════════════════════════════════════════════════════════
-- ШАГ 4. Пересчёт amount с правильным тарифом
-- Логика:
--   participant_area = 'Приемка и Хранение' → cnt = operations.count (aei_count)
--   иначе                                    → cnt = ISNULL(operations.prod_count, 0)
-- Тариф берётся из tariffs: warehouse-specific приоритет над ALL
-- ══════════════════════════════════════════════════════════════════

PRINT '';
PRINT '--- Шаг 4: пересчёт amount ---';

-- CTE с лучшим тарифом для каждой (warehouse_code, operation_type)
;WITH BestTariff AS (
  SELECT
    operation_type,
    warehouse_code,
    rate,
    ROW_NUMBER() OVER (
      PARTITION BY operation_type
      ORDER BY
        CASE WHEN warehouse_code = @wh THEN 1 ELSE 2 END,  -- склад-специфик приоритет
        valid_from DESC
    ) AS rn
  FROM tariffs
  WHERE is_active = 1
    AND (warehouse_code = @wh OR warehouse_code = 'ALL')
    AND @dateFrom >= valid_from
    AND (valid_to IS NULL OR @dateTo <= valid_to)
)
UPDATE o
SET
  o.amount     = CASE
                   WHEN o.participant_area = N'Приемка и Хранение'
                     THEN o.[count]                  * t.rate   -- Блок 1: АЕИ × ставка
                   ELSE  ISNULL(o.prod_count, 0)    * t.rate   -- Блок 2: продукты × ставка
                 END,
  o.updated_at = GETDATE()
FROM operations o
INNER JOIN BestTariff t
  ON t.operation_type = o.operation_type AND t.rn = 1
WHERE o.warehouse_code = @wh
  AND o.operation_date >= @dateFrom
  AND o.operation_date <  DATEADD(DAY, 1, @dateTo);

PRINT 'Пересчитано amount (есть тариф): ' + CAST(@@ROWCOUNT AS NVARCHAR) + ' строк';

-- Обнуляем amount там, где тарифа нет (чтобы не было старых значений)
UPDATE operations
SET amount     = 0,
    updated_at = GETDATE()
FROM operations o
WHERE o.warehouse_code = @wh
  AND o.operation_date >= @dateFrom
  AND o.operation_date <  DATEADD(DAY, 1, @dateTo)
  AND NOT EXISTS (
    SELECT 1 FROM tariffs t
    WHERE t.operation_type = o.operation_type
      AND t.is_active = 1
      AND (t.warehouse_code = @wh OR t.warehouse_code = 'ALL')
      AND @dateFrom >= t.valid_from
      AND (t.valid_to IS NULL OR @dateTo <= t.valid_to)
  );

PRINT 'Обнулено amount (нет тарифа): ' + CAST(@@ROWCOUNT AS NVARCHAR) + ' строк';

-- ══════════════════════════════════════════════════════════════════
-- ШАГ 5. Диагностика ПОСЛЕ пересчёта
-- ══════════════════════════════════════════════════════════════════

PRINT '';
PRINT '--- Состояние operations ПОСЛЕ пересчёта ---';

SELECT
  'Всего записей'   AS metric,
  CAST(COUNT(*) AS NVARCHAR) AS value
FROM operations
WHERE warehouse_code = @wh
  AND operation_date >= @dateFrom AND operation_date < DATEADD(DAY,1,@dateTo)

UNION ALL SELECT
  'amount > 0',
  CAST(SUM(CASE WHEN ISNULL(amount,0) > 0 THEN 1 ELSE 0 END) AS NVARCHAR)
FROM operations
WHERE warehouse_code = @wh
  AND operation_date >= @dateFrom AND operation_date < DATEADD(DAY,1,@dateTo)

UNION ALL SELECT
  'amount = 0 (нет тарифа)',
  CAST(SUM(CASE WHEN ISNULL(amount,0) = 0 THEN 1 ELSE 0 END) AS NVARCHAR)
FROM operations
WHERE warehouse_code = @wh
  AND operation_date >= @dateFrom AND operation_date < DATEADD(DAY,1,@dateTo)

UNION ALL SELECT
  'Сумма amount (руб.)',
  CAST(ROUND(ISNULL(SUM(amount),0), 2) AS NVARCHAR)
FROM operations
WHERE warehouse_code = @wh
  AND operation_date >= @dateFrom AND operation_date < DATEADD(DAY,1,@dateTo);

-- Что всё ещё без тарифа — для справки
PRINT '';
PRINT '--- WCR-коды без тарифа (amount=0, не BRAK) ---';

SELECT
  o.wcr_code,
  o.operation_type,
  o.participant_area,
  COUNT(*)         AS ops,
  SUM(o.[count])   AS total_aei,
  SUM(ISNULL(o.prod_count,0)) AS total_prod
FROM operations o
WHERE o.warehouse_code = @wh
  AND o.operation_date >= @dateFrom
  AND o.operation_date <  DATEADD(DAY,1,@dateTo)
  AND ISNULL(o.amount,0) = 0
  AND ISNULL(o.wcr_code,'') NOT LIKE '%BRAK%'   -- BRAK ожидаемо без тарифа
  AND ISNULL(o.wcr_code,'') NOT LIKE 'INT_BR%'
  AND ISNULL(o.wcr_code,'') NOT LIKE 'INTW%'
  AND ISNULL(o.wcr_code,'') NOT LIKE 'OUT_%'
GROUP BY o.wcr_code, o.operation_type, o.participant_area
ORDER BY total_aei DESC;

-- ══════════════════════════════════════════════════════════════════
-- ШАГ 6. ИТОГОВЫЙ ОТЧЁТ: выработка сотрудников за март
-- Блок 1 (АЕИ) + Блок 2 (Комплектация) раздельно и итого
-- ══════════════════════════════════════════════════════════════════

PRINT '';
PRINT '==============================================';
PRINT '--- ИТОГОВАЯ ВЫРАБОТКА СОТРУДНИКОВ МАРТ 2026 ---';
PRINT '==============================================';

SELECT
  u.employee_id,
  u.fio,

  -- Рабочие дни (дни, когда была хотя бы одна операция из нормативов)
  COUNT(DISTINCT CAST(o.operation_date AS DATE))   AS work_days,

  -- ── Блок 1: АЕИ (wcr_norms — приёмка, размещение, пополнение) ────────────
  ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL
                  THEN o.[count] ELSE 0 END), 0)   AS total_aei,
  ROUND(ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL
                   THEN o.amount ELSE 0 END), 0), 2) AS aei_amount,

  -- ── Блок 2: Комплектация (wcr_picking_norms — prod_count) ─────────────────
  ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL
                  THEN ISNULL(o.prod_count, 0) ELSE 0 END), 0) AS total_prod,
  ROUND(ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL
                   THEN CASE
                     WHEN wp.rate IS NOT NULL
                       THEN ISNULL(o.prod_count, 0) * wp.rate  -- ставка из справочника
                     ELSE ISNULL(o.amount, 0)                  -- или сохранённая сумма
                   END ELSE 0 END), 0), 2) AS picking_amount,

  -- ── Итого ─────────────────────────────────────────────────────────────────
  ROUND(
    ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount ELSE 0 END), 0) +
    ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL
                    THEN CASE
                      WHEN wp.rate IS NOT NULL
                        THEN ISNULL(o.prod_count, 0) * wp.rate
                      ELSE ISNULL(o.amount, 0)
                    END ELSE 0 END), 0)
  , 2) AS total_amount

FROM operations o
INNER JOIN users u              ON o.user_id = u.id
LEFT  JOIN wcr_norms         wn ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
LEFT  JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1

WHERE o.warehouse_code = @wh
  AND u.is_active = 1
  AND u.employee_id != '00000000'
  AND o.operation_date >= @dateFrom
  AND o.operation_date <  DATEADD(DAY, 1, @dateTo)
  -- Только нормативные операции (входят в расчёт зп)
  AND (wn.wcr_code IS NOT NULL OR wp.wcr_code IS NOT NULL)

GROUP BY u.id, u.employee_id, u.fio
ORDER BY total_amount DESC;

-- ══════════════════════════════════════════════════════════════════
-- ШАГ 7. Итоги по складу (контрольная сумма)
-- ══════════════════════════════════════════════════════════════════

PRINT '';
PRINT '--- Итог по складу ---';

SELECT
  @wh                  AS warehouse_code,
  COUNT(DISTINCT u.id) AS employees_count,
  ROUND(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount ELSE 0 END), 2)  AS total_aei_amount,
  ROUND(SUM(CASE WHEN wp.wcr_code IS NOT NULL
                 THEN CASE WHEN wp.rate IS NOT NULL
                           THEN ISNULL(o.prod_count,0) * wp.rate
                           ELSE ISNULL(o.amount,0) END
                 ELSE 0 END), 2)                                               AS total_picking_amount,
  ROUND(
    SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount ELSE 0 END) +
    SUM(CASE WHEN wp.wcr_code IS NOT NULL
             THEN CASE WHEN wp.rate IS NOT NULL
                       THEN ISNULL(o.prod_count,0) * wp.rate
                       ELSE ISNULL(o.amount,0) END
             ELSE 0 END)
  , 2)                                                                         AS grand_total
FROM operations o
INNER JOIN users u              ON o.user_id = u.id
LEFT  JOIN wcr_norms         wn ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
LEFT  JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
WHERE o.warehouse_code = @wh
  AND u.is_active = 1
  AND u.employee_id != '00000000'
  AND o.operation_date >= @dateFrom
  AND o.operation_date <  DATEADD(DAY, 1, @dateTo)
  AND (wn.wcr_code IS NOT NULL OR wp.wcr_code IS NOT NULL);

PRINT '';
PRINT '✅ Пересчёт завершён: ' + CONVERT(NVARCHAR, GETDATE(), 120);
GO
