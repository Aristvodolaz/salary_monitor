-- =============================================
-- Добавление поля actdura в таблицу operations
-- =============================================

USE SalaryMonitor;
GO

-- Добавляем поле для фактического времени (минуты)
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'operations' AND COLUMN_NAME = 'actdura'
)
BEGIN
    ALTER TABLE operations
    ADD actdura FLOAT;
    
    PRINT 'Добавлено поле actdura (фактическое время в минутах)';
END
ELSE
BEGIN
    PRINT 'Поле actdura уже существует';
END
GO

PRINT 'Готово! Теперь можно сохранять Actdura из SAP.';
GO
