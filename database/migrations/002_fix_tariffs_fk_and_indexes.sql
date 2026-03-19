-- =============================================
-- Migration 002: Исправление FK + производительные индексы
-- =============================================

USE SalaryMonitor;
GO

-- =============================================
-- 1. Исправить FK на tariffs.warehouse_code
-- Проблема: 'ALL' не существует как warehouse — FK нарушается
-- Решение: убрать FK, оставить логическую связь в коде
-- =============================================

PRINT '1. Удаление некорректного FK на tariffs.warehouse_code...';

DECLARE @fkName NVARCHAR(256);
SELECT @fkName = fk.name
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
INNER JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
INNER JOIN sys.tables t ON fkc.parent_object_id = t.object_id
WHERE t.name = 'tariffs' AND c.name = 'warehouse_code';

IF @fkName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE tariffs DROP CONSTRAINT ' + @fkName);
    PRINT '✅ FK удалён: ' + @fkName;
END
ELSE
BEGIN
    PRINT '⚠️  FK на tariffs.warehouse_code не найден (возможно уже удалён или не создан)';
END
GO

-- =============================================
-- 2. Составной уникальный индекс для MERGE-операции (идемпотентность)
-- Позволяет MERGE определять существующие записи без полного скана
-- =============================================

PRINT '2. Создание уникального индекса для upsert операций...';

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'idx_ops_upsert_key' AND object_id = OBJECT_ID('operations')
)
BEGIN
    -- Частичный индекс: только записи с sap_order_id (реальные операции из SAP)
    CREATE UNIQUE INDEX idx_ops_upsert_key
        ON operations(user_id, sap_order_id, operation_type)
        WHERE sap_order_id IS NOT NULL;
    PRINT '✅ Индекс idx_ops_upsert_key создан';
END
ELSE
    PRINT '⚠️  Индекс idx_ops_upsert_key уже существует';
GO

-- =============================================
-- 3. Индекс для быстрой фильтрации по периоду и складу
-- Используется при: DELETE за период, SELECT за месяц
-- =============================================

PRINT '3. Создание индекса по дате и складу...';

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'idx_ops_date_warehouse' AND object_id = OBJECT_ID('operations')
)
BEGIN
    CREATE INDEX idx_ops_date_warehouse
        ON operations(operation_date, warehouse_code)
        INCLUDE (user_id, operation_type, count, amount, participant_area);
    PRINT '✅ Индекс idx_ops_date_warehouse создан';
END
ELSE
    PRINT '⚠️  Индекс idx_ops_date_warehouse уже существует';
GO

-- =============================================
-- 4. Индекс для SQL Views (v_salary_by_day, v_salary_details)
-- Ускоряет агрегацию по пользователю и дате
-- =============================================

PRINT '4. Создание индекса для SQL Views...';

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'idx_ops_user_date_type' AND object_id = OBJECT_ID('operations')
)
BEGIN
    CREATE INDEX idx_ops_user_date_type
        ON operations(user_id, operation_date, operation_type)
        INCLUDE (count, amount, participant_area, actdura);
    PRINT '✅ Индекс idx_ops_user_date_type создан';
END
ELSE
    PRINT '⚠️  Индекс idx_ops_user_date_type уже существует';
GO

-- =============================================
-- 5. Индекс по employee_id в users (поиск при создании новых пользователей)
-- =============================================

PRINT '5. Проверка индекса users.employee_id...';

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'idx_users_employee_id' AND object_id = OBJECT_ID('users')
)
BEGIN
    CREATE INDEX idx_users_employee_id ON users(employee_id);
    PRINT '✅ Индекс idx_users_employee_id создан';
END
ELSE
    PRINT '✅ Индекс idx_users_employee_id уже существует';
GO

-- =============================================
-- 6. Индекс для поиска тарифов (ключевой запрос в syncContext)
-- =============================================

PRINT '6. Создание индекса для тарифов...';

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'idx_tariffs_lookup' AND object_id = OBJECT_ID('tariffs')
)
BEGIN
    CREATE INDEX idx_tariffs_lookup
        ON tariffs(operation_type, is_active)
        INCLUDE (warehouse_code, rate, norm_aei_per_hour, valid_from, valid_to);
    PRINT '✅ Индекс idx_tariffs_lookup создан';
END
ELSE
    PRINT '⚠️  Индекс idx_tariffs_lookup уже существует';
GO

-- =============================================
-- Итог: статистика индексов
-- =============================================

SELECT
    i.name AS index_name,
    i.type_desc,
    i.is_unique,
    i.filter_definition
FROM sys.indexes i
INNER JOIN sys.objects o ON i.object_id = o.object_id
WHERE o.name IN ('operations', 'users', 'tariffs', 'wcr_mapping')
  AND i.type > 0  -- исключаем heap
ORDER BY o.name, i.name;
GO

PRINT '';
PRINT '✅ Migration 002 completed: FK fixed + 5 performance indexes created';
GO
