-- =============================================
-- Migration 019: отделить "Упаковку" от "Комплектации"
-- =============================================
-- Сверка с эталонными файлами «Выработка комплектация» за июнь/июль/август 2026
-- показала, что приложение завышает сумму комплектации на ~35% относительно
-- эталона. Причина: коды picking_type = 'Упаковка' (DEF, DEFF, PKM2, PKM3,
-- PKM4, PKM5, PKMC) суммировались в ту же "Комплектацию", что и настоящая
-- комплектация (Коробочная/Штучная/Штучн.компл.однострочн) — а в эталонном
-- своде упаковка не является частью комплектации вообще.
--
-- Деньги никуда не делись — count × rate для упаковки остаётся прежним,
-- просто теперь считается отдельной строкой (как и в эталоне), а не
-- складывается в "Комплектацию".
--
-- Затронуто:
--   1. norms_employees_snapshot — новые колонки total_packing/packing_amount
--   2. v_salary_details — is_picking больше не включает Упаковку (is_packing новый)
-- =============================================

USE SalaryMonitor;
GO

PRINT N'--- 1. norms_employees_snapshot: колонки для упаковки ---';

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('norms_employees_snapshot') AND name = 'total_packing'
)
BEGIN
    ALTER TABLE norms_employees_snapshot
        ADD total_packing INT NOT NULL CONSTRAINT DF_norms_emp_snap_packqty DEFAULT 0;
    PRINT N'  добавлена total_packing';
END

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('norms_employees_snapshot') AND name = 'packing_amount'
)
BEGIN
    ALTER TABLE norms_employees_snapshot
        ADD packing_amount FLOAT NOT NULL CONSTRAINT DF_norms_emp_snap_packamt DEFAULT 0;
    PRINT N'  добавлена packing_amount';
END
GO

PRINT N'--- 2. v_salary_details: is_picking больше не включает Упаковку ---';

IF OBJECT_ID('v_operations_stats', 'V') IS NOT NULL DROP VIEW v_operations_stats;
IF OBJECT_ID('v_top_performers', 'V') IS NOT NULL DROP VIEW v_top_performers;
IF OBJECT_ID('v_salary_by_month', 'V') IS NOT NULL DROP VIEW v_salary_by_month;
IF OBJECT_ID('v_salary_by_day', 'V') IS NOT NULL DROP VIEW v_salary_by_day;
IF OBJECT_ID('v_salary_details', 'V') IS NOT NULL DROP VIEW v_salary_details;
GO

-- base_amount не меняется (по-прежнему count × rate для всех типов) —
-- меняется только категоризация is_picking/is_packing.
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
    CASE WHEN wp.wcr_code IS NOT NULL THEN wp.rate ELSE t.rate END AS rate,
    t.norm_aei_per_hour,
    CASE WHEN wp.wcr_code IS NOT NULL AND wp.picking_type <> N'Упаковка' THEN 1 ELSE 0 END AS is_picking,
    CASE WHEN wp.wcr_code IS NOT NULL AND wp.picking_type = N'Упаковка' THEN 1 ELSE 0 END AS is_packing,
    CASE
        WHEN wp.wcr_code IS NOT NULL
            THEN CAST(ISNULL(o.count, 0) AS FLOAT) * ISNULL(wp.rate, 0)
        WHEN wm.wcr_code IS NOT NULL AND t.rate IS NOT NULL
            THEN CAST(ISNULL(o.count, 0) AS FLOAT) * t.rate
        ELSE 0
    END AS base_amount
FROM operations o
INNER JOIN users u ON o.user_id = u.id
INNER JOIN warehouses w ON o.warehouse_code = w.code
LEFT JOIN wcr_mapping wm ON wm.wcr_code = o.wcr_code AND wm.is_active = 1
LEFT JOIN tariffs t ON
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND wm.operation_type = t.operation_type
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

PRINT N'✅ Migration 019: Упаковка отделена от Комплектации (is_packing, total_packing/packing_amount); base_amount не изменился';
GO
