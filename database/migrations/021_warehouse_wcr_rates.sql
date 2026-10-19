-- =============================================
-- Migration 021: расценки по складам (wcr_warehouse_rates) + недостающие склады
-- =============================================
-- Проблема: wcr_picking_norms / wcr_mapping / wcr_norms глобальны (UNIQUE по wcr_code),
-- одна ставка на все склады. Для РЦ/СК с индивидуальными нормативами и расценками
-- (Омск, Пермь, Новосибирск, Шушары, ...) нужна ставка в разрезе склад + WCR.
--
-- Решение: узкая таблица-переопределение. Если для (warehouse_code, wcr_code) есть
-- активная строка и дата операции в [valid_from, valid_to] — amount = count × rate.
-- Иначе всё считается как раньше (wcr_picking_norms → tariffs). Фан-аута в JOIN нет:
-- уникальность (warehouse_code, wcr_code, valid_from).
--
-- Формула НЕ меняется: count (АЕИ) × rate. Отсутствие строки = прежнее поведение,
-- ставка другого склада НЕ подставляется.
--
-- Сами строки расценок грузит backend/scripts/load-warehouse-rates.js (dry-run по
-- умолчанию, --apply для записи) из файла «Тарифы.xlsx».
-- =============================================

USE SalaryMonitor;
GO

PRINT N'--- 1. Недостающие склады (идемпотентно, существующие не трогаем) ---';

;WITH wanted(code, name) AS (
    SELECT * FROM (VALUES
        (N'01SS', N'СК Поларис'),
        (N'02DQ', N'СК ДМ офисный товар'),
        (N'02SR', N'РРЦ Южный Урал'),
        (N'0DM3', N'СК Домодедово-3'),
        (N'0KRA', N'СК Краснодар'),
        (N'0SK1', N'СК Пермь'),
        (N'0SK2', N'СК Омск'),
        (N'0SK4', N'СК Южные Врата'),
        (N'0SK5', N'СК Новосибирск'),
        (N'0SK6', N'СК Шушары'),
        (N'0SK9', N'СК Урал-Мебель'),
        (N'0SKA', N'РРЦ Казань'),
        (N'RCDM', N'РЦ Домодедово'),
        (N'RR02', N'РСД 2 ФУС'),
        (N'RR03', N'РСД 3 ФУС'),
        (N'RR04', N'РСД 4 ФУС'),
        (N'RR05', N'РСД 5 ФУС'),
        (N'RR11', N'РСД 11 ФУС')
    ) v(code, name)
)
INSERT INTO warehouses (code, name, is_active)
SELECT w.code, w.name, 1
FROM wanted w
WHERE NOT EXISTS (SELECT 1 FROM warehouses x WHERE x.code = w.code);

PRINT N'  добавлено складов: ' + CAST(@@ROWCOUNT AS NVARCHAR(10));
GO

PRINT N'--- 2. Таблица wcr_warehouse_rates ---';

IF OBJECT_ID('wcr_warehouse_rates', 'U') IS NULL
BEGIN
    CREATE TABLE wcr_warehouse_rates (
        id                INT PRIMARY KEY IDENTITY(1,1),
        warehouse_code    NVARCHAR(10)  NOT NULL,
        wcr_code          NVARCHAR(50)  NOT NULL,
        area              NVARCHAR(100) NOT NULL,   -- «Участок» из таблицы тарифов
        norm_aei_per_hour DECIMAL(9,2)  NULL,       -- «Норматив/час»
        rate              DECIMAL(9,2)  NOT NULL,   -- «Расценка, руб.» за 1 АЕИ
        is_active         BIT           NOT NULL DEFAULT 1,
        valid_from        DATE          NOT NULL DEFAULT '2020-01-01',
        valid_to          DATE          NULL,
        created_at        DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_wcr_wh_rates_wh FOREIGN KEY (warehouse_code) REFERENCES warehouses(code),
        CONSTRAINT UQ_wcr_wh_rates UNIQUE (warehouse_code, wcr_code, valid_from)
    );
    CREATE INDEX idx_wcr_wh_rates_lookup ON wcr_warehouse_rates(warehouse_code, wcr_code) WHERE is_active = 1;
    PRINT N'  создана';
END
ELSE
    PRINT N'  уже существует';
GO

PRINT N'--- 3. v_salary_details: приоритет склад-специфичной ставки ---';

IF OBJECT_ID('v_operations_stats', 'V') IS NOT NULL DROP VIEW v_operations_stats;
IF OBJECT_ID('v_top_performers', 'V') IS NOT NULL DROP VIEW v_top_performers;
IF OBJECT_ID('v_salary_by_month', 'V') IS NOT NULL DROP VIEW v_salary_by_month;
IF OBJECT_ID('v_salary_by_day', 'V') IS NOT NULL DROP VIEW v_salary_by_day;
IF OBJECT_ID('v_salary_details', 'V') IS NOT NULL DROP VIEW v_salary_details;
GO

-- Отличия от 019: LEFT JOIN wr и ветка WHEN wr.id IS NOT NULL (первая по приоритету).
-- is_picking/is_packing по-прежнему определяются глобальной классификацией wp.
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
    CASE
        WHEN wr.id IS NOT NULL THEN CAST(wr.rate AS FLOAT)
        WHEN wp.wcr_code IS NOT NULL THEN wp.rate
        ELSE t.rate
    END AS rate,
    CASE WHEN wr.id IS NOT NULL THEN CAST(wr.norm_aei_per_hour AS FLOAT) ELSE t.norm_aei_per_hour END AS norm_aei_per_hour,
    CASE WHEN wp.wcr_code IS NOT NULL AND wp.picking_type <> N'Упаковка' THEN 1 ELSE 0 END AS is_picking,
    CASE WHEN wp.wcr_code IS NOT NULL AND wp.picking_type = N'Упаковка' THEN 1 ELSE 0 END AS is_packing,
    CASE
        WHEN wr.id IS NOT NULL
            THEN CAST(ISNULL(o.count, 0) AS FLOAT) * CAST(wr.rate AS FLOAT)
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
LEFT JOIN wcr_warehouse_rates wr ON
    wr.warehouse_code = o.warehouse_code
    AND wr.wcr_code = o.wcr_code
    AND wr.is_active = 1
    AND o.operation_date >= wr.valid_from
    AND (wr.valid_to IS NULL OR o.operation_date <= wr.valid_to)
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

PRINT N'✅ Migration 021: склады добавлены, wcr_warehouse_rates создана, v_salary_details учитывает склад-специфичные расценки';
GO
