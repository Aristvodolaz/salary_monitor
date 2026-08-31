-- =============================================
-- Migration 016: комплектация и сортировка считаются по-разному
-- Комплектация (wcr_picking_norms): prod_count × ставка
-- Сортировка / АЕИ: count × ставка из tariffs
-- =============================================

USE SalaryMonitor;
GO

PRINT N'--- Пересчёт amount в operations ---';

-- Комплектация
UPDATE o
SET o.amount = CAST(ISNULL(o.prod_count, 0) AS FLOAT) * ISNULL(wp.rate, 0),
    o.updated_at = GETDATE()
FROM operations o
INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1;
GO

-- Сортировка / прочие АЕИ (нет в wcr_picking_norms)
UPDATE o
SET o.amount = CAST(ISNULL(o.count, 0) AS FLOAT) * t.rate,
    o.updated_at = GETDATE()
FROM operations o
INNER JOIN tariffs t ON
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND o.operation_type = t.operation_type
    AND t.is_active = 1
    AND o.operation_date >= t.valid_from
    AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
WHERE NOT EXISTS (
    SELECT 1 FROM wcr_picking_norms wp
    WHERE wp.wcr_code = o.wcr_code AND wp.is_active = 1
);
GO

PRINT N'--- Пересоздание представлений ---';

IF OBJECT_ID('v_operations_stats', 'V') IS NOT NULL DROP VIEW v_operations_stats;
IF OBJECT_ID('v_top_performers', 'V') IS NOT NULL DROP VIEW v_top_performers;
IF OBJECT_ID('v_salary_by_month', 'V') IS NOT NULL DROP VIEW v_salary_by_month;
IF OBJECT_ID('v_salary_by_day', 'V') IS NOT NULL DROP VIEW v_salary_by_day;
IF OBJECT_ID('v_salary_details', 'V') IS NOT NULL DROP VIEW v_salary_details;
GO

CREATE VIEW v_salary_details AS
SELECT
    o.id AS operation_id,
    u.id AS user_id,
    u.employee_id,
    u.fio,
    u.warehouse_id,
    w.code AS warehouse_code,
    w.name AS warehouse_name,
    o.operation_type,
    o.participant_area,
    o.count AS aei_count,
    o.prod_count,
    o.operation_date,
    COALESCE(wp.rate, t.rate) AS rate,
    t.norm_aei_per_hour,
    CASE WHEN wp.wcr_code IS NOT NULL THEN 1 ELSE 0 END AS is_picking,
    CASE
        WHEN wp.wcr_code IS NOT NULL
            THEN CAST(ISNULL(o.prod_count, 0) AS FLOAT) * ISNULL(wp.rate, 0)
        WHEN t.rate IS NOT NULL
            THEN CAST(ISNULL(o.count, 0) AS FLOAT) * t.rate
        ELSE ISNULL(o.amount, 0)
    END AS base_amount
FROM operations o
INNER JOIN users u ON o.user_id = u.id
INNER JOIN warehouses w ON o.warehouse_code = w.code
LEFT JOIN tariffs t ON
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND o.operation_type = t.operation_type
    AND o.operation_date >= t.valid_from
    AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
    AND t.is_active = 1
LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
WHERE u.is_active = 1;
GO

CREATE VIEW v_salary_by_day AS
SELECT
    sd.user_id,
    sd.employee_id,
    sd.fio,
    sd.warehouse_code,
    sd.warehouse_name,
    CAST(sd.operation_date AS DATE) AS date,
    COUNT(DISTINCT sd.operation_id) AS operations_count,
    SUM(sd.aei_count) AS total_aei,
    SUM(sd.base_amount) AS base_amount,
    COALESCE(ss.quality_coefficient, 1.0) AS quality_coefficient,
    SUM(sd.base_amount) * COALESCE(ss.quality_coefficient, 1.0) AS total_amount
FROM v_salary_details sd
LEFT JOIN salary_summary ss ON
    sd.user_id = ss.user_id
    AND CAST(sd.operation_date AS DATE) BETWEEN ss.period_start AND ss.period_end
GROUP BY
    sd.user_id,
    sd.employee_id,
    sd.fio,
    sd.warehouse_code,
    sd.warehouse_name,
    CAST(sd.operation_date AS DATE),
    COALESCE(ss.quality_coefficient, 1.0);
GO

CREATE VIEW v_salary_by_month AS
SELECT
    user_id,
    employee_id,
    fio,
    warehouse_code,
    warehouse_name,
    YEAR(date) AS year,
    MONTH(date) AS month,
    DATEFROMPARTS(YEAR(date), MONTH(date), 1) AS period_start,
    SUM(operations_count) AS operations_count,
    SUM(total_aei) AS total_aei,
    SUM(base_amount) AS base_amount,
    AVG(quality_coefficient) AS avg_quality_coefficient,
    SUM(total_amount) AS total_amount
FROM v_salary_by_day
GROUP BY
    user_id,
    employee_id,
    fio,
    warehouse_code,
    warehouse_name,
    YEAR(date),
    MONTH(date);
GO

CREATE VIEW v_top_performers AS
SELECT
    user_id,
    employee_id,
    fio,
    warehouse_code,
    warehouse_name,
    COUNT(DISTINCT date) AS work_days,
    SUM(operations_count) AS total_operations,
    SUM(total_aei) AS total_aei,
    SUM(total_amount) AS total_salary,
    AVG(total_amount) AS avg_daily_salary
FROM v_salary_by_day
WHERE date >= DATEADD(MONTH, -1, GETDATE())
GROUP BY
    user_id,
    employee_id,
    fio,
    warehouse_code,
    warehouse_name;
GO

CREATE VIEW v_operations_stats AS
SELECT
    warehouse_code,
    warehouse_name,
    operation_type,
    COUNT(DISTINCT user_id) AS employees_count,
    COUNT(operation_id) AS operations_count,
    SUM(aei_count) AS total_aei,
    AVG(aei_count) AS avg_aei_per_operation,
    AVG(rate) AS avg_rate,
    SUM(base_amount) AS total_amount
FROM v_salary_details
WHERE operation_date >= DATEADD(MONTH, -1, GETDATE())
GROUP BY
    warehouse_code,
    warehouse_name,
    operation_type;
GO

PRINT N'✅ Migration 016 completed: picking vs AEI/sorting formulas split';
GO
