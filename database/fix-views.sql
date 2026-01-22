-- =============================================
-- Исправление SQL Views для работы с новой структурой
-- =============================================

USE SalaryMonitor;
GO

-- Удаляем старые views
IF OBJECT_ID('v_salary_by_month', 'V') IS NOT NULL DROP VIEW v_salary_by_month;
IF OBJECT_ID('v_salary_by_day', 'V') IS NOT NULL DROP VIEW v_salary_by_day;
IF OBJECT_ID('v_salary_details', 'V') IS NOT NULL DROP VIEW v_salary_details;
GO

-- =============================================
-- View: Детальный расчет (упрощенный)
-- =============================================
CREATE VIEW v_salary_details AS
SELECT 
    o.id AS operation_id,
    u.id AS user_id,
    u.employee_id,
    u.fio,
    u.warehouse_id,
    w.code AS warehouse_code,
    w.name AS warehouse_name,
    o.participant_area,
    o.operation_type,
    o.count AS aei_count,
    o.operation_date,
    ISNULL(t.rate, 0) AS rate,
    ISNULL(t.norm_aei_per_hour, 0) AS norm_aei_per_hour,
    ISNULL(o.amount, 0) AS base_amount,
    1.0 AS quality_coefficient,
    ISNULL(o.amount, 0) AS final_amount
FROM operations o
INNER JOIN users u ON o.user_id = u.id
INNER JOIN warehouses w ON u.warehouse_id = w.id
LEFT JOIN tariffs t ON 
    (t.warehouse_code = w.code OR t.warehouse_code = 'ALL')
    AND t.operation_type = o.operation_type
    AND o.operation_date >= t.valid_from
    AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
    AND t.is_active = 1
WHERE u.is_active = 1;
GO

-- =============================================
-- View: По дням
-- =============================================
CREATE VIEW v_salary_by_day AS
SELECT 
    user_id,
    employee_id,
    fio,
    warehouse_code,
    warehouse_name,
    CAST(operation_date AS DATE) AS date,
    COUNT(DISTINCT operation_id) AS operations_count,
    SUM(aei_count) AS total_aei,
    SUM(base_amount) AS base_amount,
    AVG(quality_coefficient) AS avg_quality_coefficient,
    SUM(final_amount) AS total_amount
FROM v_salary_details
GROUP BY 
    user_id, employee_id, fio,
    warehouse_code, warehouse_name,
    CAST(operation_date AS DATE);
GO

-- =============================================
-- View: По месяцам
-- =============================================
CREATE VIEW v_salary_by_month AS
SELECT 
    user_id,
    employee_id,
    fio,
    warehouse_code,
    warehouse_name,
    YEAR(operation_date) AS year,
    MONTH(operation_date) AS month,
    DATEFROMPARTS(YEAR(operation_date), MONTH(operation_date), 1) AS period_start,
    COUNT(DISTINCT operation_id) AS operations_count,
    SUM(aei_count) AS total_aei,
    SUM(base_amount) AS base_amount,
    AVG(quality_coefficient) AS avg_quality_coefficient,
    SUM(final_amount) AS total_amount
FROM v_salary_details
GROUP BY 
    user_id, employee_id, fio,
    warehouse_code, warehouse_name,
    YEAR(operation_date), MONTH(operation_date);
GO

PRINT 'Views исправлены!';
GO
