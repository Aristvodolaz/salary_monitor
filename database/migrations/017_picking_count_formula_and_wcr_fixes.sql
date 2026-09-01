-- =============================================
-- Migration 017: комплектация = count × ставка (не prod_count)
--
-- Официальный свод «Свод для ЗП» (Выработка комплектация.xlsx)
-- считает АЕИ (operations.count), а не ZprodWtItm (prod_count).
-- prod_count в operations не трогаем — это поле SAP, просто не для денег.
--
-- Также:
--   DEFF / P3BL / P3BM / P3BS / PHSM — не было в справочниках, в своде платятся
--   RPL1/RPL2/RPL3/RPL5 — в живой БД ошибочно висели на ФС_Коробочная (5.9)
-- =============================================

USE SalaryMonitor;
GO

PRINT N'--- 1. Недостающие WCR в wcr_mapping ---';

-- DEFF: в своде ЗП рядом с комплектацией, объём не равен DEF.
-- DEF уже ПМ_Упаковка; ставку берём из wcr_picking_norms DEF = 4.1.
IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = N'DEFF')
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES (N'DEFF', N'ПМ_Упаковка', N'ПМ', 1, N'ПМ: упаковка DEFF (в своде ЗП отдельно от DEF, ставка как у DEF 4.1)');

-- P3B* — размер L/M/S, соседи PS3L/PS3M/PS3S = М3_Штучная, ставка 6.8
IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = N'P3BL')
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES (N'P3BL', N'М3_Штучная комплектация', N'М3', 1, N'М3: штучная P3B большой (сосед PS3L)');
IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = N'P3BM')
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES (N'P3BM', N'М3_Штучная комплектация', N'М3', 1, N'М3: штучная P3B средний (сосед PS3M)');
IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = N'P3BS')
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES (N'P3BS', N'М3_Штучная комплектация', N'М3', 1, N'М3: штучная P3B малый (сосед PS3S)');

-- PHSM: PH* в справочнике нет; SM как штучное (семья PSM*), ставка ФС_Штучная 2.8
IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = N'PHSM')
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES (N'PHSM', N'ФС_Штучная комплектация', N'ФС', 1, N'ФС: штучная PHSM (PH* нет, SM как PSM/штучное)');

PRINT N'  mapping: DEFF, P3BL, P3BM, P3BS, PHSM';
GO

PRINT N'--- 2. Те же коды в wcr_picking_norms (зарплата = count × rate) ---';

IF NOT EXISTS (SELECT 1 FROM wcr_picking_norms WHERE wcr_code = N'DEFF')
    INSERT INTO wcr_picking_norms
        (wcr_code, participant_area, description_old, description_new, picking_type, norm_label, rate, is_active)
    VALUES (N'DEFF', N'ПМ', N'Упаковка DEFF', N'Упаковка DEFF', N'Упаковка', N'ПМ_Упаковка', 4.1, 1);

IF NOT EXISTS (SELECT 1 FROM wcr_picking_norms WHERE wcr_code = N'P3BL')
    INSERT INTO wcr_picking_norms
        (wcr_code, participant_area, description_old, description_new, picking_type, norm_label, rate, is_active)
    VALUES (N'P3BL', N'М3', N'Сборка P3B большой короб', N'Компл М3 P3B большой', N'Штучная комплектация', N'М3_Штучная комплектация', 6.8, 1);

IF NOT EXISTS (SELECT 1 FROM wcr_picking_norms WHERE wcr_code = N'P3BM')
    INSERT INTO wcr_picking_norms
        (wcr_code, participant_area, description_old, description_new, picking_type, norm_label, rate, is_active)
    VALUES (N'P3BM', N'М3', N'Сборка P3B средний короб', N'Компл М3 P3B средний', N'Штучная комплектация', N'М3_Штучная комплектация', 6.8, 1);

IF NOT EXISTS (SELECT 1 FROM wcr_picking_norms WHERE wcr_code = N'P3BS')
    INSERT INTO wcr_picking_norms
        (wcr_code, participant_area, description_old, description_new, picking_type, norm_label, rate, is_active)
    VALUES (N'P3BS', N'М3', N'Сборка P3B малый короб', N'Компл М3 P3B малый', N'Штучная комплектация', N'М3_Штучная комплектация', 6.8, 1);

IF NOT EXISTS (SELECT 1 FROM wcr_picking_norms WHERE wcr_code = N'PHSM')
    INSERT INTO wcr_picking_norms
        (wcr_code, participant_area, description_old, description_new, picking_type, norm_label, rate, is_active)
    VALUES (N'PHSM', N'ФС', N'Штучное комплектование PHSM', N'Компл ФС PHSM штучное', N'Штучная комплектация', N'ФС_Штучная комплектация', 2.8, 1);

PRINT N'  picking norms: DEFF 4.1, P3B* 6.8, PHSM 2.8';
GO

PRINT N'--- 3. Снять RPL с коробочной комплектации ---';

-- Миграция 010 RPL не маппила; в живой БД RPL1/2/3 висели на ФС_Коробочная (×5.9).
-- Официальный свод комплектации RPL не платит. Отдельного тарифа пополнения в 010 нет —
-- не выдумываем ставку, amount = 0 до появления тарифа пополнения.
DELETE FROM wcr_mapping
WHERE wcr_code IN (N'RPL1', N'RPL2', N'RPL3', N'RPL5');

UPDATE operations
SET operation_type = N'ПМ_Пополнение',
    participant_area = N'ПМ',
    amount = 0,
    updated_at = GETDATE()
WHERE wcr_code IN (N'RPL1', N'RPL2', N'RPL3', N'RPL5');

PRINT N'  RPL1/RPL2/RPL3/RPL5: unmapped, type=ПМ_Пополнение, amount=0';
GO

PRINT N'--- 4. Тип операции у новых WCR, если строки уже есть ---';

UPDATE o
SET o.operation_type = wm.operation_type,
    o.participant_area = wm.participant_area,
    o.updated_at = GETDATE()
FROM operations o
INNER JOIN wcr_mapping wm ON wm.wcr_code = o.wcr_code AND wm.is_active = 1
WHERE o.wcr_code IN (N'DEFF', N'P3BL', N'P3BM', N'P3BS', N'PHSM');
GO

PRINT N'--- 5. Пересчёт amount: комплектация = count × picking rate ---';

UPDATE o
SET o.amount = CAST(ISNULL(o.count, 0) AS FLOAT) * ISNULL(wp.rate, 0),
    o.updated_at = GETDATE()
FROM operations o
INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1;
GO

PRINT N'--- 6. Сортировка / прочие: count × tariff, только если WCR в mapping ---';

UPDATE o
SET o.amount = CAST(ISNULL(o.count, 0) AS FLOAT) * t.rate,
    o.updated_at = GETDATE()
FROM operations o
INNER JOIN wcr_mapping wm ON wm.wcr_code = o.wcr_code AND wm.is_active = 1
INNER JOIN tariffs t ON
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND wm.operation_type = t.operation_type
    AND t.is_active = 1
    AND o.operation_date >= t.valid_from
    AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
WHERE NOT EXISTS (
    SELECT 1 FROM wcr_picking_norms wp
    WHERE wp.wcr_code = o.wcr_code AND wp.is_active = 1
);
GO

PRINT N'--- 7. Нет в picking norms и нет в mapping → amount 0 ---';

UPDATE o
SET o.amount = 0,
    o.updated_at = GETDATE()
FROM operations o
WHERE NOT EXISTS (
    SELECT 1 FROM wcr_picking_norms wp
    WHERE wp.wcr_code = o.wcr_code AND wp.is_active = 1
)
AND NOT EXISTS (
    SELECT 1 FROM wcr_mapping wm
    WHERE wm.wcr_code = o.wcr_code AND wm.is_active = 1
);
GO

PRINT N'--- 8. Пересоздание представлений ---';

IF OBJECT_ID('v_operations_stats', 'V') IS NOT NULL DROP VIEW v_operations_stats;
IF OBJECT_ID('v_top_performers', 'V') IS NOT NULL DROP VIEW v_top_performers;
IF OBJECT_ID('v_salary_by_month', 'V') IS NOT NULL DROP VIEW v_salary_by_month;
IF OBJECT_ID('v_salary_by_day', 'V') IS NOT NULL DROP VIEW v_salary_by_day;
IF OBJECT_ID('v_salary_details', 'V') IS NOT NULL DROP VIEW v_salary_details;
GO

-- Комплектация: АЕИ (count) × ставка wcr_picking_norms
-- Иначе: АЕИ × тариф, только если WCR есть в wcr_mapping
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

PRINT N'✅ Migration 017 completed: picking = count × rate; DEFF/P3B*/PHSM added; RPL unmapped';
GO
