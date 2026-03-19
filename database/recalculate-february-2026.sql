-- =============================================
-- Пересчёт данных за февраль 2026
-- ЦЕЛЬ: Исправить amount = count * rate для всех записей
-- ПРИЧИНА: Старый код считал АЕИ через actdura, а не ZsumAmountItm
--          После перезагрузки данных через новый код — пересчитать суммы
-- =============================================

USE SalaryMonitor;
GO

SET NOCOUNT ON;

PRINT '==============================================';
PRINT 'ПЕРЕСЧЁТ ДАННЫХ ЗА ФЕВРАЛЬ 2026';
PRINT CONVERT(NVARCHAR, GETDATE(), 120);
PRINT '==============================================';
PRINT '';

-- =============================================
-- 0. Диагностика ПЕРЕД пересчётом
-- =============================================

PRINT '--- ДИАГНОСТИКА ДО ПЕРЕСЧЁТА ---';
PRINT '';

SELECT
    COUNT(*) AS total_operations,
    COUNT(DISTINCT user_id) AS unique_employees,
    COUNT(DISTINCT warehouse_code) AS unique_warehouses,
    COUNT(DISTINCT operation_type) AS unique_op_types,
    SUM(count) AS total_aei,
    SUM(amount) AS total_salary_before,
    AVG(amount) AS avg_amount_per_op
FROM operations
WHERE operation_date >= '2026-02-01'
  AND operation_date <  '2026-03-01';
GO

-- Записи без тарифа (потенциальные проблемы):
PRINT '';
PRINT '--- Операции без соответствующего тарифа ---';

SELECT
    o.operation_type,
    COUNT(*) AS ops_count,
    SUM(o.count) AS total_aei
FROM operations o
WHERE o.operation_date >= '2026-02-01'
  AND o.operation_date <  '2026-03-01'
  AND NOT EXISTS (
    SELECT 1 FROM tariffs t
    WHERE (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
      AND o.operation_type = t.operation_type
      AND o.operation_date >= t.valid_from
      AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
      AND t.is_active = 1
  )
GROUP BY o.operation_type
ORDER BY ops_count DESC;
GO

-- =============================================
-- 1. Пересчёт amount = count * rate
-- БЕЗ коэффициента качества (Ккач применяется в Views)
-- =============================================

PRINT '';
PRINT '--- ПЕРЕСЧЁТ amount = count * rate ---';

UPDATE o
SET
    o.amount     = o.count * t.rate,
    o.updated_at = GETDATE()
FROM operations o
INNER JOIN tariffs t ON
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND o.operation_type = t.operation_type
    AND o.operation_date >= t.valid_from
    AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
    AND t.is_active = 1
WHERE o.operation_date >= '2026-02-01'
  AND o.operation_date <  '2026-03-01';

PRINT 'Обновлено строк: ' + CAST(@@ROWCOUNT AS NVARCHAR);
GO

-- =============================================
-- 2. Диагностика ПОСЛЕ пересчёта
-- =============================================

PRINT '';
PRINT '--- ДИАГНОСТИКА ПОСЛЕ ПЕРЕСЧЁТА ---';

SELECT
    COUNT(*) AS total_operations,
    SUM(count) AS total_aei,
    SUM(amount) AS total_salary_after
FROM operations
WHERE operation_date >= '2026-02-01'
  AND operation_date <  '2026-03-01';
GO

-- =============================================
-- 3. Расхождения: записи где amount != count * rate
-- =============================================

PRINT '';
PRINT '--- Проверка расхождений (должно быть 0 записей) ---';

SELECT COUNT(*) AS inconsistent_records
FROM operations o
INNER JOIN tariffs t ON
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND o.operation_type = t.operation_type
    AND t.is_active = 1
WHERE o.operation_date >= '2026-02-01'
  AND o.operation_date <  '2026-03-01'
  AND ABS(ISNULL(o.amount, 0) - o.count * t.rate) > 0.01;
GO

-- =============================================
-- 4. Топ расхождений (если есть)
-- =============================================

PRINT '';
PRINT '--- Топ-10 наибольших расхождений ---';

SELECT TOP 10
    u.fio,
    u.employee_id,
    o.warehouse_code,
    o.operation_type,
    CAST(o.operation_date AS DATE) AS op_date,
    o.count AS aei_count,
    t.rate,
    o.amount AS stored_amount,
    o.count * t.rate AS expected_amount,
    ABS(o.amount - o.count * t.rate) AS delta
FROM operations o
INNER JOIN users u ON o.user_id = u.id
LEFT JOIN tariffs t ON
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND o.operation_type = t.operation_type
    AND t.is_active = 1
WHERE o.operation_date >= '2026-02-01'
  AND o.operation_date <  '2026-03-01'
  AND t.rate IS NOT NULL
  AND ABS(ISNULL(o.amount, 0) - o.count * t.rate) > 0.01
ORDER BY delta DESC;
GO

-- =============================================
-- 5. Итоговый отчёт по сотрудникам за февраль
-- =============================================

PRINT '';
PRINT '--- ИТОГОВАЯ ЗАРПЛАТА ПО СОТРУДНИКАМ ЗА ФЕВРАЛЬ 2026 ---';
PRINT '(переменная часть, без Ккач)';
PRINT '';

SELECT
    u.fio,
    u.employee_id,
    o.warehouse_code,
    COUNT(DISTINCT CAST(o.operation_date AS DATE)) AS work_days,
    COUNT(*)                                        AS total_operations,
    SUM(o.count)                                    AS total_aei,
    ROUND(SUM(o.amount), 2)                         AS total_salary_rub,
    ROUND(AVG(o.amount), 2)                         AS avg_per_operation
FROM operations o
INNER JOIN users u ON o.user_id = u.id
WHERE o.operation_date >= '2026-02-01'
  AND o.operation_date <  '2026-03-01'
GROUP BY u.fio, u.employee_id, o.warehouse_code
ORDER BY total_salary_rub DESC;
GO

-- =============================================
-- 6. Разбивка по типу операции за февраль
-- =============================================

PRINT '';
PRINT '--- РАЗБИВКА ПО ТИПАМ ОПЕРАЦИЙ ЗА ФЕВРАЛЬ 2026 ---';

SELECT
    o.operation_type,
    o.warehouse_code,
    t.rate,
    COUNT(*) AS ops_count,
    SUM(o.count) AS total_aei,
    ROUND(SUM(o.amount), 2) AS total_amount
FROM operations o
LEFT JOIN tariffs t ON
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND o.operation_type = t.operation_type
    AND t.is_active = 1
WHERE o.operation_date >= '2026-02-01'
  AND o.operation_date <  '2026-03-01'
GROUP BY o.operation_type, o.warehouse_code, t.rate
ORDER BY total_amount DESC;
GO

-- =============================================
-- 7. Обновить salary_summary для февраля
-- =============================================

PRINT '';
PRINT '--- Обновление salary_summary за февраль 2026 ---';

-- Удаляем старые записи за февраль
DELETE FROM salary_summary
WHERE period_start >= '2026-02-01'
  AND period_start <  '2026-03-01';

PRINT 'Удалено из salary_summary: ' + CAST(@@ROWCOUNT AS NVARCHAR);

-- Вставляем пересчитанные
INSERT INTO salary_summary (
    user_id,
    period_start,
    period_end,
    total_amount,
    quality_coefficient,
    errors_count
)
SELECT
    user_id,
    period_start,
    EOMONTH(period_start) AS period_end,
    total_amount,
    avg_quality_coefficient,
    0 AS errors_count
FROM v_salary_by_month
WHERE year = 2026 AND month = 2;

PRINT 'Вставлено в salary_summary: ' + CAST(@@ROWCOUNT AS NVARCHAR);
GO

PRINT '';
PRINT '==============================================';
PRINT '✅ ПЕРЕСЧЁТ ЗАВЕРШЁН';
PRINT CONVERT(NVARCHAR, GETDATE(), 120);
PRINT '==============================================';
GO
