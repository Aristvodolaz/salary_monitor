-- =============================================
-- Migration 009: Полное исправление WCR-маппинга и тарифов
-- =============================================
-- ИСТОЧНИК ИСТИНЫ: эталонный отчёт заказчика (март 2026)
--
-- ИСПРАВЛЕНИЯ WCR-МАППИНГА:
--   PSCD: 'ДО Коробочная'  → 'ФС Штучная' (ошибка migration-001)
--   PZST: 'ФС Коробочная'  → 'ФС Штучная' (ошибка migration-001)
--   PCD1: 'ДО Коробочная'  → 'ФС Коробочная' (ошибка migration-001)
--   PM13: 'ФС Штучная'     → 'ФС Коробочная' (ошибка migration-001)
--
-- ОТСУТСТВУЮЩИЕ WCR-КОДЫ:
--   P2MC → МС Штучная комплектация
--   PKMC → МС Упаковка
--   PM4Z → ФС Коробочная комплектация
--   PM21 → М2 Коробочная комплектация
--   PM52 → М5 Коробочная комплектация
--   PMT4 → М4 Коробочная комплектация
--   PZCD → ФС Штучная комплектация
--
-- ИСПРАВЛЕНИЕ ТАРИФОВ (источник: расчёт по эталонным данным АЕИ × rate = сумма):
--   ФС Штучная:            2.8 → 3.0  (норма 125)
--   М2 Штучная:            1.4 → 1.5  (норма 250)
--   М2 Упаковка:           1.4 → 1.5  (норма 250)
--   М2 Коробочная:        15.3 → 16.3 (норма 23)
--   М2 Штучн.однострочн:   2.0 → 2.1  (норма 180)
--   М3 Штучная:            6.8 → 7.2  (норма 52)
--   М3 Штучн.однострочн:  10.4 → 11.0 (норма 34)
--   М4 Штучная:            1.4 → 1.5  (норма 245)
--   М4 Штучн.однострочн:   2.4 → 2.5  (норма 150)
--   М4 Упаковка:           1.5 → 1.6  (норма 240)
--   М5 Штучная:            1.1 → 1.2  (норма 320)
--   МС Штучная:            1.6 → 1.7  (норма 225)
--   МС Упаковка:           1.7 → 1.8  (норма 210)
--   ПМ Упаковка:           4.1 → 4.3  (норма 87)
-- =============================================

USE SalaryMonitor;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

PRINT '==============================================';
PRINT 'Migration 009: Полное исправление WCR + тарифов';
PRINT CONVERT(NVARCHAR, GETDATE(), 120);
PRINT '==============================================';
PRINT '';

-- =============================================
-- 1. Исправляем неверные WCR-маппинги
-- =============================================

PRINT '--- 1. Исправление неверных WCR-маппингов ---';

-- PSCD: ДО Коробочная → ФС Штучная
-- Доказательство: PSCD у Федотова, Нестеренко, Потаповой, Канищевой, Макаровой, Шуменко
--   все показывают rate=3.0, norm=125 → ФС Штучная
UPDATE wcr_mapping
SET operation_type   = 'ФС Штучная комплектация',
    participant_area  = 'ФС',
    description      = 'ИСПРАВЛЕНО migration-009: было ДО Коробочная (ошибка 001) — подтверждено эталоном',
    updated_at       = GETDATE()
WHERE wcr_code = 'PSCD';
PRINT '  PSCD: ДО Коробочная → ФС Штучная (' + CAST(@@ROWCOUNT AS VARCHAR) + ' строк)';

-- PZST: ФС Коробочная → ФС Штучная
-- Доказательство: PZST у Евстигнеевой, Канищевой, Логиновской, Нестеренко
--   все показывают rate=3.0, norm=125 → ФС Штучная
UPDATE wcr_mapping
SET operation_type   = 'ФС Штучная комплектация',
    participant_area  = 'ФС',
    description      = 'ИСПРАВЛЕНО migration-009: было ФС Коробочная (ошибка 001) — подтверждено эталоном',
    updated_at       = GETDATE()
WHERE wcr_code = 'PZST';
PRINT '  PZST: ФС Коробочная → ФС Штучная (' + CAST(@@ROWCOUNT AS VARCHAR) + ' строк)';

-- PCD1: ДО Коробочная → ФС Коробочная
-- Доказательство: PCD1 у Смирнова: 17 × 6.2 = 105.4 ≈ 105 → ФС Коробочная
UPDATE wcr_mapping
SET operation_type   = 'ФС Коробочная комплектация',
    participant_area  = 'ФС',
    description      = 'ИСПРАВЛЕНО migration-009: было ДО Коробочная (ошибка 001) — подтверждено эталоном',
    updated_at       = GETDATE()
WHERE wcr_code = 'PCD1';
PRINT '  PCD1: ДО Коробочная → ФС Коробочная (' + CAST(@@ROWCOUNT AS VARCHAR) + ' строк)';

-- PM13: ФС Штучная → ФС Коробочная
-- Доказательство: PM13 у Лайера: 4 × 6.2 = 24.8 ≈ 25 → ФС Коробочная
UPDATE wcr_mapping
SET operation_type   = 'ФС Коробочная комплектация',
    participant_area  = 'ФС',
    description      = 'ИСПРАВЛЕНО migration-009: было ФС Штучная (ошибка 001) — подтверждено эталоном',
    updated_at       = GETDATE()
WHERE wcr_code = 'PM13';
PRINT '  PM13: ФС Штучная → ФС Коробочная (' + CAST(@@ROWCOUNT AS VARCHAR) + ' строк)';

PRINT '';

-- =============================================
-- 2. Добавляем отсутствующие WCR-коды
-- =============================================

PRINT '--- 2. Добавление отсутствующих WCR-кодов ---';

IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = 'P2MC')
BEGIN
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES ('P2MC', 'МС Штучная комплектация', 'МС', 1,
            'МС Штучная — добавлено migration-009, подтверждено эталоном');
    PRINT '  P2MC добавлен → МС Штучная комплектация';
END ELSE PRINT '  P2MC уже существует';

IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = 'PKMC')
BEGIN
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES ('PKMC', 'МС Упаковка', 'МС', 1,
            'МС Упаковка — добавлено migration-009, подтверждено эталоном');
    PRINT '  PKMC добавлен → МС Упаковка';
END ELSE PRINT '  PKMC уже существует';

IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = 'PM4Z')
BEGIN
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES ('PM4Z', 'ФС Коробочная комплектация', 'ФС', 1,
            'ФС Коробочная (M4Z-операции) — добавлено migration-009, подтверждено эталоном');
    PRINT '  PM4Z добавлен → ФС Коробочная комплектация';
END ELSE PRINT '  PM4Z уже существует';

IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = 'PM21')
BEGIN
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES ('PM21', 'М2 Коробочная комплектация', 'М2', 1,
            'М2 Коробочная — добавлено migration-009, подтверждено эталоном');
    PRINT '  PM21 добавлен → М2 Коробочная комплектация';
END ELSE PRINT '  PM21 уже существует';

IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = 'PM52')
BEGIN
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES ('PM52', 'М5 Коробочная комплектация', 'М5', 1,
            'М5 Коробочная — добавлено migration-009, подтверждено эталоном');
    PRINT '  PM52 добавлен → М5 Коробочная комплектация';
END ELSE PRINT '  PM52 уже существует';

IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = 'PMT4')
BEGIN
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES ('PMT4', 'М4 Коробочная комплектация', 'М4', 1,
            'М4 Коробочная (тип T) — добавлено migration-009, подтверждено эталоном');
    PRINT '  PMT4 добавлен → М4 Коробочная комплектация';
END ELSE PRINT '  PMT4 уже существует';

IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = 'PZCD')
BEGIN
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES ('PZCD', 'ФС Штучная комплектация', 'ФС', 1,
            'ФС Штучная (Z-тип CD) — добавлено migration-009, подтверждено эталоном');
    PRINT '  PZCD добавлен → ФС Штучная комплектация';
END ELSE PRINT '  PZCD уже существует';

PRINT '';

-- =============================================
-- 3. Обновляем ВСЕ тарифы по эталонным данным
--    Используем MERGE для идемпотентности
-- =============================================

PRINT '--- 3. Полное обновление тарифов ---';

-- Эталонные тарифы (источник: расчёт AEI × rate = amount по данным заказчика)
DECLARE @tariffs TABLE (
    operation_type    NVARCHAR(100),
    rate              DECIMAL(10,2),
    norm_aei_per_hour INT
);

INSERT INTO @tariffs VALUES
-- ФС
('ФС Коробочная комплектация',     6.20, 60),
('ФС Штучная комплектация',        3.00, 125),
-- ДО
('ДО Коробочная комплектация',     7.50, 50),
-- МС
('МС Коробочная комплектация',     5.80, 65),
('МС Штучная комплектация',        1.70, 225),
('МС Упаковка',                    1.80, 210),
('МС Штучн.компл.однострочн',      3.40, 110),
-- М2
('М2 Коробочная комплектация',    16.30, 23),
('М2 Штучная комплектация',        1.50, 250),
('М2 Упаковка',                    1.50, 250),
('М2 Штучн.компл.однострочн',      2.10, 180),
-- М3
('М3 Коробочная комплектация',     5.80, 65),
('М3 Штучная комплектация',        7.20, 52),
('М3 Штучн.компл.однострочн',     11.00, 34),
-- М4
('М4 Коробочная комплектация',     5.80, 65),
('М4 Штучная комплектация',        1.50, 245),
('М4 Упаковка',                    1.60, 240),
('М4 Штучн.компл.однострочн',      2.50, 150),
-- М5
('М5 Коробочная комплектация',     5.80, 65),
('М5 Штучная комплектация',        1.20, 320),
('М5 Упаковка',                    1.20, 300),
('М5 Штучн.компл.однострочн',      1.40, 260),
-- ПМ
('ПМ Упаковка',                    4.30, 87);

MERGE tariffs AS target
USING (
    SELECT t.operation_type, t.rate, t.norm_aei_per_hour
    FROM @tariffs t
) AS source
ON (target.operation_type = source.operation_type AND target.warehouse_code = 'ALL' AND target.is_active = 1)
WHEN MATCHED THEN
    UPDATE SET
        target.rate              = source.rate,
        target.norm_aei_per_hour = source.norm_aei_per_hour
WHEN NOT MATCHED THEN
    INSERT (warehouse_code, operation_type, rate, norm_aei_per_hour, is_active, valid_from)
    VALUES ('ALL', source.operation_type, source.rate, source.norm_aei_per_hour, 1, '2025-01-01');

PRINT '  Обновлено/добавлено тарифов: ' + CAST(@@ROWCOUNT AS VARCHAR);

PRINT '';

-- =============================================
-- 4. Исправляем типы в таблице operations
--    для операций с неверными WCR (PSCD, PZST, PCD1, PM13)
-- =============================================

PRINT '--- 4. Исправление operation_type в таблице operations ---';

-- Операции с типом 'ДО Коробочная' которые имеют rate 3.0/125 → были от PSCD
-- Нельзя определить автоматически без WCR. Требуется пересинхронизация.
--
-- 'ФС Коробочная' операции от PZST/PM13 тоже неразличимы без WCR.
-- Однако для PM13 и PCD1 тип правильный (ФС Коробочная/ДО Коробочная) -
-- только rate был другим, что исправлено пересчётом ниже.
PRINT '  ⚠️  Операции от PSCD/PZST (терялись) — будут восстановлены при пересинхронизации.';
PRINT '  ⚠️  Операции от PM13/PCD1 (неверный тип) — требуют пересинхронизации.';

PRINT '';

-- =============================================
-- 5. Пересчёт amount = count * rate для ВСЕХ операций
-- =============================================

PRINT '--- 5. Пересчёт сумм операций ---';

UPDATE o
SET o.amount     = o.count * t.rate,
    o.updated_at = GETDATE()
FROM operations o
INNER JOIN tariffs t ON
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND o.operation_type = t.operation_type
    AND o.operation_date >= t.valid_from
    AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
    AND t.is_active = 1;

PRINT '  Пересчитано операций: ' + CAST(@@ROWCOUNT AS VARCHAR);

PRINT '';

-- =============================================
-- 6. Контрольный вывод
-- =============================================

PRINT '--- 6. Все тарифы после исправления ---';
SELECT
    operation_type,
    rate,
    norm_aei_per_hour
FROM tariffs
WHERE is_active = 1
  AND warehouse_code = 'ALL'
ORDER BY operation_type;

PRINT '';
PRINT '--- WCR-маппинг (все активные) ---';
SELECT wcr_code, operation_type, participant_area
FROM wcr_mapping
WHERE is_active = 1
ORDER BY participant_area, wcr_code;

COMMIT TRANSACTION;

PRINT '';
PRINT '==============================================';
PRINT '✅ Migration 009 ЗАВЕРШЕНА';
PRINT CONVERT(NVARCHAR, GETDATE(), 120);
PRINT '==============================================';
PRINT '';
PRINT '⚠️  ОБЯЗАТЕЛЬНО после этой миграции:';
PRINT '  1) npm run sync:january   -- пересинхронизировать январь';
PRINT '  2) npm run sync:february  -- пересинхронизировать февраль';
PRINT '  3) npm run sync:march     -- пересинхронизировать март';
GO
