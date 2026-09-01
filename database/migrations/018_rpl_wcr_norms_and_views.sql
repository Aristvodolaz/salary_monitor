-- =============================================
-- Migration 018: RPL в wcr_norms (amount 0) + views как в repo
--
-- 017 сняла RPL1/2/3/5 с wcr_mapping, но не добавила в wcr_norms.
-- Полный SAP-синк удаляет период и пропускает коды вне
-- wcr_norms / wcr_picking_norms — строки RPL пропадают.
-- Сюда: только wcr_norms, без wcr_mapping и без wcr_picking_norms.
--
-- Формула без изменений: picking = count × rate; иначе mapped tariff; иначе 0.
-- =============================================

USE SalaryMonitor;
GO

PRINT N'--- 1. RPL не должен быть в wcr_picking_norms ---';

DELETE FROM wcr_picking_norms
WHERE wcr_code IN (N'RPL1', N'RPL2', N'RPL3', N'RPL5');

PRINT N'  deleted RPL1/RPL2/RPL3/RPL5 from wcr_picking_norms (if any)';
GO

PRINT N'--- 2. RPL в wcr_norms: Пополнение, amount 0 на синке ---';

-- wcr_norms.norm_type есть (NVARCHAR). Пишем ПМ_Пополнение —
-- как operation_type в 017, SAP fallback копирует norm_type в operation_type.
-- В 011 такого ярлыка нет; ближайшие — «Пополнение М1»…«Пополнение М5».

IF NOT EXISTS (SELECT 1 FROM wcr_norms WHERE wcr_code = N'RPL1')
    INSERT INTO wcr_norms (wcr_code, description, norm_type, norm_value, is_active)
    VALUES (N'RPL1', N'Пополнение', N'ПМ_Пополнение', NULL, 1);

IF NOT EXISTS (SELECT 1 FROM wcr_norms WHERE wcr_code = N'RPL2')
    INSERT INTO wcr_norms (wcr_code, description, norm_type, norm_value, is_active)
    VALUES (N'RPL2', N'Пополнение', N'ПМ_Пополнение', NULL, 1);

IF NOT EXISTS (SELECT 1 FROM wcr_norms WHERE wcr_code = N'RPL3')
    INSERT INTO wcr_norms (wcr_code, description, norm_type, norm_value, is_active)
    VALUES (N'RPL3', N'Пополнение', N'ПМ_Пополнение', NULL, 1);

IF NOT EXISTS (SELECT 1 FROM wcr_norms WHERE wcr_code = N'RPL5')
    INSERT INTO wcr_norms (wcr_code, description, norm_type, norm_value, is_active)
    VALUES (N'RPL5', N'Пополнение', N'ПМ_Пополнение', NULL, 1);

-- На всякий случай не маппим и не платим: без тарифа, amount = 0
UPDATE operations
SET operation_type = N'ПМ_Пополнение',
    participant_area = N'ПМ',
    amount = 0,
    updated_at = GETDATE()
WHERE wcr_code IN (N'RPL1', N'RPL2', N'RPL3', N'RPL5');

PRINT N'  wcr_norms: RPL1/RPL2/RPL3/RPL5, norm_type=ПМ_Пополнение, norm_value=NULL';
GO

PRINT N'--- 3. Представления как в database/views.sql (rate не COALESCE) ---';

-- Зависимые сначала, иначе DROP v_salary_details падает
IF OBJECT_ID('v_operations_stats', 'V') IS NOT NULL DROP VIEW v_operations_stats;
IF OBJECT_ID('v_top_performers', 'V') IS NOT NULL DROP VIEW v_top_performers;
IF OBJECT_ID('v_salary_by_month', 'V') IS NOT NULL DROP VIEW v_salary_by_month;
IF OBJECT_ID('v_salary_by_day', 'V') IS NOT NULL DROP VIEW v_salary_by_day;
IF OBJECT_ID('v_salary_details', 'V') IS NOT NULL DROP VIEW v_salary_details;
GO

-- Комплектация: АЕИ (count) × ставка из wcr_picking_norms
-- Сортировка / АЕИ: count × ставка из tariffs, только если WCR в wcr_mapping
-- prod_count хранится, но в деньги не идёт
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
    CASE WHEN wp.wcr_code IS NOT NULL THEN 1 ELSE 0 END AS is_picking,
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

PRINT N'✅ Migration 018: RPL in wcr_norms only; picking RPL deleted; views match repo';
GO
