-- =============================================
-- SalaryMonitor SQL Views
-- Представления для расчета зарплаты
-- =============================================

USE SalaryMonitor;
GO

-- =============================================
-- View: Детальный расчет зарплаты по операциям
-- =============================================
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
    o.count AS aei_count,
    o.operation_date,
    t.rate,
    t.norm_aei_per_hour,
    o.count * t.rate AS base_amount,
    1.0 AS quality_coefficient,  -- пока фиксировано
    o.count * t.rate * 1.0 AS final_amount
FROM operations o
INNER JOIN users u ON o.user_id = u.id
INNER JOIN warehouses w ON o.warehouse_code = w.code
LEFT JOIN tariffs t ON 
    o.warehouse_code = t.warehouse_code 
    AND o.operation_type = t.operation_type
    AND o.operation_date >= t.valid_from
    AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
WHERE u.is_active = 1;
GO

-- =============================================
-- View: Агрегированная зарплата по дням
-- =============================================
IF OBJECT_ID('v_salary_by_day', 'V') IS NOT NULL DROP VIEW v_salary_by_day;
GO

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
    user_id,
    employee_id,
    fio,
    warehouse_code,
    warehouse_name,
    CAST(operation_date AS DATE);
GO

-- =============================================
-- View: Агрегированная зарплата по месяцам
-- =============================================
IF OBJECT_ID('v_salary_by_month', 'V') IS NOT NULL DROP VIEW v_salary_by_month;
GO

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
    user_id,
    employee_id,
    fio,
    warehouse_code,
    warehouse_name,
    YEAR(operation_date),
    MONTH(operation_date);
GO

-- =============================================
-- View: Топ сотрудников по зарплате
-- =============================================
IF OBJECT_ID('v_top_performers', 'V') IS NOT NULL DROP VIEW v_top_performers;
GO

CREATE VIEW v_top_performers AS
SELECT 
    user_id,
    employee_id,
    fio,
    warehouse_code,
    warehouse_name,
    COUNT(DISTINCT CAST(operation_date AS DATE)) AS work_days,
    COUNT(DISTINCT operation_id) AS total_operations,
    SUM(aei_count) AS total_aei,
    SUM(final_amount) AS total_salary,
    AVG(final_amount) AS avg_daily_salary
FROM v_salary_details
WHERE operation_date >= DATEADD(MONTH, -1, GETDATE())
GROUP BY 
    user_id,
    employee_id,
    fio,
    warehouse_code,
    warehouse_name;
GO

-- =============================================
-- View: Статистика по операциям
-- =============================================
IF OBJECT_ID('v_operations_stats', 'V') IS NOT NULL DROP VIEW v_operations_stats;
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
    SUM(final_amount) AS total_amount
FROM v_salary_details
WHERE operation_date >= DATEADD(MONTH, -1, GETDATE())
GROUP BY 
    warehouse_code,
    warehouse_name,
    operation_type;
GO

PRINT 'Views created successfully!';
PRINT '';
PRINT 'Available views:';
PRINT '- v_salary_details: Детальный расчет по операциям';
PRINT '- v_salary_by_day: Зарплата по дням';
PRINT '- v_salary_by_month: Зарплата по месяцам';
PRINT '- v_top_performers: Топ сотрудников';
PRINT '- v_operations_stats: Статистика по операциям';

