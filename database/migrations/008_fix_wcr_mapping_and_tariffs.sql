-- =============================================
-- Migration 008: Исправление WCR-маппинга и тарифов
-- =============================================
-- ИСТОЧНИК ИСТИНЫ: эталонный отчёт заказчика (март 2026)
--
-- ПРОБЛЕМЫ:
--  1) PM12  → 'ФС Штучная'          (неверно!) → 'ФС Коробочная'
--  2) PDO1  → 'ДО Штучная'          (неверно!) → 'ДО Коробочная'
--  3) PM11  → 'М Штучная'           (неверно!) → 'ФС Коробочная'
--  4) PS3M  → 'М3 Штучн.однострочн' (неверно!) → 'М3 Штучная'
--  5) PB4Z, PCD2, PM32 — отсутствуют в маппинге → операции терялись
--
--  6) Тарифы ДО и ФС Коробочная — ПЕРЕПУТАНЫ:
--       ФС Коробочная в БД = 7.50/50  → должно быть 6.20/60
--       ДО Коробочная в БД = 6.20/60  → должно быть 7.50/50
--  7) МС Коробочная: 5.70 → 5.80
--  8) М3 Коробочная: 7.50/50 → 5.80/65
-- =============================================

USE SalaryMonitor;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

PRINT '==============================================';
PRINT 'Migration 008: Fix WCR mapping + tariffs';
PRINT CONVERT(NVARCHAR, GETDATE(), 120);
PRINT '==============================================';
PRINT '';

-- =============================================
-- 1. Исправляем неверные WCR-маппинги
-- =============================================

PRINT '--- 1. Исправление неверных WCR-маппингов ---';

-- PM12: ФС Штучная → ФС Коробочная
UPDATE wcr_mapping
SET operation_type   = 'ФС Коробочная комплектация',
    participant_area  = 'ФС',
    description      = 'ИСПРАВЛЕНО migration-008: было ФС Штучная — подтверждено эталоном заказчика',
    updated_at       = GETDATE()
WHERE wcr_code = 'PM12';
PRINT '  PM12: ФС Штучная → ФС Коробочная (' + CAST(@@ROWCOUNT AS VARCHAR) + ' строк)';

-- PDO1: ДО Штучная → ДО Коробочная
UPDATE wcr_mapping
SET operation_type   = 'ДО Коробочная комплектация',
    participant_area  = 'ДО',
    description      = 'ИСПРАВЛЕНО migration-008: было ДО Штучная — подтверждено эталоном заказчика',
    updated_at       = GETDATE()
WHERE wcr_code = 'PDO1';
PRINT '  PDO1: ДО Штучная → ДО Коробочная (' + CAST(@@ROWCOUNT AS VARCHAR) + ' строк)';

-- PM11: М Штучная → ФС Коробочная
UPDATE wcr_mapping
SET operation_type   = 'ФС Коробочная комплектация',
    participant_area  = 'ФС',
    description      = 'ИСПРАВЛЕНО migration-008: было М Штучная — подтверждено эталоном заказчика',
    updated_at       = GETDATE()
WHERE wcr_code = 'PM11';
PRINT '  PM11: М Штучная → ФС Коробочная (' + CAST(@@ROWCOUNT AS VARCHAR) + ' строк)';

-- PS3M: М3 Штучн.компл.однострочн → М3 Штучная
-- (migration-001 ошибочно поставил его в однострочн; migration-003 INSERT провалился из-за UNIQUE)
UPDATE wcr_mapping
SET operation_type   = 'М3 Штучная комплектация',
    participant_area  = 'М3',
    description      = 'ИСПРАВЛЕНО migration-008: было М3 Штучн.компл.однострочн — подтверждено эталоном',
    updated_at       = GETDATE()
WHERE wcr_code = 'PS3M';
PRINT '  PS3M: М3 Штучн.однострочн → М3 Штучная (' + CAST(@@ROWCOUNT AS VARCHAR) + ' строк)';

PRINT '';

-- =============================================
-- 2. Добавляем отсутствующие WCR-коды
-- =============================================

PRINT '--- 2. Добавление отсутствующих WCR-кодов ---';

-- PB4Z → ФС Коробочная
IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = 'PB4Z')
BEGIN
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES ('PB4Z', 'ФС Коробочная комплектация', 'ФС', 1,
            'ФС Коробочная — добавлено migration-008, подтверждено эталоном');
    PRINT '  PB4Z добавлен → ФС Коробочная';
END
ELSE
BEGIN
    PRINT '  PB4Z уже существует, пропускаем';
END

-- PCD2 → ФС Коробочная
IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = 'PCD2')
BEGIN
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES ('PCD2', 'ФС Коробочная комплектация', 'ФС', 1,
            'ФС Коробочная — добавлено migration-008, подтверждено эталоном');
    PRINT '  PCD2 добавлен → ФС Коробочная';
END
ELSE
BEGIN
    PRINT '  PCD2 уже существует, пропускаем';
END

-- PM32 → М3 Коробочная
IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = 'PM32')
BEGIN
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES ('PM32', 'М3 Коробочная комплектация', 'М3', 1,
            'М3 Коробочная — добавлено migration-008, подтверждено эталоном');
    PRINT '  PM32 добавлен → М3 Коробочная';
END
ELSE
BEGIN
    PRINT '  PM32 уже существует, пропускаем';
END

PRINT '';

-- =============================================
-- 3. Исправляем тарифы
-- =============================================

PRINT '--- 3. Исправление тарифов ---';

-- ФС Коробочная: 7.50/50 → 6.20/60 (были перепутаны с ДО!)
UPDATE tariffs
SET rate            = 6.20,
    norm_aei_per_hour = 60
WHERE operation_type = 'ФС Коробочная комплектация'
  AND is_active = 1;
PRINT '  ФС Коробочная: 7.50/50 → 6.20/60 (' + CAST(@@ROWCOUNT AS VARCHAR) + ' строк)';

-- ДО Коробочная: 6.20/60 → 7.50/50 (были перепутаны с ФС!)
UPDATE tariffs
SET rate            = 7.50,
    norm_aei_per_hour = 50
WHERE operation_type = 'ДО Коробочная комплектация'
  AND is_active = 1;
PRINT '  ДО Коробочная: 6.20/60 → 7.50/50 (' + CAST(@@ROWCOUNT AS VARCHAR) + ' строк)';

-- МС Коробочная: 5.70 → 5.80
UPDATE tariffs
SET rate            = 5.80,
    norm_aei_per_hour = 65
WHERE operation_type = 'МС Коробочная комплектация'
  AND is_active = 1;
PRINT '  МС Коробочная: 5.70/65 → 5.80/65 (' + CAST(@@ROWCOUNT AS VARCHAR) + ' строк)';

-- М3 Коробочная: 7.50/50 → 5.80/65
UPDATE tariffs
SET rate            = 5.80,
    norm_aei_per_hour = 65
WHERE operation_type = 'М3 Коробочная комплектация'
  AND is_active = 1;
PRINT '  М3 Коробочная: 7.50/50 → 5.80/65 (' + CAST(@@ROWCOUNT AS VARCHAR) + ' строк)';

PRINT '';

-- =============================================
-- 4. Исправляем типы в таблице operations
--    (только те типы, которые возникли исключительно
--     из-за неверного WCR-маппинга и не могут быть
--     «легитимными»)
-- =============================================

PRINT '--- 4. Исправление operation_type в таблице operations ---';

-- 'ДО Штучная комплектация' существует ТОЛЬКО из-за PDO1 (до этой миграции).
-- PDO3 тоже был отображён на этот тип; оба должны быть ДО Коробочная.
UPDATE operations
SET operation_type  = 'ДО Коробочная комплектация',
    participant_area = 'ДО',
    updated_at       = GETDATE()
WHERE operation_type = 'ДО Штучная комплектация';
PRINT '  ДО Штучная → ДО Коробочная: ' + CAST(@@ROWCOUNT AS VARCHAR) + ' операций';

-- 'М Штучная комплектация' существует ТОЛЬКО из-за PM11 (до этой миграции).
UPDATE operations
SET operation_type  = 'ФС Коробочная комплектация',
    participant_area = 'ФС',
    updated_at       = GETDATE()
WHERE operation_type = 'М Штучная комплектация';
PRINT '  М Штучная → ФС Коробочная: ' + CAST(@@ROWCOUNT AS VARCHAR) + ' операций';

-- 'М3 Штучн.компл.однострочн' из PS3M нельзя отличить от PPM3 без WCR.
-- Поэтому НЕ меняем автоматически — требуется пересинхронизация данных за период.
PRINT '';
PRINT '  ⚠️  PS3M/PM12 в операциях: автоисправление невозможно (WCR не хранится).';
PRINT '      Требуется пересинхронизация данных из SAP за затронутые периоды.';

PRINT '';

-- =============================================
-- 5. Пересчёт amount = count * rate для всех операций
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

PRINT '--- 6. Проверка тарифов после исправления ---';
SELECT
    operation_type,
    rate,
    norm_aei_per_hour
FROM tariffs
WHERE operation_type IN (
    'ФС Коробочная комплектация',
    'ДО Коробочная комплектация',
    'МС Коробочная комплектация',
    'М3 Коробочная комплектация'
)
AND is_active = 1
ORDER BY operation_type;

PRINT '';
PRINT '--- Проверка WCR-маппинга для исправленных кодов ---';
SELECT wcr_code, operation_type, participant_area
FROM wcr_mapping
WHERE wcr_code IN ('PM11','PM12','PDO1','PS3M','PB4Z','PCD2','PM32')
ORDER BY wcr_code;

COMMIT TRANSACTION;

PRINT '';
PRINT '==============================================';
PRINT '✅ Migration 008 ЗАВЕРШЕНА';
PRINT CONVERT(NVARCHAR, GETDATE(), 120);
PRINT '==============================================';
PRINT '';
PRINT '⚠️  НЕОБХОДИМО ДОПОЛНИТЕЛЬНО:';
PRINT '  1) Пересинхронизировать из SAP периоды, где встречались:';
PRINT '       PB4Z, PCD2, PM32  — их операции были пропущены при загрузке';
PRINT '       PM12              — операции записаны как ФС Штучная (нельзя исправить без WCR)';
PRINT '       PS3M              — операции записаны как М3 Штучн.однострочн (смешаны с PPM3)';
PRINT '  2) Обновить salary_summary за пересчитанные периоды.';
GO
