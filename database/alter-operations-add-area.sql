-- =============================================
-- Добавление поля participant_area в таблицу operations
-- =============================================

USE SalaryMonitor;
GO

-- Добавляем поле для участка (М2, М3, и т.д.)
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'operations' AND COLUMN_NAME = 'participant_area'
)
BEGIN
    ALTER TABLE operations
    ADD participant_area NVARCHAR(50);
    
    PRINT 'Добавлено поле participant_area';
END
ELSE
BEGIN
    PRINT 'Поле participant_area уже существует';
END
GO

-- Создаем индекс для быстрого поиска
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_operations_area' AND object_id = OBJECT_ID('operations'))
BEGIN
    CREATE INDEX idx_operations_area ON operations(participant_area);
    PRINT 'Создан индекс idx_operations_area';
END
GO

-- Обновляем operation_type для хранения полного названия (Участок + Тип)
-- Например: "М2 Штучная комплектация"
PRINT '';
PRINT 'Готово! Теперь operations может хранить информацию об участках.';
GO
