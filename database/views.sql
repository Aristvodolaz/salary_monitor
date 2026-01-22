-- =============================================
-- SalaryMonitor SQL Views
-- Представления для расчета зарплаты
-- =============================================

USE SalaryMonitor;
GO

-- =============================================
-- View: Детальный расчет зарплаты по операциям
-- ВАЖНО: Ккач НЕ применяется на уровне операций!
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
    o.participant_area,
    o.count AS aei_count,
    o.operation_date,
    t.rate,
    t.norm_aei_per_hour,
    o.amount AS base_amount  -- Используем уже рассчитанную сумму из таблицы
FROM operations o
INNER JOIN users u ON o.user_id = u.id
INNER JOIN warehouses w ON o.warehouse_code = w.code
LEFT JOIN tariffs t ON 
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND o.operation_type = t.operation_type
    AND o.operation_date >= t.valid_from
    AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
    AND t.is_active = 1
WHERE u.is_active = 1;
GO

-- =============================================
-- View: Агрегированная зарплата по дням
-- Применяем Ккач к СУММЕ за день: Итог = Ʃ(АЕИ * Расценка) * Ккач
-- Ккач берется из salary_summary, если нет - используем 1.0
-- =============================================
IF OBJECT_ID('v_salary_by_day', 'V') IS NOT NULL DROP VIEW v_salary_by_day;
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

-- =============================================
-- View: Агрегированная зарплата по месяцам
-- Применяем средний Ккач за месяц к СУММЕ: Итог = Ʃ(АЕИ * Расценка) * AVG(Ккач)
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
    YEAR(date) AS year,
    MONTH(date) AS month,
    DATEFROMPARTS(YEAR(date), MONTH(date), 1) AS period_start,
    SUM(operations_count) AS operations_count,
    SUM(total_aei) AS total_aei,
    SUM(base_amount) AS base_amount,
    AVG(quality_coefficient) AS avg_quality_coefficient,
    SUM(total_amount) AS total_amount  -- Уже с учетом Ккач из v_salary_by_day
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
    COUNT(DISTINCT date) AS work_days,
    SUM(operations_count) AS total_operations,
    SUM(total_aei) AS total_aei,
    SUM(total_amount) AS total_salary,  -- Уже с учетом Ккач
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
    SUM(base_amount) AS total_amount  -- Без Ккач, т.к. статистика по операциям
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

